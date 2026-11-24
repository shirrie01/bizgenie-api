'use strict';
// BG-FOUNDER-E2E-FINAL-01 — deterministic, NON-BILLABLE Fonzo launch-week acceptance on a disposable PostgreSQL.
// Real routers, repositories, quote/confirm/ledger, fenced worker, private storage, preview registry, approval, schedule and calendar.
// Only the three provider boundaries are test doubles: text generator, image provider, video provider. Nothing here proves a hosted
// customer journey, a real provider response, or database-level tenant isolation (the runtime role has BYPASSRLS).
const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const fonzo = require('./fixtures/fonzo-acceptance');
const { PostgresBillingRepository, BillingService } = require('../src/billing');
const { PostgresGenerationQuoteService } = require('../src/generation-quotes/service');
const { FencedGenerationWorker } = require('../src/generation-quotes/worker');
const { CreativeJobService } = require('../src/generation-quotes/jobs');
const { GenerationExecutionPolicy } = require('../src/generation-quotes/executionPolicy');
const { ExistingTextGenerationAdapter } = require('../src/generation-quotes/textAdapter');
const { ExistingCreativeServicesAdapter } = require('../src/generation-quotes/creativeAdapter');
const { PostgresGenerationJobRepository } = require('../src/generation-jobs');
const { PostgresCampaignRepository, PostgresPreviewRegistry } = require('../src/campaigns');
const { PostgresBrandBrainRepository } = require('../src/brand-brain');
const { PostgresMediaAssetRepository, DurableMediaAssetStore } = require('../src/media');
const { ImageGenerationService, InMemoryImageGenerationRepository } = require('../src/image-generation');
const { VideoGenerationService, PostgresVideoGenerationRepository } = require('../src/video-generation');
const { createVideoInspector } = require('../src/media/videoInspection');
const { localMediaKit } = require('./helpers/customer-media-local');
const { previewReceipt, context } = require('./helpers/campaign-regressions');

const url = process.env.TEST_DATABASE_URL;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=', 'base64');
const actor = context.actor;
const scope = { tenant_id: 'tenant_a', project_id: 'project_a', brand_id: 'brand_a' };
const profiles = {
  'text.standard': { id: 'fixture.text', version: 1, provider_model: 'mock-only' },
  'image.normal': { id: 'fixture.image', version: 1, provider_model: 'mock-only', aspect_ratio: '1:1' },
  'video.normal': { id: 'fixture.video', version: 1, provider_model: 'mock-only', aspect_ratio: '16:9', duration_seconds: 4 },
};

(url ? describe : describe.skip)('Fonzo launch-week acceptance (deterministic doubles, disposable PostgreSQL)', { concurrency: 1 }, () => {
  let admin, pool, db, billing, service, campaigns, clock, counters, kit, objects, brainRepo, base;

  before(async () => {
    admin = new Pool({ connectionString: url });
    const c = await admin.connect();
    try {
      await c.query('select pg_advisory_lock(734921)');
      await c.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$");
    } finally { await c.query('select pg_advisory_unlock(734921)'); c.release(); }
    db = 'fonzo_acceptance_' + randomUUID().replaceAll('-', '');
    await admin.query(`create database ${db}`);
    const local = new URL(url); local.pathname = '/' + db;
    pool = new Pool({ connectionString: local.toString(), max: 12 });
    await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
    for (const f of fs.readdirSync(path.join(__dirname, '../supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(__dirname, '../supabase/migrations', f), 'utf8'));
    await pool.query('insert into auth.users values($1)', [actor.auth_user_id]);
    await pool.query('insert into customer_profiles(auth_user_id) values($1)', [actor.auth_user_id]);
    await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_a','Fonzo Fixture Workspace',$1)", [actor.auth_user_id]);
    await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner')", [actor.auth_user_id]);
    await pool.query("insert into projects(project_id,tenant_id,name) values('project_a','tenant_a','Fonzo Fixture Project')");
    brainRepo = new PostgresBrandBrainRepository({ pool });
    await brainRepo.upsert({ brand_id: 'brand_a', project_id: 'project_a', ...structuredClone(fonzo.brandBrain), metadata: { version: 1, status: 'approved', created_at: '2026-10-26T12:00:00.000Z', updated_at: '2026-10-26T12:00:00.000Z' } });
    // Provisional staging.standard.v1 prices (text 1, image 2, video 5): NOT commercially approved. 100 = the founder-verified staging funding.
    await pool.query("insert into commercial_policies(policy_id,plan_code,policy_version,status,included_monthly_credits,bolt_on_eligible,effective_from)values('fonzo_fixture_policy','standard',998,'draft',100,true,'2026-01-01')");
    await pool.query("insert into commercial_execution_prices(policy_id,execution_class,credit_cost)values('fonzo_fixture_policy','text.standard',1),('fonzo_fixture_policy','image.normal',2),('fonzo_fixture_policy','video.normal',5)");
    await pool.query("update commercial_policies set status='active' where policy_id='fonzo_fixture_policy'");
    await pool.query("insert into tenant_entitlements(entitlement_id,tenant_id,policy_id,plan_code,status,starts_at,reference_period_start,reference_period_end,included_monthly_credit_grant)values('fonzo_entitlement','tenant_a','fonzo_fixture_policy','standard','active','2026-01-01','2026-10-01','2026-11-01',100)");
    await pool.query("insert into credit_accounts(account_id,tenant_id)values('fonzo_account','tenant_a')");
    billing = new PostgresBillingRepository({ pool, now: () => clock });
    service = new BillingService({ repository: billing, now: () => clock });
    campaigns = new PostgresCampaignRepository({ pool, now: () => clock, resolvePreviewReceipt: previewReceipt, validatePreview: async () => true });
    const registry = new PostgresPreviewRegistry({ pool, now: () => clock });
    campaigns.resolvePreviewReceipt = registry.resolvePreviewReceipt.bind(registry);
    campaigns.validatePreview = registry.validatePreview.bind(registry);
    campaigns.registry = registry;
  });
  after(async () => { await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });
  beforeEach(async () => {
    clock = new Date('2026-10-26T12:00:00Z');
    counters = { text: 0, image: 0, video: 0, videoPolls: 0, failNextVideo: false };
    objects = new Map();
    kit = localMediaKit({ pool, billing, now: () => clock });
    const key = randomUUID();
        await service.adjustCredits({ tenantId: 'tenant_a', amount: 100, direction: 'credit', transactionCorrelationId: key, idempotencyKey: key });
    base = await balance(); // ledger is append-only: assertions are relative to the balance after the funding step
  });

  const quotes = (options = {}) => new PostgresGenerationQuoteService({ billingRepository: billing, profiles, now: () => clock, ...options });
  const balance = async () => (await service.readBalance({ tenantId: 'tenant_a' })).available_balance;
  const ledger = async () => (await pool.query("select entry_type,count(*)::int n,coalesce(sum(amount),0)::int total from credit_ledger group by entry_type order by entry_type")).rows;

  function providers(q) {
    const policy = new GenerationExecutionPolicy({ mode: 'quoted_v1', quoteService: q });
    const jobs = new PostgresGenerationJobRepository({ pool });
    const text = new ExistingTextGenerationAdapter({ jobs, executionPolicy: policy, branding: {}, generator: async (brief, options) => { counters.text++; assert.equal(options.modelName, 'mock-only'); const day = /Day (\d)/.exec(String(brief))?.[1]; return { text: `FIXTURE COPY (deterministic test double, not AI output)${day ? ` day ${day}` : ''}: ${fonzo.brandBrain.name} is a sugar-free soft drink in 330ml cans. ${fonzo.brandBrain.commercial.primary_cta}.`, metadata: { model: 'mock-only' } }; } });
    const storage = {
      bucket: 'private-fixture', putObject: async ({ key, data }) => { objects.set(key, Buffer.from(data)); return { byteSize: data.length }; }, delete: async () => {},
      statPreview: async ({ key }) => ({ size: objects.get(key).length, mimeType: 'image/png', generation: '1' }),
      openPreview: async ({ key }) => new Response(objects.get(key), { headers: { 'content-type': 'image/png', 'content-length': String(objects.get(key).length) } }),
    };
    const media = new PostgresMediaAssetRepository({ pool });
    const store = new DurableMediaAssetStore({ mediaKind: 'image', repository: media, storage, now: () => clock });
    const imageService = new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), brandBrainRepository: new PostgresBrandBrainRepository({ pool }), now: () => clock, provider: { model: 'mock-only', generate: async ({ metadata }) => { counters.image++; const saved = await store.save({ data: png, mime_type: 'image/png', width: 1080, height: 1080, lineage: metadata }); const { byte_size, ...asset } = saved; return { provider: 'fixture', provider_job_id: `fixture_image_${counters.image}`, asset }; } } });
    const image = new ExistingCreativeServicesAdapter({ jobs, mediaAssets: media, imageService });
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/video-inspection/silent-h264.mp4')), inspect = createVideoInspector();
    const provider = {
      modelForQuality: () => 'mock-only',
      submit: async () => { counters.video++; return { provider: 'fixture', provider_job_id: `fixture_video_${counters.video}`, provider_model: 'mock-only' }; },
      poll: async () => { counters.videoPolls++; if (counters.failNextVideo) { counters.failNextVideo = false; return { provider: 'fixture', provider_job_id: `fixture_video_${counters.video}`, provider_model: 'mock-only', status: 'failed', error_code: 'VIDEO_PROVIDER_FAILED' }; } return { provider: 'fixture', provider_job_id: `fixture_video_${counters.video}`, provider_model: 'mock-only', status: 'completed', asset_source: { location: 'gs://fixture-only/output.mp4', mime_type: 'video/mp4', width: 1280, height: 720, duration_seconds: 4, container: 'mp4' } }; },
    };
    const videoService = new VideoGenerationService({ repository: new PostgresVideoGenerationRepository({ pool }), provider, brandBrainRepository: new PostgresBrandBrainRepository({ pool }), assetStore: { save: async ({ lineage }) => kit.store.saveComposed({ data: bytes, lineage }, { inspect }) }, referenceAssetLoader: { load: async () => { throw Error('AI-only fixture: no source asset'); } }, now: () => clock });
    const video = new ExistingCreativeServicesAdapter({ jobs, mediaAssets: kit.assets, videoService, executionPolicy: policy });
    return { policy, text, image, video, storage };
  }

  const cmd = async (campaignId, type, payload, key = randomUUID()) => campaigns.executeCommand(context, { contract_version: 'campaign-spine.v1', idempotency_key: key, expected_campaign_version: (await campaigns.getCampaign(context, campaignId)).version, command_type: type, tenant_id: 'tenant_a', project_id: 'project_a', campaign_id: campaignId, payload });

  async function createCampaign() {
    const r = await campaigns.executeCommand(context, { contract_version: 'campaign-spine.v1', idempotency_key: randomUUID(), expected_campaign_version: 0, command_type: 'create_campaign', tenant_id: 'tenant_a', project_id: 'project_a', payload: { brand_id: 'brand_a', name: 'Fonzo launch week (FIXTURE)', goal: fonzo.goal, display_timezone: 'Europe/London' } });
    return r.campaign_id;
  }
  function app() {
    const { createApp } = require('../index');
    return createApp({ campaignRepository: campaigns, brandBrainRepository: brainRepo, customerTokenVerifier: { verifyAccessToken: async () => actor }, authorizationService: { authorizeProject: async () => context }, logger: { info() {}, warn() {}, error() {} } });
  }
  async function fetchPlan(campaignId, startDate = fonzo.startDate) {
    const r = await request(app()).get(`/customer/campaigns/${campaignId}/content-plan`).query({ tenant_id: 'tenant_a', project_id: 'project_a', start_date: startDate }).set('authorization', 'Bearer fixture');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.plan;
  }

  // One generation step: quote -> explicit confirmation at the quoted price -> fenced worker -> attach (never self-approves).
  async function generate(q, p, campaignId, variantId, step) {
    const price = fonzo.provisionalPrices[step.execution_class];
    const quote = await q.quote(actor, { tenant_id: 'tenant_a', project_id: 'project_a', campaign_id: campaignId, variant_id: variantId, expected_campaign_version: (await campaigns.getCampaign(context, campaignId)).version, execution_class: step.execution_class, execution_mode: 'ai', execution_brief: step.execution_brief, supplied_assets: [], idempotency_key: randomUUID() });
    assert.equal(quote.credits, price);
    const confirmed = await q.confirm(actor, quote.quote_id, { idempotency_key: randomUUID(), max_credits: price, confirmed: true });
    const adapter = step.execution_class === 'image.normal' ? p.image : p.video;
    // The image adapter is built without the durable execution policy (as in the existing quoted-image proof); video shares it.
    const worker = step.execution_class === 'image.normal' ? new FencedGenerationWorker({ quoteService: q, provider: adapter }) : new FencedGenerationWorker({ quoteService: q, provider: adapter, executionPolicy: p.policy });
    const claim = await worker.claim(confirmed.job_id);
    let run = await worker.run(claim);
    if (run.status === 'recovery_required') run = await worker.reconcile(claim);
    return { quote, confirmed, run, claim };
  }

  async function review(campaignId, variantId, revisionId, schedule) {
    await cmd(campaignId, 'submit_review', { variant_id: variantId, revision_id: revisionId });
    const rendered = await campaigns.registry.renderPreview(context, await campaigns.getCampaign(context, campaignId), { variant_id: variantId, revision_id: revisionId, idempotency_key: randomUUID() });
    const ack = await cmd(campaignId, 'acknowledge_preview', { variant_id: variantId, revision_id: revisionId, render_receipt_id: rendered.render_receipt_id, acknowledged: true });
    const approved = await cmd(campaignId, 'approve', { variant_id: variantId, revision_id: revisionId, preview_id: ack.created_ids.preview_ids[0], approved: true });
    if (schedule) await cmd(campaignId, 'schedule', { variant_id: variantId, revision_id: revisionId, approval_id: approved.created_ids.approval_ids[0], ...schedule });
  }

  it('executes the whole Fonzo launch week: plan -> items -> text/image/video -> review -> approval -> schedule -> calendar, with exact credit accounting', async () => {
    const campaignId = await createCampaign();
    const plan = await fetchPlan(campaignId);
    assert.deepEqual(plan.totals, { posts: fonzo.expected.posts, content_items: fonzo.expected.contentItems, images: fonzo.expected.images, videos: fonzo.expected.videos, text_generations: fonzo.expected.textGenerations, copy: 'template_draft_editable' });
    const q = quotes(), p = providers(q), jobs = new CreativeJobService({ quoteService: q, campaignRepository: campaigns });
    const scheduled = [];
    for (const item of plan.items) {
      const created = await cmd(campaignId, 'create_content_item', { ...item.content_item, initial_content: item.initial_content }, item.idempotency_key);
      const variantId = created.created_ids.variant_ids[0];
      let revisionId = created.created_ids.revision_ids[0];
      for (const step of item.generation_steps) {
        const done = await generate(q, p, campaignId, variantId, step);
        assert.equal(done.run.status, 'succeeded', `${item.key} ${step.execution_class}`);
        const attached = await jobs.attach(actor, done.confirmed.job_id, scope);
        assert.equal(attached.association.approval_status, 'not_approved', 'a generated result never approves itself');
        revisionId = attached.association.revision_id;
      }
      const variant = [...(await campaigns.getCampaign(context, campaignId)).items.values()].flatMap((i) => [...i.variants.values()]).find((v) => v.variant_id === variantId);
      assert.equal(variant.current_revision_id, revisionId);
      assert.equal((await campaigns.getRevision?.(context, campaignId, revisionId))?.content?.body ?? item.initial_content.body, item.initial_content.body, 'the draft copy survives media attachment');
      await review(campaignId, variantId, revisionId, item.schedule);
      if (item.schedule) scheduled.push({ variantId, ...item.schedule });
    }
    // Provider boundaries were each invoked exactly once per planned step; nothing was invoked twice.
    assert.deepEqual({ text: counters.text, image: counters.image, video: counters.video }, { text: 0, image: 5, video: 3 });
    // Credits: provisional 5*2 + 3*5 = 25 settled out of the 100-credit founder funding.
    assert.equal(await balance(), base - fonzo.expected.provisionalCredits);
    const entries = Object.fromEntries((await ledger()).map((r) => [r.entry_type, r]));
        assert.ok(Object.keys(entries).length >= 2, JSON.stringify(entries));
    // Campaign state: 8 items, 7 scheduled variants, calendar has 7 dated entries at the planned UTC slots.
    const campaign = await campaigns.getCampaign(context, campaignId);
    assert.equal(campaign.items.size, 8);
    const variants = [...campaign.items.values()].flatMap((i) => [...i.variants.values()]);
    assert.equal(variants.filter((v) => v.workflow === 'scheduled').length, 7);
    assert.equal(variants.filter((v) => v.workflow === 'approved').length, 1, 'the key visual is approved but intentionally unscheduled');
    const calendar = await request(app()).get(`/customer/campaigns/${campaignId}/calendar`).query({ tenant_id: 'tenant_a', project_id: 'project_a', from: '2026-12-01T00:00:00Z', to: '2026-12-31T00:00:00Z' }).set('authorization', 'Bearer fixture');
    assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
    assert.deepEqual(calendar.body.entries.map((e) => e.occurrence_at).sort(), scheduled.map((s) => s.scheduled_for).sort());
    assert.equal(calendar.body.entries.length, 7);
    assert.equal((await campaigns.verifyCampaignProjection(context, campaignId)).valid, true);
    // Replaying the whole plan creates nothing new (idempotent content-item keys).
    const again = await cmd(campaignId, 'create_content_item', { ...plan.items[0].content_item, initial_content: plan.items[0].initial_content }, plan.items[0].idempotency_key).catch((e) => e);
    assert.equal((await campaigns.getCampaign(context, campaignId)).items.size, 8, `replay or stale rejection must not add a ninth item: ${again?.code || 'replayed'}`);
    assert.equal(JSON.stringify(plan).includes('gs://'), false);
  });

  it('a definitive provider failure releases its reservation once, loses no completed work, and a fresh quote succeeds without a duplicate debit', async () => {
    const campaignId = await createCampaign(), plan = await fetchPlan(campaignId);
    const q = quotes(), p = providers(q), jobs = new CreativeJobService({ quoteService: q, campaignRepository: campaigns });
    const videoItem = plan.items.find((i) => i.content_item.format === 'video');
    const created = await cmd(campaignId, 'create_content_item', { ...videoItem.content_item, initial_content: videoItem.initial_content });
    const variantId = created.created_ids.variant_ids[0];
    const afterCopy = await balance();
    counters.failNextVideo = true;
    const failed = await generate(q, p, campaignId, variantId, videoItem.generation_steps[0]);
    assert.equal(failed.run.status, 'failed');
    assert.equal(await balance(), afterCopy, 'failed video returns every reserved credit');
    assert.equal((await pool.query("select count(*)::int n from credit_ledger where generation_id=$1 and entry_type='reservation_release'", [failed.confirmed.job_id])).rows[0].n, 1);
    assert.equal((await new FencedGenerationWorker({ quoteService: q, provider: p.video, executionPolicy: p.policy }).reconcile(failed.claim)).replay, true, 'reconcile replays, never releases twice');
    assert.equal((await pool.query("select count(*)::int n from credit_ledger where generation_id=$1 and entry_type='reservation_release'", [failed.confirmed.job_id])).rows[0].n, 1);
    const detail = await jobs.get(actor, failed.confirmed.job_id, scope);
    assert.equal(detail.state, 'failed');assert.equal(detail.retry_guidance, 'new_quote_required');
    const current = [...(await campaigns.getCampaign(context, campaignId)).items.values()][0].variants.values().next().value;
    assert.ok(current, 'the item and its draft survive the failed video');
    const retry = await generate(q, p, campaignId, variantId, videoItem.generation_steps[0]);
    assert.equal(retry.run.status, 'succeeded');
    assert.equal(await balance(), afterCopy - fonzo.provisionalPrices['video.normal'], 'exactly one video debit after the retry');
    assert.equal(counters.video, 2);
    await jobs.attach(actor, retry.confirmed.job_id, scope);
  });

  it('insufficient credits cannot confirm; duplicate and concurrent confirmations create one reservation; ledger never goes negative', async () => {
    const campaignId = await createCampaign(), plan = await fetchPlan(campaignId), q = quotes();
    const created = await cmd(campaignId, 'create_content_item', { ...plan.items.find((i) => i.content_item.format === 'video').content_item, initial_content: plan.items.find((i) => i.content_item.format === 'video').initial_content });
    const variantId = created.created_ids.variant_ids[0];
    const quoteInput = async () => ({ tenant_id: 'tenant_a', project_id: 'project_a', campaign_id: campaignId, variant_id: variantId, expected_campaign_version: (await campaigns.getCampaign(context, campaignId)).version, execution_class: 'video.normal', execution_mode: 'ai', execution_brief: 'Fixture video brief', supplied_assets: [], idempotency_key: randomUUID() });
    const quote = await q.quote(actor, await quoteInput());
    const body = { idempotency_key: randomUUID(), max_credits: 5, confirmed: true };
    const both = await Promise.all([q.confirm(actor, quote.quote_id, body), quotes().confirm(actor, quote.quote_id, body)]);
    assert.equal(both[0].job_id, both[1].job_id);
    assert.equal((await pool.query('select count(*)::int n from credit_ledger where generation_id=$1', [both[0].job_id])).rows[0].n, 1, 'one reservation despite two concurrent confirmations');
    const available = await balance();
    const key = randomUUID();
    await service.adjustCredits({ tenantId: 'tenant_a', amount: available - 4, direction: 'debit', transactionCorrelationId: key, idempotencyKey: key });
    const second = await q.quote(actor, await quoteInput());
    assert.equal(second.sufficient, false);
    await assert.rejects(q.confirm(actor, second.quote_id, { idempotency_key: randomUUID(), max_credits: 5, confirmed: true }), { code: 'INSUFFICIENT_AVAILABLE_CREDITS' });
    assert.ok((await balance()) >= 0);
    assert.equal(counters.video, 0, 'no provider is contacted by any of the above');
  });

  it('two launch weeks coexist in one campaign without name or key collisions; each week replays exactly and the impossible date is refused', async () => {
    const campaignId = await createCampaign();
    const week1 = await fetchPlan(campaignId, '2026-12-07'), week2 = await fetchPlan(campaignId, '2026-12-14');
    const add = (item) => cmd(campaignId, 'create_content_item', { ...item.content_item, initial_content: item.initial_content }, item.idempotency_key);
    const ids1 = []; for (const item of week1.items) ids1.push((await add(item)).created_ids.content_item_ids[0]);
    const count = async () => (await campaigns.getCampaign(context, campaignId)).items.size;
    assert.equal(await count(), 8);
    const ids2 = []; for (const item of week2.items) ids2.push((await add(item)).created_ids.content_item_ids[0]);
    assert.equal(await count(), 16, 'the next week adds eight new items; none is mistaken for week one');
    assert.equal(new Set([...ids1, ...ids2]).size, 16);
    const names = [...(await campaigns.getCampaign(context, campaignId)).items.values()].map((i) => i.name);
    assert.equal(new Set(names).size, 16, 'all saved names are distinct across weeks');
    // Exact same-week retry: replaying a week-one key (with a stale expected version) never adds a ninth-of-week or seventeenth item.
    const replay = await add(week1.items[0]).catch((e) => e);
    assert.equal(await count(), 16, `replay or stale refusal must not add an item: ${replay?.code || 'replayed'}`);
    if (!(replay instanceof Error)) assert.deepEqual(replay.created_ids.content_item_ids, [ids1[0]], 'a successful replay returns the original item');
    // Impossible dates are refused by the route (400), never rolled into March.
    for (const bad of ['2026-02-30', '2026-13-45']) {
      const r = await request(app()).get(`/customer/campaigns/${campaignId}/content-plan`).query({ tenant_id: 'tenant_a', project_id: 'project_a', start_date: bad }).set('authorization', 'Bearer fixture');
      assert.equal(r.status, 400, bad);
    }
    assert.equal(counters.text + counters.image + counters.video, 0, 'planning and adding items never invokes a provider');
  });

  it('another tenant cannot read, plan, quote or confirm Fonzo work (application-level checks only; the runtime database role bypasses RLS)', async () => {
    const campaignId = await createCampaign(), q = quotes();
    const foreign = { kind: 'customer', auth_user_id: randomUUID() };
    await assert.rejects(q.quote(foreign, { tenant_id: 'tenant_a', project_id: 'project_a', campaign_id: campaignId, variant_id: randomUUID(), expected_campaign_version: 1, execution_class: 'text.standard', execution_mode: 'ai', supplied_assets: [], idempotency_key: randomUUID() }));
    const denied = await request((() => { const { createApp } = require('../index'); return createApp({ campaignRepository: campaigns, brandBrainRepository: brainRepo, customerTokenVerifier: { verifyAccessToken: async () => foreign }, authorizationService: { authorizeProject: async () => { const { AuthorizationDeniedError } = require('../src/authorization'); throw new AuthorizationDeniedError(); } }, logger: { info() {}, warn() {}, error() {} } }); })()).get(`/customer/campaigns/${campaignId}/content-plan`).query({ tenant_id: 'tenant_a', project_id: 'project_a', start_date: fonzo.startDate }).set('authorization', 'Bearer foreign');
    assert.ok([401, 403, 404].includes(denied.status), String(denied.status));
    assert.equal(JSON.stringify(denied.body).includes('Fonzo'), false);
    assert.equal(counters.text + counters.image + counters.video, 0);
  });
});
