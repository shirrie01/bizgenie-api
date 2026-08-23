const { VideoGenerationConflictError } = require("./errors");
const { VideoGenerationRecordSchema } = require("./schema");

const IMMUTABLE_FIELDS = new Set([
  "generation_id", "parent_generation_id", "transaction_correlation_id",
  "execution_id", "user_id", "project_id", "brand_id", "campaign_id",
  "tenant_id", "generation_job_id",
  "content_item_id", "video_purpose", "quality", "aspect_ratio",
  "duration_seconds", "created_at",
]);
const ALLOWED_STATE_TRANSITIONS = Object.freeze({
  queued: new Set(["submitted", "failed"]),
  submitted: new Set(["processing", "failed"]),
  processing: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set(),
});

function copy(value) { return value ? structuredClone(value) : value; }

class VideoGenerationRepository {
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
    this.records.set(parsed.generation_id, copy(parsed));
    return copy(parsed);
  }

  getByGenerationId(generationId) { return copy(this.records.get(generationId) || null); }

  update(generationId, patch) {
    const current = this.records.get(generationId);
    if (!current) throw new Error("Video generation record was not found");
    for (const field of IMMUTABLE_FIELDS) {
      if (Object.hasOwn(patch, field) && patch[field] !== current[field]) {
        throw new Error(`Video generation field '${field}' is immutable`);
      }
    }
    if (patch.status && patch.status !== current.status && !ALLOWED_STATE_TRANSITIONS[current.status].has(patch.status)) {
      throw new Error(`Invalid video generation state transition from '${current.status}' to '${patch.status}'`);
    }
    const parsed = VideoGenerationRecordSchema.parse({ ...current, ...copy(patch) });
    this.records.set(generationId, copy(parsed));
    return copy(parsed);
  }
}

module.exports = { ALLOWED_STATE_TRANSITIONS, VideoGenerationRepository, InMemoryVideoGenerationRepository };
