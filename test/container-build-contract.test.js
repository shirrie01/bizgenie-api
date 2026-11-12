const assert = require("node:assert/strict");
const { test } = require("node:test");
const { checkContainerBuildContract } = require("../scripts/check-container-build-contract");
test("canonical Docker installs the matching lockfile with a pinned Node base and clean context", () => {
  assert.deepEqual(checkContainerBuildContract(), { node_major: 22, install: "npm ci", digest_pinned: true, context_isolated: true });
});
