// Proves the media toolchain works in THIS runtime (used by the staging image build and by the preflight): makes a tiny H.264 file with ffmpeg, measures it with the
// production inspector, fully decodes it, and checks that a damaged copy is rejected. Needs no network, no credentials and writes only to the temp directory.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createVideoInspector, createHardenedVideoInspector } = require("../../src/media/videoInspection");
const { createVideoDecodeCheck } = require("../../src/media/videoDecode");
const { validateGeneratedVideo } = require("../../src/media/platformMediaProfiles");

async function main() {
  const local = process.env.VIDEO_INSPECTION_ISOLATION !== "bubblewrap";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bg-selftest-"));
  try {
    const file = path.join(dir, "t.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", file]);
    const bytes = fs.readFileSync(file);
    const measured = await (local ? createVideoInspector({ isolation: "local" }) : createHardenedVideoInspector())(bytes);
    const reasons = validateGeneratedVideo(measured, { aspect_ratio: "9:16", duration_seconds: 4 });
    const decode = createVideoDecodeCheck({ isolation: local ? "local" : "bubblewrap" });
    const decoded = await decode(bytes);
    const damaged = Buffer.from(bytes); for (let i = Math.floor(damaged.length / 2); i < Math.floor(damaged.length / 2) + 400; i += 1) damaged[i] = 0xff;
    const rejected = await decode(damaged);
    const ok = measured.status === "measured" && reasons.length === 0 && decoded.status === "decoded" && rejected.status === "invalid";
    console.log(JSON.stringify({ ok, isolation: local ? "local" : "bubblewrap", measured: measured.status, measured_reason: measured.reason, rules: reasons, decode: decoded.status, damaged: rejected.status }));
    process.exit(ok ? 0 : 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch((e) => { console.log(JSON.stringify({ ok: false, error: e.message })); process.exit(1); });
