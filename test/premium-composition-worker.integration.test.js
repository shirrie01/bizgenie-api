// BG-LAUNCH-001: the premium application composition and the background worker, against a DISPOSABLE PostgreSQL database (TEST_DATABASE_URL).
// Real: createPremiumComposition, the quote service, execution policy, fenced worker, router, creative/text adapters, GoogleVertexVeoProvider, video service, durable asset store, the
// worker loops and runner, and the Express routes. Stand-ins (labelled): the image/text model calls, the HTTPS transport to Vertex AI and the object-storage copy.
const assert = require("node:assert/strict");
const { describe, it, before, after, beforeEach } = require("node:test");
const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const { randomUUID } = require("node:crypto");
const { PostgresBillingRepository, BillingService } = require("../src/billing");
const { PostgresCampaignRepository, PostgresPreviewRegistry } = require("../src/campaigns");
const { PostgresMediaAssetRepository, DurableMediaAssetStore } = require("../src/media");
const { GoogleVertexVeoProvider, VideoGenerationService, PostgresVideoGenerationRepository, modelForQuality } = require("../src/video-generation");
const { ImageGenerationService, InMemoryImageGenerationRepository } = require("../src/image-generation");
const { PostgresBrandBrainRepository } = require("../src/brand-brain");
const { ActivationConfigurationError, createPremiumComposition } = require("../src/activation");
const { GenerationLoop, SocialLoop } = require("../src/worker/loops");
const { WorkerRunner } = require("../src/worker/runner");
const { createApp } = require("../index");
const { scenario, previewReceipt, context } = require("./helpers/campaign-regressions");
const { localMediaKit } = require("./helpers/customer-media-local");
const { socialFixture } = require("./helpers/social-local");

const url = process.env.TEST_DATABASE_URL;
const actor = context.actor;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=", "base64");
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40, 1)]); // opaque bytes: the Veo path copies by reference and the stored asset is what is asserted
const ENV = { BIZGENIE_ENVIRONMENT: "staging", QUOTED_GENERATION_ENABLED: "true", TEXT_GENERATION_MODEL: "text-model-1", VIDEO_DURATION_SECONDS: "4" };

(url ? describe : describe.skip)("premium composition and worker against disposable PostgreSQL", { concurrency: 1 }, () => {
  let admin, pool, db, billing, billingService, campaigns, clock, kit, media, providerCalls, transportState, premium, brandRepo, videoRepo, imageBehaviour;

  before(async () => {
    admin = new Pool({ connectionString: url }); const c = await admin.connect();
    try { await c.query("select pg_advisory_lock(734921)"); await c.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$"); } finally { await c.query("select pg_advisory_unlock(734921)"); c.release(); }
    db = "launch_proof_" + randomUUID().replaceAll("-", ""); await admin.query(`create database ${db}`);
    const local = new URL(url); local.pathname = "/" + db; pool = new Pool({ connectionString: local.toString(), max: 14 });
    await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
    for (const f of fs.readdirSync(path.join(__dirname, "../supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) await pool.query(fs.readFileSync(path.join(__dirname, "../supabase/migrations", f), "utf8"));
    await pool.query("insert into auth.users values($1)", [actor.auth_user_id]); await pool.query("insert into customer_profiles(auth_user_id) values($1)", [actor.auth_user_id]);
    await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_a','Synthetic',$1)", [actor.auth_user_id]); await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner')", [actor.auth_user_id]);
    await pool.query("insert into projects(project_id,tenant_id,name) values('project_a','tenant_a','Synthetic')"); await pool.query("insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values('brand_a','project_a','Synthetic',1,'approved',now(),now())");
    await pool.query("insert into commercial_policies(policy_id,plan_code,policy_version,status,included_monthly_credits,bolt_on_eligible,effective_from)values('synthetic_policy','standard',999,'draft',100,true,'2026-01-01')");
    await pool.query("insert into commercial_execution_prices(policy_id,execution_class,credit_cost)values('synthetic_policy','text.standard',2),('synthetic_policy','image.normal',2),('synthetic_policy','video.normal',6),('synthetic_policy','video.premium',9)");
    await pool.query("update commercial_policies set status='active' where policy_id='synthetic_policy'");
    await pool.query("insert into tenant_entitlements(entitlement_id,tenant_id,policy_id,plan_code,status,starts_at,reference_period_start,reference_period_end,included_monthly_credit_grant)values('synthetic_entitlement','tenant_a','synthetic_policy','standard','active','2026-01-01','2026-10-01','2027-12-01',100)");
    await pool.query("insert into credit_accounts(account_id,tenant_id)values('synthetic_account','tenant_a')");
    billing = new PostgresBillingRepository({ pool, now: () => clock }); billingService = new BillingService({ repository: billing, now: () => clock });
    campaigns = new PostgresCampaignRepository({ pool, now: () => clock, resolvePreviewReceipt: previewReceipt, validatePreview: async () => true });
    const registry = new PostgresPreviewRegistry({ pool, now: () => clock }); campaigns.resolvePreviewReceipt = registry.resolvePreviewReceipt.bind(registry); campaigns.validatePreview = registry.validatePreview.bind(registry);
    brandRepo = new PostgresBrandBrainRepository({ pool }); videoRepo = new PostgresVideoGenerationRepository({ pool }); await videoRepo.initialize();
    kit = localMediaKit({ pool, billing, now: () => clock });
    const assets = new PostgresMediaAssetRepository({ pool });
    // stand-in storage copy for the provider output prefix
    const OUT = "gs://standin-bucket/veo-out/"; const outputs = new Map();
    kit.storage.copyObject = async ({ source, destinationKey, allowedSourcePrefix }) => { if (!source.startsWith(allowedSourcePrefix) || !outputs.has(source)) throw new Error("copy refused"); return kit.storage.putObject({ key: destinationKey, data: outputs.get(source), mimeType: "video/mp4" }); };
    transportState = { readyAfter: 0, operations: new Map(), fail: false };
    const transport = { post: async (u, body) => {
      const m = /\/(projects\/[^/]+\/locations\/[^/]+\/publishers\/google\/models\/[^:]+):(predictLongRunning|fetchPredictOperation)$/.exec(u);
      if (m[2] === "predictLongRunning") { providerCalls.video += 1; const id = randomUUID(); const name = `${m[1]}/operations/${id}`; transportState.operations.set(name, { uri: `${OUT}${id}/sample_0.mp4`, polls: 0 }); return { name }; }
      const op = transportState.operations.get(body.operationName); op.polls += 1;
      if (transportState.fail) return { name: body.operationName, done: true, error: { code: 3 } };
      if (op.polls <= transportState.readyAfter) return { name: body.operationName, done: false };
      outputs.set(op.uri, mp4); return { name: body.operationName, done: true, response: { videos: [{ gcsUri: op.uri, mimeType: "video/mp4" }] } };
    } };
    const imageStore = new DurableMediaAssetStore({ mediaKind: "image", repository: assets, storage: kit.storage, now: () => clock });
    imageBehaviour = { fail: false };
    media = {
      mediaEnabled: true, imageEnabled: true, videoEnabled: true, mediaAssetRepository: assets, mediaPreviewStorage: kit.storage,
      imageProvider: { model: "image-model-1", generate: async ({ metadata }) => { providerCalls.image += 1; if (imageBehaviour.fail) throw new Error("synthetic provider outage"); const saved = await imageStore.save({ data: png, mime_type: "image/png", width: 1, height: 1, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: "synthetic", provider_job_id: "synthetic_image_op", asset }; } },
      videoProvider: new GoogleVertexVeoProvider({ projectId: "standin-project", outputStorageUri: OUT, transport }),
      videoAssetStore: new DurableMediaAssetStore({ mediaKind: "video", repository: assets, storage: kit.storage, videoSourcePrefix: OUT, now: () => clock }),
      videoReferenceAssetLoader: new (require("../src/video-generation").UnconfiguredVideoReferenceAssetLoader)(),
    };
  });
  after(async () => { await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });
  beforeEach(async () => {
    clock = new Date("2026-10-31T12:00:00Z"); providerCalls = { image: 0, video: 0, text: 0 }; transportState.readyAfter = 0; transportState.fail = false; imageBehaviour.fail = false;
    const key = randomUUID(); await billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: key, idempotencyKey: key });
    { const c = await pool.connect(); try { await c.query("set session_replication_role=replica"); await c.query("update generation_execution_claims set state='cancelled', claim_token=null where state in ('queued','claimed','calling','recovery_required')"); } finally { await c.query("reset session_replication_role"); c.release(); } } // test isolation only, on the disposable database: leftovers from a previous case are not this case's
    premium = await build();
  });

  async function build(env = ENV, extra = {}) {
    return createPremiumComposition({ pool, billing: { billingRepository: billing }, media, brandBrainRepository: brandRepo, videoGenerationRepository: videoRepo, scriptGenerator: async () => { providerCalls.text += 1; return { text: "Hook: x\nConcept: y\nScript: z\nCTA: c\nCaption: d\nHashtags: #a\nFilming instructions: f", metadata: { model: "text-model-1" } }; }, branding: require("../src/config/branding").brandingConfig, env, logger: { log() {}, warn() {}, error() {} }, now: () => clock, ...extra });
  }
  const sc = (s, format = "image", platform = "instagram") => s.cmd("create_content_item", { name: `${platform} ${format}`, format, platform, placement: "feed", destination_label: "A", initial_content: { title: null, body: "Draft", caption: null, alt_text: null, asset_refs: [] } });
  async function item(format, platform) { const s = await scenario(campaigns); const created = await sc(s, format, platform); return { s, variant_id: created.created_ids.variant_ids[0], version: (await s.get()).version }; }
  const req = (x, cls, extra = {}) => ({ tenant_id: "tenant_a", project_id: "project_a", campaign_id: x.s.id, variant_id: x.variant_id, expected_campaign_version: x.version, execution_class: cls, execution_mode: "ai", execution_brief: cls === "text.standard" ? undefined : "A synthetic brief", supplied_assets: [], idempotency_key: randomUUID(), ...extra });
  async function confirmed(cls, platform = "instagram", format = cls.split(".")[0]) {
    const x = await item(format, platform); const q = await premium.generationQuoteService.quote(actor, req(x, cls));
    const job = await premium.generationQuoteService.confirm(actor, q.quote_id, { idempotency_key: randomUUID(), max_credits: q.credits, confirmed: true });
    return { x, q, job };
  }
  const loop = (over = {}) => new GenerationLoop({ quoteService: premium.generationQuoteService, worker: premium.generationWorker, now: () => clock, logger: { warn() {}, error() {}, log() {} }, ...over });
  const balance = async () => (await billingService.readBalance({ tenantId: "tenant_a" })).available_balance;
  const claimState = async (jobId) => (await pool.query("select state, fence from generation_execution_claims where job_id=$1", [jobId])).rows[0];
  const ledger = async (jobId) => Object.fromEntries((await pool.query("select entry_type, count(*)::int n from credit_ledger where generation_id=$1 group by 1", [jobId])).rows.map((r) => [r.entry_type, r.n]));

  describe("composition fails closed", () => {
    it("with no flag nothing is composed and the services stay unavailable", async () => {
      const off = await build({ BIZGENIE_ENVIRONMENT: "staging" }); assert.equal(off.enabled, false); assert.equal(off.generationQuoteService, null); assert.equal(off.generationWorker, null);
      const app = createApp({ customerTokenVerifier: { verifyAccessToken: async () => actor }, generationQuoteService: off.generationQuoteService, generationExecutionPolicy: off.generationExecutionPolicy, logger: { warn() {}, error() {}, info() {} } });
      assert.equal((await request(app).get("/customer/generation-quotes/00000000-0000-4000-8000-000000000001").set("Authorization", "Bearer t")).status, 503);
    });
    it("every enabled capability states what it is missing instead of starting half-configured", async () => {
      const fails = async (env, extra, pattern) => assert.rejects(build({ BIZGENIE_ENVIRONMENT: "staging", ...env }, extra), (e) => e instanceof ActivationConfigurationError && pattern.test(e.message));
      await assert.rejects(build({ QUOTED_GENERATION_ENABLED: "true" }), /BIZGENIE_ENVIRONMENT/);
      await fails({ QUOTED_GENERATION_ENABLED: "true" }, { media: { mediaEnabled: false } }, /at least one generation capability/);
      await fails({ STRATEGY_WORKFLOWS_ENABLED: "true" }, {}, /requires QUOTED_GENERATION_ENABLED/);
      await fails({ QUOTED_GENERATION_ENABLED: "true", STRATEGY_WORKFLOWS_ENABLED: "true", TEXT_GENERATION_MODEL: "m" }, {}, /founder-approved workflow price policy/);
      await fails({ MEDIA_INTAKE_ENABLED: "true" }, {}, /inspector/);
      await fails({ SOCIAL_PUBLISHING_ENABLED: "true" }, {}, /SOCIAL_PLATFORMS/);
      await fails({ SOCIAL_PUBLISHING_ENABLED: "true", SOCIAL_PLATFORMS: "tiktok" }, { connectors: {} }, /No connector is registered for tiktok/);
      await fails({ LEARNING_ENABLED: "true" }, {}, /requires SOCIAL_PUBLISHING_ENABLED/);
      await assert.rejects(build({ BIZGENIE_ENVIRONMENT: "development", QUOTED_GENERATION_ENABLED: "true" }), ActivationConfigurationError);
    });
    it("composes text, image and Veo video profiles from the providers actually present, and mounts the real routes", async () => {
      assert.deepEqual(premium.capabilities, { text: true, image: true, video: true, strategyWorkflows: false });
      assert.equal(premium.generationQuoteService.profiles["video.normal"].provider_model, modelForQuality("normal")); assert.equal(premium.generationQuoteService.profiles["video.normal"].aspect_ratio, "9:16");
      const app = createApp({ campaignRepository: campaigns, customerTokenVerifier: { verifyAccessToken: async () => actor }, authorizationService: { authorizeProject: async () => context }, generationQuoteService: premium.generationQuoteService, generationExecutionPolicy: premium.generationExecutionPolicy, logger: { warn() {}, error() {}, info() {} } });
      const x = await item("image"); const quote = await request(app).post("/customer/generation-quotes").set("Authorization", "Bearer t").send(req(x, "image.normal"));
      assert.equal(quote.status, 201); assert.equal(quote.body.credits, 2);
      assert.equal((await request(app).post("/customer/generate-image").set("Authorization", "Bearer t").send({})).status, 428); // the legacy un-quoted route is closed in quoted mode
    });
  });

  describe("generation loop", () => {
    it("claims a confirmed image job, runs it once, settles credits once and does nothing on the next tick", async () => {
      const before = await balance(); const { job } = await confirmed("image.normal");
      assert.equal(await balance(), before - 2); // reserved at confirmation
      const r = await loop().tick(); assert.equal(r.succeeded, 1); assert.equal(providerCalls.image, 1);
      assert.deepEqual(await ledger(job.job_id), { reservation: 1, debit: 1 }); assert.equal((await claimState(job.job_id)).state, "succeeded");
      const again = await loop().tick(); assert.equal(again.succeeded, 0); assert.equal(providerCalls.image, 1);
    });
    it("two workers ticking at the same moment call the provider exactly once", async () => {
      await confirmed("image.normal"); const [a, b] = await Promise.all([loop().tick(), loop().tick()]);
      assert.equal(providerCalls.image, 1); assert.equal(a.succeeded + b.succeeded, 1);
    });
    it("a text job runs through the text adapter", async () => {
      const { job } = await confirmed("text.standard", "instagram", "text"); const r = await loop().tick(); assert.equal(r.succeeded, 1); assert.equal(providerCalls.text, 1);
      assert.deepEqual(await ledger(job.job_id), { reservation: 1, debit: 1 });
    });
    it("a definitive provider failure releases the reservation and charges nothing; credits are not lost", async () => {
      const before = await balance(); imageBehaviour.fail = true; const { job } = await confirmed("image.normal"); const r = await loop().tick();
      assert.equal(r.succeeded, 0); const st = await claimState(job.job_id); assert.ok(["recovery_required", "failed"].includes(st.state));
      assert.equal((await ledger(job.job_id)).debit || 0, 0); // an uncertain failure never debits; it stays held until reconciled
      assert.equal(providerCalls.image, 1); assert.ok((await balance()) >= before - 2);
    });
    it("Veo video: submit leaves the job pending, polling backs off, completion saves the asset and settles once", async () => {
      transportState.readyAfter = 2; const { job } = await confirmed("video.normal", "tiktok", "video"); const l = loop({ minBackoffMs: 1000, maxBackoffMs: 4000 });
      const first = await l.tick(); assert.equal(first.pending, 1); assert.equal(providerCalls.video, 1); assert.equal((await claimState(job.job_id)).state, "recovery_required");
      const second = await l.tick(); assert.equal(second.reconciled + second.stillPending, 0); // inside the backoff window: not polled again
      clock = new Date(clock.getTime() + 2000); const third = await l.tick(); assert.equal(third.stillPending + third.reconciled, 1);
      clock = new Date(clock.getTime() + 10000); let done = 0; for (let i = 0; i < 4 && !done; i += 1) { const r = await l.tick(); done = r.reconciled; clock = new Date(clock.getTime() + 10000); }
      assert.equal((await claimState(job.job_id)).state, "succeeded"); assert.equal(providerCalls.video, 1, "never submitted twice");
      assert.deepEqual(await ledger(job.job_id), { reservation: 1, debit: 1 });
      const asset = (await pool.query("select media_kind, mime_type, status, source_kind from media_assets where generation_job_id=$1", [job.job_id])).rows; assert.deepEqual(asset, [{ media_kind: "video", mime_type: "video/mp4", status: "active", source_kind: "generated" }]);
    });
    it("a provider-reported Veo failure is final: the reservation is released and nothing is charged", async () => {
      transportState.fail = true; const before = await balance(); const { job } = await confirmed("video.normal", "tiktok", "video"); const l = loop({ minBackoffMs: 1 });
      await l.tick(); clock = new Date(clock.getTime() + 5000); await l.tick();
      const st = await claimState(job.job_id); assert.equal(st.state, "failed"); assert.equal((await ledger(job.job_id)).debit || 0, 0); assert.equal(await balance(), before);
    });
    it("a worker that died after claiming but before the provider boundary is resumed with a new fence, and the dead worker can no longer complete it", async () => {
      const { job } = await confirmed("image.normal"); const dead = await premium.generationWorker.claim(job.job_id); // claimed, never started
      const fresh = await loop().tick(); assert.equal(fresh.resumed, 0, "a recent claim is not stolen"); assert.equal(providerCalls.image, 0);
      clock = new Date(clock.getTime() + 300000); const r = await loop().tick(); assert.equal(r.resumed, 1); assert.equal(r.succeeded, 1); assert.equal(providerCalls.image, 1);
      await assert.rejects(premium.generationWorker.run(dead), (e) => /FENCE_STALE|RECONCILIATION/.test(e.code)); assert.equal(providerCalls.image, 1);
      assert.deepEqual(await ledger(job.job_id), { reservation: 1, debit: 1 });
    });
    it("tenancy: when the owner's membership is gone the job is not run and the provider is never called", async () => {
      const other = "88888888-8888-4888-8888-888888888888"; await pool.query("insert into auth.users values($1)", [other]); await pool.query("insert into customer_profiles(auth_user_id) values($1)", [other]);
      await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_b','Other',$1)", [other]); await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_b',$1,'owner')", [other]);
      const { job } = await confirmed("image.normal"); await pool.query("delete from tenant_memberships where tenant_id='tenant_a' and auth_user_id=$1", [actor.auth_user_id]);
      try { const r = await loop().tick(); assert.equal(r.succeeded, 0); assert.equal(providerCalls.image, 0); assert.equal((await claimState(job.job_id)).state, "queued"); }
      finally { await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner')", [actor.auth_user_id]); }
    });
    it("a cancelled-before-start job is not executed", async () => {
      const { q, job } = await confirmed("image.normal"); await premium.generationQuoteService.cancel(actor, q.quote_id); const r = await loop().tick(); assert.equal(providerCalls.image, 0); assert.equal(r.succeeded, 0);
      assert.equal((await claimState(job.job_id)).state, "cancelled");
    });
  });

  describe("social loop and runner", () => {
    it("publishes a due approved dispatch once, resumes nothing twice, and reports an uncertain outcome without re-sending", async () => {
      const f = await socialFixture({ billing, pool, campaigns, now: () => clock }); const d = await f.service.enqueue(actor, f.scope, f.input);
      const l = new SocialLoop({ socialService: f.service, now: () => clock, logger: { warn() {}, error() {}, log() {} } });
      const early = await l.tick(); assert.equal(early.published, 0); // not due yet: SCHEDULE_NOT_DUE is a normal answer
      clock = new Date(clock.getTime() + 3 * 60000); const due = await l.tick(); assert.equal(due.published, 1); assert.equal(f.state.calls, 1);
      const later = await l.tick(); assert.equal(later.published, 0); assert.equal(f.state.calls, 1);
      assert.equal((await pool.query("select state from social_dispatches where dispatch_id=$1", [d.dispatch_id])).rows[0].state, "published");
    });
    it("the runner keeps going when one loop throws, runs again soon after work, and stop() waits for the current tick", async () => {
      const calls = []; const bad = { name: "bad", tick: async () => { throw Object.assign(new Error("x"), { code: "BOOM" }); } };
      const good = { name: "good", tick: async () => { calls.push(1); return { loop: "good", succeeded: calls.length < 3 ? 1 : 0 }; } };
      const runner = new WorkerRunner({ loops: [bad, good], intervalMs: 5, busyIntervalMs: 1, jitter: 0, logger: { log() {}, error() {} } });
      const once = await runner.runOnce(); assert.equal(once.length, 2); assert.deepEqual(once[0].errors, ["BOOM"]);
      runner.start(); await new Promise((r) => setTimeout(r, 80)); await runner.stop(); const n = calls.length; assert.ok(n >= 3); await new Promise((r) => setTimeout(r, 30)); assert.equal(calls.length, n, "no ticks after stop");
    });
  });
});
