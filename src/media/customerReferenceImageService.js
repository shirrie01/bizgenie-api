const { randomUUID } = require("node:crypto");
const { MediaPersistenceError } = require("./errors");
const { MAX_IMAGE_BYTES, objectKey } = require("./storage");

const MIME = Object.freeze({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" });
const REFERENCE_RIGHTS = Object.freeze(["image.generate.reference", "video.generate.reference", "campaign.preview"]);
const DEFAULT_MAX_CUSTOMER_IMAGE_BYTES = 10 * 1024 * 1024;

function detectImageMime(data) {
  if (!Buffer.isBuffer(data)) return null;
  if (data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Internal reference ingestion primitive, NOT a public HTTP endpoint.
 * The caller MUST first verify the authenticated actor's approved project/brand write scope.
 * The caller MUST enforce HTTP request limits and scan/decode images before calling.
 */
class CustomerReferenceImageService {
  constructor({ repository, storage, scanImage, now = () => new Date(), maxBytes = DEFAULT_MAX_CUSTOMER_IMAGE_BYTES }) {
    if (!repository?.create || !storage?.putObject || !storage?.delete || typeof scanImage !== "function") {
      throw new TypeError("Reference ingestion requires repository, storage and a scanner");
    }
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_IMAGE_BYTES) throw new TypeError("Invalid image limit");
    Object.assign(this, { repository, storage, scanImage, now, maxBytes });
  }

  async ingest({ authority, data, mimeType }) {
    if (!authority?.verified || !authority.tenant_id || !authority.project_id || !authority.brand_id) {
      throw new MediaPersistenceError();
    }
    if (!Buffer.isBuffer(data) || !data.length || data.length > this.maxBytes) throw new MediaPersistenceError();
    const detected = detectImageMime(data);
    if (!detected || !Object.hasOwn(MIME, mimeType) || detected !== mimeType) throw new MediaPersistenceError();
    // Scanner is fail-closed; any rejected, errored or unavailable scan blocks storage.
    let scan;
    try { scan = await this.scanImage({ data, mimeType }); } catch { throw new MediaPersistenceError(); }
    if (scan !== true) throw new MediaPersistenceError();

    const assetId = randomUUID();
    const key = objectKey({
      tenantId: authority.tenant_id, projectId: authority.project_id,
      mediaKind: "image", assetId, extension: MIME[mimeType],
    });
    let uploaded = false;
    try {
      const stored = await this.storage.putObject({ key, data, mimeType });
      uploaded = true;
      const asset = await this.repository.create({
        asset_id: assetId,
        tenant_id: authority.tenant_id,
        project_id: authority.project_id,
        brand_id: authority.brand_id,
        source_kind: "reference",
        media_kind: "image",
        storage_bucket: this.storage.bucket,
        storage_key: key,
        mime_type: mimeType,
        byte_size: stored.byteSize || data.length,
        allowed_uses: [...REFERENCE_RIGHTS],
        status: "active",
        created_at: this.now().toISOString(),
      });
      return { asset_id: asset.asset_id, media_kind: asset.media_kind, mime_type: asset.mime_type, byte_size: asset.byte_size };
    } catch {
      if (uploaded) await this.storage.delete({ key });
      throw new MediaPersistenceError();
    }
  }
}

module.exports = { CustomerReferenceImageService, DEFAULT_MAX_CUSTOMER_IMAGE_BYTES, detectImageMime };
