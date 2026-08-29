const { VideoGenerationConflictError } = require("./errors");
const { VideoGenerationRecordSchema } = require("./schema");

const IMMUTABLE_FIELDS = new Set([
  "generation_id", "parent_generation_id", "transaction_correlation_id",
  "execution_id", "user_id", "project_id", "brand_id", "campaign_id",
  "tenant_id", "generation_job_id", "content_item_id", "video_purpose",
  "quality", "aspect_ratio", "duration_seconds", "created_at",
]);
const ALLOWED_STATE_TRANSITIONS = Object.freeze({
  queued: new Set(["submitted", "failed"]),
  submitted: new Set(["processing", "failed"]),
  processing: new Set(["completed", "failed"]),
  completed: new Set(), failed: new Set(),
});
function copy(value) { return value ? structuredClone(value) : value; }
function assertPatch(current, patch) {
  for (const field of IMMUTABLE_FIELDS) {
    if (Object.hasOwn(patch, field) && patch[field] !== current[field]) throw new Error(`Video generation field '${field}' is immutable`);
  }
  if (patch.status && patch.status !== current.status && !ALLOWED_STATE_TRANSITIONS[current.status].has(patch.status)) {
    throw new Error(`Invalid video generation state transition from '${current.status}' to '${patch.status}'`);
  }
}
class VideoGenerationRepository {
  async initialize() {}
  create(_record) { throw new Error("VideoGenerationRepository.create is not implemented"); }
  getByGenerationId(_generationId) { throw new Error("VideoGenerationRepository.getByGenerationId is not implemented"); }
  update(_generationId, _patch) { throw new Error("VideoGenerationRepository.update is not implemented"); }
}
class InMemoryVideoGenerationRepository extends VideoGenerationRepository {
  constructor() { super(); this.records = new Map(); }
  create(record) {
    const parsed = VideoGenerationRecordSchema.parse(record);
    if (parsed.status !== "queued") throw new Error("A new video generation must start in queued state");
    if (this.records.has(parsed.generation_id)) throw new VideoGenerationConflictError(parsed.generation_id);
    this.records.set(parsed.generation_id, copy(parsed)); return copy(parsed);
  }
  getByGenerationId(generationId) { return copy(this.records.get(generationId) || null); }
  update(generationId, patch) {
    const current = this.records.get(generationId); if (!current) throw new Error("Video generation record was not found");
    assertPatch(current, patch);
    const parsed = VideoGenerationRecordSchema.parse({ ...current, ...copy(patch) });
    this.records.set(generationId, copy(parsed)); return copy(parsed);
  }
}
class PostgresVideoGenerationRepository extends VideoGenerationRepository {
  constructor({ pool }) { super(); if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required"); this.pool = pool; }
  async initialize() {
    const result = await this.pool.query(`SELECT to_regclass('public.video_generations') AS relation`);
    if (!result.rows[0]?.relation) throw new Error("Durable video generation state is not initialized");
  }
  toRecord(row) {
    if (!row) return null;
    const optional = (key, value) => value == null ? {} : { [key]: value };
    return VideoGenerationRecordSchema.parse({
      generation_id: row.generation_id, ...optional("parent_generation_id", row.parent_generation_id),
      ...optional("transaction_correlation_id", row.transaction_correlation_id), execution_id: row.execution_id,
      user_id: row.user_id, ...optional("tenant_id", row.tenant_id), ...optional("generation_job_id", row.generation_job_id),
      project_id: row.project_id, ...optional("brand_id", row.brand_id), ...optional("campaign_id", row.campaign_id),
      ...optional("content_item_id", row.content_item_id), video_purpose: row.video_purpose, quality: row.quality,
      aspect_ratio: row.aspect_ratio, duration_seconds: Number(row.duration_seconds), status: row.status,
      ...optional("approval_status", row.approval_status), ...optional("provider", row.provider),
      ...optional("provider_job_id", row.provider_job_id), ...optional("provider_model", row.provider_model),
      ...optional("provider_diagnostics", row.provider_diagnostics), ...optional("provider_cost_evidence", row.provider_cost_evidence),
      ...optional("asset", row.asset), ...optional("error_code", row.error_code),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      ...(row.completed_at ? { completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at } : {}),
    });
  }
  async create(record) {
    const r = VideoGenerationRecordSchema.parse(record);
    if (r.status !== "queued") throw new Error("A new video generation must start in queued state");
    try {
      const q = await this.pool.query(`INSERT INTO public.video_generations
        (generation_id,parent_generation_id,transaction_correlation_id,execution_id,user_id,tenant_id,generation_job_id,project_id,brand_id,campaign_id,content_item_id,video_purpose,quality,aspect_ratio,duration_seconds,status,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [r.generation_id,r.parent_generation_id||null,r.transaction_correlation_id||null,r.execution_id,r.user_id,r.tenant_id||null,r.generation_job_id||null,r.project_id,r.brand_id||null,r.campaign_id||null,r.content_item_id||null,r.video_purpose,r.quality,r.aspect_ratio,r.duration_seconds,r.status,r.created_at,r.updated_at]);
      return this.toRecord(q.rows[0]);
    } catch (error) { if (error?.code === "23505") throw new VideoGenerationConflictError(r.generation_id); throw error; }
  }
  async getByGenerationId(generationId) {
    const q = await this.pool.query(`SELECT * FROM public.video_generations WHERE generation_id=$1`, [generationId]);
    return this.toRecord(q.rows[0]);
  }
  async update(generationId, patch) {
    const current = await this.getByGenerationId(generationId); if (!current) throw new Error("Video generation record was not found");
    assertPatch(current, patch); const next = VideoGenerationRecordSchema.parse({ ...current, ...copy(patch) });
    const q = await this.pool.query(`UPDATE public.video_generations SET
      status=$2,approval_status=$3,provider=$4,provider_job_id=$5,provider_model=$6,provider_diagnostics=$7,provider_cost_evidence=$8,asset=$9,error_code=$10,updated_at=$11,completed_at=$12
      WHERE generation_id=$1 AND status=$13 RETURNING *`,
      [generationId,next.status,next.approval_status||null,next.provider||null,next.provider_job_id||null,next.provider_model||null,next.provider_diagnostics||null,next.provider_cost_evidence||null,next.asset||null,next.error_code||null,next.updated_at,next.completed_at||null,current.status]);
    if (!q.rows[0]) throw new Error("Video generation state changed concurrently"); return this.toRecord(q.rows[0]);
  }
}
module.exports = { ALLOWED_STATE_TRANSITIONS, VideoGenerationRepository, InMemoryVideoGenerationRepository, PostgresVideoGenerationRepository };
