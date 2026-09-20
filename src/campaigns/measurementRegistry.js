const { randomUUID } = require("node:crypto");
const { CampaignIdempotencyError, CampaignPersistenceError, CampaignResourceError, CampaignValidationError } = require("./errors");

const METRICS = new Set(["reach","views","impressions","clicks","enquiries","leads","conversions","sales","revenue","value"]);
const UNITS = new Set(["count","gbp","usd","eur","percent","other"]);
const clone = (value) => structuredClone(value);

function validate(input, now) {
  if (!input || typeof input !== "object" || !METRICS.has(input.metric) ||
      typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0 || input.value > 1e15 ||
      (input.unit != null && !UNITS.has(input.unit)) ||
      typeof input.observed_at !== "string" || !Number.isFinite(new Date(input.observed_at).getTime()) ||
      new Date(input.observed_at) > now ||
      (input.note != null && (typeof input.note !== "string" || !input.note.trim() || [...input.note.trim()].length > 1000)) ||
      typeof input.idempotency_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.idempotency_key)) {
    throw new CampaignValidationError();
  }
}

function safe(row) {
  return {
    measurement_id: row.measurement_id,
    campaign_id: row.campaign_id,
    content_item_id: row.content_item_id,
    variant_id: row.variant_id,
    metric: row.metric,
    value: Number(row.value),
    unit: row.unit,
    observed_at: row.observed_at,
    evidence_kind: row.evidence_kind,
    note: row.note,
    recorded_at: row.recorded_at,
  };
}

class InMemoryCampaignMeasurementRegistry {
  constructor({ now = () => new Date(), idFactory = randomUUID } = {}) {
    this.now = now; this.idFactory = idFactory; this.rows = []; this.receipts = new Map();
  }
  async record(context, binding, input) {
    const now = this.now(); validate(input, now);
    if (!binding?.publication_id || binding.workflow !== "published" || new Date(input.observed_at) < new Date(binding.published_at)) throw new CampaignValidationError();
    const key = [context.tenant_id, context.project_id, context.actor.auth_user_id, input.idempotency_key].join("|");
    const intent = JSON.stringify({ binding, metric:input.metric, value:input.value, unit:input.unit || "count", observed_at:new Date(input.observed_at).toISOString(), note:input.note?.trim() || null });
    const prior = this.receipts.get(key);
    if (prior) { if (prior.intent !== intent) throw new CampaignIdempotencyError(); return clone(prior.row); }
    const row = { measurement_id:this.idFactory(), tenant_id:context.tenant_id, project_id:context.project_id, brand_id:binding.brand_id, campaign_id:binding.campaign_id, content_item_id:binding.content_item_id, variant_id:binding.variant_id, publication_id:binding.publication_id, metric:input.metric, value:input.value, unit:input.unit || "count", observed_at:new Date(input.observed_at).toISOString(), evidence_kind:"customer_attestation", note:input.note?.trim() || null, recorded_at:now.toISOString(), recorded_by:context.actor.auth_user_id };
    this.rows.push(row); this.receipts.set(key,{intent,row}); return clone(row);
  }
  async list(context, campaignId, variantId) {
    return this.rows.filter(r=>r.tenant_id===context.tenant_id&&r.project_id===context.project_id&&r.campaign_id===campaignId&&(!variantId||r.variant_id===variantId)).sort((a,b)=>a.observed_at.localeCompare(b.observed_at)||a.measurement_id.localeCompare(b.measurement_id)).map(clone);
  }
  async listBrand(context, brandId) {
    return this.rows.filter(r=>r.tenant_id===context.tenant_id&&r.project_id===context.project_id&&r.brand_id===brandId)
      .sort((a,b)=>a.observed_at.localeCompare(b.observed_at)||a.measurement_id.localeCompare(b.measurement_id)).map(clone);
  }
}

class PostgresCampaignMeasurementRegistry {
  constructor({ pool, now = () => new Date(), idFactory = randomUUID } = {}) {
    if (!pool) throw new CampaignPersistenceError(); this.pool=pool; this.now=now; this.idFactory=idFactory;
  }
  async initialize() {
    const q=await this.pool.query(`select c.relrowsecurity,
      coalesce(has_table_privilege('anon',c.oid,'select,insert,update,delete'),false) anon_access,
      coalesce(has_table_privilege('authenticated',c.oid,'select,insert,update,delete'),false) authenticated_access,
      coalesce(has_table_privilege('service_role',c.oid,'select,insert,update,delete'),false) service_access
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='campaign_measurements'`);
    if(q.rowCount!==1||!q.rows[0].relrowsecurity||q.rows[0].anon_access||q.rows[0].authenticated_access||q.rows[0].service_access)throw new CampaignPersistenceError();
  }
  async record(context,binding,input) {
    const now=this.now(); validate(input,now);
    if(!binding?.publication_id||binding.workflow!=="published"||new Date(input.observed_at)<new Date(binding.published_at))throw new CampaignValidationError();
    const client=await this.pool.connect();
    try {
      await client.query("begin");
      const auth=await client.query(`select 1 from public.customer_profiles cp join public.tenant_memberships tm on tm.auth_user_id=cp.auth_user_id and tm.tenant_id=$2 join public.projects p on p.project_id=$3 and p.tenant_id=tm.tenant_id where cp.auth_user_id=$1 and tm.role='owner'`,[context.actor.auth_user_id,context.tenant_id,context.project_id]);
      if(!auth.rowCount)throw new CampaignResourceError();
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["campaign-measurement.v1",context.tenant_id,context.project_id,context.actor.auth_user_id,input.idempotency_key])]);
      const intent={publication_id:binding.publication_id,metric:input.metric,value:input.value,unit:input.unit||"count",observed_at:new Date(input.observed_at).toISOString(),note:input.note?.trim()||null};
      const existing=await client.query(`select * from public.campaign_measurements where tenant_id=$1 and project_id=$2 and recorded_by=$3 and idempotency_key=$4`,[context.tenant_id,context.project_id,context.actor.auth_user_id,input.idempotency_key]);
      if(existing.rowCount){if(JSON.stringify(existing.rows[0].intent)!==JSON.stringify(intent))throw new CampaignIdempotencyError();await client.query("commit");return existing.rows[0];}
      const id=this.idFactory();
      const inserted=await client.query(`insert into public.campaign_measurements(measurement_id,tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,publication_id,metric,value,unit,observed_at,evidence_kind,note,recorded_at,recorded_by,idempotency_key,intent)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'customer_attestation',$13,$14,$15,$16,$17::jsonb) returning *`,
        [id,context.tenant_id,context.project_id,binding.brand_id,binding.campaign_id,binding.content_item_id,binding.variant_id,binding.publication_id,input.metric,input.value,input.unit||"count",intent.observed_at,intent.note,now.toISOString(),context.actor.auth_user_id,input.idempotency_key,JSON.stringify(intent)]);
      await client.query("commit");return inserted.rows[0];
    } catch(e){try{await client.query("rollback")}catch{};if(e instanceof CampaignIdempotencyError||e instanceof CampaignResourceError||e instanceof CampaignValidationError)throw e;throw new CampaignPersistenceError();} finally {client.release();}
  }
  async list(context,campaignId,variantId) {
    try {
      const values=[context.tenant_id,context.project_id,campaignId]; let suffix="";
      if(variantId){values.push(variantId);suffix=" and variant_id=$4";}
      const q=await this.pool.query(`select * from public.campaign_measurements where tenant_id=$1 and project_id=$2 and campaign_id=$3${suffix} order by observed_at,measurement_id`,values);
      return q.rows;
    } catch(e){throw e instanceof CampaignResourceError?e:new CampaignPersistenceError();}
  }
  async listBrand(context,brandId) {
    try {
      const q=await this.pool.query("select * from public.campaign_measurements where tenant_id=$1 and project_id=$2 and brand_id=$3 order by observed_at,measurement_id",[context.tenant_id,context.project_id,brandId]);
      return q.rows;
    } catch(e){throw new CampaignPersistenceError();}
  }
}

module.exports={METRICS,UNITS,safeMeasurement:safe,InMemoryCampaignMeasurementRegistry,PostgresCampaignMeasurementRegistry};
