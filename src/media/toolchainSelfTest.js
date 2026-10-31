// Proves, in THIS runtime and with the configured isolation, that the media toolchain works and fails the way it must (BG-LAUNCH-004). Used at startup (the service refuses to
// enable video/uploads on a failure), by the container smoke test and by the staging preflight. It needs no network or credentials and writes only to the temp directory.
// It makes one tiny H.264 file with ffmpeg (trusted input, outside the sandbox), then through the SAME inspectors production uses: measures it, applies the generated-video rules,
// fully decodes it, and checks that a damaged copy and a disguised playlist are rejected. "unavailable" (tool or sandbox missing) is a failure, never a pass.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVideoInspector, createHardenedVideoInspector } = require("./videoInspection");
const { createVideoDecodeCheck } = require("./videoDecode");
const { validateGeneratedVideo } = require("./platformMediaProfiles");

async function runToolchainSelfTest({ isolation = "bubblewrap" } = {}) {
  if (!["local", "bubblewrap"].includes(isolation)) return { ok: false, isolation, failure: "UNKNOWN_ISOLATION" };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bg-selftest-"));
  const out = { ok: false, isolation, uid: typeof process.getuid === "function" ? process.getuid() : null };
  try {
    const file = path.join(dir, "t.mp4");
    try { execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", file], { timeout: 30000 }); }
    catch { return { ...out, failure: "FFMPEG_UNAVAILABLE" }; }
    const bytes = fs.readFileSync(file);
    const inspect = isolation === "local" ? createVideoInspector({ isolation: "local" }) : createHardenedVideoInspector();
    const decode = createVideoDecodeCheck({ isolation });
    const measured = await inspect(bytes);
    if (measured.status === "unavailable") return { ...out, failure: measured.reason };
    const rules = measured.status === "measured" ? validateGeneratedVideo(measured, { aspect_ratio: "9:16", duration_seconds: 4 }) : ["NOT_MEASURED"];
    const decoded = await decode(bytes);
    if (decoded.status === "unavailable") return { ...out, failure: decoded.reason };
    const damaged = Buffer.from(bytes); for (let i = Math.floor(damaged.length / 2); i < Math.floor(damaged.length / 2) + 400; i += 1) damaged[i] = 0xff;
    const damagedVerdict = await decode(damaged);
    const playlist = await decode(Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypisom"), Buffer.alloc(8), Buffer.from("\nffconcat version 1.0\nfile '/etc/passwd'\n")]));
    const ok = measured.status === "measured" && rules.length === 0 && decoded.status === "decoded" && damagedVerdict.status === "invalid" && playlist.status === "invalid";
    return { ...out, ok, measured: measured.status, rules, decode: decoded.status, damaged: damagedVerdict.status, playlist: playlist.status, ...(ok ? {} : { failure: "SELFTEST_ASSERTION_FAILED" }) };
  } catch (error) { return { ...out, failure: "SELFTEST_ERROR", detail: String(error.message).slice(0, 120) }; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = { runToolchainSelfTest };
