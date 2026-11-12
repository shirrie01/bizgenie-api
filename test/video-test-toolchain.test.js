const assert = require("node:assert/strict");
const { test } = require("node:test");
const { checkVideoTestToolchain } = require("../scripts/check-video-test-toolchain");
test("required inspection test tools are executable and report their versions", () => {
  const tools = checkVideoTestToolchain();
  assert.match(tools.ffprobe, /^ffprobe version /);
  assert.match(tools.prlimit, /^prlimit from util-linux /);
});
test("missing FFprobe is a clear prerequisite failure, not a skipped test", () => {
  assert.throws(() => checkVideoTestToolchain({ probePath: "/missing/test-ffprobe" }), /Required video test tool unavailable: ffprobe/);
});
