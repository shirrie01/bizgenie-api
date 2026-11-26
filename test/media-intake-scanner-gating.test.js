'use strict';
// BG-COMMERCIAL-LAUNCH Phase 1 (E4): at the SERVICE level, an unavailable scanner, a failed scan, a timeout or an unsafe file can never become an active customer asset.
// Uses the real intake service, the real upload inspector and the real clamd adapter against a protocol stand-in; the database is an in-memory recorder that fails on any unexpected statement.
// NOT a virus scanner test (see test/helpers/fake-clamd.js): hosted acceptance with a real clamd is the E4 packet.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { createHash, randomUUID } = require('node:crypto');
const { CustomerMediaIntakeService } = require('../src/media-intake/service');
const { createUploadInspector } = require('../src/media-intake/uploadInspector');
const { createClamdScanner } = require('../src/media-intake/clamdScanner');
const { startFakeClamd } = require('./helpers/fake-clamd');
const privateSchema = require('../src/security/privateSchema');

privateSchema.assertPrivateSchema = async () => {}; // the schema guard is covered by its own tests; here only the state machine matters

const crc = (b) => { const v = zlib.crc32 ? zlib.crc32(b) : 0; const o = Buffer.alloc(4); o.writeUInt32BE(v >>> 0); return o; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); return Buffer.concat([len, td, crc(td)]); };
function png(w = 8, h = 8) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x7f); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SCOPE = { tenant_id: 't1', project_id: 'p1', brand_id: 'b1' };
const ACTOR = { kind: 'customer', auth_user_id: randomUUID() };
const POLICY = { version: 'fonzo-staging-rights.v1', statement: 'I confirm I own, or am licensed to use, this file.' };
const nonVideo = () => { throw new Error('no video in these tests'); };

function harness({ bytes, inspector, state = 'quarantined', enabled = true, allowUnscanned = false, rightsPolicy = POLICY, storedBytes } = {}) {
  const id = randomUUID(); const data = bytes; const row = { asset_id: id, ...SCOPE, filename: 'a.png', content_type: 'image/png', declared_bytes: data.length, storage_key: 'k', state, sha256: sha(data), generation: '1', rights_policy_version: POLICY.version, created_at: new Date() };
  const log = { inserts: [], updates: [], audits: [] };
  const client = { async query(sql, params) {
    if (/from tenant_memberships/.test(sql)) return { rowCount: 1, rows: [{ role: 'owner' }] };
    if (/select \* from customer_media_intakes where asset_id/.test(sql)) return { rowCount: 1, rows: [{ ...row, state: log.updates.at(-1)?.state ?? row.state }] };
    if (/insert into media_assets/.test(sql)) { log.inserts.push(params); return { rowCount: 1, rows: [] }; }
    if (/update customer_media_intakes set state=\$2,inspection/.test(sql)) { const next = { ...row, state: params[1], inspection: params[2] }; log.updates.push(next); return { rowCount: 1, rows: [next] }; }
    if (/insert into customer_media_intake_audit/.test(sql)) { log.audits.push(params); return { rowCount: 1, rows: [] }; }
    throw new Error('unexpected statement: ' + sql.slice(0, 60));
  } };
  const stored = storedBytes || data;
  const storage = { bucket: 'b', putImmutableObject: async () => {}, statPreview: async () => ({ size: stored.length, mimeType: 'image/png', generation: '1' }),
    openPreview: async () => new Response(stored, { status: 200, headers: { 'content-length': String(stored.length), 'content-type': 'image/png' } }) };
  const svc = new CustomerMediaIntakeService({ billingRepository: { withTransaction: (fn) => fn(client) }, storage, inspector, rightsPolicy, enabled, allowUnscanned });
  return { svc, id, log, complete: () => svc.complete(ACTOR, id, SCOPE) };
}
const structural = (scanner, extra = {}) => createUploadInspector({ videoInspector: nonVideo, videoDecode: nonVideo, malwareScanner: scanner, ...extra });
const assertNoAsset = (h) => { assert.equal(h.log.inserts.length, 0, 'a media_assets row was created'); assert.ok(!h.log.updates.some((u) => u.state === 'ready'), 'intake reached ready'); };

test('positive control: a clean file with a healthy scanner becomes exactly one active asset', async () => {
  const d = await startFakeClamd(); try {
    const h = harness({ bytes: png(), inspector: structural(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 1500 })) }); const out = await h.complete();
    assert.equal(out.state, 'ready'); assert.equal(h.log.inserts.length, 1); assert.equal(d.state.streams, 1); assert.match(h.log.updates[0].inspection.engine, /structural.*\+/);
  } finally { await d.close(); }
});
test('a signature hit rejects a structurally valid file and creates no asset (the scanner, not the structure check, is what refuses it)', async () => {
  const d = await startFakeClamd(); try {
    const base = png(); const iend = base.subarray(base.length - 12); const body = base.subarray(0, base.length - 12);
    const bad = Buffer.concat([body, chunk('tEXt', Buffer.concat([Buffer.from('c\0'), d.EICAR])), iend]);
    const h = harness({ bytes: bad, inspector: structural(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 1500 })) }); const out = await h.complete();
    assert.equal(out.state, 'rejected'); assert.equal(d.state.streams, 1, 'the scanner must have been consulted'); assertNoAsset(h); assert.equal(h.log.updates.at(-1).inspection.clean, false);
  } finally { await d.close(); }
});
test('scanner unavailable, hung, erroring, garbled, or with a stale database: the attempt is refused (503) and no asset exists', async () => {
  for (const mode of ['hang', 'error', 'garbage']) {
    const d = await startFakeClamd({ mode }); try { const h = harness({ bytes: png(), inspector: structural(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 500 })) }); await assert.rejects(h.complete(), (e) => e.code === 'INSPECTION_UNAVAILABLE' || e.status === 503 || /UNAVAILABLE/.test(String(e.code)), mode); assertNoAsset(h); assert.equal(h.log.updates.length, 0, `${mode}: state must not advance`); } finally { await d.close(); }
  }
  const stale = await startFakeClamd({ builtAt: new Date(Date.now() - 10 * 86400000) }); try { const h = harness({ bytes: png(), inspector: structural(createClamdScanner({ host: stale.host, port: stale.port, timeoutMs: 800, maxSignatureAgeHours: 72 })) }); await assert.rejects(h.complete()); assertNoAsset(h); } finally { await stale.close(); }
  const dead = await startFakeClamd(); const { host, port } = dead; await dead.close();
  const h = harness({ bytes: png(), inspector: structural(createClamdScanner({ host, port, timeoutMs: 500 })) }); await assert.rejects(h.complete()); assertNoAsset(h); assert.equal(h.log.updates.length, 0);
});
test('malformed inspector verdicts never become assets (null, wrong hash, wrong type, non-boolean, missing engine or policy)', async () => {
  const b = png(); const good = { sha256: sha(b), content_type: 'image/png', clean: true, engine: 'e', policy_version: 'p', width: 8, height: 8 };
  const verdicts = { nul: null, wrongSha: { ...good, sha256: 'f'.repeat(64) }, wrongType: { ...good, content_type: 'image/jpeg' }, notBool: { ...good, clean: 'yes' }, noEngine: { ...good, engine: '' }, noPolicy: { ...good, policy_version: '' }, noWidth: { ...good, width: undefined }, hugeWidth: { ...good, width: 1e9 }, zeroHeight: { ...good, height: 0 } };
  for (const [name, v] of Object.entries(verdicts)) { const h = harness({ bytes: b, inspector: { inspect: async () => v } }); await assert.rejects(h.complete(), (e) => e.code === 'INSPECTION_UNAVAILABLE', name); assertNoAsset(h); }
  const throws = harness({ bytes: b, inspector: { inspect: async () => { throw new Error('boom'); } } }); await assert.rejects(throws.complete(), { code: 'INSPECTION_UNAVAILABLE' }); assertNoAsset(throws); // an unexpected inspector exception is a 503, never a raw 500
});
test('an UNSCANNED verdict is refused unless unscanned use was explicitly enabled; production-style construction cannot build an unscanned inspector', async () => {
  const b = png(); const unscanned = { sha256: sha(b), content_type: 'image/png', clean: true, engine: 'structural-ffprobe-ffmpeg+UNSCANNED', policy_version: 'p', width: 8, height: 8 };
  const h = harness({ bytes: b, inspector: { inspect: async () => unscanned } }); await assert.rejects(h.complete(), { code: 'INSPECTION_UNAVAILABLE' }); assertNoAsset(h);
  assert.throws(() => createUploadInspector({ videoInspector: nonVideo, videoDecode: nonVideo }), /malware scanner/);
});
test('corrupt or mislabelled files are rejected without an asset; swapped or truncated stored bytes fail integrity before inspection', async () => {
  const d = await startFakeClamd(); try {
    const insp = structural(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 1500 }));
    const truncated = png().subarray(0, 40); const h1 = harness({ bytes: truncated, inspector: insp }); const r1 = await h1.complete().catch((e) => ({ error: e.code })); assert.ok(r1.state === 'rejected' || r1.error, JSON.stringify(r1)); assertNoAsset(h1);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]); const h2 = harness({ bytes: exe, inspector: insp }); const r2 = await h2.complete().catch((e) => ({ error: e.code })); assert.ok(r2.state === 'rejected' || r2.error); assertNoAsset(h2);
    const a = png(); const swapped = Buffer.from(a); swapped[40] ^= 0xff; const h3 = harness({ bytes: a, storedBytes: swapped, inspector: insp }); await assert.rejects(h3.complete(), { code: 'UPLOAD_INTEGRITY_MISMATCH' }); assertNoAsset(h3); assert.equal(d.state.streams, 0, 'swapped bytes must never reach the scanner');
  } finally { await d.close(); }
});
test('disabled intake, missing inspector or missing rights policy answers 503 before any state change', async () => {
  const b = png(); const insp = { inspect: async () => null };
  for (const over of [{ enabled: false, inspector: insp }, { inspector: null }, { inspector: insp, rightsPolicy: null }, { inspector: insp, rightsPolicy: { version: 'v1', statement: '   ' } }]) { const h = harness({ bytes: b, ...over }); await assert.rejects(h.complete(), { code: 'MEDIA_INTAKE_UNAVAILABLE' }); assertNoAsset(h); assert.equal(h.log.updates.length, 0); }
});
test('a file can only be inspected from the quarantined state; a ready or rejected file is not re-processed into a second asset', async () => {
  const b = png(); let calls = 0; const insp = { inspect: async () => { calls++; return null; } };
  for (const state of ['initiated', 'rejected', 'deleted', 'revoked']) { const h = harness({ bytes: b, inspector: insp, state }); await assert.rejects(h.complete(), { code: 'UPLOAD_STATE_CONFLICT' }, state); assertNoAsset(h); }
  assert.equal(calls, 0, 'the scanner must not run outside quarantine');
});
test('the rights policy version is bound: a changed policy blocks completion', async () => {
  const d = await startFakeClamd(); try { const h = harness({ bytes: png(), inspector: structural(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 1500 })), rightsPolicy: { ...POLICY, version: 'fonzo-staging-rights.v2' } }); await assert.rejects(h.complete(), { code: 'RIGHTS_POLICY_CHANGED' }); assertNoAsset(h); assert.equal(d.state.streams, 0); } finally { await d.close(); }
});
test('the service deadline: an inspector that never answers is refused (503) and no asset exists', { timeout: 30000 }, async () => {
  const h = harness({ bytes: png(), inspector: { inspect: ({ signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) } });
  await assert.rejects(h.complete(), { code: 'INSPECTION_UNAVAILABLE' }); assertNoAsset(h); assert.equal(h.log.updates.length, 0);
});
