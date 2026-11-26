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
function world({ svcEnv, revEnv, svcSa = 'sa@x', revSa = 'sa@x', bridgeEnvOnNew, preTagged = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-a0-')); const d = path.join(home, 'stub'); fs.mkdirSync(d); fs.mkdirSync(path.join(home, '.bg-private'));
  const envA = [{ name: 'FOO', value: 'v1' }, { name: 'SECRET_A', valueFrom: { secretKeyRef: { name: 's1', key: 'latest' } } }];
  const W = (n, o) => fs.writeFileSync(path.join(d, n), JSON.stringify(o));
  const sSpec = tmpl(svcEnv || envA, svcSa), rSpec = tmpl(revEnv || envA, revSa);
  W(`svc-bizgenie-api-staging.json`, svcJson('a', sSpec, [{ revisionName: BA, percent: 100 }, { revisionName: NEWA, percent: 0, tag: 'a0-dfd49116' }], BA)); W(`rev-${BA}.json`, revJson(rSpec, BAD)); W(`rev-${NEWA}.json`, revJson(rSpec, NAD));
  W(`svc-bizgenie-studio-bridge-staging.json`, svcJson('b', sSpec, [{ revisionName: BB, percent: 100 }, { revisionName: NEWB, percent: 0, tag: 'a0-dfd49116', url: 'https://a0---b.run.app' }], BB));
  W(`rev-${BB}.json`, revJson(rSpec, BBD)); const nspec = tmpl([{ name: 'BG_BRIDGE_REVISION', value: bridgeEnvOnNew ?? NEWA }, ...FALSE_FLAGS.map((n) => ({ name: n, value: 'false' }))]); W(`rev-${NEWB}.json`, revJson(nspec, NBD));
  const untag = (f) => { const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); j.status.traffic = j.status.traffic.filter((x) => !x.tag); fs.writeFileSync(path.join(d, f), JSON.stringify(j)); };
  if (preTagged !== true && preTagged !== 'api') untag('svc-bizgenie-api-staging.json'); if (preTagged !== true) untag('svc-bizgenie-studio-bridge-staging.json');
  // a successful deploy creates the tagged, 0% revision (the stub mirrors what Cloud Run reports afterwards)
  fs.writeFileSync(path.join(d, 'deploy-effect.sh'), `#!/bin/sh\nsvc=$3; case "$svc" in bizgenie-api-staging) rev=${NEWA};; *) rev=${NEWB};; esac\nf="$STUB_DIR/svc-$svc.json"; jq --arg r "$rev" '.status.traffic += [{revisionName:$r,percent:0,tag:"a0-dfd49116",url:"https://a0-dfd49116---x.run.app"}]' "$f" > "$f.x" && mv "$f.x" "$f"\n`); const bin = path.join(home, 'bin'); fs.mkdirSync(bin); fs.copyFileSync(STUB, path.join(bin, 'gcloud')); fs.chmodSync(path.join(bin, 'gcloud'), 0o755);
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
  const w = world({ preTagged: true, ...(over.world || {}) }); const st = { apiRevision: NEWA, apiDigest: NAD, bridgeRevision: NEWB, bridgeDigest: NBD, bridgeTag: 'a0-dfd49116', evTag: EVTAG, evTagRevision: NEWA, evReconciliation: EVR, evBridgeReconciliation: BEV, ...(over.state || {}) };
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
  const w = world({ preTagged: true }); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify({ apiRevision: NEWA, bridgeRevision: NEWB, bridgeDigest: NBD }));
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
  const w = world({ svcEnv: [ENVSTG, DB, ISO(), NEWREF()], revEnv: [ENVSTG, DB, OLDREF()], preTagged: 'api' }); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify({ apiRevision: NEWA, apiDigest: NAD })); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-bridge-env.yaml'), a0Yaml());
  const r = w.run('a0-deploy.sh', ['bridge'], { BRIDGE_REF: BRREF, EV_RECONCILIATION: EVR, EV_TAG: EVTAG, ...IDENT }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /template differs/); assert.doesNotMatch(w.calls(), /run deploy/);
});
test('check-templates is read-only and reports both services', { skip: !haveTools }, () => {
  let w = world({ svcEnv: [ENVSTG, DB, ISO(), NEWREF()], revEnv: [ENVSTG, DB, OLDREF()] }); let r = w.run('a0-deploy.sh', ['check-templates'], { EV_RECONCILIATION: EVR });
  assert.match(out(r), /approved reconciliation/); assert.match(out(r), /bridge template vs serving/); assert.match(out(r), /secret-backed env vars/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
  w = world({ svcEnv: [ENVSTG, ISO()], revEnv: [ENVSTG, ISO()] }); r = w.run('a0-deploy.sh', ['check-templates']); assert.strictEqual(r.status, 0, out(r)); assert.match(out(r), /TEMPLATE CHECK: PASS/); assert.match(out(r), /A0 environment plan/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
  w = world({ svcEnv: [ENVSTG, DB, ISO('bubblewrap'), NEWREF()], revEnv: [ENVSTG, DB, OLDREF()] }); r = w.run('a0-deploy.sh', ['check-templates'], { EV_RECONCILIATION: EVR }); assert.notStrictEqual(r.status, 0); assert.match(out(r), /TEMPLATE CHECK: FAIL/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
});

// ---- BG-RELEASE08 A0 bridge reconciliation ----
const A0_NAMES = ['BG_BRIDGE_ALLOW_DRAFT_WORKFLOW', 'BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE', 'BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING', 'BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION', 'BG_BRIDGE_ALLOW_SOCIAL_WRITES', 'BG_BRIDGE_ALLOW_STRIPE_CHECKOUT', 'BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP', 'BG_BRIDGE_ALLOW_WRITES', 'BG_BRIDGE_AUDIENCE', 'BG_BRIDGE_BIND', 'BG_BRIDGE_FOUNDER_AUTH_USER_ID', 'BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME', 'BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY', 'BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID', 'BG_BRIDGE_REVIEW_REF', 'BG_BRIDGE_REVISION', 'BG_BRIDGE_SOURCE_SHA', 'BG_BRIDGE_STUDIO_ORIGIN', 'BG_BRIDGE_TARGET_URL', 'BIZGENIE_ENVIRONMENT', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL'];
const FALSE_FLAGS = ['BG_BRIDGE_ALLOW_DRAFT_WORKFLOW', 'BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING', 'BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION', 'BG_BRIDGE_ALLOW_SOCIAL_WRITES', 'BG_BRIDGE_ALLOW_STRIPE_CHECKOUT', 'BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP', 'BG_BRIDGE_ALLOW_WRITES'];
const FOUNDER = '11111111-1111-4111-8111-111111111111', TENANT = 'tenant-sentinel-77', APPR = 'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-7175314064', EVTAG = 'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-7190000002';
const AUD = 'https://bizgenie-api-staging-abc123xyz-ew.a.run.app', sha8 = (v) => require('node:crypto').createHash('sha256').update(v).digest('hex').slice(0, 8);
const GOOD = { BG_BRIDGE_AUDIENCE: AUD, BG_BRIDGE_TARGET_URL: 'https://a0-dfd49116---' + AUD.slice(8), BG_BRIDGE_REVISION: NEWA, BG_BRIDGE_SOURCE_SHA: 'dfd49116a0fe6bde11dbc25ca4599a03b8046999', BG_BRIDGE_BIND: '0.0.0.0', BG_BRIDGE_STUDIO_ORIGIN: 'https://bizgenie-studio-staging.pages.dev',
  SUPABASE_URL: 'https://zrczojyxebwjgpymbmgu.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', BG_BRIDGE_FOUNDER_AUTH_USER_ID: FOUNDER, BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID: TENANT, BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY: 'fonzo.workspace.v1', BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME: 'Fonzo', BG_BRIDGE_REVIEW_REF: APPR };
const IDENT = { EXPECT_FOUNDER_H: sha8(FOUNDER), EXPECT_TENANT_H: sha8(TENANT), EV_APPROVAL: APPR };
function a0Values(over = {}, drop = [], extra = {}) {
  const base = Object.fromEntries(A0_NAMES.map((n) => [n, FALSE_FLAGS.includes(n) ? 'false' : n === 'BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE' ? 'true' : n === 'BIZGENIE_ENVIRONMENT' ? 'staging' : GOOD[n]]));
  const e = { ...base, ...over, ...extra }; for (const d of drop) delete e[d]; return e;
}
const toYaml = (e) => Object.entries(e).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n';
function a0Yaml(over = {}, drop = [], extra = {}) { return toYaml(a0Values(over, drop, extra)); }
const SERVING_NAMES = ['BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING', 'BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS', 'BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION', 'BG_BRIDGE_ALLOW_SOCIAL_WRITES', 'BG_BRIDGE_ALLOW_STRIPE_CHECKOUT', 'BG_BRIDGE_ALLOW_WRITES', 'BG_BRIDGE_AUDIENCE', 'BG_BRIDGE_BIND', 'BG_BRIDGE_FOUNDER_AUTH_USER_ID', 'BG_BRIDGE_REVIEW_REF', 'BG_BRIDGE_REVISION', 'BG_BRIDGE_SOURCE_SHA', 'BG_BRIDGE_STUDIO_ORIGIN', 'BG_BRIDGE_TARGET_URL', 'BIZGENIE_ENVIRONMENT', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL'];
const PRIV_T = 'PRIVATE-TENANT-VALUE-9f3', PRIV_SHA = 'f'.repeat(64);
const latestOnly = [{ name: 'BG_BRIDGE_ALLOW_DRAFT_WORKFLOW', value: 'true' }, { name: 'BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT', value: 'true' }, { name: 'BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP', value: 'true' }, { name: 'BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256', value: PRIV_SHA }, { name: 'BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID', value: 'PRIVATE-BRAND' }, { name: 'BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID', value: 'PRIVATE-PROJECT' }, { name: 'BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID', value: PRIV_T }];
const BEV = 'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-7190000001';
function bridgeWorld(mut = {}) {
  const servEnv = SERVING_NAMES.map((n) => ({ name: n, value: n === 'BG_BRIDGE_SOURCE_SHA' ? 'a'.repeat(40) : 'x' + n.length }));
  const tmplEnv = [...servEnv.map((e) => (e.name === 'BG_BRIDGE_SOURCE_SHA' ? { ...e, value: 'b'.repeat(40) } : e)), ...latestOnly];
  const w = world({ svcEnv: tmplEnv, revEnv: servEnv, preTagged: 'api' }); const sf = path.join(w.d, 'svc-bizgenie-studio-bridge-staging.json'), rf = path.join(w.d, `rev-${BB}.json`);
  const S = JSON.parse(fs.readFileSync(sf, 'utf8')), R = JSON.parse(fs.readFileSync(rf, 'utf8')); S.spec.template.spec.containers[0].name = 'bridge-latest'; R.spec.containers[0].name = 'bridge-serving';
  if (mut.svc) mut.svc(S); if (mut.rev) mut.rev(R); fs.writeFileSync(sf, JSON.stringify(S)); fs.writeFileSync(rf, JSON.stringify(R));
  const yaml = mut.yaml ?? a0Yaml(); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify({ apiRevision: NEWA, apiDigest: NAD, ...(mut.state || {}) })); fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-bridge-env.yaml'), yaml);
  const nf = path.join(w.d, `rev-${NEWB}.json`), N = JSON.parse(fs.readFileSync(nf, 'utf8')); try { N.spec.containers[0].env = Object.entries(Object.fromEntries(yaml.trim().split('\n').map((l) => [l.slice(0, l.indexOf(': ')), JSON.parse(l.slice(l.indexOf(': ') + 2))]))).map(([name, value]) => ({ name, value })); } catch { /* malformed file tests */ } if (mut.liveEnv) mut.liveEnv(N); fs.writeFileSync(nf, JSON.stringify(N));
  return { w, run: (env = {}) => w.run('a0-deploy.sh', ['bridge'], { BRIDGE_REF: BRREF, ...IDENT, EV_TAG: EVTAG, EV_RECONCILIATION: EVR, EV_BRIDGE_RECONCILIATION: BEV, ...env }) };
}
test('bridge reconciliation: the nine reviewed differences are accepted with a distinct approval; env is replaced, not inherited', { skip: !haveTools }, () => {
  const { w, run } = bridgeWorld(); const r = run(); assert.strictEqual(r.status, 0, out(r)); assert.match(w.calls(), /run deploy bizgenie-studio-bridge-staging .*--env-vars-file=.*--no-traffic/); assert.doesNotMatch(w.calls(), /update-traffic/);
  assert.match(out(r), /approved bridge reconciliation/); assert.match(out(r), /BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID/); assert.match(out(r), /container-name\(bridge-latest<-bridge-serving\)/);
  assert.doesNotMatch(out(r), new RegExp(`${PRIV_T}|PRIVATE-BRAND|PRIVATE-PROJECT|${PRIV_SHA}`));
});
test('bridge reconciliation: distinct approval is mandatory', { skip: !haveTools }, () => {
  for (const env of [{ EV_BRIDGE_RECONCILIATION: '' }, { EV_BRIDGE_RECONCILIATION: 'https://example.com/x' }, { EV_BRIDGE_RECONCILIATION: EVR, EV_RECONCILIATION: EVR }, { EV_BRIDGE_RECONCILIATION: BEV, EV_APPROVAL: BEV }, { EV_BRIDGE_RECONCILIATION: EVTAG }]) { const { w, run } = bridgeWorld(); const r = run(env); assert.notStrictEqual(r.status, 0, JSON.stringify(env)); assert.doesNotMatch(w.calls(), /run deploy/); }
});
test('bridge reconciliation: non-environment drift, secrets, volumes, probes, dependencies and extra containers are refused', { skip: !haveTools }, () => {
  const sc = (S) => S.spec.template.spec, tc = (S) => S.spec.template.spec.containers[0];
  const cases = {
    serviceAccount: { svc: (S) => { sc(S).serviceAccountName = 'other@x'; } }, limits: { svc: (S) => { tc(S).resources.limits.memory = '2Gi'; } }, ports: { svc: (S) => { tc(S).ports = [{ containerPort: 9999 }]; } }, args: { svc: (S) => { tc(S).args = ['--x']; } },
    probe: { svc: (S) => { tc(S).startupProbe = { tcpSocket: { port: 8080 } }; } }, servingProbe: { rev: (R) => { R.spec.containers[0].livenessProbe = { httpGet: { path: '/h' } }; } }, volume: { svc: (S) => { sc(S).volumes = [{ name: 'v', emptyDir: {} }]; } },
    secretVolume: { svc: (S) => { sc(S).volumes = [{ name: 'v', secret: { secretName: 's' } }]; }, rev: (R) => { R.spec.volumes = [{ name: 'v', secret: { secretName: 's' } }]; } }, concurrency: { svc: (S) => { sc(S).containerConcurrency = 5; } },
    dependencies: { svc: (S) => { S.spec.template.metadata.annotations['run.googleapis.com/container-dependencies'] = '{"a":["b"]}'; } }, minScale: { svc: (S) => { S.spec.template.metadata.annotations['autoscaling.knative.dev/minScale'] = '3'; } },
    secondContainer: { svc: (S) => { sc(S).containers.push({ name: 'side', image: 'x', env: [] }); } }, badName: { svc: (S) => { tc(S).name = 'Bad_Name'; } },
    secretEnvTemplate: { svc: (S) => { tc(S).env.push({ name: 'SUPABASE_SERVICE_ROLE_KEY', valueFrom: { secretKeyRef: { name: 's', key: '1' } } }); } }, secretEnvServing: { rev: (R) => { R.spec.containers[0].env.push({ name: 'X', valueFrom: { secretKeyRef: { name: 's', key: '1' } } }); } },
  };
  for (const [name, mut] of Object.entries(cases)) { const { w, run } = bridgeWorld(mut); const r = run(); assert.notStrictEqual(r.status, 0, name); assert.match(r.stderr, /STOP:/, name); assert.doesNotMatch(w.calls(), /run deploy/, name); }
});
test('bridge env file: unsafe flags, reserved PORT, unknown or missing names are refused before any deploy', { skip: !haveTools }, () => {
  const cases = { writes: a0Yaml({ BG_BRIDGE_ALLOW_WRITES: 'true' }), draft: a0Yaml({ BG_BRIDGE_ALLOW_DRAFT_WORKFLOW: 'true' }), bootstrap: a0Yaml({ BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP: 'true' }), social: a0Yaml({ BG_BRIDGE_ALLOW_SOCIAL_WRITES: 'true' }), stripe: a0Yaml({ BG_BRIDGE_ALLOW_STRIPE_CHECKOUT: 'true' }),
    gen: a0Yaml({ BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION: 'true' }), onboarding: a0Yaml({ BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING: 'true' }), noWorkspace: a0Yaml({ BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE: 'false' }), notStaging: a0Yaml({ BIZGENIE_ENVIRONMENT: 'production' }),
    port: a0Yaml({}, [], { PORT: '8080' }), campaignRoot: a0Yaml({}, [], { BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT: 'true' }), linkedin: a0Yaml({}, [], { LINKEDIN_CLIENT_ID: 'x' }), missing: a0Yaml({}, ['BG_BRIDGE_ALLOW_WRITES']), missingSource: a0Yaml({}, ['BG_BRIDGE_SOURCE_SHA']) };
  for (const [name, yaml] of Object.entries(cases)) { const { w, run } = bridgeWorld({ yaml }); const r = run(); assert.notStrictEqual(r.status, 0, name); assert.match(r.stderr, /STOP:/, name); assert.doesNotMatch(w.calls(), /run deploy/, name); }
});
test('comparator completeness: probes, volume definitions, security context and working directory drift are refused for the API too', { skip: !haveTools }, () => {
  for (const [name, mut] of Object.entries({ probe: (R) => { R.spec.containers[0].startupProbe = { tcpSocket: { port: 1 } }; }, volume: (R) => { R.spec.volumes = [{ name: 'v', secret: { secretName: 's' } }]; }, security: (R) => { R.spec.containers[0].securityContext = { runAsUser: 0 }; }, workdir: (R) => { R.spec.containers[0].workingDir = '/x'; } })) {
    const w = world(); const f = path.join(w.d, `rev-${BA}.json`); const R = JSON.parse(fs.readFileSync(f, 'utf8')); mut(R); fs.writeFileSync(f, JSON.stringify(R)); const r = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF, EV_RECONCILIATION: EVR }); assert.notStrictEqual(r.status, 0, name); assert.match(out(r), /template differs/, name); assert.doesNotMatch(w.calls(), /run deploy/, name);
  }
});
test('read-only bridge diagnostic prints only safe facts and never private values', { skip: !haveTools }, () => {
  const { w } = bridgeWorld(); const h8 = require('node:crypto').createHash('sha256').update(PRIV_T).digest('hex').slice(0, 8);
  const r = w.run('a0-deploy.sh', ['diagnose-bridge'], { EXPECT_TENANT_H: h8 }); assert.strictEqual(r.status, 0, out(r)); const o = out(r);
  assert.match(o, /BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID\s+present, MATCHES the Fairway fingerprint/); assert.match(o, /BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID\s+present, does not match Fairway/); assert.match(o, /BODY_SHA256\s+present, well-formed/); assert.match(o, /template container names: bridge-latest/);
  assert.match(o, /removed \(serving only\):\s+BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS/); assert.match(o, /added \(A0 only\):.*BG_BRIDGE_ALLOW_DRAFT_WORKFLOW/); assert.doesNotMatch(o, new RegExp(`${PRIV_T}|PRIVATE-BRAND|PRIVATE-PROJECT|${PRIV_SHA}`)); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/);
});
test('prepare writes the bridge env file without PORT (reserved by Cloud Run)', () => { const s = fs.readFileSync(path.join(S, 'a0-prepare.sh'), 'utf8'); assert.match(s, /del\(\.PORT\)/); });
// ---- BG-RELEASE08 adversarial self-review (Phase 1) and partial-deployment resume (Phase 2) ----
test('self-review: bridge environment exception is limited to the reviewed names; any other template drift is refused', { skip: !haveTools }, () => {
  const cases = {
    unknownTemplateOnly: { svc: (S) => { S.spec.template.spec.containers[0].env.push({ name: 'BG_BRIDGE_UNREVIEWED_FLAG', value: 'true' }); } },
    changedUnreviewedName: { svc: (S) => { const e = S.spec.template.spec.containers[0].env.find((x) => x.name === 'BG_BRIDGE_AUDIENCE'); e.value = 'changed'; } },
    linkedinTemplateOnly: { svc: (S) => { S.spec.template.spec.containers[0].env.push({ name: 'LINKEDIN_CLIENT_ID', value: 'x' }); } },
  };
  for (const [name, mut] of Object.entries(cases)) { const { w, run } = bridgeWorld(mut); const r = run(); assert.notStrictEqual(r.status, 0, name); assert.match(out(r), /template differs/, name); assert.doesNotMatch(w.calls(), /run deploy/, name); }
});
test('self-review: exact validation of every A0 setting (identity pins, URLs, non-strings, malformed lines, duplicates)', { skip: !haveTools }, () => {
  const yamls = {
    wrongSupabase: a0Yaml({ SUPABASE_URL: 'https://uvgblmejpbswkvlqvqmz.supabase.co' }), wrongOrigin: a0Yaml({ BG_BRIDGE_STUDIO_ORIGIN: 'https://evil.pages.dev' }), wrongSha: a0Yaml({ BG_BRIDGE_SOURCE_SHA: 'a'.repeat(40) }), wrongBind: a0Yaml({ BG_BRIDGE_BIND: '127.0.0.1' }),
    revisionNotAccepted: a0Yaml({ BG_BRIDGE_REVISION: 'bizgenie-api-staging-00099-zzz' }), revisionMalformed: a0Yaml({ BG_BRIDGE_REVISION: 'latest' }), audienceNotApi: a0Yaml({ BG_BRIDGE_AUDIENCE: 'https://bizgenie-studio-bridge-staging-1.europe-west1.run.app' }),
    targetNotTagged: a0Yaml({ BG_BRIDGE_TARGET_URL: AUD }), targetOtherTag: a0Yaml({ BG_BRIDGE_TARGET_URL: 'https://other---' + AUD.slice(8) }), secretKey: a0Yaml({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }), jwtKey: a0Yaml({ SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOi' }), emptyKey: a0Yaml({ SUPABASE_PUBLISHABLE_KEY: '' }),
    founderMismatch: a0Yaml({ BG_BRIDGE_FOUNDER_AUTH_USER_ID: '22222222-2222-4222-8222-222222222222' }), founderNotUuid: a0Yaml({ BG_BRIDGE_FOUNDER_AUTH_USER_ID: 'not-a-uuid' }), tenantMismatch: a0Yaml({ BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID: 'other-tenant' }),
    idemKey: a0Yaml({ BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY: 'other.v1' }), businessName: a0Yaml({ BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME: 'Fairway' }), reviewRef: a0Yaml({ BG_BRIDGE_REVIEW_REF: 'https://example.com/x' }), reviewOther: a0Yaml({ BG_BRIDGE_REVIEW_REF: BEV }),
    flagCase: a0Yaml({ BG_BRIDGE_ALLOW_WRITES: 'False' }), flagSpace: a0Yaml({ BG_BRIDGE_ALLOW_WRITES: 'false ' }), flagTrue: a0Yaml({ BG_BRIDGE_ALLOW_SOCIAL_WRITES: 'true' }), nonString: a0Yaml().replace(/BG_BRIDGE_ALLOW_WRITES: "false"/, 'BG_BRIDGE_ALLOW_WRITES: false'),
    malformedJson: a0Yaml().replace(/BIZGENIE_ENVIRONMENT: "staging"/, 'BIZGENIE_ENVIRONMENT: "staging'), duplicate: a0Yaml() + 'BG_BRIDGE_ALLOW_WRITES: "true"\n', comment: '# note\n' + a0Yaml(), blankKeyLine: a0Yaml() + ' BG_BRIDGE_X: "1"\n', nestedYaml: a0Yaml() + 'BG_BRIDGE_X:\n  - a\n',
  };
  for (const [name, yaml] of Object.entries(yamls)) { const { w, run } = bridgeWorld({ yaml: yaml.replace(/\\n/g, '\n') }); const r = run(); assert.notStrictEqual(r.status, 0, name); assert.match(r.stderr, /STOP:/, name); assert.doesNotMatch(w.calls(), /run deploy/, name); }
  const { w, run } = bridgeWorld(); assert.strictEqual(run().status, 0); assert.match(w.calls(), /run deploy/);
});
test('self-review: bridge approval and EV_TAG must be distinct from every other evidence reference and are bound in the state', { skip: !haveTools }, () => {
  for (const env of [{ EV_BRIDGE_RECONCILIATION: EVTAG }, { EV_TAG: BEV }, { EV_TAG: EVR }, { EV_TAG: APPR }, { EV_TAG: '' }, { EV_TAG: 'https://example.com/y' }, { EV_SCOPE: BEV }, { EV_ROLLBACK: BEV }, { EV_SCOPE: EVTAG }]) {
    const { w, run } = bridgeWorld(); const r = run(env); assert.notStrictEqual(r.status, 0, JSON.stringify(env)); assert.doesNotMatch(w.calls(), /run deploy/, JSON.stringify(env));
  }
  const { w, run } = bridgeWorld(); const r = run({ EV_SCOPE: 'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-1', EV_ROLLBACK: 'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-2' }); assert.strictEqual(r.status, 0, out(r));
  const st = JSON.parse(fs.readFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), 'utf8')); assert.strictEqual(st.evTag, EVTAG); assert.strictEqual(st.evTagRevision, NEWA); assert.strictEqual(st.evBridgeReconciliation, BEV);
});
test('self-review: a state bound to another EV_TAG/revision is a conflict', { skip: !haveTools }, () => {
  for (const state of [{ evTag: BEV, evTagRevision: NEWA }, { evTag: EVTAG, evTagRevision: 'bizgenie-api-staging-00001-aaa' }]) { const { w, run } = bridgeWorld({ state }); const r = run(); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /CONFLICT/); assert.doesNotMatch(w.calls(), /run deploy/); }
});
test('self-review: shift refuses unbound evidence, future-dated or malformed smoke evidence, and restores the rollback target when traffic does not settle', { skip: !haveTools }, () => {
  for (const over of [{ state: { evTag: '' } }, { state: { evBridgeReconciliation: '' } }, { state: { evReconciliation: '' } }, { state: { evTagRevision: 'other' } }, { ev: { passedAt: Math.floor(Date.now() / 1000) + 3600 } }, { ev: { passedAt: 'yesterday' } }, { ev: { tag: 'other' } }, { ev: { apiRevision: 'other' } }]) {
    const { w, r } = readyToShift(over); const res = r(); assert.notStrictEqual(res.status, 0, JSON.stringify(over)); assert.doesNotMatch(w.calls(), /update-traffic/, JSON.stringify(over));
  }
  const { w, r } = readyToShift(); const res = r(); // traffic-effect absent: the stub never moves traffic, so the post-shift check fails and the baseline is restored
  assert.notStrictEqual(res.status, 0); const calls = w.calls().split('\n').filter((l) => /update-traffic/.test(l)); assert.strictEqual(calls.length, 2); assert.match(calls[0], new RegExp(`--to-revisions=${NEWB}=100`)); assert.match(calls[1], new RegExp(`--to-revisions=${BB}=100`)); assert.match(res.stderr, /restored/);
});
test('self-review: the live bridge revision must carry all seven flags false at shift time', { skip: !haveTools }, () => {
  const { w, r } = readyToShift(); const f = path.join(w.d, `rev-${NEWB}.json`); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.spec.containers[0].env.find((e) => e.name === 'BG_BRIDGE_ALLOW_WRITES').value = 'true'; fs.writeFileSync(f, JSON.stringify(j));
  const res = r(); assert.notStrictEqual(res.status, 0); assert.match(res.stderr, /seven permission flags/); assert.doesNotMatch(w.calls(), /update-traffic/);
});
test('secret-safe output: no private value, token or id reaches stdout/stderr or the command lines of the stubs', { skip: !haveTools }, () => {
  const { w, run } = bridgeWorld(); const r = run(); const all = out(r) + w.calls();
  for (const secret of [FOUNDER, TENANT, 'sb_publishable_synthetic']) assert.ok(!all.includes(secret), `leaked ${secret.slice(0, 6)}`);
});
// ---- Phase 2: partial API deployment recovery ----
const apiWorld = (opts = {}) => { const w = world({ preTagged: opts.preTagged }); if (opts.state) fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify(opts.state)); if (opts.mut) { const f = path.join(w.d, 'svc-bizgenie-api-staging.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); opts.mut(j); fs.writeFileSync(f, JSON.stringify(j)); } if (opts.revlist) fs.writeFileSync(path.join(w.d, 'revlist-bizgenie-api-staging.txt'), opts.revlist); return { w, run: () => w.run('a0-deploy.sh', ['api'], { API_REF: APIREF, EV_RECONCILIATION: EVR }) }; };
test('resume: an existing tagged API revision with the accepted digest is adopted without a second deploy', { skip: !haveTools }, () => {
  for (const state of [undefined, { apiRevision: NEWA, apiDigest: NAD, baseApiRevision: BA }]) { const { w, run } = apiWorld({ preTagged: 'api', state }); const r = run(); assert.strictEqual(r.status, 0, out(r)); assert.match(out(r), /RESUMING from this verified checkpoint/); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/); }
});
test('resume: a tag on a different image, on the baseline, on a non-Ready or traffic-carrying revision, or conflicting state is refused', { skip: !haveTools }, () => {
  const mutations = {
    otherImage: (w) => { const f = path.join(w.d, `rev-${NEWA}.json`); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.status.imageDigest = `${REPO}/x@sha256:${'9'.repeat(64)}`; fs.writeFileSync(f, JSON.stringify(j)); },
    notReady: (w) => { const f = path.join(w.d, `rev-${NEWA}.json`); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.status.conditions[0].status = 'False'; fs.writeFileSync(f, JSON.stringify(j)); },
    carriesTraffic: (w) => { const f = path.join(w.d, 'svc-bizgenie-api-staging.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.status.traffic = [{ revisionName: BA, percent: 50 }, { revisionName: NEWA, percent: 50, tag: 'a0-dfd49116' }]; fs.writeFileSync(f, JSON.stringify(j)); },
    tagOnBaseline: (w) => { const f = path.join(w.d, 'svc-bizgenie-api-staging.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.status.traffic = [{ revisionName: BA, percent: 100, tag: 'a0-dfd49116' }]; fs.writeFileSync(f, JSON.stringify(j)); },
    servingDrift: (w) => { const f = path.join(w.d, 'svc-bizgenie-api-staging.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.status.traffic[0].revisionName = 'bizgenie-api-staging-00099-zzz'; j.status.latestReadyRevisionName = 'bizgenie-api-staging-00099-zzz'; fs.writeFileSync(f, JSON.stringify(j)); },
  };
  for (const [name, m] of Object.entries(mutations)) { const { w, run } = apiWorld({ preTagged: 'api' }); m(w); const r = run(); assert.notStrictEqual(r.status, 0, name); assert.match(r.stderr, /STOP:/, name); assert.doesNotMatch(w.calls(), /run deploy|update-traffic/, name); }
  for (const [name, state] of Object.entries({ otherRevision: { apiRevision: 'bizgenie-api-staging-00001-aaa', apiDigest: NAD }, otherBaseline: { apiRevision: NEWA, apiDigest: NAD, baseApiRevision: 'bizgenie-api-staging-00001-aaa' } })) { const { w, run } = apiWorld({ preTagged: 'api', state }); const r = run(); assert.notStrictEqual(r.status, 0, name); assert.match(r.stderr, /CONFLICT/, name); assert.doesNotMatch(w.calls(), /run deploy/, name); }
});
test('resume: after a failed deploy an untagged or unrecognised revision stops a redeploy; a stale attempt is rejected; a clean failed attempt may be retried once verified', { skip: !haveTools }, () => {
  const started = new Date(Date.now() - 60000).toISOString().replace(/\.\d+Z$/, 'Z'), old = new Date(Date.now() - 3 * 86400000).toISOString().replace(/\.\d+Z$/, 'Z');
  let a = apiWorld({ state: { apiDeployStartedAt: started, apiRevisionsBefore: `${BA} `, baseApiRevision: BA }, revlist: `${BA}\n${NEWA}\n` }); let r = a.run(); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /UNTAGGED\/unrecognised revision/); assert.doesNotMatch(a.w.calls(), /run deploy/);
  a = apiWorld({ state: { apiDeployStartedAt: old, apiRevisionsBefore: `${BA} ` }, revlist: `${BA}\n` }); r = a.run(); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /STALE/); assert.doesNotMatch(a.w.calls(), /run deploy/);
  a = apiWorld({ state: { apiRevision: NEWA, apiDigest: NAD } }); r = a.run(); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /CONFLICT/); assert.doesNotMatch(a.w.calls(), /run deploy/);
  a = apiWorld({ state: { apiDeployStartedAt: started, apiRevisionsBefore: `${BA} `, baseApiRevision: BA }, revlist: `${BA}\n` }); r = a.run(); assert.strictEqual(r.status, 0, out(r)); assert.strictEqual((a.w.calls().match(/run deploy/g) || []).length, 1);
});
test('resume: a first run records the revision snapshot, then a second run adopts the result instead of redeploying', { skip: !haveTools }, () => {
  const a = apiWorld(); let r = a.run(); assert.strictEqual(r.status, 0, out(r)); const st = JSON.parse(fs.readFileSync(path.join(a.w.home, '.bg-private', 'a0-state.json'), 'utf8')); assert.strictEqual(st.apiRevision, NEWA); assert.ok(st.apiRevisionsBefore && st.apiDeployStartedAt && st.apiVerifiedAt);
  r = a.run(); assert.strictEqual(r.status, 0, out(r)); assert.match(out(r), /RESUMING/); assert.strictEqual((a.w.calls().match(/run deploy/g) || []).length, 1); assert.doesNotMatch(a.w.calls(), /update-traffic/);
});
test('resume: a failing deploy command stops with recovery guidance and never touches traffic', { skip: !haveTools }, () => {
  const a = apiWorld(); fs.writeFileSync(path.join(a.w.d, 'deploy-effect.sh'), '#!/bin/sh\nexit 1\n'); fs.chmodSync(path.join(a.w.d, 'deploy-effect.sh'), 0o755);
  const stub = fs.readFileSync(path.join(a.w.home, 'bin', 'gcloud'), 'utf8'); fs.writeFileSync(path.join(a.w.home, 'bin', 'gcloud'), stub.replace('[ -f "$STUB_DIR/deploy-effect.sh" ] && bash "$STUB_DIR/deploy-effect.sh" "$@"; true;;', 'bash "$STUB_DIR/deploy-effect.sh" "$@";;'));
  const r = a.run(); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /Do NOT redeploy by hand/); assert.doesNotMatch(a.w.calls(), /update-traffic/);
});
test('bridge resume: an existing tagged bridge revision is adopted only when its environment equals the validated A0 file exactly', { skip: !haveTools }, () => {
  let { w, run } = bridgeWorld(); w = w; let r = run(); assert.strictEqual(r.status, 0, out(r)); r = run(); assert.strictEqual(r.status, 0, out(r)); assert.match(out(r), /ADOPTING/); assert.strictEqual((w.calls().match(/run deploy bizgenie-studio-bridge-staging/g) || []).length, 1);
  const b = bridgeWorld({ liveEnv: (N) => { N.spec.containers[0].env.find((e) => e.name === 'BG_BRIDGE_AUDIENCE').value = 'https://elsewhere'; } }); b.run(); const r2 = b.run(); assert.notStrictEqual(r2.status, 0); assert.match(r2.stderr, /not exactly the validated A0 file/);
});

// ---- smoke: mandatory authenticated read, identity and secret safety ----
function smokeWorld({ code = '200', body, state } = {}) {
  const w = world({ preTagged: true }); const PROJ = 'project-sentinel-55'; fs.writeFileSync(path.join(w.home, '.bg-private', 'a0-state.json'), JSON.stringify(state || { apiRevision: NEWA, bridgeRevision: NEWB, bridgeDigest: NBD }));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'release08', 'curl-stub.sh'), path.join(w.home, 'bin', 'curl')); fs.chmodSync(path.join(w.home, 'bin', 'curl'), 0o755);
  fs.writeFileSync(path.join(w.d, 'auth-code'), code); fs.writeFileSync(path.join(w.d, 'auth-body'), body === undefined ? JSON.stringify({ workspaces: [{ tenant_id: 't', project_id: PROJ, brand_id: 'b' }] }) : body);
  return { w, PROJ, run: (token = 'TOKEN-SENTINEL-abc123') => w.run('a0-smoke.sh', [], { EXPECT_PROJECT_H: sha8(PROJ) }, token + '\n'), evid: () => path.join(w.home, '.bg-private', 'a0-smoke-evidence.json') };
}
test('smoke: a complete pass writes evidence bound to the revision, digest, tag and API revision; the token never appears in output or on any command line', { skip: !haveTools || !have('curl') }, () => {
  const { w, run, evid } = smokeWorld(); const r = run(); assert.strictEqual(r.status, 0, out(r)); const e = JSON.parse(fs.readFileSync(evid(), 'utf8'));
  assert.strictEqual(e.revision, NEWB); assert.strictEqual(e.digest, NBD); assert.strictEqual(e.tag, 'a0-dfd49116'); assert.strictEqual(e.apiRevision, NEWA); assert.strictEqual(e.authenticatedRead, true); assert.ok(e.checks.length >= 7 && e.checks.every((c) => c.result === 'PASS'));
  const argv = fs.readFileSync(path.join(w.d, 'curl-argv.log'), 'utf8'); for (const hay of [out(r), argv, w.calls(), fs.readFileSync(evid(), 'utf8')]) { assert.ok(!hay.includes('TOKEN-SENTINEL'), 'token leaked'); assert.ok(!hay.includes('project-sentinel')); }
  assert.match(fs.readFileSync(path.join(w.d, 'curl-stdin.log'), 'utf8'), /Authorization: Bearer TOKEN-SENTINEL/);
});
test('smoke: wrong status, wrong identity, non-JSON body, empty token or a tag on another revision write no evidence', { skip: !haveTools || !have('curl') }, () => {
  const cases = { unauthorised: smokeWorld({ code: '401' }), noIdentity: smokeWorld({ body: JSON.stringify({ workspaces: [{ project_id: 'someone-else' }] }) }), notJson: smokeWorld({ body: '<html>200 OK</html>' }), emptyBody: smokeWorld({ body: '' }), serverError: smokeWorld({ code: '500' }) };
  for (const [name, c] of Object.entries(cases)) { const r = c.run(); assert.notStrictEqual(r.status, 0, name); assert.ok(!fs.existsSync(c.evid()), name); }
  const e = smokeWorld(); assert.notStrictEqual(e.run('').status, 0); assert.ok(!fs.existsSync(e.evid()));
  const d = smokeWorld({ state: { apiRevision: NEWA, bridgeRevision: 'bizgenie-studio-bridge-staging-00099-zzz', bridgeDigest: NBD } }); const r = d.run(); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /does not point at the deployed A0 revision/); assert.ok(!fs.existsSync(d.evid()));
  const g = smokeWorld({ state: { apiRevision: NEWA, bridgeRevision: NEWB, bridgeDigest: 'sha256:' + '1'.repeat(64) } }); const r2 = g.run(); assert.notStrictEqual(r2.status, 0); assert.match(r2.stderr, /live digest/); assert.ok(!fs.existsSync(g.evid()));
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
