// BG-LAUNCH-003: real structural inspection of customer uploads (image bytes; video ffprobe + full decode). Local isolation, real ffmpeg files, no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createVideoInspector } = require("../src/media/videoInspection");
const { createVideoDecodeCheck } = require("../src/media/videoDecode");
const { createUploadInspector } = require("../src/media-intake/uploadInspector");

const have = require("./helpers/media-tools").haveMediaTools();
const skip = have ? false : "ffmpeg/ffprobe/prlimit unavailable";
const dir = have ? fs.mkdtempSync(path.join(os.tmpdir(), "bg-up-")) : null;
const enc = (name, input, out) => { execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...input, ...out, path.join(dir, name)]); return fs.readFileSync(path.join(dir, name)); };
const src = (size, d = 3) => ["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=24:duration=${d}`];
const F = have ? {
  png: enc("a.png", ["-f", "lavfi", "-i", "testsrc2=size=800x600:rate=1", "-frames:v", "1"], []),
  video: enc("v.mp4", src("640x360"), ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an"]),
  withAudio: enc("va.mp4", [...src("640x360"), "-f", "lavfi", "-i", "sine=d=3"], ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]),
  vp9: enc("v9.mp4", src("640x360"), ["-c:v", "libvpx-vp9", "-an"]),
  long: enc("vl.mp4", src("320x180", 62), ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-g", "250"]),
} : {};
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const inspector = () => createUploadInspector({ videoInspector: createVideoInspector({ isolation: "local" }), videoDecode: createVideoDecodeCheck({ isolation: "local" }), allowUnscanned: true });
const run = (i, bytes, type) => i.inspect({ bytes, sha256: sha(bytes), content_type: type, max_bytes: 10e6 });

test("it refuses to be built without a malware scanner unless unscanned use is explicit, and says UNSCANNED when it is", { skip }, () => {
  const parts = { videoInspector: createVideoInspector({ isolation: "local" }), videoDecode: createVideoDecodeCheck({ isolation: "local" }) };
  assert.throws(() => createUploadInspector(parts), /malware scanner/);
  assert.throws(() => createUploadInspector({ ...parts, malwareScanner: {} }), /Invalid malware scanner/);
  return run(inspector(), F.png, "image/png").then((r) => assert.match(r.engine, /UNSCANNED/));
});

test("valid images and video are cleared with measured facts", { skip }, async () => {
  const i = inspector();
  const img = await run(i, F.png, "image/png"); assert.deepEqual([img.clean, img.width, img.height, img.policy_version], [true, 800, 600, "upload-structural.v1"]);
  const vid = await run(i, F.video, "video/mp4"); assert.deepEqual([vid.clean, vid.width, vid.height, Math.round(vid.duration_seconds)], [true, 640, 360, 3]);
  assert.equal((await run(i, F.withAudio, "video/mp4")).clean, true); // customer footage may carry audio
});

test("mislabelled, damaged, undecodable, unsupported and over-long uploads are rejected, not cleared", { skip }, async () => {
  const i = inspector();
  assert.equal((await run(i, F.png, "image/jpeg")).clean, false); // PNG bytes labelled as JPEG
  assert.equal((await run(i, F.png.subarray(0, 80), "image/png")).clean, false);
  assert.equal((await run(i, F.vp9, "video/mp4")).clean, false); // not H.264
  assert.equal((await run(i, F.long, "video/mp4")).clean, false); // over 60 s
  const damaged = Buffer.from(F.video); for (let n = Math.floor(damaged.length / 2); n < Math.floor(damaged.length / 2) + 400; n += 1) damaged[n] = 0xff;
  assert.equal((await run(i, damaged, "video/mp4")).clean, false, "the full decode catches damage that headers do not show");
  assert.equal((await run(i, Buffer.alloc(200, 1), "video/mp4")).clean, false);
});

test("it never vouches for bytes that are not the pinned ones, and unavailable tools are unavailable, not clean", { skip }, async () => {
  const i = inspector();
  assert.equal(await i.inspect({ bytes: F.png, sha256: sha(Buffer.from("other")), content_type: "image/png", max_bytes: 1e7 }), null);
  assert.equal(await i.inspect({ bytes: F.png, sha256: sha(F.png), content_type: "image/png", max_bytes: 10 }), null);
  const broken = createUploadInspector({ videoInspector: async () => ({ status: "unavailable", reason: "INSPECTION_TOOL_UNAVAILABLE" }), videoDecode: createVideoDecodeCheck({ isolation: "local" }), allowUnscanned: true });
  assert.equal(await run(broken, F.video, "video/mp4"), null);
  const noDecode = createUploadInspector({ videoInspector: createVideoInspector({ isolation: "local" }), videoDecode: createVideoDecodeCheck({ executable: "/nonexistent/ffmpeg", isolation: "local" }), allowUnscanned: true });
  assert.equal(await run(noDecode, F.video, "video/mp4"), null);
});

test("a malware scanner has the last word, and a scanner failure is unavailable", { skip }, async () => {
  const parts = { videoInspector: createVideoInspector({ isolation: "local" }), videoDecode: createVideoDecodeCheck({ isolation: "local" }) };
  const verdict = (clean) => createUploadInspector({ ...parts, malwareScanner: { engine: "scanner-x", scan: async () => ({ clean }) } });
  const ok = await run(verdict(true), F.png, "image/png"); assert.deepEqual([ok.clean, ok.engine.includes("scanner-x"), ok.engine.includes("UNSCANNED")], [true, true, false]);
  assert.equal((await run(verdict(false), F.png, "image/png")).clean, false);
  assert.equal(await run(createUploadInspector({ ...parts, malwareScanner: { scan: async () => { throw new Error("down"); } } }), F.png, "image/png"), null);
});
