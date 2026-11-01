// BG-LAUNCH-004: inspection limits, decoder hardening and the self-test's fail-closed behaviour.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { limits, prlimitArgs } = require("../src/media/inspectionLimits");
const { runToolchainSelfTest } = require("../src/media/toolchainSelfTest");
const { createVideoDecodeCheck } = require("../src/media/videoDecode");
const have = require("./helpers/media-tools").haveMediaTools();

test("the resource limits are explicit, frozen and applied to both subprocess kinds", () => {
  assert.ok(Object.isFrozen(limits) && Object.isFrozen(limits.probe)); assert.equal(limits.probe.cpuSeconds, 5);
  assert.deepEqual(prlimitArgs("probe"), ["--as=1073741824", "--cpu=5", "--nofile=64", "--fsize=1048576", "--core=0"]);
  assert.deepEqual(prlimitArgs("decode"), ["--as=2147483648", "--cpu=30", "--nofile=64", "--fsize=1048576", "--core=0"]);
  assert.equal(limits.input.maxBytes, 32 * 1024 * 1024);
  for (const file of ["videoInspection.js", "videoDecode.js"]) { const src = fs.readFileSync(path.join(__dirname, "../src/media", file), "utf8"); assert.match(src, /prlimitArgs\("/, file); assert.doesNotMatch(src, /"--as=\d/, file + " must not carry its own literal limits"); assert.match(src, /shell: false/); }
});

test("the decoder only ever opens a real MP4: a disguised playlist is refused before ffmpeg runs, and oversize input too", { skip: !have }, async () => {
  const decode = createVideoDecodeCheck({ isolation: "local" });
  const concat = Buffer.from("ffconcat version 1.0\nfile '/etc/passwd'\nfile 'http://127.0.0.1:9/x'\n");
  assert.deepEqual((await decode(concat)).reason, "INVALID_MP4_HEADER");
  const disguised = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypisom"), Buffer.alloc(8), concat]);
  assert.equal((await decode(disguised)).status, "invalid");
  assert.equal((await decode(Buffer.alloc(limits.input.maxBytes + 1))).reason, "OBJECT_TOO_LARGE");
});

test("the self-test passes under process-local isolation and refuses (fails closed) when hardened isolation is unavailable", { skip: !have }, async () => {
  const local = await runToolchainSelfTest({ isolation: "local" });
  assert.deepEqual([local.ok, local.measured, local.decode, local.damaged, local.playlist], [true, "measured", "decoded", "invalid", "invalid"]);
  const hasBwrap = fs.existsSync("/usr/bin/bwrap");
  const hardened = await runToolchainSelfTest({ isolation: "bubblewrap" });
  if (!hasBwrap) assert.deepEqual([hardened.ok, hardened.failure], [false, "INSPECTION_SANDBOX_UNAVAILABLE"]); // never reported as ready
  assert.deepEqual((await runToolchainSelfTest({ isolation: "chroot" })).failure, "UNKNOWN_ISOLATION");
});

test("the decoder is pinned to H.264: other video codecs are refused before any other decoder can run (BG-LAUNCH-006)", { skip: !have }, async () => {
  const { execFileSync } = require("node:child_process"); const os = require("node:os"); const fs = require("node:fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bg-dec-"));
  try {
    const mk = (name, codec) => { const f = path.join(dir, name); execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=2", "-c:v", codec, "-an", f]); return fs.readFileSync(f); };
    const decode = createVideoDecodeCheck({ isolation: "local" });
    assert.equal((await decode(mk("h264.mp4", "libx264"))).status, "decoded");
    assert.equal((await decode(mk("vp9.mp4", "libvpx-vp9"))).status, "invalid");
    assert.equal((await decode(mk("mpeg4.mp4", "mpeg4"))).status, "invalid");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.match(fs.readFileSync(path.join(__dirname, "../src/media/videoDecode.js"), "utf8"), /"-c:v", "h264", "-i"/);
});
