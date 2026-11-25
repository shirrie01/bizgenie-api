'use strict';
// BG-FOUNDER-RELEASE-07 — OFFLINE acceptance harness for a separately bound Fonzo workspace and rights-checked artwork intake.
// Real PostgreSQL (disposable database), real workspace/campaign/intake services and repositories. Test doubles: private object storage and the
// content inspector (the real scanner is infrastructure). The fixture below is a CONTROLLED SYNTHETIC IMAGE standing in for founder-supplied artwork:
// it is not Fonzo artwork, the rights statement is not approved legal wording, and nothing here is evidence of a hosted journey, a genuine upload,
// a real malware scan, or database-level tenant isolation (the runtime role bypasses RLS: isolation shown here is the application layer).
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PostgresBillingRepository } = require('../src/billing');
const { PostgresCampaignRepository } = require('../src/campaigns');
const { PostgresBrandBrainRepository } = require('../src/brand-brain');
const { PostgresCustomerWorkspaceRepository } = require('../src/customer-workspace/postgresRepository');
const { CustomerWorkspaceService } = require('../src/customer-workspace/service');
const { CustomerMediaIntakeService } = require('../src/media-intake/service');
const { buildContentPlan } = require('../src/campaigns/contentPlan');
const { previewReceipt, context: baseContext } = require('./helpers/campaign-regressions');
const { localMediaKit } = require('./helpers/customer-media-local');
const fonzo = require('./fixtures/fonzo-acceptance');

const url = process.env.TEST_DATABASE_URL;
const KEY = 'bg-r2-founder-campaign-v1';
const founder = baseContext.actor; // the accepted founder identity of the existing fixtures
const stranger = { kind: 'customer', auth_user_id: '99999999-9999-4999-8999-999999999999' };
const member = { kind: 'customer', auth_user_id: '88888888-8888-4888-8888-888888888888' };
// Controlled synthetic fixture: a valid 1x1 PNG. SHA-256 is computed, never hard-coded, so the assertions compare what was uploaded with what is stored.
const artwork = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=', 'base64');
const artworkSha = createHash('sha256').update(artwork).digest('hex');
const sha = (b) => createHash('sha256').update(b).digest('hex');

(url ? describe : describe.skip)('Fonzo workspace and artwork intake (offline harness, disposable PostgreSQL)', { concurrency: 1 }, () => {
  let admin, pool, db, billing, campaigns, brainRepo, workspaceService, kit, clock = new Date('2026-11-25T12:00:00Z');
  let fonzoAsset, fairway, fonzoScope, fairwayCampaign, fairwaySnapshot, fonzoCampaign, provisioned = [];
  let scanner = { mode: 'clean' };

  const ctx = (scope) => ({ ...baseContext, tenant_id: scope.tenant_id, project_id: scope.project_id });
  const command = (scope, type, payload, key = randomUUID(), campaignId, version = 0) => ({ contract_version: 'campaign-spine.v1', idempotency_key: key, expected_campaign_version: version, command_type: type, tenant_id: scope.tenant_id, project_id: scope.project_id, ...(campaignId ? { campaign_id: campaignId } : {}), payload });
  const createCampaign = (scope, name, goal, key = KEY) => campaigns.executeCommand(ctx(scope), command(scope, 'create_campaign', { brand_id: scope.brand_id, name, goal, display_timezone: 'Europe/London' }, key));
  async function snapshot(scope, campaignId) {
    const c = ctx(scope), campaign = await campaigns.getCampaign(c, campaignId);
    const counts = (await pool.query("select (select count(*)::int from campaign_command_receipts where tenant_id=$1 and project_id=$2) receipts,(select count(*)::int from campaign_content_items where tenant_id=$1 and project_id=$2) items,(select count(*)::int from customer_media_intakes where tenant_id=$1 and project_id=$2) intakes,(select count(*)::int from media_assets where tenant_id=$1 and project_id=$2) assets", [scope.tenant_id, scope.project_id])).rows[0];
    return { version: campaign.version, name: campaign.name, goal: campaign.goal, brand_id: campaign.brand_id, ...counts };
  }
  function intakeService(overrides = {}) {
    return new CustomerMediaIntakeService({
      billingRepository: billing, storage: kit.storage, enabled: true, now: () => clock,
      rightsPolicy: { version: 'synthetic-rights.v1', statement: 'Synthetic attestation fixture, not approved legal wording', allowed_uses: ['campaign.preview', 'image.generate.reference', 'video.generate.reference'] },
      inspector: { inspect: async ({ sha256, content_type }) => {
        if (scanner.mode === 'down') throw new Error('synthetic scanner unavailable');
        if (scanner.mode === 'infected') return { sha256, content_type, clean: false, engine: 'synthetic-inspector', policy_version: 'synthetic.v1' };
        if (scanner.mode === 'unscanned') return { sha256, content_type, clean: true, engine: 'UNSCANNED-structural', policy_version: 'synthetic.v1', width: 1, height: 1 };
        return { sha256, content_type, clean: true, engine: 'synthetic-inspector', policy_version: 'synthetic.v1', width: 1, height: 1 };
      } },
      ...overrides,
    });
  }
  const init = (svc, actor, scope, patch = {}) => svc.initiate(actor, { ...scope, filename: 'classic-cola.png', content_type: 'image/png', bytes: artwork.length, rights_confirmed: true, idempotency_key: 'fonzo.classic.v1', ...patch });

  before(async () => {
    admin = new Pool({ connectionString: url });
    const c = await admin.connect();
    try {
      await c.query('select pg_advisory_lock(734921)');
      await c.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$");
    } finally { await c.query('select pg_advisory_unlock(734921)'); c.release(); }
    db = 'fonzo_intake_' + randomUUID().replaceAll('-', '');
    await admin.query(`create database ${db}`);
    const local = new URL(url); local.pathname = '/' + db;
    pool = new Pool({ connectionString: local.toString(), max: 12 });
    await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
    for (const f of fs.readdirSync(path.join(__dirname, '../supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(__dirname, '../supabase/migrations', f), 'utf8'));
    for (const a of [founder, stranger, member]) { await pool.query('insert into auth.users values($1)', [a.auth_user_id]); await pool.query('insert into customer_profiles(auth_user_id) values($1)', [a.auth_user_id]); }
    // The accepted Fairway workspace: owned by the founder.
    await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_fairway','Fairway Workspace',$1)", [founder.auth_user_id]);
    await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_fairway',$1,'owner'),('tenant_fairway',$2,'member')", [founder.auth_user_id, member.auth_user_id]);
    await pool.query("insert into projects(project_id,tenant_id,name) values('project_fairway','tenant_fairway','Fairway Campaign Workspace')");
    // A different customer entirely.
    await pool.query("insert into tenants(tenant_id,name,created_by) values('tenant_stranger','Stranger Workspace',$1)", [stranger.auth_user_id]);
    await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('tenant_stranger',$1,'owner')", [stranger.auth_user_id]);
    await pool.query("insert into projects(project_id,tenant_id,name) values('project_stranger','tenant_stranger','Stranger Campaign Workspace')");
    brainRepo = new PostgresBrandBrainRepository({ pool });
    const meta = { version: 1, status: 'approved', created_at: '2026-10-26T12:00:00.000Z', updated_at: '2026-10-26T12:00:00.000Z' };
    await brainRepo.upsert({ brand_id: 'brand_fairway', project_id: 'project_fairway', name: 'Fairway', identity: { description: 'Fairway develops and supplies soft drinks to retailers.' }, commercial: { primary_cta: 'Enquire about stocking Fairway' }, metadata: meta });
    await brainRepo.upsert({ brand_id: 'brand_stranger', project_id: 'project_stranger', name: 'Stranger', identity: { description: 'Synthetic other customer.' }, commercial: { primary_cta: 'Contact us' }, metadata: meta });
    billing = new PostgresBillingRepository({ pool, now: () => clock });
    campaigns = new PostgresCampaignRepository({ pool, now: () => clock, resolvePreviewReceipt: previewReceipt, validatePreview: async () => true });
    workspaceService = new CustomerWorkspaceService({
      repository: new PostgresCustomerWorkspaceRepository({ pool }), brandBrainRepository: brainRepo,
      scopeProvisioner: { provisionTrustedScope: async (input) => { provisioned.push(input); return { requires_session_refresh: true }; } },
    });
    fairway = { tenant_id: 'tenant_fairway', project_id: 'project_fairway', brand_id: 'brand_fairway' };
    kit = localMediaKit({ pool, billing, now: () => clock });
  });
  after(async () => { await pool?.end(); if (db) await admin.query(`drop database ${db}`); await admin?.end(); });

  it('the accepted Fairway campaign exists under the fixed founder key and is snapshotted', async () => {
    const r = await createCampaign(fairway, 'Fairway trade acquisition (accepted)', 'Win independent retailers for Fairway drinks');
    fairwayCampaign = r.campaign_id;
    assert.ok(fairwayCampaign);
    fairwaySnapshot = await snapshot(fairway, fairwayCampaign);
    assert.equal(fairwaySnapshot.version >= 1, true);
  });

  it('a separate Fonzo workspace is created by the existing additional-workspace operation with its own project and brand; Fairway is unchanged', async () => {
    const result = await workspaceService.createAdditionalWorkspace({ actor: { ...founder }, request: { tenant_id: 'tenant_fairway', business_name: 'Fonzo' } });
    assert.equal(result.status, 'ready');
    fonzoScope = { tenant_id: result.workspace.tenant_id, project_id: result.workspace.project_id, brand_id: result.workspace.brand_id };
    assert.equal(fonzoScope.tenant_id, fairway.tenant_id, 'additional workspaces live under the existing owner tenant');
    assert.notEqual(fonzoScope.project_id, fairway.project_id);
    assert.notEqual(fonzoScope.brand_id, fairway.brand_id);
    assert.equal(provisioned.at(-1).trusted_scope.project_id, fonzoScope.project_id, 'the founder trusted scope is moved to the new workspace');
    const brain = await brainRepo.getByProjectAndBrand(fonzoScope.project_id, fonzoScope.brand_id);
    assert.equal(brain.name, 'Fonzo');
    assert.equal((await brainRepo.getByProjectAndBrand(fairway.project_id, fairway.brand_id)).name, 'Fairway');
    assert.deepEqual(await snapshot(fairway, fairwayCampaign), fairwaySnapshot);
    // The operation is not idempotent: a replay makes ANOTHER workspace. This is why the bridge permits one attempt per process.
    const again = await workspaceService.createAdditionalWorkspace({ actor: { ...founder }, request: { tenant_id: 'tenant_fairway', business_name: 'Fonzo' } });
    assert.notEqual(again.workspace.project_id, fonzoScope.project_id);
    // A non-owner of the tenant cannot create one in it.
    await assert.rejects(workspaceService.createAdditionalWorkspace({ actor: { ...member }, request: { tenant_id: 'tenant_fairway', business_name: 'Fonzo' } }));
    await assert.rejects(workspaceService.createAdditionalWorkspace({ actor: { ...stranger }, request: { tenant_id: 'tenant_fairway', business_name: 'Fonzo' } }));
  });

  it('Fonzo gets its own campaign under the SAME fixed key without touching Fairway; the spent Fairway key cannot be reused for Fonzo content', async () => {
    await brainRepo.upsert({ brand_id: fonzoScope.brand_id, project_id: fonzoScope.project_id, ...structuredClone(fonzo.brandBrain), metadata: { version: 2, status: 'approved', created_at: '2026-11-25T12:00:00.000Z', updated_at: '2026-11-25T12:00:00.000Z' } });
    const created = await createCampaign(fonzoScope, 'Fonzo launch week', fonzo.goal);
    fonzoCampaign = created.campaign_id;
    assert.notEqual(fonzoCampaign, fairwayCampaign);
    assert.equal((await createCampaign(fonzoScope, 'Fonzo launch week', fonzo.goal)).campaign_id, fonzoCampaign, 'a lost response replays the same key and body to the same campaign');
    // Same tenant, project, actor and key as the accepted Fairway campaign, different intent: refused, never overwritten.
    await assert.rejects(createCampaign(fairway, 'Fonzo launch week', fonzo.goal), (e) => e.code === 'IDEMPOTENCY_KEY_CONFLICT');
    assert.deepEqual(await snapshot(fairway, fairwayCampaign), fairwaySnapshot);
  });

  it('campaign planning and draft creation still work in the Fonzo workspace', async () => {
    const c = ctx(fonzoScope), campaign = await campaigns.getCampaign(c, fonzoCampaign), brain = await brainRepo.getByProjectAndBrand(fonzoScope.project_id, fonzoScope.brand_id);
    const plan = buildContentPlan({ campaign, brandBrain: brain, startDate: fonzo.startDate });
    assert.equal(plan.campaign_id, fonzoCampaign);
    assert.ok(plan.items.length >= 8);
    const item = plan.items.find((i) => i.content_item.format === 'text') || plan.items[0];
    const first = await campaigns.executeCommand(c, command(fonzoScope, 'create_content_item', { ...item.content_item, initial_content: item.initial_content }, item.idempotency_key, fonzoCampaign, campaign.version));
    const replay = await campaigns.executeCommand(c, command(fonzoScope, 'create_content_item', { ...item.content_item, initial_content: item.initial_content }, item.idempotency_key, fonzoCampaign, campaign.version));
    assert.deepEqual(replay, first);
    assert.equal((await snapshot(fonzoScope, fonzoCampaign)).items, 1);
    assert.deepEqual(await snapshot(fairway, fairwayCampaign), fairwaySnapshot);
  });

  it('a rights-approved fixture passes the intake contract with identity and SHA-256 preserved, and no public URL', async () => {
    const svc = intakeService();
    const started = await init(svc, founder, fonzoScope);
    assert.equal(started.state, 'initiated'); assert.equal(started.rights_confirmed, true); assert.equal(started.rights_evidence_kind, 'customer_attestation');
    const quarantined = await svc.upload(founder, started.asset_id, fonzoScope, artwork, 'image/png');
    assert.equal(quarantined.state, 'quarantined');
    const ready = await svc.complete(founder, started.asset_id, fonzoScope);
    assert.equal(ready.state, 'ready');
    const row = (await pool.query('select * from customer_media_intakes where asset_id=$1', [started.asset_id])).rows[0];
    assert.equal(row.sha256, artworkSha, 'stored SHA-256 equals the fixture');
    assert.equal(row.brand_id, fonzoScope.brand_id); assert.equal(row.project_id, fonzoScope.project_id); assert.equal(row.created_by, founder.auth_user_id);
    assert.equal(sha(kit.objects.get(row.storage_key).data), artworkSha, 'the stored object bytes are the uploaded bytes');
    assert.match(row.storage_key, /^assets\//);
    const asset = (await pool.query('select * from media_assets where asset_id=$1', [started.asset_id])).rows[0];
    assert.equal(asset.source_kind, 'reference'); assert.equal(asset.brand_id, fonzoScope.brand_id);
    assert.doesNotMatch(JSON.stringify([started, quarantined, ready]), /https?:\/\/|"url"/i);
    fonzoAsset = started.asset_id;
  });

  it('only the owner scope previews it; another tenant, another scope of the same owner and anonymous callers cannot', async () => {
    const svc = intakeService(), id = fonzoAsset;
    const desc = await svc.preview(founder, id, fonzoScope);
    assert.equal(desc.mimeType, 'image/png'); assert.equal(desc.byteSize, artwork.length);
    const stat = await kit.storage.statPreview({ key: desc.key });
    const body = Buffer.from(await (await kit.storage.openPreview({ key: desc.key, generation: stat.generation, range: { start: 0, end: stat.size - 1, partial: false } })).arrayBuffer());
    assert.equal(sha(body), artworkSha);
    const denied = (e) => e.code === 'RESOURCE_NOT_AVAILABLE';
    await assert.rejects(svc.preview(stranger, id, fonzoScope), denied);
    await assert.rejects(svc.preview(stranger, id, { tenant_id: 'tenant_stranger', project_id: 'project_stranger', brand_id: 'brand_stranger' }), denied);
    await assert.rejects(svc.preview(founder, id, fairway), denied, 'the same owner cannot read it through the Fairway scope');
    await assert.rejects(svc.get(stranger, id, fonzoScope), denied);
    await assert.rejects(svc.preview({ kind: 'anonymous' }, id, fonzoScope), denied);
    const theirs = await svc.list(stranger, { tenant_id: 'tenant_stranger', project_id: 'project_stranger', brand_id: 'brand_stranger' });
    assert.deepEqual(theirs.assets, [], 'another tenant lists nothing');
    assert.equal((await svc.list(founder, fonzoScope)).assets.some((a) => a.asset_id === id), true, 'the owner lists it');
  });

  it('retries are safe: same key and body returns the same asset, a changed body conflicts, repeated upload and complete add nothing', async () => {
    const svc = intakeService(), id = fonzoAsset;
    assert.equal((await init(svc, founder, fonzoScope)).asset_id, id);
    await assert.rejects(init(svc, founder, fonzoScope, { filename: 'other.png' }), (e) => e.code === 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal((await svc.upload(founder, id, fonzoScope, artwork, 'image/png')).state, 'ready');
    await assert.rejects(svc.upload(founder, id, fonzoScope, Buffer.concat([artwork.subarray(0, artwork.length - 1), Buffer.from([0])]), 'image/png'), (e) => ['UPLOAD_STATE_CONFLICT', 'UPLOAD_TYPE_OR_SIZE_INVALID'].includes(e.code));
    assert.equal((await svc.complete(founder, id, fonzoScope)).state, 'ready');
    assert.equal((await pool.query('select count(*)::int n from media_assets where asset_id=$1', [id])).rows[0].n, 1);
    assert.equal((await pool.query('select sha256 from customer_media_intakes where asset_id=$1', [id])).rows[0].sha256, artworkSha);
  });

  it('negative paths: no rights, wrong type, size, signature, scope and role are refused without storing or exposing anything', async () => {
    const svc = intakeService(), before = (await snapshot(fonzoScope, fonzoCampaign)).intakes;
    for (const patch of [{ rights_confirmed: false }, { rights_confirmed: undefined }, { content_type: 'image/gif' }, { content_type: 'image/svg+xml' }, { bytes: 0 }, { bytes: 33554433 }, { filename: 'a/b.png' }, { idempotency_key: undefined }, { sha256: sha(artwork) }])
      await assert.rejects(init(svc, founder, fonzoScope, { idempotency_key: 'neg.' + randomUUID(), ...patch }), (e) => e.code === 'VALIDATION_ERROR', JSON.stringify(patch));
    assert.equal((await snapshot(fonzoScope, fonzoCampaign)).intakes, before);
    // Another tenant, Fairway scope, and a read-only member cannot initiate; a non-owner owner-of-nothing cannot either.
    for (const [actor, scope] of [[stranger, fonzoScope], [founder, { ...fonzoScope, brand_id: fairway.brand_id }], [member, fairway]]) await assert.rejects(init(svc, actor, scope, { idempotency_key: 'deny.' + randomUUID() }), (e) => e.code === 'RESOURCE_NOT_AVAILABLE');
    const a = await init(svc, founder, fonzoScope, { idempotency_key: 'sig.' + randomUUID() });
    await assert.rejects(svc.upload(founder, a.asset_id, fonzoScope, Buffer.from('not an image at all, wrong signature!!'.padEnd(artwork.length, '.')), 'image/png'), (e) => e.code === 'UPLOAD_TYPE_OR_SIZE_INVALID');
    await assert.rejects(svc.upload(founder, a.asset_id, fonzoScope, artwork, 'image/jpeg'), (e) => e.code === 'UPLOAD_TYPE_OR_SIZE_INVALID');
    await assert.rejects(svc.upload(founder, a.asset_id, fonzoScope, Buffer.concat([artwork, Buffer.from([0])]), 'image/png'), (e) => e.code === 'UPLOAD_TYPE_OR_SIZE_INVALID');
    await assert.rejects(svc.upload(stranger, a.asset_id, fonzoScope, artwork, 'image/png'), (e) => e.code === 'RESOURCE_NOT_AVAILABLE');
    await assert.rejects(svc.complete(founder, a.asset_id, fonzoScope), (e) => e.code === 'UPLOAD_STATE_CONFLICT', 'complete before upload');
    assert.equal((await pool.query('select count(*)::int n from media_assets where asset_id=$1', [a.asset_id])).rows[0].n, 0);
  });

  it('the scanner requirement cannot be bypassed: unavailable stays quarantined and retries, infected is rejected, UNSCANNED is refused, disabled intake is unavailable', async () => {
    const svc = intakeService();
    const a = await init(svc, founder, fonzoScope, { idempotency_key: 'scan.' + randomUUID() });
    await svc.upload(founder, a.asset_id, fonzoScope, artwork, 'image/png');
    scanner.mode = 'down';
    await assert.rejects(svc.complete(founder, a.asset_id, fonzoScope));
    assert.equal((await pool.query('select state from customer_media_intakes where asset_id=$1', [a.asset_id])).rows[0].state, 'quarantined');
    assert.equal((await pool.query('select count(*)::int n from media_assets where asset_id=$1', [a.asset_id])).rows[0].n, 0, 'no usable asset while unscanned');
    await assert.rejects(svc.preview(founder, a.asset_id, fonzoScope), (e) => e.code === 'RESOURCE_NOT_AVAILABLE', 'a quarantined asset has no preview');
    scanner.mode = 'unscanned';
    await assert.rejects(svc.complete(founder, a.asset_id, fonzoScope), (e) => e.code === 'INSPECTION_UNAVAILABLE');
    assert.equal((await pool.query('select state from customer_media_intakes where asset_id=$1', [a.asset_id])).rows[0].state, 'quarantined');
    scanner.mode = 'infected';
    assert.equal((await svc.complete(founder, a.asset_id, fonzoScope)).state, 'rejected');
    assert.equal((await pool.query('select count(*)::int n from media_assets where asset_id=$1', [a.asset_id])).rows[0].n, 0, 'a rejected upload never becomes an asset');
    await assert.rejects(svc.preview(founder, a.asset_id, fonzoScope), (e) => e.code === 'RESOURCE_NOT_AVAILABLE');
    scanner.mode = 'clean';
    await assert.rejects(intakeService({ inspector: null }).complete(founder, a.asset_id, fonzoScope), (e) => e.code === 'MEDIA_INTAKE_UNAVAILABLE');
    await assert.rejects(intakeService({ enabled: false }).preview(founder, fonzoAsset, fonzoScope), (e) => e.code === 'MEDIA_INTAKE_UNAVAILABLE');
    const changed = intakeService({ rightsPolicy: { version: 'synthetic-rights.v2', statement: 'Changed wording', allowed_uses: ['campaign.preview'] } });
    const b = await init(svc, founder, fonzoScope, { idempotency_key: 'rights.' + randomUUID() });
    await svc.upload(founder, b.asset_id, fonzoScope, artwork, 'image/png');
    await assert.rejects(changed.complete(founder, b.asset_id, fonzoScope), (e) => e.code === 'RIGHTS_POLICY_CHANGED');
  });

  it('uploaded reference media is not finished generated campaign artwork: campaigns refuse it as a creative and nothing is attached or generated', async () => {
    const id = fonzoAsset, c = ctx(fonzoScope), campaign = await campaigns.getCampaign(c, fonzoCampaign), before = await snapshot(fonzoScope, fonzoCampaign);
    const refs = [{ asset_id: id, role: 'primary' }];
    await assert.rejects(campaigns.executeCommand(c, command(fonzoScope, 'create_content_item', { name: 'Fonzo uploaded artwork as a post', format: 'image', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', initial_content: { title: null, body: 'Uses uploaded artwork', caption: null, alt_text: null, asset_refs: refs } }, randomUUID(), fonzoCampaign, campaign.version)), (e) => e.name === 'CampaignResourceError' && e.code === 'RESOURCE_NOT_AVAILABLE');
    assert.deepEqual(await snapshot(fonzoScope, fonzoCampaign), before, 'refusal changed nothing');
    const row = (await pool.query('select source_kind, generation_job_id from media_assets where asset_id=$1', [id])).rows[0];
    assert.equal(row.source_kind, 'reference'); assert.equal(row.generation_job_id, null, 'no generation job exists for an upload');
    assert.equal((await pool.query('select count(*)::int n from generation_jobs where tenant_id=$1', [fonzoScope.tenant_id])).rows[0].n, 0, 'intake never creates generation work or spend');
    assert.equal((await pool.query("select count(*)::int n from credit_ledger")).rows[0].n, 0, 'no credit is touched');
  });

  it('Fairway is unchanged at the end, and no media, intake or campaign row leaked into it', async () => {
    assert.deepEqual(await snapshot(fairway, fairwayCampaign), fairwaySnapshot);
    assert.equal((await pool.query("select count(*)::int n from customer_media_intakes where project_id=$1", [fairway.project_id])).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int n from media_assets where project_id=$1", [fairway.project_id])).rows[0].n, 0);
  });
});
