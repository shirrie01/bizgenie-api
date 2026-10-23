const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { readFileSync, existsSync } = require("node:fs");
const { mkdtemp, writeFile, rm, readdir } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createVideoInspector, assessInstagramVideoCandidate, MAX_BYTES } = require("../src/media/videoInspection");
const bytes = name => readFileSync(path.join(__dirname, "fixtures/video-inspection", name));
const silent = bytes("silent-h264.mp4");
const available = existsSync("/usr/bin/ffprobe");
const real = { skip: available ? false : "Local ffprobe required for real-byte inspection; missing tool is a runtime blocker" };
let directory;
before(async () => { directory = await mkdtemp(path.join(tmpdir(), "bg-inspection-test-")); });
after(async () => { await rm(directory, { recursive: true, force: true }); });
async function tool(name, source) {
  const executable = path.join(directory, name);
  await writeFile(executable, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  return executable;
}

test("measures real H.264 bytes, not request claims, and keeps candidate non-provisionable", real, async () => {
  const r = await createVideoInspector()(silent);
  assert.equal(r.status, "measured"); assert.equal(r.video.codec, "h264");
  assert.equal(r.video.width, 1280); assert.equal(r.video.height, 720);
  assert.deepEqual(r.video.frame_rate, { numerator: 24, denominator: 1 });
  assert.equal(r.video.duration_seconds, 4); assert.equal(r.audio.length, 0);
  assert.equal(r.byte_size, silent.length);
  assert.equal(r.sha256, createHash("sha256").update(silent).digest("hex"));
  assert.ok(r.video.profile); assert.ok(Object.isFrozen(r.video));
  const assessment = assessInstagramVideoCandidate(r);
  assert.equal(assessment.status, "candidate_constraints_met"); assert.equal(assessment.provisionable, false);
  assert.equal(assessment.platform_compliance, "unverified");
});

test("measures audio from bytes and denies the silent candidate", real, async () => {
  const r = await createVideoInspector()(bytes("audio-h264.mp4"));
  assert.equal(r.status, "measured"); assert.equal(r.audio[0].codec, "aac");
  assert.equal(r.audio[0].sample_rate, 48000);
  assert.ok(assessInstagramVideoCandidate(r).reasons.includes("AUDIO_UNSUPPORTED"));
});

test("measures a non-H.264 MP4 and does not widen codec/dimension/duration constraints", real, async () => {
  const r = await createVideoInspector()(bytes("mpeg4.mp4"));
  assert.equal(r.status, "measured"); assert.equal(r.video.codec, "mpeg4");
  assert.deepEqual(assessInstagramVideoCandidate(r).reasons, ["VIDEO_CODEC_UNSUPPORTED", "DIMENSIONS_UNSUPPORTED", "DURATION_UNSUPPORTED"]);
});

test("reads rotation display matrix and rejects rotated candidate", real, async () => {
  const r = await createVideoInspector()(bytes("rotated-h264.mp4"));
  assert.equal(r.status, "measured"); assert.equal(r.video.rotation_degrees, 90);
  assert.ok(assessInstagramVideoCandidate(r).reasons.includes("ROTATION_UNSUPPORTED"));
});

test("rejects forged/deserialized or mutated inspection authority", real, async () => {
  const r = await createVideoInspector()(silent);
  assert.equal(assessInstagramVideoCandidate(JSON.parse(JSON.stringify(r))).status, "unavailable");
  assert.equal(assessInstagramVideoCandidate({ status: "measured", video: { codec: "h264" } }).status, "unavailable");
  assert.equal(Reflect.set(r.video, "width", 1), false);
});

for (const bad of [null, "https://private.example/secret.mp4", "/etc/passwd", Buffer.alloc(0), Buffer.from("#EXTM3U\nhttps://private.example")]) {
  test(`refuses non-MP4/non-byte input ${typeof bad}`, async () => {
    const r = await createVideoInspector({ executable: "/does/not/exist" })(bad);
    assert.equal(r.status, "invalid"); assert.ok(!JSON.stringify(r).includes("private.example"));
  });
}

test("input size is bounded before subprocess/file access", async () => {
  assert.deepEqual(await createVideoInspector()(Buffer.alloc(MAX_BYTES + 1)), { status: "unsupported", reason: "OBJECT_TOO_LARGE" });
});
test("MOV brand cannot masquerade as accepted MP4", async () => {
  const b = Buffer.from(silent); b.fill(0x20, 8, b.readUInt32BE(0)); b.write("qt  ", 8);
  assert.equal((await createVideoInspector()(b)).status, "unsupported");
});
test("truncated and corrupt MP4 are invalid", real, async () => {
  assert.equal((await createVideoInspector()(silent.subarray(0, 32))).status, "invalid");
});
test("missing executable is sanitized unavailable; no private path leaks", async () => {
  assert.deepEqual(await createVideoInspector({ executable: "/missing/private/tool" })(silent), { status: "unavailable", reason: "INSPECTION_TOOL_UNAVAILABLE" });
});
test("rejects unsafe operator config; never accepts shell text as input", () => {
  assert.throws(() => createVideoInspector({ executable: "ffprobe; touch /tmp/pwn" }));
  assert.throws(() => createVideoInspector({ timeoutMs: 10001 }));
});
test("pre-aborted inspection does no work", async () => {
  const c = new AbortController(); c.abort();
  assert.equal((await createVideoInspector()(silent, { signal: c.signal })).reason, "CANCELLED");
});
test("timeout kills stalled subprocess, releases slot, and cleans private directory", async () => {
  const executable = await tool("stall", "setInterval(() => {}, 1000);");
  const inspect = createVideoInspector({ executable, timeoutMs: 100 });
  const before = new Set((await readdir(tmpdir())).filter(n => n.startsWith("bg-video-inspect-")));
  assert.equal((await inspect(silent)).reason, "INSPECTION_TIMEOUT");
  assert.equal((await inspect(silent)).reason, "INSPECTION_TIMEOUT");
  const added = (await readdir(tmpdir())).filter(n => n.startsWith("bg-video-inspect-") && !before.has(n));
  assert.deepEqual(added, []);
});
test("stdout amplification is bounded and sanitized", async () => {
  const executable = await tool("flood", 'process.stdout.write("x".repeat(1048576)); setInterval(() => {}, 1000);');
  assert.equal((await createVideoInspector({ executable })(silent)).reason, "INSPECTION_OUTPUT_LIMIT");
});
test("malformed tool JSON and stderr never escape to consumers", async () => {
  const executable = await tool("bad-json", 'process.stderr.write("secret-token-and-bucket"); process.stdout.write("{");');
  const r = await createVideoInspector({ executable })(silent);
  assert.deepEqual(r, { status: "invalid", reason: "INVALID_INSPECTION_OUTPUT" });
});
test("fixed arguments disable external references/network; child inherits no credentials", async () => {
  const capture = path.join(directory, "capture.json");
  const executable = await tool("capture", `require('fs').writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args:process.argv.slice(2),env:process.env,limits:require('fs').readFileSync('/proc/self/limits','utf8'),mode:require('fs').statSync(process.argv[process.argv.indexOf('-i')+1]).mode & 511})); process.stdout.write('{}');`);
  process.env.BG_INSPECTION_TEST_SECRET = "must-not-inherit";
  try { await createVideoInspector({ executable })(silent); }
  finally { delete process.env.BG_INSPECTION_TEST_SECRET; }
  const data = JSON.parse(readFileSync(capture));
  assert.equal(data.args[data.args.indexOf("-protocol_whitelist") + 1], "file");
  assert.equal(data.args[data.args.indexOf("-enable_drefs") + 1], "0");
  assert.equal(data.args[data.args.indexOf("-use_absolute_path") + 1], "0");
  assert.equal(data.env.BG_INSPECTION_TEST_SECRET, undefined); assert.equal(data.mode, 0o600);
  assert.match(data.limits, /Max address space\s+1073741824\s+1073741824/);
  assert.match(data.limits, /Max cpu time\s+5\s+5/);
  assert.match(data.limits, /Max open files\s+64\s+64/);
  assert.match(data.limits, /Max core file size\s+0\s+0/);
});
test("parallelism and in-flight cancellation are bounded per inspector", async () => {
  const executable = await tool("parallel-stall", "setInterval(() => {}, 1000);");
  const inspect = createVideoInspector({ executable, timeoutMs: 1000 }); const c = new AbortController();
  const a = inspect(silent, { signal: c.signal }), b = inspect(silent, { signal: c.signal });
  assert.equal((await inspect(silent)).reason, "INSPECTION_BUSY"); c.abort();
  assert.deepEqual((await Promise.all([a, b])).map(r => r.reason), ["CANCELLED", "CANCELLED"]);
});
test("caller buffer mutation cannot change bytes after inspection starts", real, async () => {
  const b = Buffer.from(silent); const pending = createVideoInspector()(b); b.fill(0);
  assert.equal((await pending).sha256, createHash("sha256").update(silent).digest("hex"));
});

test("abort terminates an already-running subprocess, not merely queued IO", async () => {
  const ready = path.join(directory, "running.json");
  const executable = await tool("running-child", `require('fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000);`);
  const c = new AbortController();
  const pending = createVideoInspector({ executable, timeoutMs: 2000 })(silent, { signal: c.signal });
  for (let i = 0; i < 100 && !existsSync(ready); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(ready), "fixture subprocess started");
  const pid = Number(readFileSync(ready, "utf8")); c.abort();
  assert.equal((await pending).reason, "CANCELLED");
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("undefined frame-rate evidence fails closed instead of inventing a rate", async () => {
  const output = { format: { size: String(silent.length), duration: "4" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1280, height: 720, duration: "4", sample_aspect_ratio: "1:1", avg_frame_rate: "0/0" }] };
  const executable = await tool("missing-rate", `process.stdout.write(${JSON.stringify(JSON.stringify(output))});`);
  const r = await createVideoInspector({ executable })(silent);
  assert.deepEqual(r, { status: "unsupported", reason: "INCOMPLETE_STREAM_METADATA" });
  assert.equal(assessInstagramVideoCandidate(r).status, "unavailable");
});

test("missing video duration is not fabricated from container duration", async () => {
  const output = { format: { size: String(silent.length), duration: "4" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1280, height: 720, sample_aspect_ratio: "1:1", avg_frame_rate: "24/1" }] };
  const executable = await tool("missing-video-duration", `process.stdout.write(${JSON.stringify(JSON.stringify(output))});`);
  assert.deepEqual(await createVideoInspector({ executable })(silent), { status: "unsupported", reason: "INCOMPLETE_STREAM_METADATA" });
});
