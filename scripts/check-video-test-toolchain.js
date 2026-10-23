// Test prerequisites only. This is not runtime packaging or sandbox acceptance.
const { spawnSync } = require("node:child_process");
function checkVideoTestToolchain({ probePath = "/usr/bin/ffprobe", limitPath = "/usr/bin/prlimit" } = {}) {
  const inspect = (name, executable, args, expected) => {
    const result = spawnSync(executable, args, { encoding: "utf8", timeout: 3000, maxBuffer: 64 * 1024,
      shell: false, env: { LANG: "C", LC_ALL: "C" } });
    const firstLine = (result.stdout || "").split(/\r?\n/, 1)[0];
    if (result.error || result.status !== 0 || !expected.test(firstLine)) {
      throw new Error(`Required video test tool unavailable: ${name}. Install the ffmpeg and util-linux test packages; do not skip inspection tests.`);
    }
    return firstLine;
  };
  return Object.freeze({
    ffprobe: inspect("ffprobe", probePath, ["-version"], /^ffprobe version \S+/),
    prlimit: inspect("prlimit", limitPath, ["--version"], /^prlimit from util-linux \S+/),
  });
}
if (require.main === module) {
  try { console.log(JSON.stringify(checkVideoTestToolchain())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { checkVideoTestToolchain };
