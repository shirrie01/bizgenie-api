// Media tests need ffmpeg/ffprobe/prlimit. Locally they skip when absent; in CI (CI=true) a missing tool is a FAILURE, never a silent skip.
const { execFileSync } = require("node:child_process");
function haveMediaTools() {
  try { for (const t of ["ffmpeg", "ffprobe"]) execFileSync(t, ["-version"], { stdio: "ignore" }); execFileSync("/usr/bin/prlimit", ["--version"], { stdio: "ignore" }); return true; }
  catch { if (process.env.CI) throw new Error("Required media test tools (ffmpeg, ffprobe, util-linux prlimit) are missing in CI; refusing to skip inspection tests"); return false; }
}
module.exports = { haveMediaTools };
