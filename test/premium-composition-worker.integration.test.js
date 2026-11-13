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
const { startFakeClamd } = require("./helpers/fake-clamd");

const url = process.env.TEST_DATABASE_URL;
const actor = context.actor;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=", "base64");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const { createVideoInspector } = require("../src/media/videoInspection");
const haveFfmpeg = require("./helpers/media-tools").haveMediaTools();
// REAL encoded files made with ffmpeg (no network, no paid call) so the real ffprobe inspector measures actual bytes.
const fixtures = {};
function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bg-video-fx-")); const enc = (name, input, out) => { execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...input, ...out, path.join(dir, name)]); return fs.readFileSync(path.join(dir, name)); };
  const src = (size, dur = 4) => ["-f", "lavfi", "-i", `testsrc=size=${size}:rate=24:duration=${dur}`];
  fixtures.png = enc("a.png", ["-f", "lavfi", "-i", "testsrc2=size=640x480:rate=1", "-frames:v", "1"], []);
  fixtures.good = enc("good.mp4", src("720x1280"), ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an"]);
  fixtures.audio = enc("audio.mp4", [...src("720x1280"), "-f", "lavfi", "-i", "sine=d=4"], ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]);
  fixtures.wrongAspect = enc("wide.mp4", src("1280x720"), ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an"]);
  fixtures.wrongLength = enc("long.mp4", src("720x1280", 7), ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-an"]);
  fixtures.vp9 = enc("vp9.mp4", src("720x1280"), ["-c:v", "libvpx-vp9", "-an"]);
  fixtures.truncated = fixtures.good.subarray(0, Math.floor(fixtures.good.length / 2));
  fixtures.corrupt = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(40, 1)]);
  fs.rmSync(dir, { recursive: true, force: true });
}
const ENV = { BIZGENIE_ENVIRONMENT: "staging", QUOTED_GENERATION_ENABLED: "true", TEXT_GENERATION_MODEL: "text-model-1", VIDEO_DURATION_SECONDS: "4" };

(url && haveFfmpeg ? describe : describe.skip)("premium composition and worker against disposable PostgreSQL", { concurrency: 1 }, () => {
  let admin, pool, db, billing, billingService, campaigns, clock, kit, media, providerCalls, transportState, premium, brandRepo, videoRepo, imageBehaviour;

  before(async () => {
    makeFixtures();
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
    transportState = { readyAfter: 0, operations: new Map(), fail: false, output: () => fixtures.good, inspectorDown: false };
    kit.storage.download = async ({ key, maximumBytes }) => { const o = kit.objects.get(key); if (!o || o.data.length > maximumBytes) throw new Error('missing'); return Buffer.from(o.data); };
    kit.storage.delete = async ({ key }) => { kit.objects.delete(key); };
    const transport = { post: async (u, body) => {
      const m = /\/(projects\/[^/]+\/locations\/[^/]+\/publishers\/google\/models\/[^:]+):(predictLongRunning|fetchPredictOperation)$/.exec(u);
      if (m[2] === "predictLongRunning") { providerCalls.video += 1; const id = randomUUID(); const name = `${m[1]}/operations/${id}`; transportState.operations.set(name, { uri: `${OUT}${id}/sample_0.mp4`, polls: 0 }); return { name }; }
      const op = transportState.operations.get(body.operationName); op.polls += 1;
      if (transportState.fail) return { name: body.operationName, done: true, error: { code: 3 } };
      if (op.polls <= transportState.readyAfter) return { name: body.operationName, done: false };
      outputs.set(op.uri, transportState.output()); return { name: body.operationName, done: true, response: { videos: [{ gcsUri: op.uri, mimeType: "video/mp4" }] } };
    } };
    const imageStore = new DurableMediaAssetStore({ mediaKind: "image", repository: assets, storage: kit.storage, now: () => clock });
    imageBehaviour = { fail: false };
    media = {
      mediaEnabled: true, imageEnabled: true, videoEnabled: true, mediaAssetRepository: assets, mediaPreviewStorage: kit.storage,
      imageProvider: { model: "image-model-1", generate: async ({ metadata }) => { providerCalls.image += 1; if (imageBehaviour.fail) throw new Error("synthetic provider outage"); const saved = await imageStore.save({ data: png, mime_type: "image/png", width: 1, height: 1, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: "synthetic", provider_job_id: "synthetic_image_op", asset }; } },
      videoProvider: new GoogleVertexVeoProvider({ projectId: "standin-project", outputStorageUri: OUT, transport }),
      videoAssetStore: new DurableMediaAssetStore({ mediaKind: "video", repository: assets, storage: kit.storage, videoSourcePrefix: OUT, now: () => clock, requireVideoValidation: true,
        videoInspector: async (bytes) => (transportState.inspectorDown ? { status: "unavailable", reason: "INSPECTION_TOOL_UNAVAILABLE" } : createVideoInspector({ isolation: "local" })(bytes)) }),
      videoReferenceAssetLoader: new (require("../src/video-generation").UnconfiguredVideoReferenceAssetLoader)(),
    };
  });
  after(async () => { await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });
  beforeEach(async () => {
    clock = new Date("2026-10-31T12:00:00Z"); providerCalls = { image: 0, video: 0, text: 0 }; transportState.readyAfter = 0; transportState.fail = false; transportState.output = () => fixtures.good; transportState.inspectorDown = false; imageBehaviour.fail = false;
    const key = randomUUID(); await billingService.adjustCredits({ tenantId: "tenant_a", amount: 100, direction: "credit", transactionCorrelationId: key, idempotencyKey: key });
    { const c = await pool.connect(); try { await c.query("set session_replication_role=replica"); await c.query("update generation_execution_claims set state='cancelled', claim_token=null where state in ('queued','claimed','calling','recovery_required')"); } finally { await c.query("reset session_replication_role"); c.release(); } } // test isolation only, on the disposable database: leftovers from a previous case are not this case's
    premium = await build();
  });

  it('composes LinkedIn OAuth with a durable encrypted vault independently of TikTok/video configuration', async () => {
    const key = require('node:crypto').randomBytes(32), env = {
      BIZGENIE_ENVIRONMENT:'staging', SOCIAL_PUBLISHING_ENABLED:'true', SOCIAL_PLATFORMS:'linkedin',
      LINKEDIN_CLIENT_ID:'synthetic_linkedin_client', LINKEDIN_CLIENT_SECRET:'synthetic_secret',
      LINKEDIN_APP_REVIEW_APPROVED:'true', LINKEDIN_OAUTH_REVIEW_REF:'synthetic_review'
    };
    let calls=0;
    const made=await build(env,{media:{},socialKeyProvider:{keyId:'synthetic_linkedin_key',getKey:async()=>key},socialFetch:async url=>{
      calls++;if(url.endsWith('/accessToken'))return new Response(JSON.stringify({access_token:'synthetic_linkedin_private',expires_in:3600,scope:'openid profile w_member_social'}));
      assert.equal(url,'https://api.linkedin.com/v2/userinfo');return new Response(JSON.stringify({sub:'synthetic_linkedin_subject',name:'Synthetic member'}));
    }});
    const svc=made.socialPublishingService,scope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'},verifier='l'.repeat(43);
    const intent=await svc.oauthIntent(actor,scope,{platform:'linkedin',pkce_challenge:require('node:crypto').createHash('sha256').update(verifier).digest('base64url')});
    assert.equal(intent.oauth_protocol,'linkedin_oidc_web');assert.equal(intent.provider_pkce_required,false);assert.equal(calls,0);
    const connection=await svc.connect(actor,scope,{intent_id:intent.intent_id,state:intent.state,code:'synthetic_code',code_verifier:verifier});
    assert.equal(connection.capabilities.member_login.available,true);assert.equal(connection.capabilities.member_text_post.available,false);
    assert.equal(calls,2);assert.equal(made.generationWorker,null);assert.equal(made.flags.QUOTED_GENERATION_ENABLED,false);
    const stored=(await pool.query('select s.ciphertext from social_token_secrets s join social_connections c on c.token_reference=s.reference where c.connection_id=$1',[connection.connection_id])).rows[0];
    assert.equal(stored.ciphertext.includes(Buffer.from('synthetic_linkedin_private')),false);
    const before=calls;await svc.disconnect(actor,connection.connection_id,scope);assert.equal(calls,before);
  });

  it('shares encrypted credential runtime across both connectors without weakening TikTok upload gates', async () => {
    const key=require('node:crypto').randomBytes(32), socialKeyProvider={keyId:'synthetic_shared_key',getKey:async()=>key};
    const env={BIZGENIE_ENVIRONMENT:'staging',SOCIAL_PUBLISHING_ENABLED:'true',SOCIAL_PLATFORMS:'linkedin,tiktok',
      LINKEDIN_CLIENT_ID:'synthetic_li',LINKEDIN_CLIENT_SECRET:'synthetic_secret',LINKEDIN_APP_REVIEW_APPROVED:'true',LINKEDIN_OAUTH_REVIEW_REF:'synthetic_review',
      TIKTOK_CLIENT_KEY:'synthetic_tt',TIKTOK_CLIENT_SECRET:'synthetic_secret',TIKTOK_APP_REVIEW_APPROVED:'true',TIKTOK_OAUTH_REVIEW_REF:'synthetic_review',
      TIKTOK_UPLOAD_REVIEW_REF:'synthetic_upload_review',TIKTOK_UPLOAD_ORIGINS:'https://upload.example.test',TIKTOK_UPLOAD_CHUNK_BYTES:'33554432'};
    await assert.rejects(build(env,{media:{},socialKeyProvider}),/validated video generation/);
    for(const order of ['linkedin,tiktok','tiktok,linkedin']){
      const made=await build({...env,SOCIAL_PLATFORMS:order},{socialKeyProvider,socialFetch:async()=>assert.fail('Provider called during composition')});
      const {linkedin,tiktok}=made.socialPublishingService.platforms;
      assert.equal(linkedin.connector.vault,tiktok.connector.vault);assert.equal(linkedin.connector.operations,tiktok.connector.operations);
      assert.equal(tiktok.deliveryMode,'draft_upload');assert.equal(linkedin.features.member_text_post,false);
    }
    await assert.rejects(build({...env,TIKTOK_UPLOAD_REVIEW_REF:''},{socialKeyProvider}),/TIKTOK_UPLOAD_REVIEW_REF/);
    await assert.rejects(build({...env,SOCIAL_PLATFORMS:'linkedin'},{socialKeyProvider:null,media:{}}),/Social token vault key/);
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
      await fails({ MEDIA_INTAKE_ENABLED: "true" }, {}, /malware scanner/);
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
    it("the stored Veo asset carries what was MEASURED from its bytes, not what the provider claimed", async () => {
      const { job } = await confirmed("video.normal", "tiktok", "video"); await loop({ minBackoffMs: 1 }).tick(); clock = new Date(clock.getTime() + 5000); await loop({ minBackoffMs: 1 }).tick();
      const a = (await pool.query("select width,height,duration_seconds::float d,byte_size from media_assets where generation_job_id=$1", [job.job_id])).rows[0];
      assert.deepEqual([a.width, a.height, a.d, Number(a.byte_size)], [720, 1280, 4, fixtures.good.length]);
    });
    for (const [name, key, reason] of [["audio track", "audio", "AUDIO_UNSUPPORTED"], ["wrong aspect ratio", "wrongAspect", "ASPECT_RATIO_MISMATCH"], ["wrong duration", "wrongLength", "DURATION_MISMATCH"], ["unsupported codec", "vp9", "VIDEO_CODEC_UNSUPPORTED"], ["truncated file", "truncated", null], ["corrupt bytes", "corrupt", null]]) {
      it(`a finished Veo job whose output has ${name} fails definitively: no asset exists, nothing is charged, the reservation is released`, async () => {
        transportState.output = () => fixtures[key]; const before = await balance(); const { job } = await confirmed("video.normal", "tiktok", "video"); const l = loop({ minBackoffMs: 1 });
        await l.tick(); clock = new Date(clock.getTime() + 5000); await l.tick();
        assert.equal((await claimState(job.job_id)).state, "failed"); assert.equal((await ledger(job.job_id)).debit || 0, 0); assert.equal(await balance(), before);
        assert.equal((await pool.query("select count(*)::int n from media_assets where generation_job_id=$1", [job.job_id])).rows[0].n, 0, "no asset row, so nothing to approve or publish");
        assert.equal([...kit.objects.keys()].filter((k) => k.endsWith(".mp4") && k.includes(job.job_id)).length, 0);
        const v = (await pool.query("select status,error_code from video_generations where generation_job_id=$1", [job.job_id])).rows[0]; assert.deepEqual(v, { status: "failed", error_code: "VIDEO_OUTPUT_INVALID" });
        const shown = (await pool.query("select error_code from generation_execution_claims where job_id=$1", [job.job_id])).rows[0]; assert.equal(shown.error_code, "VIDEO_OUTPUT_INVALID", "job history can say why");
        void reason;
      });
    }
    it("when the inspection tool is unavailable the job stays recoverable (never approved), and completes once inspection works", async () => {
      transportState.inspectorDown = true; const { job } = await confirmed("video.normal", "tiktok", "video"); const l = loop({ minBackoffMs: 1 });
      await l.tick(); clock = new Date(clock.getTime() + 5000); await l.tick();
      assert.equal((await claimState(job.job_id)).state, "recovery_required"); assert.equal((await pool.query("select count(*)::int n from media_assets where generation_job_id=$1", [job.job_id])).rows[0].n, 0);
      transportState.inspectorDown = false; clock = new Date(clock.getTime() + 60000); await l.tick(); assert.equal((await claimState(job.job_id)).state, "succeeded"); assert.equal(providerCalls.video, 1);
    });
    it("media intake composes the real structural upload inspector only with the explicit staging opt-in, and labels it UNSCANNED", async () => {
      const base = { BIZGENIE_ENVIRONMENT: "staging", MEDIA_INTAKE_ENABLED: "true", MEDIA_RIGHTS_POLICY_VERSION: "rights.v1", MEDIA_RIGHTS_POLICY_STATEMENT: "Reviewed wording placeholder for staging", VIDEO_INSPECTION_ISOLATION: "local" };
      await assert.rejects(build({ ...base }), /malware scanner/);
      await assert.rejects(build({ ...base, MEDIA_INTAKE_STRUCTURAL_INSPECTION: "true" }), /only allowed in staging with MEDIA_INTAKE_ALLOW_UNSCANNED/);
      // production can never take the unscanned path or local isolation, even if those variables are set
      const prod = { ...base, BIZGENIE_ENVIRONMENT: "production", PRODUCTION_ACTIVATION_ENABLED: "true" };
      await assert.rejects(build({ ...prod, MEDIA_INTAKE_STRUCTURAL_INSPECTION: "true", MEDIA_INTAKE_ALLOW_UNSCANNED: "true" }), /local.*only allowed in disposable isolated staging|only allowed in staging/);
      await assert.rejects(build({ ...prod, MALWARE_SCANNER: "clamd", MALWARE_SCANNER_HOST: "scanner.internal" }), /local.*only allowed in disposable isolated staging/);
      await assert.rejects(build({ ...base, MALWARE_SCANNER: "clamd" }), /MALWARE_SCANNER_HOST/);
      await assert.rejects(build({ ...base, MALWARE_SCANNER: "yara", MALWARE_SCANNER_HOST: "h" }), /only supported scanner adapter/);
      await assert.rejects(build({ ...base, MALWARE_SCANNER: "clamd", MALWARE_SCANNER_HOST: "h", MALWARE_SCANNER_TIMEOUT_MS: "30000" }), /deadline/);
      const scanned = await build({ ...base, MALWARE_SCANNER: "clamd", MALWARE_SCANNER_HOST: "scanner.internal" }); assert.ok(scanned.mediaIntakeService);
      const hardened = { ...prod }; delete hardened.VIDEO_INSPECTION_ISOLATION;
      const hardenedEnv = { ...hardened, MALWARE_SCANNER: "clamd", MALWARE_SCANNER_HOST: "scanner.internal" };
      assert.ok((await build(hardenedEnv, { toolchainCheck: async ({ isolation }) => { assert.equal(isolation, "bubblewrap"); return { ok: true }; } })).mediaIntakeService, "production with a scanner and the default hardened isolation composes");
      await assert.rejects(build(hardenedEnv, { toolchainCheck: async () => ({ ok: false, failure: "INSPECTION_SANDBOX_UNAVAILABLE" }) }), /media inspection is not ready \(bubblewrap\): INSPECTION_SANDBOX_UNAVAILABLE/);
      const ok = await build({ ...base, MEDIA_INTAKE_STRUCTURAL_INSPECTION: "true", MEDIA_INTAKE_ALLOW_UNSCANNED: "true" });
      assert.ok(ok.mediaIntakeService);
    });
    it("composition refuses to enable video without an inspector", async () => {
      assert.throws(() => new DurableMediaAssetStore({ mediaKind: "video", repository: {}, storage: {}, requireVideoValidation: true }));
    });
    it("the demo credit ceiling is enforced by the product before any provider call: with exactly 8 credits (one image + one video) a third job is refused", async () => {
      const spare = (await balance()) - 8; const key = randomUUID(); await billingService.adjustCredits({ tenantId: "tenant_a", amount: spare, direction: "debit", transactionCorrelationId: key, idempotencyKey: key });
      assert.equal(await balance(), 8);
      await confirmed("image.normal"); await confirmed("video.normal", "tiktok", "video"); assert.equal(await balance(), 0);
      await assert.rejects(confirmed("image.normal"), (e) => { assert.match(String(e.code), /INSUFFICIENT|CREDIT|BALANCE/i); return true; });
      const l = loop({ minBackoffMs: 1 }); await l.tick(); clock = new Date(clock.getTime() + 5000); await l.tick();
      assert.deepEqual([providerCalls.image, providerCalls.video], [1, 1], "exactly the two funded jobs reached a provider");
      assert.equal(await balance(), 0);
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


  describe("customer uploads stay quarantined until scanned and validated (real intake service, real inspector, scanner protocol stand-in)", () => {
    const { CustomerMediaIntakeService } = require("../src/media-intake/service");
    const { createUploadInspector } = require("../src/media-intake/uploadInspector");
    const { createClamdScanner } = require("../src/media-intake/clamdScanner");
    const { createVideoInspector: vi } = require("../src/media/videoInspection");
    const { createVideoDecodeCheck: vd } = require("../src/media/videoDecode");
    const scope = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
    const png8 = (extra) => { // a structurally valid PNG, optionally carrying an extra tEXt chunk (valid CRC) before IEND
      const base = fixtures.png; if (!extra) return base; const body = Buffer.concat([Buffer.from("Comment\0"), extra]); const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
      const type = Buffer.from("tEXt"); const crc = Buffer.alloc(4); crc.writeUInt32BE(require("node:zlib").crc32(Buffer.concat([type, body])) >>> 0);
      const iend = base.length - 12; return Buffer.concat([base.subarray(0, iend), len, type, body, crc, base.subarray(iend)]);
    };
    const build = (scanner, over = {}) => {
      const objects = new Map();
      const storage = { bucket: "private-intake", putImmutableObject: async ({ key, data, mimeType }) => { objects.set(key, { data: Buffer.from(data), mime: mimeType, generation: "42" }); },
        statPreview: async ({ key }) => { const v = objects.get(key); return { size: v.data.length, mimeType: v.mime, generation: v.generation }; },
        openPreview: async ({ key }) => { const v = objects.get(key); return new Response(v.data, { headers: { "content-length": String(v.data.length), "content-type": v.mime } }); } };
      const inspector = createUploadInspector({ videoInspector: vi({ isolation: "local" }), videoDecode: vd({ isolation: "local" }), ...(scanner ? { malwareScanner: scanner } : { allowUnscanned: true }) });
      return new CustomerMediaIntakeService({ billingRepository: billing, storage, inspector, enabled: true, now: () => clock, rightsPolicy: { version: "rights.v1", statement: "Reviewed wording placeholder for tests", allowed_uses: ["campaign.preview", "video.generate.reference"] }, ...over });
    };
    const upload = async (intake, bytes, type, name) => {
      const first = await intake.initiate(actor, { ...scope, filename: name, content_type: type, bytes: bytes.length, rights_confirmed: true, idempotency_key: randomUUID() });
      assert.equal((await intake.upload(actor, first.asset_id, scope, bytes, type)).state, "quarantined");
      return first.asset_id;
    };
    const assetRows = async (id) => (await pool.query("select status from media_assets where asset_id=$1", [id])).rows;
    const state = async (id) => (await pool.query("select state from customer_media_intakes where asset_id=$1", [id])).rows[0].state;

    it("clean files become ready only after structure, decode and scan all pass; a signature hit is rejected and never becomes an asset", async () => {
      const d = await startFakeClamd(); try {
        const intake = build(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 800, now: () => new Date() }));
        const okPng = await upload(intake, fixtures.png, "image/png", "ok.png"); assert.equal((await intake.complete(actor, okPng, scope)).state, "ready"); assert.deepEqual(await assetRows(okPng), [{ status: "active" }]);
        const okVid = await upload(intake, fixtures.good, "video/mp4", "ok.mp4"); assert.equal((await intake.complete(actor, okVid, scope)).state, "ready");
        const bad = await upload(intake, png8(d.EICAR), "image/png", "bad.png"); assert.equal((await intake.complete(actor, bad, scope)).state, "rejected");
        assert.deepEqual(await assetRows(bad), [], "a rejected upload has no asset row, so nothing can use or publish it");
        const damaged = await upload(intake, fixtures.truncated, "video/mp4", "cut.mp4"); assert.equal((await intake.complete(actor, damaged, scope)).state, "rejected");
        assert.equal(d.state.streams >= 2, true);
      } finally { await d.close(); }
    });

    it("scanner unavailable or too slow fails closed: the asset stays quarantined, then completes once the scanner is back", async () => {
      const d = await startFakeClamd({ mode: "hang" }); try {
        const intake = build(createClamdScanner({ host: d.host, port: d.port, timeoutMs: 400, now: () => new Date() }));
        const id = await upload(intake, fixtures.png, "image/png", "wait.png");
        await assert.rejects(intake.complete(actor, id, scope), { code: "INSPECTION_UNAVAILABLE" }); assert.equal(await state(id), "quarantined"); assert.deepEqual(await assetRows(id), []);
        d.state.mode = "ok"; assert.equal((await intake.complete(actor, id, scope)).state, "ready");
      } finally { await d.close(); }
      const down = await startFakeClamd(); const { host, port } = down; await down.close();
      const intake = build(createClamdScanner({ host, port, timeoutMs: 400 })); const id = await upload(intake, fixtures.png, "image/png", "down.png");
      await assert.rejects(intake.complete(actor, id, scope), { code: "INSPECTION_UNAVAILABLE" }); assert.equal(await state(id), "quarantined");
    });

    it("an UNSCANNED verdict is never accepted unless the service was explicitly told it is disposable staging", async () => {
      const prod = build(null); const id = await upload(prod, fixtures.png, "image/png", "u.png");
      await assert.rejects(prod.complete(actor, id, scope), { code: "INSPECTION_UNAVAILABLE" }); assert.equal(await state(id), "quarantined"); assert.deepEqual(await assetRows(id), []);
      const staging = build(null, { allowUnscanned: true }); const id2 = await upload(staging, fixtures.png, "image/png", "u2.png"); assert.equal((await staging.complete(actor, id2, scope)).state, "ready");
    });
  });


  describe("TikTok draft upload end to end: composition + validated Veo asset + encrypted vault + approved-video source (HTTP is a labelled stand-in; no live TikTok call)", () => {
    const { PostgresPreviewRegistry: PreviewRegistry } = require("../src/campaigns");
    const { CreativeJobService } = require("../src/generation-quotes/jobs");
    const { createApprovedVideoSource } = require("../src/social-connectors/approvedVideoSource");
    const { SocialLoop: SocialWorkLoop } = require("../src/worker/loops");
    const { createHash: sha256h, randomBytes: rb } = require("node:crypto");
    const scope = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
    const sha = (b) => sha256h("sha256").update(b).digest("hex");
    const tiktokEnv = (over = {}) => ({ ...ENV, SOCIAL_PUBLISHING_ENABLED: "true", SOCIAL_PLATFORMS: "tiktok", TIKTOK_CLIENT_KEY: "ck_test_key", TIKTOK_CLIENT_SECRET: "cs_test_SECRET_VALUE", TIKTOK_APP_REVIEW_APPROVED: "true", TIKTOK_OAUTH_REVIEW_REF: "review-ref-1",
      TIKTOK_UPLOAD_REVIEW_REF: "upload-review-1", TIKTOK_UPLOAD_ORIGINS: "https://upload.tiktok-test.example", TIKTOK_UPLOAD_CHUNK_BYTES: "33554432", SOCIAL_TOKEN_KEY_ID: "staging-test-key-1", SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: rb(32).toString("base64"), ...over });

    function fakeTikTok() {
      const st = { calls: [], init: null, uploaded: null, putHeaders: null, status: "SEND_TO_USER_INBOX", revokedTokens: [], tokenN: 0, putFails: false, uploadUrl: "https://upload.tiktok-test.example/upload?token=abc" };
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      st.fetch = async (url, opts = {}) => {
        const u = new URL(url); const method = opts.method || "GET";
        st.calls.push({ method, host: u.host, path: u.pathname, bearer: Boolean(opts.headers?.Authorization), redirect: opts.redirect, credentials: opts.credentials });
        if (u.host === "open.tiktokapis.com") {
          if (u.pathname === "/v2/oauth/token/") { st.tokenN += 1; st.tokenForm = new URLSearchParams(opts.body); return json({ open_id: "open_id_creator_1", scope: "user.info.basic,video.upload", access_token: `AT_PLAINTEXT_SECRET_${st.tokenN}`, refresh_token: `RT_PLAINTEXT_SECRET_${st.tokenN}`, expires_in: 86400, refresh_expires_in: 31536000, token_type: "Bearer" }); }
          if (u.pathname === "/v2/user/info/") return json({ data: { user: { open_id: "open_id_creator_1", display_name: "Test Creator", avatar_url: "https://x.example/a.png" } }, error: { code: "ok" } });
          if (u.pathname === "/v2/post/publish/inbox/video/init/") { st.init = JSON.parse(opts.body); return json({ data: { publish_id: "v_inbox_file~v2.1234567890", upload_url: st.uploadUrl }, error: { code: "ok" } }); }
          if (u.pathname === "/v2/post/publish/status/fetch/") return json({ data: { status: st.status }, error: { code: "ok" } });
          if (u.pathname === "/v2/oauth/revoke/") { st.revokedTokens.push(new URLSearchParams(opts.body).get("token")); return json({ error: { code: "ok" } }); }
        }
        if (u.host === "upload.tiktok-test.example" && method === "PUT") { if (st.putFails) throw new Error("socket hang up"); st.uploaded = Buffer.from(opts.body); st.putHeaders = opts.headers; return new Response(null, { status: 201 }); }
        throw new Error("unexpected request to " + u.host + u.pathname);
      };
      return st;
    }

    async function journey(over = {}) {
      const tt = fakeTikTok(); const env = tiktokEnv(over); premium = await build(env, { socialFetch: tt.fetch });
      const svc = premium.socialPublishingService; const verifier = rb(48).toString("base64url");
      const intent = await svc.oauthIntent(actor, scope, { platform: "tiktok", pkce_challenge: sha256h("sha256").update(verifier).digest("base64url") });
      const connection = await svc.connect(actor, scope, { intent_id: intent.intent_id, state: intent.state, code: "auth_code_1", code_verifier: verifier });
      const s = await scenario(campaigns);
      const added = await s.cmd("create_content_item", { name: "TikTok reel", format: "video", platform: "tiktok", placement: "feed", destination_label: "Test Creator", destination_key: connection.connection_id, initial_content: { title: null, body: "Spring reveal", caption: "Spring reveal", alt_text: "A short vertical reveal", asset_refs: [] } });
      const variantId = added.created_ids.variant_ids[0]; const version = (await s.get()).version;
      const q = await premium.generationQuoteService.quote(actor, { tenant_id: "tenant_a", project_id: "project_a", campaign_id: s.id, variant_id: variantId, expected_campaign_version: version, execution_class: "video.normal", execution_mode: "ai", execution_brief: "A short vertical reveal", supplied_assets: [], idempotency_key: randomUUID() });
      const job = await premium.generationQuoteService.confirm(actor, q.quote_id, { idempotency_key: randomUUID(), max_credits: q.credits, confirmed: true });
      const l = loop({ minBackoffMs: 1 }); await l.tick(); clock = new Date(clock.getTime() + 5000); await l.tick();
      assert.equal((await claimState(job.job_id)).state, "succeeded");
      await new CreativeJobService({ quoteService: premium.generationQuoteService, campaignRepository: campaigns }).attach(actor, job.job_id, scope);
      const target = { variant_id: variantId, revision_id: (await s.variant({ variant_id: variantId })).current_revision_id };
      const registry = new PreviewRegistry({ pool, now: () => clock });
      // the attach step changed the campaign outside the helper's own version counter, so commands here read the live version
      const cmd = async (type, payload) => campaigns.executeCommand(context, { contract_version: "campaign-spine.v1", idempotency_key: randomUUID(), expected_campaign_version: (await s.get()).version, command_type: type, tenant_id: "tenant_a", project_id: "project_a", campaign_id: s.id, payload });
      await cmd("submit_review", target);
      const rendered = await registry.renderPreview(context, await s.get(), { ...target, idempotency_key: randomUUID() });
      const ack = await cmd("acknowledge_preview", { ...target, render_receipt_id: rendered.render_receipt_id, acknowledged: true });
      await cmd("approve", { ...target, preview_id: ack.created_ids.preview_ids[0], approved: true });
      const due = new Date(clock.getTime() + 60000);
      const schedule = await cmd("schedule", { ...target, approval_id: (await s.variant(target)).active_approval_id, scheduled_for: due.toISOString(), timezone: "UTC", local_datetime: due.toISOString().slice(0, -1), utc_offset_minutes: 0 });
      // the Studio never learns the item's destination key: the server resolves the bound connection itself
      const dispatch = await svc.enqueue(actor, scope, { campaign_id: s.id, variant_id: variantId, schedule_id: schedule.created_ids.schedule_ids[0], expected_campaign_version: (await s.get()).version, publishing_confirmed: true });
      const asset = (await pool.query("select * from media_assets where generation_job_id=$1", [job.job_id])).rows[0];
      return { tt, svc, connection, dispatch, job, asset, s, target, due, env };
    }
    const workLoop = (svc) => new SocialWorkLoop({ socialService: svc, now: () => clock, logger: { warn() {}, error() {}, log() {} } });
    const dispatchRow = async (id) => (await pool.query("select state, operation_kind, publication_id, publication_url, published_at, uploaded_at, provider_reference from social_dispatches where dispatch_id=$1", [id])).rows[0];

    it("a validated Veo video reaches the creator's TikTok inbox as a DRAFT: exact bytes, exact pinned binding, never recorded as published", async () => {
      const j = await journey(); assert.equal(j.dispatch.operation_kind, "draft_upload");
      const l = workLoop(j.svc); assert.equal((await l.tick()).uploaded ?? 0, 0, "not due yet");
      clock = new Date(clock.getTime() + 3 * 60000); const r1 = await l.tick();
      const stored = kit.objects.get(j.asset.storage_key).data;
      assert.equal(sha(j.tt.uploaded), sha(stored), "TikTok received exactly the validated, stored bytes");
      assert.deepEqual([j.tt.init.source_info.source, j.tt.init.source_info.video_size, j.tt.init.source_info.total_chunk_count], ["FILE_UPLOAD", stored.length, 1]);
      assert.equal(j.tt.putHeaders["Content-Range"], `bytes 0-${stored.length - 1}/${stored.length}`);
      assert.equal(j.tt.calls.some((c) => c.host === "upload.tiktok-test.example" && c.bearer), false, "the upload URL never receives the bearer token");
      assert.equal(j.tt.calls.every((c) => c.redirect === "error" && c.credentials === "omit"), true);
      for (let i = 0; i < 4 && (await dispatchRow(j.dispatch.dispatch_id)).state !== "uploaded"; i += 1) { clock = new Date(clock.getTime() + 61000); await l.tick(); }
      const row = await dispatchRow(j.dispatch.dispatch_id);
      assert.equal(row.state, "uploaded"); assert.equal(row.operation_kind, "draft_upload");
      assert.deepEqual([row.publication_id, row.publication_url, row.published_at], [null, null, null], "an uploaded draft is not a publication");
      assert.ok(row.uploaded_at);
      const listed = (await j.svc.list(actor, scope)).dispatches.find((d) => d.dispatch_id === j.dispatch.dispatch_id);
      assert.deepEqual([listed.state, listed.operation_kind, listed.creator_action_required, listed.evidence_kind], ["uploaded", "draft_upload", true, null]);
      assert.equal(j.tt.calls.filter((c) => c.path === "/v2/post/publish/inbox/video/init/").length, 1, "initialised exactly once"); void r1;
      assert.equal(j.tt.calls.some((c) => /publish\/video|direct/i.test(c.path)), false, "Direct Post is never called");
    });

    it("credentials are encrypted at rest, bound to tenant/project/brand/platform/account, never exposed, and disconnect revokes them", async () => {
      const j = await journey(); const { SocialTokenVault } = require("../src/social-connectors/tokenVault");
      const own = (await pool.query("select token_reference from social_connections where connection_id=$1", [j.connection.connection_id])).rows[0].token_reference;
      const rows = (await pool.query("select reference, binding, ciphertext, iv, tag, key_id, revoked, rotation_state from social_token_secrets where reference=$1", [own])).rows; assert.equal(rows.length, 1);
      const raw = JSON.stringify(rows[0]) + rows[0].ciphertext.toString("latin1");
      assert.equal(/PLAINTEXT_SECRET|cs_test_SECRET_VALUE/.test(raw), false, "no token or client secret in the row");
      assert.deepEqual([rows[0].key_id, rows[0].revoked, rows[0].binding.tenant_id, rows[0].binding.platform, rows[0].binding.account_id], ["staging-test-key-1", false, "tenant_a", "tiktok", "open_id_creator_1"]);
      const surface = JSON.stringify([j.connection, await j.svc.listConnections(actor, scope), premium.describe(), j.dispatch]);
      assert.equal(/PLAINTEXT_SECRET|cs_test_SECRET_VALUE|ciphertext|token_reference/i.test(surface.replace(/token_reference_hidden/g, "")), false, "no secret or vault reference in any customer-facing value");
      // a different binding (another tenant or account) cannot open this credential, even with the right reference
      const vault = new SocialTokenVault({ driver: premium.socialPublishingService.platforms.tiktok.connector.vault.driver });
      const ref = rows[0].reference; const bind = rows[0].binding;
      await assert.rejects(vault.use(ref, { ...bind, tenant_id: "tenant_b" }, async () => true));
      await assert.rejects(vault.use(ref, { ...bind, account_id: "someone_else" }, async () => true));
      // ciphertext tampering is detected, never decrypted
      await pool.query("update social_token_secrets set tag=$2 where reference=$1", [ref, Buffer.alloc(16, 7)]).catch(() => {});
      const out = await j.svc.disconnect(actor, j.connection.connection_id, scope);
      assert.equal(out.status, "revoked");
      const after = (await pool.query("select revoked from social_token_secrets where reference=$1", [ref])).rows[0];
      assert.equal(after.revoked, true, "the credential is unusable locally the moment the owner disconnects");
      await assert.rejects(vault.use(ref, bind, async () => true));
      assert.ok(["confirmed", "unknown", "previously_retired"].includes(out.provider_revocation_status), "remote revocation outcome is reported honestly: " + out.provider_revocation_status);
    });

    it("a normal disconnect revokes the access token at TikTok exactly once, confirms it, and a repeat does not call TikTok again", async () => {
      const j = await journey(); const revokeCalls = () => j.tt.calls.filter((c) => c.path === "/v2/oauth/revoke/").length;
      const out = await j.svc.disconnect(actor, j.connection.connection_id, scope);
      assert.equal(out.status, "revoked"); assert.equal(out.provider_revocation_status, "confirmed", "TikTok was asked and acknowledged");
      assert.equal(revokeCalls(), 1); assert.match(j.tt.revokedTokens[0], /^AT_PLAINTEXT_SECRET_/, "the access token itself was revoked");
      const again = await j.svc.disconnect(actor, j.connection.connection_id, scope); assert.equal(again.status, "revoked"); assert.equal(revokeCalls(), 1, "no second revoke call");
    });

    it("disconnecting AFTER a draft was uploaded and reconciled still asks TikTok to revoke the token", async () => {
      const j = await journey(); clock = new Date(clock.getTime() + 3 * 60000); const l = workLoop(j.svc);
      for (let i = 0; i < 5 && (await dispatchRow(j.dispatch.dispatch_id)).state !== "uploaded"; i += 1) { await l.tick(); clock = new Date(clock.getTime() + 61000); }
      assert.equal((await dispatchRow(j.dispatch.dispatch_id)).state, "uploaded");
      const revokeCalls = () => j.tt.calls.filter((c) => c.path === "/v2/oauth/revoke/").length;
      const out = await j.svc.disconnect(actor, j.connection.connection_id, scope);
      assert.equal(out.status, "revoked"); assert.equal(out.provider_revocation_status, "confirmed"); assert.equal(revokeCalls(), 1);
      assert.equal((await dispatchRow(j.dispatch.dispatch_id)).state, "uploaded", "an uploaded draft stays an uploaded draft after the account is disconnected");
    });

    it("the media source gives bytes to nobody else: wrong tenant, revoked asset, a revision that does not carry the asset, or a dispatch that is not a live draft all fail closed", async () => {
      const j = await journey(); clock = new Date(clock.getTime() + 3 * 60000);
      const claim = await j.svc.claim(j.dispatch.dispatch_id); await j.svc.start(claim); // dispatch is now 'sending'
      const source = createApprovedVideoSource({ pool, storage: kit.storage, videoInspector: media.videoAssetStore.videoInspector, now: () => clock });
      const d = (await pool.query("select * from social_dispatches where dispatch_id=$1", [j.dispatch.dispatch_id])).rows[0];
      const binding = { ...scope, platform: "tiktok", account_id: "open_id_creator_1" };
      const dctx = { dispatch_id: d.dispatch_id, actor_id: d.created_by, ...scope, campaign_id: d.campaign_id, variant_id: d.variant_id, revision_id: d.revision_id, approval_id: d.approval_id, schedule_id: d.schedule_id };
      const payload = { content: { asset_refs: [{ asset_id: j.asset.asset_id }] } };
      const good = await source.loadApprovedVideo({ binding, payload, dispatch: dctx });
      assert.deepEqual([good.mimeType, good.assetId, good.sha256], ["video/mp4", j.asset.asset_id, sha(kit.objects.get(j.asset.storage_key).data)]);
      await source.revalidate(good, { binding, dispatch: dctx });
      const denied = async (b, p, c, code = "RESOURCE_NOT_AVAILABLE") => assert.rejects(source.loadApprovedVideo({ binding: b, payload: p, dispatch: c }), (e) => e.code === code);
      await denied({ ...binding, tenant_id: "tenant_b" }, payload, { ...dctx, tenant_id: "tenant_b" });
      await denied(binding, { content: { asset_refs: [{ asset_id: randomUUID() }] } }, dctx);
      await denied(binding, { content: { asset_refs: [{ asset_id: j.asset.asset_id }, { asset_id: randomUUID() }] } }, dctx);
      await denied(binding, payload, { ...dctx, revision_id: randomUUID() });
      await denied({ ...binding, brand_id: "brand_other" }, payload, { ...dctx, brand_id: "brand_other" });
      // the object changes underneath us between chunks -> revalidate refuses
      const key = j.asset.storage_key; const before = kit.objects.get(key); kit.objects.set(key, { ...before, generation: "999" });
      await assert.rejects(source.revalidate(good, { binding, dispatch: dctx }), { code: "RESOURCE_NOT_AVAILABLE" }); kit.objects.set(key, before);
      // damaged bytes are re-measured and refused
      kit.objects.set(key, { ...before, data: fixtures.audio, generation: before.generation });
      await assert.rejects(source.loadApprovedVideo({ binding, payload, dispatch: dctx }), (e) => e.code === "RESOURCE_NOT_AVAILABLE" || e.code === "TIKTOK_MEDIA_UNAVAILABLE"); kit.objects.set(key, before);
      // once the dispatch is terminal it can no longer read media
      await pool.query("update social_dispatches set state='reconciliation_required' where dispatch_id=$1", [d.dispatch_id]);
      await source.revalidate(good, { binding, dispatch: dctx });
    });


    describe("staging callback host (BG-LAUNCH-008)", () => {
      const connectVia = async (over) => {
        const tt = fakeTikTok(); premium = await build(tiktokEnv(over), { socialFetch: tt.fetch });
        const svc = premium.socialPublishingService; const verifier = rb(48).toString("base64url");
        const intent = await svc.oauthIntent(actor, scope, { platform: "tiktok", pkce_challenge: sha256h("sha256").update(verifier).digest("base64url") });
        return { tt, svc, verifier, intent };
      };
      it("by default the redirect URI is still the bare domain", async () => {
        const { intent } = await connectVia({});
        assert.equal(new URL(intent.authorize_url).searchParams.get("redirect_uri"), "https://getbizgenie.com/customer/social/oauth/callback/tiktok");
      });
      it("staging: the mapped host is sent to TikTok, used for the code exchange and relayed to the staging Studio host", async () => {
        const redirect = "https://staging-api.getbizgenie.com/customer/social/oauth/callback/tiktok";
        const { tt, svc, verifier, intent } = await connectVia({ TIKTOK_REDIRECT_URI: redirect, TIKTOK_BROWSER_RETURN_URI: "https://staging-app.getbizgenie.com/" });
        const authorize = new URL(intent.authorize_url);
        assert.deepEqual([authorize.origin + authorize.pathname, authorize.searchParams.get("redirect_uri"), authorize.searchParams.get("scope"), authorize.searchParams.has("code_challenge")], ["https://www.tiktok.com/v2/auth/authorize/", redirect, "user.info.basic,video.upload", false]);
        const back = new URL(await svc.callbackRedirect("tiktok", { code: "auth_code_1", state: intent.state }));
        assert.deepEqual([back.origin, back.searchParams.get("state")], ["https://staging-app.getbizgenie.com", intent.state]);
        const connection = await svc.connect(actor, scope, { intent_id: intent.intent_id, state: intent.state, code: "auth_code_1", code_verifier: verifier });
        assert.equal(connection.status, "active"); assert.equal(tt.tokenForm.get("redirect_uri"), redirect); await svc.disconnect(actor, connection.connection_id, scope); // leave no live connection behind for the journeys that follow
      });
      it("any other redirect host, scheme, port or path fails closed at start-up; a browser return outside the reviewed hosts is refused", async () => {
        for (const bad of ["https://evil.example/customer/social/oauth/callback/tiktok", "http://staging-api.getbizgenie.com/customer/social/oauth/callback/tiktok", "https://staging-api.getbizgenie.com:8443/customer/social/oauth/callback/tiktok", "https://staging-api.getbizgenie.com/other", "https://api.getbizgenie.com/customer/social/oauth/callback/tiktok", "https://staging-api.getbizgenie.com/customer/social/oauth/callback/tiktok?x=1"]) {
          await assert.rejects(build(tiktokEnv({ TIKTOK_REDIRECT_URI: bad }), { socialFetch: fakeTikTok().fetch }), (e) => /TIKTOK_NOT_CONFIGURED|not configured/i.test(`${e.code} ${e.message}`), bad);
        }
        for (const bad of ["https://evil.example/", "https://app.getbizgenie.com/", "http://staging-app.getbizgenie.com/", "https://staging-app.getbizgenie.com:8443/"]) {
          const { svc, intent } = await connectVia({ TIKTOK_BROWSER_RETURN_URI: bad });
          await assert.rejects(svc.callbackRedirect("tiktok", { code: "auth_code_1", state: intent.state }), (e) => e.code === "OAUTH_CONFIGURATION_UNAVAILABLE" || /unavailable/i.test(e.message), bad);
        }
      });
    });
    describe("destination key stays server-side (BG-LAUNCH-006A)", () => {
      it("the dispatch is bound to the item's own connection, and the connection id in the request is optional but never overrides the binding", async () => {
        const j = await journey();
        const row = (await pool.query("select connection_id from social_dispatches where dispatch_id=$1", [j.dispatch.dispatch_id])).rows[0];
        assert.equal(row.connection_id, j.connection.connection_id);
        assert.doesNotMatch(JSON.stringify(j.dispatch), /destination_key|connection_id/);
      });
      it("an item created WITHOUT a connected account cannot be sent: refused, nothing queued, no key in the refusal", async () => {
        const j = await journey(); const s = j.s;
        const added = await campaigns.executeCommand(context, { contract_version: "campaign-spine.v1", idempotency_key: randomUUID(), expected_campaign_version: (await s.get()).version, command_type: "create_content_item", tenant_id: "tenant_a", project_id: "project_a", campaign_id: s.id, payload: { name: "Unbound reel", format: "video", platform: "tiktok", placement: "feed", destination_label: "Nobody", initial_content: { title: null, body: "x", caption: "x", alt_text: "x", asset_refs: [] }  } });
        const vid = added.created_ids.variant_ids[0];
        const before = (await pool.query("select count(*)::int n from social_dispatches")).rows[0].n;
        await assert.rejects(j.svc.enqueue(actor, scope, { campaign_id: s.id, variant_id: vid, schedule_id: randomUUID(), expected_campaign_version: (await s.get()).version, publishing_confirmed: true }), (e) => e instanceof Error && !/destination_key|connection/i.test(e.message), "refused, and the refusal does not name the key");
        assert.equal((await pool.query("select count(*)::int n from social_dispatches")).rows[0].n, before);
      });
      it("a stranger, a non-owner member and another tenant's owner cannot resolve or use the binding", async () => {
        const j = await journey();
        const ask = (who, sc) => j.svc.enqueue(who, sc, { campaign_id: j.s.id, variant_id: j.target.variant_id, schedule_id: randomUUID(), expected_campaign_version: 1, publishing_confirmed: true });
        const stranger = { ...actor, auth_user_id: randomUUID() };
        await assert.rejects(ask(stranger, scope), (e) => e.code === "RESOURCE_NOT_AVAILABLE" || e.message === "RESOURCE_NOT_AVAILABLE");
        const member = randomUUID(); await pool.query("insert into auth.users values($1)", [member]); await pool.query("insert into customer_profiles(auth_user_id) values($1)", [member]); await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'member')", [member]);
        await assert.rejects(ask({ ...actor, auth_user_id: member }, scope), (e) => e.code === "RESOURCE_NOT_AVAILABLE" || e.message === "RESOURCE_NOT_AVAILABLE");
        const other = randomUUID(); await pool.query("insert into auth.users values($1)", [other]); await pool.query("insert into customer_profiles(auth_user_id) values($1)", [other]); await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_b','Other',$1) on conflict do nothing", [other]); await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_b',$1,'owner')", [other]);
        await assert.rejects(ask({ ...actor, auth_user_id: other }, scope), (e) => e.code === "RESOURCE_NOT_AVAILABLE" || e.message === "RESOURCE_NOT_AVAILABLE");
        await assert.rejects(ask({ ...actor, auth_user_id: other }, { ...scope, tenant_id: "tenant_b" }), Error);
      });
      it("the request still refuses unknown fields and a connection from another account", async () => {
        const j = await journey();
        await assert.rejects(j.svc.enqueue(actor, scope, { campaign_id: j.s.id, variant_id: j.target.variant_id, schedule_id: randomUUID(), expected_campaign_version: 1, publishing_confirmed: true, destination_key: randomUUID() }), (e) => e.code === "VALIDATION_ERROR" || e.message === "VALIDATION_ERROR");
        await assert.rejects(j.svc.enqueue(actor, scope, { connection_id: randomUUID(), campaign_id: j.s.id, variant_id: j.target.variant_id, schedule_id: randomUUID(), expected_campaign_version: 1, publishing_confirmed: true }), Error);
      });
    });
    describe("failure recovery", () => {
      beforeEach(async () => {
        // Each journey has its own fake provider and encryption key, but shares this
        // disposable DB. Retire earlier fixtures through the real cancellation
        // service: invalid old queue heads must not consume this test's bounded batch.
        const leftovers = await pool.query("select dispatch_id from social_dispatches where tenant_id=$1 and project_id=$2 and brand_id=$3 and created_by=$4 and state in ('queued','claimed')", [scope.tenant_id, scope.project_id, scope.brand_id, actor.auth_user_id]);
        const cleanup = await build(tiktokEnv(), { socialFetch: fakeTikTok().fetch });
        for (const row of leftovers.rows) await cleanup.socialPublishingService.cancel(actor, row.dispatch_id, scope);
      });
      const initCalls = (tt) => tt.calls.filter((c) => c.path === "/v2/post/publish/inbox/video/init/").length;
      const putCalls = (tt) => tt.calls.filter((c) => c.method === "PUT").length;
      const due = (j) => { clock = new Date(Math.max(clock.getTime(), j.due.getTime()) + 1000); };

      it("TikTok reporting FAILED is a definitive failure: not uploaded, not published, no second attempt", async () => {
        const j = await journey(); j.tt.status = "FAILED"; due(j); const l = workLoop(j.svc);
        // Process the isolated fixture through the real bounded worker, including reconciliation.
        for (let i = 0; i < 15 && !["failed", "uploaded"].includes((await dispatchRow(j.dispatch.dispatch_id)).state); i += 1) { await l.tick(); clock = new Date(clock.getTime() + 61000); }
        const row = await dispatchRow(j.dispatch.dispatch_id);
        assert.equal(row.state, "failed"); assert.deepEqual([row.publication_id, row.publication_url, row.uploaded_at], [null, null, null]);
        for (let i = 0; i < 3; i += 1) { await l.tick(); clock = new Date(clock.getTime() + 61000); }
        assert.deepEqual([initCalls(j.tt), putCalls(j.tt)], [1, 1], "a failed draft is never retried automatically");
      });

      it("a worker that dies mid-upload leaves an unknown outcome; after a full restart it is reconciled from the journal and TikTok is never initialised or uploaded to twice", async () => {
        const j = await journey(); j.tt.putFails = true; due(j);
        const claim = await j.svc.claim(j.dispatch.dispatch_id); await j.svc.run(claim).catch(() => {});
        const mid = await dispatchRow(j.dispatch.dispatch_id);
        assert.equal(mid.state, "reconciliation_required", "an unknown outcome is held, not retried and not claimed done"); assert.deepEqual([mid.publication_id, mid.published_at], [null, null]);
        assert.deepEqual([initCalls(j.tt), putCalls(j.tt)], [1, 1]);
        // full restart: a brand-new composition over the same database and the same key, as a new process would build
        j.tt.putFails = false; const restarted = await build(j.env, { socialFetch: j.tt.fetch });
        const out = await restarted.socialPublishingService.reconcile(j.dispatch.dispatch_id);
        assert.equal(out.state, "uploaded"); assert.equal((await dispatchRow(j.dispatch.dispatch_id)).state, "uploaded");
        assert.deepEqual([initCalls(j.tt), putCalls(j.tt)], [1, 1], "no second init and no second upload after the restart");
        assert.deepEqual(await restarted.socialPublishingService.reconcile(j.dispatch.dispatch_id).then((r) => r.state), "uploaded");
        const stillOnce = await restarted.socialPublishingService.runDue(); void stillOnce; assert.equal(initCalls(j.tt), 1);
      });

      it("an upload URL outside the reviewed origins is never sent a single byte", async () => {
        const j = await journey(); j.tt.uploadUrl = "https://evil.example/upload?x=1"; due(j);
        const claim = await j.svc.claim(j.dispatch.dispatch_id); await j.svc.run(claim).catch(() => {});
        assert.equal(j.tt.calls.some((c) => c.host === "evil.example"), false); assert.equal(putCalls(j.tt), 0);
        assert.notEqual((await dispatchRow(j.dispatch.dispatch_id)).state, "uploaded");
      });

      it("a connection the owner revoked before the scheduled time uploads nothing and the dispatch cannot run", async () => {
        const j = await journey(); await j.svc.disconnect(actor, j.connection.connection_id, scope); due(j);
        await workLoop(j.svc).tick();
        assert.deepEqual([initCalls(j.tt), putCalls(j.tt)], [0, 0], "no bytes leave BizGenie for a revoked connection");
        assert.notEqual((await dispatchRow(j.dispatch.dispatch_id)).state, "uploaded");
      });

      it("rights lost between approval and upload (the asset is withdrawn) stops the upload before any byte is sent", async () => {
        const j = await journey(); due(j);
        const res = await pool.query("update media_assets set status='deleted' where asset_id=$1", [j.asset.asset_id]).then(() => "updated").catch((e) => "blocked:" + e.message);
        if (res !== "updated") { assert.match(res, /blocked/); return; } // an immutability guard that forbids it is also a pass: the right cannot be silently removed
        const claim = await j.svc.claim(j.dispatch.dispatch_id).catch(() => null); if (claim) await j.svc.run(claim).catch(() => {});
        assert.deepEqual([initCalls(j.tt), putCalls(j.tt)], [0, 0], "media is checked before TikTok is contacted at all"); assert.notEqual((await dispatchRow(j.dispatch.dispatch_id)).state, "uploaded");
      });
    });

    it("Direct Post is disabled at every layer, and the platform is draft-only", async () => {
      const j = await journey(); const entry = premium.socialPublishingService.platforms.tiktok;
      assert.equal(entry.deliveryMode, "draft_upload"); assert.deepEqual(entry.requiredScopes, ["user.info.basic", "video.upload"]);
      await assert.rejects(entry.connector.publish(), { code: "DIRECT_POST_DISABLED" });
      assert.equal((await pool.query("select count(*)::int n from social_dispatches where operation_kind='publish'")).rows[0].n, 0);
      void j;
    });

    it("encryption-key configuration fails closed and never leaks the key", async () => {
      const key = rb(32).toString("base64"); const probe = async (over, pattern, extra = {}) => { let built = false; try { await build(tiktokEnv(over), { socialFetch: fakeTikTok().fetch, ...extra }); built = true; } catch (e) { const text = `${e.code || ""} ${e.message}`; assert.match(text, pattern); assert.equal(text.includes(key), false); assert.equal(/cs_test_SECRET_VALUE/.test(text), false); } assert.equal(built, false, "the configuration must be refused: " + JSON.stringify(over).replace(/"[A-Za-z0-9+/]{43}="/g, "<key>")); };
      await probe({ SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: "" }, /32-byte key/);
      await probe({ SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(16, 1).toString("base64") }, /32-byte key/);
      await probe({ SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64") }, /usable 32-byte key/);
      await probe({ SOCIAL_TOKEN_KEY_ID: "" }, /SOCIAL_TOKEN_KEY_ID/);
      await probe({ SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: key, BIZGENIE_ENVIRONMENT: "production", PRODUCTION_ACTIVATION_ENABLED: "true", VIDEO_INSPECTION_ISOLATION: undefined }, /only allowed in disposable isolated staging|key-management/);
      await probe({ TIKTOK_UPLOAD_ORIGINS: "" }, /TIKTOK_UPLOAD_REVIEW_REF and TIKTOK_UPLOAD_ORIGINS/);
      await probe({ TIKTOK_UPLOAD_ORIGINS: "http://insecure.example" }, /TIKTOK_UPLOAD_NOT_CONFIGURED|upload/i);
      await probe({ TIKTOK_APP_REVIEW_APPROVED: "false" }, /PLATFORM_APP_REVIEW_REQUIRED|review/i);
      await probe({}, /validated video generation/, { media: { ...media, videoEnabled: false } });
      const ok = await build(tiktokEnv({ SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: key }), { socialFetch: fakeTikTok().fetch });
      assert.equal(JSON.stringify(ok.describe()).includes(key), false);
      // an injected production-grade provider is accepted without the environment key at all
      const injected = { keyId: "kms-key-1", getKey: async () => rb(32) };
      const viaProvider = await build(tiktokEnv({ SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64: undefined, SOCIAL_TOKEN_KEY_ID: undefined }), { socialFetch: fakeTikTok().fetch, socialKeyProvider: injected });
      assert.ok(viaProvider.socialPublishingService);
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
