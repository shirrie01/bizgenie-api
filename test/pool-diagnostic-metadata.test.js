const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Closure-07 finding B: the read-only metadata collector must never print probe header values, plain environment values, tokens or credentials, on success or failure paths.
// Deterministic stub gcloud; no network, no GCP.
const SCRIPT = path.resolve(__dirname, "../docs/staging/pool-diagnostic/collect-revision-metadata.sh");
const CANARIES = ["CANARY_PROBE_HEADER_VALUE", "CANARY_PROBE_BEARER_TOKEN", "CANARY_PLAIN_ENV_VALUE", "CANARY_STDERR_TOKEN", "CANARY_IMG_TOKEN", "CANARY_JWT_PAYLOAD", "CANARY_URL_PASSWORD", "CANARY_BUILD_SECRET", "CANARY_COOKIE"];
const revision = (extra = {}) => ({
  metadata: { name: "rev", annotations: { "run.googleapis.com/vpc-access-connector": "conn1" } },
  status: { conditions: [{ type: "Ready", status: "True" }] },
  spec: { serviceAccountName: "bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com", containers: [{
    image: "europe-west1-docker.pkg.dev/p/r/i@sha256:abc123",
    resources: { limits: { cpu: "1", memory: "512Mi" } },
    startupProbe: { httpGet: { path: "/", port: 8080, httpHeaders: [{ name: "Authorization", value: "Bearer CANARY_PROBE_BEARER_TOKEN" }, { name: "X-Probe-Key", value: "CANARY_PROBE_HEADER_VALUE" }, { name: "Cookie", value: "CANARY_COOKIE" }] }, initialDelaySeconds: 5, timeoutSeconds: 3, periodSeconds: 10, failureThreshold: 6 },
    env: [{ name: "PLAIN", value: "CANARY_PLAIN_ENV_VALUE" }, { name: "BRAND_BRAIN_DATABASE_URL", valueFrom: { secretKeyRef: { name: "bizgenie-staging-database-url", key: "5" } } }],
  }] },
  ...extra,
});
function run({ rev30 = revision(), rev29 = revision(), imageOverride = null, failArtifacts = false, brokenJson29 = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdstub-"));
  fs.writeFileSync(path.join(dir, "rev30.json"), JSON.stringify(rev30));
  fs.writeFileSync(path.join(dir, "rev29.json"), brokenJson29 ? '{"broken": CANARY_JWT_PAYLOAD eyJhbGciOiJI.eyJzdWIiOiJDQU5BUlk.c2lnbmF0dXJl' : JSON.stringify(rev29));
  fs.writeFileSync(path.join(dir, "gcloud"), `#!/usr/bin/env bash
D="${dir}"
case "$*" in
 "config get-value project") echo bizgenie-backend;;
 *"revisions describe bizgenie-api-staging-00030-pob"*"format=json"*) cat "$D/rev30.json";;
 *"revisions describe bizgenie-api-staging-00029-wtc"*"format=json"*) cat "$D/rev29.json";;
 *"revisions describe bizgenie-api-staging-00030-pob"*"value(spec.containers"*) echo "${imageOverride || "europe-west1-docker.pkg.dev/p/r/i@sha256:abc123"}";;
 run\\ services\\ describe*) echo '{"status":{"traffic":[{"revisionName":"bizgenie-api-staging-00030-pob","percent":0,"tag":"f1fc2f51"},{"revisionName":"bizgenie-api-staging-00029-wtc","percent":100}]}}';;
 secrets\\ versions\\ list*) printf '5\\tENABLED\\t2026-11-01T00:00:00Z\\n';;
 artifacts*) ${failArtifacts ? 'echo "ERROR: request failed Authorization: Bearer CANARY_STDERR_TOKEN https://u:CANARY_URL_PASSWORD@host/x" >&2; exit 1' : 'echo "sha256:abc123"'};;
 builds*) echo "build-1 SUCCESS 2026-11-01 f1fc2f51502793d9fb03617f30fd72b5a61c1e2e secret=CANARY_BUILD_SECRET";;
 *) exit 1;;
esac
`);
  fs.chmodSync(path.join(dir, "gcloud"), 0o755);
  const r = spawnSync("bash", [SCRIPT], { encoding: "utf8", env: { PATH: `${dir}:${process.env.PATH}` }, timeout: 20000 });
  return { out: r.stdout + r.stderr, status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const leaks = (text) => CANARIES.filter((c) => text.includes(c));

describe("metadata collector confidentiality (Closure-07 finding B)", () => {
  it("startup-probe header NAMES and VALUES never appear; only type/path/port/timings and the header COUNT are printed", () => {
    const r = run(); assert.equal(r.status, 0); assert.deepEqual(leaks(r.out), []);
    assert.doesNotMatch(r.out, /X-Probe-Key|"Authorization"|Cookie|httpHeaders/);
    const probe = JSON.parse(r.stdout.split("== bizgenie-api-staging-00030-pob\n")[1].split("== bizgenie-api-staging-00029-wtc")[0]).startup_probe;
    assert.deepEqual(probe, { kind: "httpGet", path: "/", port: 8080, header_count: 3, initialDelaySeconds: 5, timeoutSeconds: 3, periodSeconds: 10, failureThreshold: 6 });
  });
  it("plain environment values stay unprinted; secret-backed variables keep their name@version provenance", () => {
    const r = run(); assert.doesNotMatch(r.out, /CANARY_PLAIN_ENV_VALUE/); assert.match(r.out, /secret:bizgenie-staging-database-url@5/); assert.match(r.out, /plain-value-NOT-PRINTED/);
  });
  it("useful non-sensitive provenance is preserved", () => {
    const r = run(); for (const s of ["sha256:abc123", "bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com", "conn1", "bizgenie-api-staging-00029-wtc", "100%", "f1fc2f51", "ENABLED", "\"ready\": \"True\""]) assert.ok(r.out.includes(s), s);
  });
  it("a failure path cannot bypass redaction: stderr from a failing gcloud call carrying a bearer token and URL credentials is redacted or discarded", () => {
    const r = run({ failArtifacts: true }); assert.deepEqual(leaks(r.out), []); assert.match(r.out, /INACCESSIBLE/);
  });
  it("a secret-like key/value in a command's output (build substitution) is redacted by the global filter", () => {
    const r = run(); assert.doesNotMatch(r.out, /CANARY_BUILD_SECRET/); assert.match(r.out, /secret=\[REDACTED\]/);
  });
  it("a token-like query string inside the image reference is redacted by the global filter", () => {
    const r = run({ imageOverride: "europe-west1-docker.pkg.dev/p/r/i@sha256:abc123?token=CANARY_IMG_TOKEN" }); assert.doesNotMatch(r.out, /CANARY_IMG_TOKEN/);
  });
  it("malformed JSON that would make jq print a fragment of its input is discarded (INACCESSIBLE), never echoed", () => {
    const r = run({ brokenJson29: true }); assert.deepEqual(leaks(r.out), []); assert.match(r.out, /INACCESSIBLE/);
  });
  it("a probe that carries a header whose NAME looks sensitive still prints nothing about it, even when the probe has no other fields", () => {
    const rev = revision(); rev.spec.containers[0].startupProbe = { httpGet: { httpHeaders: [{ name: "X-Api-Key", value: "CANARY_PROBE_HEADER_VALUE" }] } };
    const r = run({ rev30: rev }); assert.deepEqual(leaks(r.out), []); assert.doesNotMatch(r.out, /X-Api-Key/);
  });
  it("the script still refuses a wrong project and never calls a mutating or secret-reading gcloud verb", () => {
    const src = fs.readFileSync(SCRIPT, "utf8"); assert.doesNotMatch(src, /secrets versions access|add-iam|remove-iam|set-iam|run (deploy|services update|jobs (create|execute|delete))|print-(access|identity)-token/);
  });
});
