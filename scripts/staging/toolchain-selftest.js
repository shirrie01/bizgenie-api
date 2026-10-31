// Container/CI/preflight entry for the media toolchain self-test (src/media/toolchainSelfTest.js). Defaults to the PRODUCTION isolation (bubblewrap); set
// VIDEO_INSPECTION_ISOLATION=local only for disposable isolated staging. Exit 0 = pass, 2 = isolation/tool unavailable (fail closed), 1 = any other failure.
const { runToolchainSelfTest } = require("../../src/media/toolchainSelfTest");
runToolchainSelfTest({ isolation: process.env.VIDEO_INSPECTION_ISOLATION || "bubblewrap" }).then((r) => {
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : /UNAVAILABLE|SANDBOX|TOOL/.test(String(r.failure)) ? 2 : 1);
});
