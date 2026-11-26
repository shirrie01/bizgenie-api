const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const request = require("supertest");
const { createApp } = require("../index");
const { PATH, earlyAccessConfig, createEarlyAccessRouter } = require("../src/early-access");
const { EarlyAccessRepository } = require("../src/early-access/repository");
const { consentHashes } = require("../src/early-access/contract");
const { createEarlyAccessPreviewDraft } = require("../src/early-access/previewDraft");

const endpoint = process.env.TEST_DATABASE_URL;
const origin = "http://127.0.0.1:4300";
const config = {
  clientSecret: "fixture-client-hash-on-disposable-pg",
  submissionSecret: "fixture-submission-hash-on-disposable-pg",
  retentionDays: 30, origin,
};
const payload = {
  contract_version: "early-access-interest.v1", submission_id: "test-lead-1",
  name: "Test Person", work_email: "Leads@example.test", business_name: "Synthetic Orchard",
  industry: "product_brand", intention: "early_access", marketing_priorities: ["performance"],
  notes: "Example questionnaire answer", privacy_contact_consent: true, marketing_consent: false,
  consent: { version: "early-access-contact-v1", ...consentHashes, shown_at: "2026-11-26T12:00:00Z" },
  source: { utm_campaign: "fixture", referrer_host: "example.test", landing_path: "/" },
  client: { elapsed_ms: 3140 },
};

test("intake is absent by default and incomplete enabled configuration fails closed", async () => {
  assert.equal(earlyAccessConfig({}), null);
  assert.throws(() => earlyAccessConfig({ EARLY_ACCESS_CAPTURE_ENABLED: "true" }));
  await request(createApp()).post(PATH).send(payload).expect(404);
});

test("durable lead, receipt, consent, abuse limits, draft preview and deletion on loopback PostgreSQL",
  { skip: !endpoint }, async (t) => {
    const db = new URL(endpoint);
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(db.hostname));
    const admin = new Pool({ connectionString: db.toString() });
    t.after(() => admin.end());
    const name = "early_access_test_" + randomUUID().replaceAll("-", "");
    await admin.query(`CREATE DATABASE ${name}`);
    db.pathname = "/" + name;
    const pool = new Pool({ connectionString: db.toString() });
    t.after(async () => {
      await pool.end();
      const cleanup = new Pool({ connectionString: endpoint });
      try { await cleanup.query(`DROP DATABASE ${name}`); } finally { await cleanup.end(); }
    });
    await pool.query(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261126140000_create_early_access_interest.sql"), "utf8"));
    const repository = new EarlyAccessRepository(pool);
    await repository.initialize();
    const app = createApp({ earlyAccessRouter: createEarlyAccessRouter({ repository, config, maxAttempts: 20 }) });
    const post = (body) => request(app).post(PATH).set("Origin", origin).send(body);
    await request(app).options(PATH).set("Origin", origin)
      .set("Access-Control-Request-Method", "POST").expect(204).expect("Access-Control-Allow-Origin", origin);
    await request(app).options(PATH).set("Origin", "https://foreign.example.test")
      .set("Access-Control-Request-Method", "POST").expect(403);
    await post({ ...payload, extra: "never expose this" }).expect(400);
    await post({ ...payload, consent: { ...payload.consent, contact_text_sha256: "a".repeat(64) } }).expect(400);
    const [first, retry] = await Promise.all([post(payload), post(payload)]);
    assert.equal(first.status, 202);
    assert.deepEqual(retry.body, first.body);
    assert.match(first.headers["cache-control"], /no-store/);
    await post({ ...payload, source: { utm_campaign: "changed" } }).expect(409);
    const repeat = await post({ ...payload, submission_id: "test-lead-2", intention: "founding_customer" }).expect(202);
    assert.notEqual(repeat.body.reference_id, first.body.reference_id);
    await request(app).get(PATH).expect(405);
    const { rows: [lead] } = await pool.query("SELECT * FROM public.early_access_leads");
    assert.equal(lead.work_email, "leads@example.test");
    assert.equal(lead.intention, "founding_customer");
    assert.equal(lead.preview_draft, null);
    const { rows: receipts } = await pool.query("SELECT * FROM public.early_access_receipts");
    assert.equal(receipts.length, 2);
    assert.equal(receipts[0].attribution.utm_campaign, "fixture");
    assert.equal(receipts[0].consent.contact_text_sha256, consentHashes.contact_text_sha256);
    await pool.query("GRANT SELECT ON public.early_access_leads TO anon");
    await assert.rejects(repository.initialize(), /private lead schema/);
    await pool.query("REVOKE SELECT ON public.early_access_leads FROM anon");
    const draft = await repository.preparePreview(first.body.reference_id, createEarlyAccessPreviewDraft);
    assert.equal(draft.slides.length, 7);
    assert.equal(draft.provenance, "deterministic_fixture");
    assert.match(draft.slides[0].body, /Synthetic Orchard/);
    assert.doesNotMatch(JSON.stringify(draft), /Test Person|leads@example|questionnaire answer/);
    assert.deepEqual((await pool.query("SELECT preview_draft FROM public.early_access_leads")).rows[0].preview_draft, draft);
    const limited = createApp({ earlyAccessRouter: createEarlyAccessRouter({ repository, config, maxAttempts: 1 }) });
    await request(limited).post(PATH).set("X-Forwarded-For", "203.0.113.45").send(payload)
      .expect(429).expect("Retry-After", /^[0-9]+$/);
    await pool.query("ALTER TABLE public.early_access_receipts RENAME TO early_access_receipts_unavailable");
    await post({ ...payload, submission_id: "pending", work_email: "failed@example.test" }).expect(503);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.early_access_leads")).rows[0].n, 1);
    await pool.query("ALTER TABLE public.early_access_receipts_unavailable RENAME TO early_access_receipts");
    assert.equal(await repository.deleteLead(lead.id), true);
    assert.equal(await repository.preparePreview(first.body.reference_id, createEarlyAccessPreviewDraft), null);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.early_access_receipts")).rows[0].n, 0);
    await post({ ...payload, submission_id: "to-expire" }).expect(202);
    assert.deepEqual(await repository.purgeExpired(new Date(Date.now() + 31 * 86400000)), { leads: 1, buckets: 1 });
  });
