const { ImageGenerationConflictError } = require("./errors");
const { ImageGenerationRecordSchema } = require("./schema");

const IMMUTABLE_FIELDS = new Set([
  "generation_id",
  "parent_generation_id",
  "execution_id",
  "user_id",
  "project_id",
  "brand_id",
  "campaign_id",
  "content_item_id",
  "image_purpose",
  "aspect_ratio",
  "created_at",
]);

const ALLOWED_STATE_TRANSITIONS = Object.freeze({
  queued: new Set(["processing", "failed"]),
  processing: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set(),
});

function copy(value) {
  return value ? structuredClone(value) : value;
}

class ImageGenerationRepository {
  create(_record) {
    throw new Error("ImageGenerationRepository.create is not implemented");
  }

  getByGenerationId(_generationId) {
    throw new Error(
      "ImageGenerationRepository.getByGenerationId is not implemented"
    );
  }

  update(_generationId, _patch) {
    throw new Error("ImageGenerationRepository.update is not implemented");
  }
}

class InMemoryImageGenerationRepository extends ImageGenerationRepository {
  constructor() {
    super();
    this.records = new Map();
  }

  create(record) {
    const parsed = ImageGenerationRecordSchema.parse(record);
    if (parsed.status !== "queued") {
      throw new Error("A new image generation must start in queued state");
    }
    if (this.records.has(parsed.generation_id)) {
      throw new ImageGenerationConflictError(parsed.generation_id);
    }
    this.records.set(parsed.generation_id, copy(parsed));
    return copy(parsed);
  }

  getByGenerationId(generationId) {
    return copy(this.records.get(generationId) || null);
  }

  update(generationId, patch) {
    const current = this.records.get(generationId);
    if (!current) {
      throw new Error("Image generation record was not found");
    }

    for (const field of IMMUTABLE_FIELDS) {
      if (Object.hasOwn(patch, field) && patch[field] !== current[field]) {
        throw new Error(`Image generation field '${field}' is immutable`);
      }
    }

    if (
      patch.status &&
      patch.status !== current.status &&
      !ALLOWED_STATE_TRANSITIONS[current.status].has(patch.status)
    ) {
      throw new Error(
        `Invalid image generation state transition from '${current.status}' to '${patch.status}'`
      );
    }

    const parsed = ImageGenerationRecordSchema.parse({
      ...current,
      ...copy(patch),
    });
    this.records.set(generationId, copy(parsed));
    return copy(parsed);
  }
}

module.exports = {
  ImageGenerationRepository,
  InMemoryImageGenerationRepository,
};
