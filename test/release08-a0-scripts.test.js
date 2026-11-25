'use strict';
// BG-RELEASE08 deployment-script safeguards, tested against a fixture-driven gcloud stub (no cloud access).
const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const { spawnSync, execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..'); const S = path.join(root, 'scripts', 'release08'); const STUB = path.join(__dirname, 'fixtures', 'release08', 'gcloud-stub.sh');
const have = (c) => spawnSync('sh', ['-c', `command -v ${c}`]).status === 0; const haveTools = have('bash') && have('jq') && have('sha256sum');
const BB = 'bizgenie-studio-bridge-staging-step7-c023184c', BA = 'bizgenie-api-staging-00029-wtc', NEWB = 'bizgenie-studio-bridge-staging-00040-xyz', NEWA = 'bizgenie-api-staging-00041-abc';
const BBD = 'sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18', BAD = 'sha256:e443d4bc136c79080f6535f78a7fb72a03d69a6ea39b91473ee3d84e240f7ae2';
const NBD = 'sha256:' + '5'.repeat(64), NAD = 'sha256:' + 'a'.repeat(64); const REPO = 'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy';
const ctr = (env, extra = {}) => ({ name: 'c', image: 'x', ports: [{ containerPort: 8080 }], resources: { limits: { cpu: '1', memory: '512Mi' } }, env, ...extra });
const tmpl = (env, sa = 'sa@x', ann = {}) => ({ serviceAccountName: sa, containerConcurrency: 80, timeoutSeconds: 300, containers: [ctr(env)], _ann: ann });
function svcJson(name, spec, traffic, latest) { return { status: { latestReadyRevisionName: latest, traffic, url: 'https://x.run.app' }, spec: { template: { metadata: { annotations: spec._ann }, spec: (({ _ann, ...r }) => r)(spec) } } }; }
function revJson(spec, digest, ready = true, envOverride) { const { _ann, ...r } = spec; return { status: { imageDigest: digest, conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] }, metadata: { annotations: _ann }, spec: r }; }
function world({ svcEnv, revEnv, svcSa = 'sa@x', revSa = 'sa@x', bridgeEnvOnNew } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-a0-')); const d = path.join(home, 'stub'); fs.mkdirSync(d); fs.mkdirSync(path.join(home, '.bg-private'));
  const envA = [{ name: 'FOO', value: 'v1' }, { name: 'SECRET_A', valueFrom: { secretKeyRef: { name: 's1', key: 'latest' } } }];
  const W = (n, o) => fs.writeFileSync(path.join(d, n), JSON.stringify(o));
  const sSpec = tmpl(svcEnv || envA, svcSa), rSpec = tmpl(revEnv || envA, revSa);
  W(`svc-bizgenie-api-staging.json`, svcJson('a', sSpec, [{ revisionName: BA, percent: 100 }, { revisionName: NEWA, percent: 0, tag: 'a0-dfd49116' }], BA)); W(`rev-${BA}.json`, revJson(rSpec, BAD)); W(`rev-${NEWA}.json`, revJson(rSpec, NAD));
  W(`svc-bizgenie-studio-bridge-staging.json`, svcJson('b', sSpec, [{ revisionName: BB, percent: 100 }, { revisionName: NEWB, percent: 0, tag: 'a0-dfd49116', url: 'https://a0---b.run.app' }], BB));
  W(`rev-${BB}.json`, revJson(rSpec, BBD)); const nspec = tmpl([{ name: 'BG_BRIDGE_REVISION', value: bridgeEnvOnNew ?? NEWA }]); W(`rev-${NEWB}.json`, revJson(nspec, NBD));
  fs.writeFileSync(path.join(d, 'deploy-effect.sh'), '#!/bin/sh\ntrue\n'); const bin = path.join(home, 'bin'); fs.mkdirSync(bin); fs.copyFileSync(STUB, path.join(bin, 'gcloud')); fs.chmodSync(path.join(bin, 'gcloud'), 0o755);
  return { home, d, run: (script, args, env = {}, input) => spawnSync('bash', [path.join(S, script), ...args], { input, encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, STUB_DIR: d, ...env } }), calls: () => (fs.existsSync(path.join(d, 'calls.log')) ? fs.readFileSync(path.join(d, 'calls.log'), 'utf8') : '') };
}
const APIREF = `${REPO}/bizgenie-api@${NAD}`, BRREF = `${REPO}/bizgenie-studio-bridge@${NBD}`;
const out = (r) => r.stdout + r.stderr;
test('template value change with identical variable names is refused and the value is never printed', { skip: !haveTools }, () => {
  const w = world({ svcEnv: [{ name: 'FOO', value: 'TOPSECRETVALUE-CHANGED' }, { name: 'SECRET_A', valueFrom: { secretKeyRef: { name: 's1', key: 'latest' } } }] });
  const r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /template differs/); assert.match(out(r), /ENV c0\.FOO/); assert.doesNotMatch(out(r), /TOPSECRETVALUE/); assert.doesNotMatch(w.calls(), /run deploy/);
});
test('secret reference change and service-account change are refused', { skip: !haveTools }, () => {
  let w = world({ svcEnv: [{ name: 'FOO', value: 'v1' }, { name: 'SECRET_A', valueFrom: { secretKeyRef: { name: 's2', key: 'latest' } } }] });
  let r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /ENVREF c0\.SECRET_A/); assert.doesNotMatch(w.calls(), /run deploy/);
  w = world({ svcSa: 'other@x' }); r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /SA serviceAccount/); assert.doesNotMatch(w.calls(), /run deploy/);
});
test('an identical template passes the comparison and deploys with no traffic', { skip: !haveTools }, () => {
  const w = world(); const r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.match(w.calls(), /run deploy bizgenie-api-staging .*--no-traffic/); assert.match(out(r), /NEW_API_REVISION=/);
});
function readyToShift(over = {}) {
  const w = world(over.world); const st = { apiRevision: NEWA, apiDigest: NAD, bridgeRevision: NEWB, bridgeDigest: NBD, bridgeTag: 'a0-dfd49116' };
  fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify(st));
  const ev = { revision: NEWB, digest: NBD, tag: 'a0-dfd49116', apiRevision: NEWA, authenticatedRead: true, checks: Array.from({ length: 8 }, (_, i) => ({ name: 'c' + i, result: 'PASS' })), passedAt: Math.floor(Date.now() / 1000), ...(over.ev || {}) };
  if (!over.noEvidence) fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-smoke-evidence.json'), JSON.stringify(ev));
  const env = { BRIDGE_REF: BRREF, A0_CONFIRM_REVISION: NEWB, ...(over.env || {}) }; return { w, r: () => w.run('a0-deploy.sh', ['shift-bridge'], env) };
}
test('shift-bridge refuses without evidence, with unauthenticated evidence, failed checks, stale evidence, wrong digest or wrong confirmation', { skip: !haveTools }, () => {
  const cases = { noEvidence: { noEvidence: true }, unauth: { ev: { authenticatedRead: false } }, failed: { ev: { checks: [{ name: 'x', result: 'FAIL' }] } }, short: { ev: { checks: [{ name: 'x', result: 'PASS' }] } }, stale: { ev: { passedAt: 1000 } }, otherRevision: { ev: { revision: 'other' } },
    otherDigest: { env: { BRIDGE_REF: `${REPO}/bizgenie-studio-bridge@sha256:${'6'.repeat(64)}` } }, wrongConfirm: { env: { A0_CONFIRM_REVISION: 'x' } }, apiPin: { world: { bridgeEnvOnNew: 'bizgenie-api-staging-99999-zzz' } } };
  for (const [name, c] of Object.entries(cases)) { const { w, r } = readyToShift(c); const res = r(); assert.notStrictEqual(res.status, 0, name); assert.match(res.stderr, /STOP:/, name); assert.doesNotMatch(w.calls(), /update-traffic/, name); }
});
test('shift-bridge with complete fresh evidence shifts by exact revision (never by tag)', { skip: !haveTools }, () => {
  const { w, r } = readyToShift(); // after the shift the stub must report the new serving revision
  fs.writeFileSync(path.join(w.d, 'traffic-effect.sh'), `#!/bin/sh\njq '.status.traffic=[{revisionName:"${NEWB}",percent:100}] | .status.latestReadyRevisionName="${NEWB}"' "$STUB_DIR/svc-bizgenie-studio-bridge-staging.json" > "$STUB_DIR/x" && mv "$STUB_DIR/x" "$STUB_DIR/svc-bizgenie-studio-bridge-staging.json"\n`);
  const res = r(); assert.strictEqual(res.status, 0, out(res)); assert.match(w.calls(), new RegExp(`update-traffic bizgenie-studio-bridge-staging .*--to-revisions=${NEWB}=100`)); assert.doesNotMatch(w.calls(), /--to-tags/);
});
test('smoke: an empty token is refused and no evidence is written', { skip: !haveTools || !have('curl') }, () => {
  const w = world(); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify({ apiRevision: NEWA, bridgeRevision: NEWB, bridgeDigest: NBD }));
  fs.writeFileSync(path.join(w.home, 'bin', 'curl'), '#!/bin/sh\nprev=; for a in "$@"; do case "$prev" in -w) fmt=1;; esac; prev=$a; done\ncase "$*" in *"-X OPTIONS"*"foreign"*) printf 403;; *"-X OPTIONS"*) printf 204;; *"-X POST"*"bootstrap"*|*"-X POST"*"uploads"*) printf 403;; *"-X POST"*) printf 401;; *) printf 401;; esac\n'); fs.chmodSync(path.join(w.home, 'bin', 'curl'), 0o755);
  const r = w.run('a0-smoke.sh', [], {}, '\n'); assert.notStrictEqual(r.status, 0); assert.match(out(r), /mandatory/); assert.ok(!fs.existsSync(path.join(w.home, '.bg-private', 'a0-smoke-evidence.json')));
});
const py = have('python3') && spawnSync('python3', ['-c', 'import yaml']).status === 0;
test('scanner patch tool: allowlist, no --remove, approved settings accepted', { skip: !py }, () => {
  const base = ['--api-image', `${REPO}/bizgenie-api@sha256:${'a'.repeat(64)}`, '--clamav-image', `${REPO}/clamav@sha256:${'b'.repeat(64)}`, '--suffix', 'a2s1', '--tag', 'a2-scanner'];
  const sample = path.join(__dirname, 'fixtures', 'release08', 'svc-sample.yaml'); const o = path.join(os.tmpdir(), 'bg-a2-out-' + process.pid + '.yaml'); const run = (...x) => spawnSync('python3', [path.join(S, 'a2-scanner-patch.py'), sample, o, ...base, ...x], { encoding: 'utf8' });
  assert.strictEqual(run('--env', 'MEDIA_STORAGE_ENABLED=true', '--env', 'MEDIA_STORAGE_BUCKET=fonzo-staging-media').status, 0);
  for (const bad of ['LINKEDIN_CLIENT_ID=x', 'MEDIA_INTAKE_ALLOW_UNSCANNED=true', 'MEDIA_STORAGE_ENABLED=false', 'SUPABASE_URL=x', 'MEDIA_STORAGE_BUCKET=Bad_Bucket!']) assert.notStrictEqual(run('--env', bad).status, 0, bad);
  assert.notStrictEqual(run('--remove', 'FOO').status, 0); assert.notStrictEqual(run('--min-instances', '0').status, 0); assert.notStrictEqual(run('--max-instances', '9').status, 0);
});
test('the single founder file is generated from the tested sources and passes a syntax check', { skip: !haveTools }, () => {
  const before = fs.readFileSync(path.join(S, 'a0-founder-run.sh'), 'utf8'); execFileSync('bash', [path.join(S, 'build-a0-bundle.sh')], { cwd: root }); assert.strictEqual(fs.readFileSync(path.join(S, 'a0-founder-run.sh'), 'utf8'), before, 'regenerate with scripts/release08/build-a0-bundle.sh');
  for (const f of ['a0-prepare.sh', 'a0-deploy.sh', 'a0-smoke.sh', 'a2-scanner-gate.sh', 'a0-founder-run.sh']) assert.strictEqual(spawnSync('bash', ['-n', path.join(S, f)]).status, 0, f);
  assert.match(before, new RegExp('bizgenie-api@sha256:af4814e7eaef97a8f46925c6738492f8649ee14038d8e9705dbb72e03604d952')); assert.match(before, /bizgenie-studio-bridge@sha256:5cfdc9a2c4ba86676a1d1f365f3edc493cf039ea7829265e80f4a5a679b1667f/);
  assert.doesNotMatch(before, /--to-tags/);
});
