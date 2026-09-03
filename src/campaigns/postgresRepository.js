const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { CampaignResourceError, CampaignPersistenceError, CampaignIdempotencyError } = require("./errors");
const { hashIntent, parseCommand } = require("./schema");
const { CampaignRepository, InMemoryCampaignRepository } = require("./repository");

const RELATIONS = Object.freeze([
  "campaigns", "campaign_content_items", "campaign_platform_variants", "campaign_revisions",
  "campaign_brand_snapshots", "campaign_preview_evidence", "campaign_approval_events",
  "campaign_schedule_entries", "campaign_manual_attempts", "campaign_attempt_resolutions",
  "campaign_publications", "campaign_publication_corrections", "campaign_events",
  "campaign_command_receipts",
]);
const clone = (value) => structuredClone(value);
const actorUuid = (value) => value?.auth_user_id || value;

function databaseError(error) {
  if (error?.code && /^[A-Z_]+$/.test(error.code)) return error;
  if (error?.code === "23505" && error.constraint === "campaign_command_receipts_identity_unique") return new CampaignIdempotencyError();
  return new CampaignPersistenceError();
}

async function insert(client, table, row, conflict = "do nothing") {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => `"${key}"`).join(",");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(",");
  await client.query(
    `insert into public.${table} (${columns}) values (${placeholders}) on conflict ${conflict}`,
    entries.map(([, value]) => Array.isArray(value) ? JSON.stringify(value) : value),
  );
}

class PostgresCampaignRepository extends CampaignRepository {
  constructor({ pool, now = () => new Date(), idFactory = randomUUID, resolvePreviewReceipt, fault = async () => {} }) {
    super();
    if (!pool || typeof pool.connect !== "function") throw new CampaignPersistenceError();
    this.pool = pool; this.now = now; this.idFactory = idFactory; this.resolvePreviewReceipt = resolvePreviewReceipt; this.fault = fault;
  }

  async initialize() {
    try {
      const result = await this.pool.query(`
        select c.relname, c.relrowsecurity,
               coalesce(has_table_privilege('anon', c.oid, 'select,insert,update,delete'), false) anon_access,
               coalesce(has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'), false) authenticated_access,
               coalesce(has_table_privilege('service_role', c.oid, 'select,insert,update,delete'), false) service_access
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = any($1::text[])`, [RELATIONS]);
      if (result.rows.length !== RELATIONS.length || result.rows.some((row) => !row.relrowsecurity || row.anon_access || row.authenticated_access || row.service_access)) throw new Error("unsafe campaign persistence");
    } catch { throw new CampaignPersistenceError(); }
  }

  async _authorize(client, context, forWrite = false) {
    const role = forWrite ? "owner" : null;
    const result = await client.query(`
      select b.brand_id
        from public.customer_profiles cp
        join public.tenant_memberships tm on tm.auth_user_id = cp.auth_user_id and tm.tenant_id = $2
        join public.projects p on p.tenant_id = tm.tenant_id and p.project_id = $3
        left join public.brand_brains b on b.project_id = p.project_id
       where cp.auth_user_id = $1 and ($4::text is null or tm.role = $4)
       limit 1
       ${forWrite ? "for share of cp, tm, p" : ""}`,
      [context.actor?.auth_user_id, context.tenant_id, context.project_id, role]);
    if (!result.rowCount) throw new CampaignResourceError();
  }

  async executeCommand(context, input, requestId) {
    const command = parseCommand(input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this._authorize(client, context, true);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["campaign-spine.v1", context.tenant_id, context.project_id, context.actor.auth_user_id, command.idempotency_key])]);
      const existing = await client.query(`select intent_hash, result from public.campaign_command_receipts where namespace='campaign-spine.v1' and tenant_id=$1 and project_id=$2 and auth_user_id=$3 and idempotency_key=$4`, [context.tenant_id, context.project_id, context.actor.auth_user_id, command.idempotency_key]);
      const intentHash = hashIntent({ ...command, actor: context.actor });
      if (existing.rowCount) {
        if (existing.rows[0].intent_hash !== intentHash) throw new CampaignIdempotencyError();
        await client.query("commit");
        return clone(existing.rows[0].result);
      }

      const before = command.campaign_id ? await this._loadCampaign(client, context, command.campaign_id, true) : null;
      const memory = new InMemoryCampaignRepository({
        now: this.now, idFactory: this.idFactory,
        authorize: async () => true,
        captureBrandSnapshot: async (_context, brandId) => this._captureBrandSnapshot(client, context, brandId),
        resolvePreviewReceipt: this.resolvePreviewReceipt,
        fault: this.fault,
      });
      if (before) memory.state.campaigns.set(before.campaign_id, clone(before));
      const result = await memory.executeCommand(context, command, requestId);
      const after = memory.state.campaigns.get(result.campaign_id);
      await this._persistCampaign(client, before, after, command, context, intentHash, result);
      await client.query("set constraints all immediate");
      await client.query("select set_config('bizgenie.campaign_command','off',true)");
      await this.fault("postgres_before_commit");
      await client.query("commit");
      await this.fault("postgres_after_commit");
      return result;
    } catch (error) {
      try { await client.query("rollback"); } catch {}
      throw databaseError(error);
    } finally {
      try { await client.query("select set_config('bizgenie.campaign_command','off',false)"); } catch {}
      client.release();
    }
  }

  async _captureBrandSnapshot(client, context, brandId) {
    const result = await client.query(`select b.* from public.brand_brains b join public.projects p on p.project_id=b.project_id and p.tenant_id=$1 where b.project_id=$2 and b.brand_id=$3 and b.status='approved' for share of b`, [context.tenant_id, context.project_id, brandId]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    const snapshot = { brand_id: row.brand_id, project_id: row.project_id, name: row.name, metadata: { version: row.version, status: row.status, created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at).toISOString() } };
    for (const key of ["identity","voice","audience","commercial","competitors","visual"]) if (row[key] != null) snapshot[key] = row[key];
    const snapshotHash = hashIntent(snapshot);
    const found = await client.query(`select * from public.campaign_brand_snapshots where tenant_id=$1 and project_id=$2 and brand_id=$3 and source_version=$4 and snapshot_hash=$5`, [context.tenant_id, context.project_id, brandId, row.version, snapshotHash]);
    return found.rows[0] || { brand_snapshot_id: this.idFactory(), tenant_id: context.tenant_id, project_id: context.project_id, brand_id: brandId, source_version: row.version, source_updated_at: new Date(row.updated_at).toISOString(), source_schema_version: "brand-brain.v1", snapshot, snapshot_hash: snapshotHash, captured_at: this.now().toISOString() };
  }

  async _loadCampaign(client, context, campaignId, lock = false) {
    const root = await client.query(`select * from public.campaigns where tenant_id=$1 and project_id=$2 and campaign_id=$3 ${lock ? "for update" : ""}`, [context.tenant_id, context.project_id, campaignId]);
    if (!root.rowCount) throw new CampaignResourceError();
    const campaign = { ...root.rows[0], created_by: { kind: "customer", auth_user_id: root.rows[0].created_by }, brand_snapshots: new Map(), items: new Map(), approvals: new Map(), previews: new Map(), schedules: new Map(), attempts: new Map(), resolutions: new Map(), publications: new Map(), corrections: new Map(), events: [] };
    const query = async (table) => (await client.query(`select * from public.${table} where tenant_id=$1 and project_id=$2 and campaign_id=$3`, [context.tenant_id, context.project_id, campaignId])).rows;
    const snapshots = (await client.query(`select s.* from public.campaign_brand_snapshots s where s.tenant_id=$1 and s.project_id=$2 and s.brand_id=$3 and (s.brand_snapshot_id=$4 or exists(select 1 from public.campaign_revisions r where r.campaign_id=$5 and r.brand_snapshot_id=s.brand_snapshot_id))`, [context.tenant_id, context.project_id, campaign.brand_id, campaign.initial_brand_snapshot_id, campaignId])).rows;
    snapshots.forEach((row) => campaign.brand_snapshots.set(row.brand_snapshot_id, row));
    const items = await query("campaign_content_items");
    const variants = await query("campaign_platform_variants");
    const revisions = await query("campaign_revisions");
    for (const row of items) campaign.items.set(row.content_item_id, { ...row, created_by: { kind: "customer", auth_user_id: row.created_by }, variants: new Map() });
    for (const row of variants) campaign.items.get(row.content_item_id).variants.set(row.variant_id, { ...row, revisions: new Map() });
    for (const row of revisions) campaign.items.get(row.content_item_id).variants.get(row.variant_id).revisions.set(row.revision_id, { ...row, created_by: { kind: "customer", auth_user_id: row.created_by } });
    for (const [table, target, key, actorFields] of [
      ["campaign_preview_evidence","previews","preview_id",["observed_by"]], ["campaign_approval_events","approvals","approval_id",["created_by"]],
      ["campaign_schedule_entries","schedules","schedule_id",["created_by"]], ["campaign_manual_attempts","attempts","attempt_id",["started_by"]],
      ["campaign_attempt_resolutions","resolutions","resolution_id",["resolved_by"]], ["campaign_publications","publications","publication_id",["recorded_by"]],
      ["campaign_publication_corrections","corrections","correction_id",["created_by"]],
    ]) for (const row of await query(table)) {
      for (const field of actorFields) row[field] = { kind: "customer", auth_user_id: row[field] };
      campaign[target].set(row[key], row);
    }
    campaign.events = (await query("campaign_events")).sort((a, b) => Number(a.sequence) - Number(b.sequence));
    return campaign;
  }

  async _persistCampaign(client, before, campaign, command, context, intentHash, result) {
    const owner = { tenant_id: campaign.tenant_id, project_id: campaign.project_id, brand_id: campaign.brand_id, campaign_id: campaign.campaign_id };
    for (const row of campaign.brand_snapshots.values()) await insert(client, "campaign_brand_snapshots", row);
    if (!before) await insert(client, "campaigns", { campaign_id: campaign.campaign_id, tenant_id: campaign.tenant_id, project_id: campaign.project_id, brand_id: campaign.brand_id, name: campaign.name, goal: campaign.goal, initial_brand_snapshot_id: campaign.initial_brand_snapshot_id, display_timezone: campaign.display_timezone, version: campaign.version, last_event_sequence: campaign.last_event_sequence, archived_at: campaign.archived_at, created_at: campaign.created_at, updated_at: campaign.updated_at, created_by: actorUuid(campaign.created_by) });
    else {
      await client.query("select set_config('bizgenie.campaign_command',txid_current()::text,true)");
      await client.query(`update public.campaigns set name=$1,display_timezone=$2,version=$3,last_event_sequence=$4,archived_at=$5,updated_at=$6 where campaign_id=$7`, [campaign.name,campaign.display_timezone,campaign.version,campaign.last_event_sequence,campaign.archived_at,campaign.updated_at,campaign.campaign_id]);
    }
    for (const item of campaign.items.values()) {
      await insert(client, "campaign_content_items", { ...owner, content_item_id: item.content_item_id, name: item.name, format: item.format, archived_at: item.archived_at, created_at: item.created_at, updated_at: item.updated_at, created_by: actorUuid(item.created_by) });
      if (before?.items.has(item.content_item_id)) await client.query(`update public.campaign_content_items set name=$1,archived_at=$2,updated_at=$3 where content_item_id=$4`, [item.name,item.archived_at,item.updated_at,item.content_item_id]);
      for (const variant of item.variants.values()) {
        const variantRow = { ...owner, content_item_id: item.content_item_id, variant_id: variant.variant_id, platform: variant.platform, placement: variant.placement, destination_key: variant.destination_key, destination_label: variant.destination_label, workflow: variant.workflow, current_revision_id: variant.current_revision_id, active_approval_id: variant.active_approval_id, active_schedule_id: variant.active_schedule_id, pending_attempt_id: variant.pending_attempt_id, publication_id: variant.publication_id, created_at: variant.created_at, updated_at: variant.updated_at };
        await insert(client, "campaign_platform_variants", variantRow);
        for (const revision of variant.revisions.values()) await insert(client, "campaign_revisions", { ...owner, content_item_id: item.content_item_id, variant_id: variant.variant_id, ...revision, created_by: actorUuid(revision.created_by) });
        if (before && [...before.items.values()].some((old) => old.variants.has(variant.variant_id))) await client.query(`update public.campaign_platform_variants set workflow=$1,current_revision_id=$2,active_approval_id=$3,active_schedule_id=$4,pending_attempt_id=$5,publication_id=$6,updated_at=$7 where variant_id=$8`, [variant.workflow,variant.current_revision_id,variant.active_approval_id,variant.active_schedule_id,variant.pending_attempt_id,variant.publication_id,variant.updated_at,variant.variant_id]);
      }
    }
    const descendant = (row) => ({ ...owner, content_item_id: this._findItem(campaign,row.variant_id), ...row });
    for (const row of campaign.previews.values()) await insert(client,"campaign_preview_evidence",{...descendant(row), observed_by: actorUuid(row.observed_by)});
    for (const row of campaign.approvals.values()) await insert(client,"campaign_approval_events",{...descendant(row), created_by: actorUuid(row.created_by)});
    for (const row of campaign.schedules.values()) await insert(client,"campaign_schedule_entries",{...descendant(row), created_by: actorUuid(row.created_by)});
    for (const row of campaign.attempts.values()) await insert(client,"campaign_manual_attempts",{...descendant(row), started_by: actorUuid(row.started_by)});
    for (const row of campaign.resolutions.values()) { const attempt=campaign.attempts.get(row.attempt_id); await insert(client,"campaign_attempt_resolutions",{...descendant({...row,revision_id:attempt.revision_id,approval_id:attempt.approval_id}), resolved_by: actorUuid(row.resolved_by)}); }
    for (const row of campaign.publications.values()) await insert(client,"campaign_publications",{...descendant(row), recorded_by: actorUuid(row.recorded_by)});
    for (const row of campaign.corrections.values()) await insert(client,"campaign_publication_corrections",{...descendant(row), created_by: actorUuid(row.created_by)});
    await insert(client,"campaign_command_receipts",{command_id:result.command_id,namespace:"campaign-spine.v1",tenant_id:campaign.tenant_id,project_id:campaign.project_id,auth_user_id:context.actor.auth_user_id,idempotency_key:command.idempotency_key,command_type:command.command_type,intent_hash:intentHash,campaign_id:campaign.campaign_id,expected_campaign_version:command.expected_campaign_version,result_campaign_version:result.campaign_version,first_sequence:result.first_sequence,last_sequence:result.last_sequence,http_status:command.command_type==="create_campaign"?201:200,result,recorded_at:this.now().toISOString()});
    for (const event of campaign.events.slice(before?.events.length || 0)) await insert(client,"campaign_events",event);
  }

  _findItem(campaign, variantId) { for (const item of campaign.items.values()) if (item.variants.has(variantId)) return item.content_item_id; throw new CampaignResourceError(); }

  async getCampaign(context, campaignId) { const client=await this.pool.connect(); try { await this._authorize(client,context); return clone(await this._loadCampaign(client,context,campaignId)); } catch(error){ throw databaseError(error); } finally { client.release(); } }
  async listCampaigns(context) { const client=await this.pool.connect(); try { await this._authorize(client,context); const rows=await client.query(`select * from public.campaigns where tenant_id=$1 and project_id=$2 and archived_at is null order by updated_at desc,campaign_id`,[context.tenant_id,context.project_id]); return rows.rows; } catch(error){ throw databaseError(error); } finally { client.release(); } }
  async listCampaignEvents(context,campaignId) { return (await this.getCampaign(context,campaignId)).events; }
  async listCalendarEntries(context,{from,to}) { const client=await this.pool.connect(); try { await this._authorize(client,context); const rows=await client.query(`select c.campaign_id,i.content_item_id,v.variant_id,v.workflow,coalesce(p.published_at,s.scheduled_for) occurrence_at from public.campaigns c join public.campaign_content_items i on i.campaign_id=c.campaign_id and i.archived_at is null join public.campaign_platform_variants v on v.content_item_id=i.content_item_id left join public.campaign_publications p on p.publication_id=v.publication_id left join public.campaign_schedule_entries s on s.schedule_id=v.active_schedule_id where c.tenant_id=$1 and c.project_id=$2 and c.archived_at is null and coalesce(p.published_at,s.scheduled_for) >= $3 and coalesce(p.published_at,s.scheduled_for) < $4 order by occurrence_at,v.variant_id`,[context.tenant_id,context.project_id,from,to]); return rows.rows; } catch(error){ throw databaseError(error); } finally { client.release(); } }
  async verifyCampaignProjection(context,campaignId) { const campaign=await this.getCampaign(context,campaignId); const valid=campaign.events.every((event,index)=>Number(event.sequence)===index+1)&&Number(campaign.last_event_sequence)===campaign.events.length&&Number(campaign.version)===new Set(campaign.events.map((event)=>Number(event.campaign_version))).size; return {valid,campaign_version:Number(campaign.version),last_event_sequence:Number(campaign.last_event_sequence)}; }
  async close(){ if(typeof this.pool.end==="function") await this.pool.end(); }
}

function createPostgresCampaignRepositoryFromEnv({ env=process.env, ...options }={}) {
  if (!env.CAMPAIGN_DATABASE_URL) throw new CampaignPersistenceError();
  return new PostgresCampaignRepository({ pool:new Pool({connectionString:env.CAMPAIGN_DATABASE_URL,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000}),...options });
}

module.exports={ PostgresCampaignRepository, createPostgresCampaignRepositoryFromEnv, CAMPAIGN_RELATIONS:RELATIONS };
