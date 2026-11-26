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
function revJson(spec, digest, ready = true, envOverride) { const { _ann, ...r } = spec; return { status: { imageDigest: digest.startsWith('sha256:') ? `${REPO}/x@${digest}` : digest, conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] }, metadata: { annotations: _ann }, spec: r }; }
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
test('A0 URL validation: both Cloud Run hostname styles, exact tag prefix, nothing else', { skip: !haveTools }, () => {
  const src = fs.readFileSync(path.join(S, 'a0-prepare.sh'), 'utf8'); const fn = src.slice(src.indexOf('# BEGIN url-validation'), src.indexOf('# END url-validation'));
  const ok = (a, t, g) => spawnSync('bash', ['-c', `${fn}\nvalid_service_urls "$1" "$2" "$3"`, 'x', a, t, g]).status === 0; const TG = 'a0-dfd49116';
  const legacy = 'https://bizgenie-api-staging-abc123xyz-ew.a.run.app', regional = 'https://bizgenie-api-staging-303691956826.europe-west1.run.app';
  assert.ok(ok(legacy, `https://${TG}---bizgenie-api-staging-abc123xyz-ew.a.run.app`, TG)); assert.ok(ok(regional, `https://${TG}---bizgenie-api-staging-303691956826.europe-west1.run.app`, TG));
  const bad = [[legacy, `https://other-tag---bizgenie-api-staging-abc123xyz-ew.a.run.app`], [legacy, `https://${TG}---bizgenie-api-staging-zzz-ew.a.run.app`], [legacy, regional], [regional, `https://${TG}---bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app`],
    [legacy, `https://${TG}--bizgenie-api-staging-abc123xyz-ew.a.run.app`], [legacy, `http://${TG}---bizgenie-api-staging-abc123xyz-ew.a.run.app`], [legacy, `https://${TG}---bizgenie-api-staging-abc123xyz-ew.a.run.app/x`], [legacy, ''],
    ['https://bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app', `https://${TG}---bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app`], ['https://evil.example.com', `https://${TG}---evil.example.com`],
    ['https://bizgenie-api-staging-303691956826.us-central1.run.app', `https://${TG}---bizgenie-api-staging-303691956826.us-central1.run.app`], [`${regional}/`, `https://${TG}---bizgenie-api-staging-303691956826.europe-west1.run.app/`], ['', '']];
  for (const [a, t] of bad) assert.ok(!ok(a, t, TG), `${a} | ${t}`); assert.ok(!ok(legacy, `https://BAD---bizgenie-api-staging-abc123xyz-ew.a.run.app`, 'BAD'));
});

function setLiveDigest(w, rev, value) { const f = path.join(w.d, `rev-${rev}.json`); const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (value === undefined) delete j.status.imageDigest; else j.status.imageDigest = value; fs.writeFileSync(f, JSON.stringify(j)); }
test('digest normalization: full Cloud Run repository@sha256 and bare digests are accepted for the protected rollback revisions', { skip: !haveTools }, () => {
  for (const form of [`${REPO}/bizgenie-studio-bridge@${BBD}`, BBD, `us-docker.pkg.dev/other/path/img@${BBD}`]) {
    const w = world(); setLiveDigest(w, BB, form); const r = w.run('a0-deploy.sh', ['rollback-bridge']); assert.strictEqual(r.status, 0, form + out(r)); assert.match(w.calls(), new RegExp(`update-traffic bizgenie-studio-bridge-staging .*--to-revisions=${BB}=100`));
  }
});
test('digest normalization: wrong, malformed, uppercase, short and missing live digests fail closed everywhere', { skip: !haveTools }, () => {
  const bad = [`${REPO}/x@sha256:${'1'.repeat(64)}`, `${REPO}/x@sha256:${'A'.repeat(64)}`, `${REPO}/x@sha256:${'1'.repeat(63)}`, `${REPO}/x@sha1:${'1'.repeat(64)}`, `${REPO}/x@sha256:${BBD.slice(7)}00`, 'sha256:', '', undefined];
  for (const v of bad) {
    let w = world(); setLiveDigest(w, BB, v); let r = w.run('a0-deploy.sh', ['rollback-bridge']); assert.notStrictEqual(r.status, 0, String(v)); assert.doesNotMatch(w.calls(), /update-traffic/, String(v));
    w = world(); setLiveDigest(w, NEWA, v); r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.notStrictEqual(r.status, 0, 'api ' + String(v)); assert.match(r.stderr, /STOP:/, 'api ' + String(v));
  }
});
test('digest normalization: a new revision whose live digest differs from the reference is refused after deploy; matching full-reference digests pass', { skip: !haveTools }, () => {
  let w = world(); setLiveDigest(w, NEWA, `${REPO}/bizgenie-api@sha256:${'9'.repeat(64)}`); let r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /differs from API_REF/);
  w = world(); setLiveDigest(w, NEWA, `${REPO}/bizgenie-api@${NAD}`); r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF }); assert.strictEqual(r.status, 0, out(r));
});
test('digest normalization in shift-bridge: live full-reference digest of the A0 revision must equal the accepted digest', { skip: !haveTools }, () => {
  const { w, r } = readyToShift(); setLiveDigest(w, NEWB, `${REPO}/bizgenie-studio-bridge@sha256:${'7'.repeat(64)}`); const res = r(); assert.notStrictEqual(res.status, 0); assert.doesNotMatch(w.calls(), /update-traffic/);
  const s = readyToShift(); setLiveDigest(s.w, BB, 'garbage'); const res2 = s.r(); assert.notStrictEqual(res2.status, 0); assert.doesNotMatch(s.w.calls(), /update-traffic/);
});
test('prepare and smoke use the same strict normalization (static audit)', () => {
  for (const f of ['a0-deploy.sh', 'a0-prepare.sh']) { const s = fs.readFileSync(path.join(S, f), 'utf8'); assert.match(s, /norm_digest\(\)/, f); assert.match(s, /\^sha256:\[a-f0-9\]\{64\}\$/, f); }
  const sm = fs.readFileSync(path.join(S, 'a0-smoke.sh'), 'utf8'); assert.match(sm, /LIVE=\$\{LIVE##\*@\}/); assert.match(sm, /\^sha256:\[a-f0-9\]\{64\}\$/);
  for (const f of ['a0-deploy.sh', 'a0-prepare.sh', 'a0-smoke.sh']) assert.doesNotMatch(fs.readFileSync(path.join(S, f), 'utf8'), /\$\(gcloud run revisions describe[^)]*imageDigest[^)]*\)"? = /, f);
});

// ---- BG-RELEASE08 A0 reconciliation: exactly two reviewed API template differences ----
const OLDREF = (key = '1') => ({ name: 'SUPABASE_SERVICE_ROLE_KEY', valueFrom: { secretKeyRef: { name: 'bizgenie-supabase-service-role-key', key } } });
const NEWREF = (name = 'bizgenie-staging-supabase-service-role-key', key = '1') => ({ name: 'SUPABASE_SERVICE_ROLE_KEY', valueFrom: { secretKeyRef: { key, name } } }); // note: key order differs from OLDREF on purpose
const ENVSTG = { name: 'BIZGENIE_ENVIRONMENT', value: 'staging' }, ISO = (v = 'local') => ({ name: 'VIDEO_INSPECTION_ISOLATION', value: v }), DB = { name: 'BRAND_BRAIN_DATABASE_URL', valueFrom: { secretKeyRef: { name: 'bizgenie-staging-database-url', key: 'latest' } } };
const EVR = 'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-7178999999';
const recon = (svcEnv, revEnv, env = { EV_RECONCILIATION: EVR }) => { const w = world({ svcEnv, revEnv }); return { w, r: w.run('a0-deploy.sh', ['api'], { API_REF: APIREF, ...env }) }; };
test('reconciliation: exactly the two reviewed differences are accepted, with the founder approval reference', { skip: !haveTools }, () => {
  const { w, r } = recon([ENVSTG, DB, ISO(), NEWREF()], [ENVSTG, DB, OLDREF('latest')]); assert.strictEqual(r.status, 0, out(r)); assert.match(out(r), /approved reconciliation/); assert.match(out(r), /bizgenie-supabase-service-role-key@latest->bizgenie-staging-supabase-service-role-key@1/); assert.match(w.calls(), /run deploy bizgenie-api-staging .*--no-traffic/);
  assert.doesNotMatch(out(r), /local/);
});
test('reconciliation: the approval reference is mandatory when the differences are present', { skip: !haveTools }, () => {
  for (const env of [{}, { EV_RECONCILIATION: 'https://example.com/x' }, { EV_RECONCILIATION: 'https://github.com/shirrie01/bizgenie-api/issues/1#issuecomment-5' }]) { const { w, r } = recon([ENVSTG, DB, ISO(), NEWREF()], [ENVSTG, DB, OLDREF()], env); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /EV_RECONCILIATION/); assert.doesNotMatch(w.calls(), /run deploy/); }
});
test('reconciliation: any other content, extra drift or a changed value is refused', { skip: !haveTools }, () => {
  const bad = {
    isolationOther: [[ENVSTG, DB, ISO('bubblewrap'), NEWREF()], [ENVSTG, DB, OLDREF()]], notStaging: [[{ name: 'BIZGENIE_ENVIRONMENT', value: 'production' }, DB, ISO(), NEWREF()], [{ name: 'BIZGENIE_ENVIRONMENT', value: 'production' }, DB, OLDREF()]],
    otherSecretName: [[ENVSTG, DB, ISO(), NEWREF('some-other-secret')], [ENVSTG, DB, OLDREF()]], latestVersion: [[ENVSTG, DB, ISO(), NEWREF(undefined, 'latest')], [ENVSTG, DB, OLDREF()]], version2: [[ENVSTG, DB, ISO(), NEWREF(undefined, '2')], [ENVSTG, DB, OLDREF()]],
    servingNotHistorical: [[ENVSTG, DB, ISO(), NEWREF()], [ENVSTG, DB, { name: 'SUPABASE_SERVICE_ROLE_KEY', valueFrom: { secretKeyRef: { name: 'unknown', key: '1' } } }]],
    plusDbSecretChange: [[ENVSTG, { ...DB, valueFrom: { secretKeyRef: { name: 'other-db', key: 'latest' } } }, ISO(), NEWREF()], [ENVSTG, DB, OLDREF()]], plusNewVariable: [[ENVSTG, DB, ISO(), NEWREF(), { name: 'EXTRA_FLAG', value: 'true' }], [ENVSTG, DB, OLDREF()]],
    isolationChangedNotAdded: [[ENVSTG, DB, ISO('local'), NEWREF()], [ENVSTG, DB, ISO('bubblewrap'), OLDREF()]], literalKey: [[ENVSTG, DB, ISO(), { name: 'SUPABASE_SERVICE_ROLE_KEY', value: 'literal' }], [ENVSTG, DB, OLDREF()]],
  };
  for (const [name, [s, v]] of Object.entries(bad)) { const { w, r } = recon(s, v); assert.notStrictEqual(r.status, 0, name); assert.match(r.stderr, /STOP:/, name); assert.doesNotMatch(w.calls(), /run deploy/, name); assert.doesNotMatch(out(r), /literal/, name); }
});
test('reconciliation never applies to the bridge: the same differences are refused there', { skip: !haveTools }, () => {
  const w = world({ svcEnv: [ENVSTG, DB, ISO(), NEWREF()], revEnv: [ENVSTG, DB, OLDREF()] }); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), '{}'); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-bridge-env.yaml'), 'A: "b"\n');
  const r = w.run('a0-deploy.sh', ['bizgenie'.slice(0, 0) + 'bridge'], { BRIDGE_REF: BRREF, EV_RECONCILIATION: EVR }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /template differs/); assert.doesNotMatch(w.calls(), /run deploy/);
});
test('check-templates is read-only and reports both services', { skip: !haveTools }, () => {
  let w = world({ svcEnv: [ENVSTG, DB, ISO(), NEWREF()], revEnv: [ENVSTG, DB, OLDREF()] }); let r = w.run('a0-deploy.sh', ['check-templates'], { EV_RECONCILIATION: EVR });
  assert.match(out(r), /approved reconciliation/); assert.match(out(r), /bridge template vs serving/); assert.match(out(r), /secret-backed env vars/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
  w = world({ svcEnv: [ENVSTG, ISO()], revEnv: [ENVSTG, ISO()] }); r = w.run('a0-deploy.sh', ['check-templates']); assert.strictEqual(r.status, 0, out(r)); assert.match(out(r), /TEMPLATE CHECK: PASS/); assert.match(out(r), /env variable NAMES/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
  w = world({ svcEnv: [ENVSTG, DB, ISO('bubblewrap'), NEWREF()], revEnv: [ENVSTG, DB, OLDREF()] }); r = w.run('a0-deploy.sh', ['check-templates'], { EV_RECONCILIATION: EVR }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /TEMPLATE CHECK: FAIL/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
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
