const { createHash, randomUUID } = require("node:crypto");
const { MediaAssetUnavailableError, MediaConfigurationError, MediaPersistenceError } = require("./errors");

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
});

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function objectKey({ tenantId, projectId, mediaKind, assetId, extension }) {
  return `assets/${sha(tenantId)}/${sha(projectId)}/${mediaKind}/${assetId}.${extension}`;
}

function parseGcsLocation(value) {
  const match = typeof value === "string" && value.match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (!match || !match[2] || match[2].includes("..")) throw new MediaPersistenceError();
  return { bucket: match[1], key: match[2] };
}

class GoogleCloudMediaStorage {
  constructor({ bucket, accessTokenProvider, fetchImpl = globalThis.fetch }) {
    if (typeof bucket !== "string" || !/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/.test(bucket)) {
      throw new MediaConfigurationError("MEDIA_STORAGE_BUCKET is invalid");
    }
    if (typeof accessTokenProvider !== "function" || typeof fetchImpl !== "function") {
      throw new MediaConfigurationError();
    }
    this.bucket = bucket;
    this.accessTokenProvider = accessTokenProvider;
    this.fetchImpl = fetchImpl;
  }

  async request(url, init = {}) {
    let token;
    try {
      token = await this.accessTokenProvider();
    } catch {
      throw new MediaPersistenceError();
    }
    if (typeof token !== "string" || !token.trim()) throw new MediaPersistenceError();
    let response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
      });
    } catch {
      throw new MediaPersistenceError();
    }
    if (!response?.ok) throw new MediaPersistenceError();
    return response;
  }

  async initialize() {
    try {
      const response = await this.request(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}`
      );
      const metadata = await response.json();
      if (
        metadata?.name !== this.bucket ||
        metadata?.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true ||
        metadata?.iamConfiguration?.publicAccessPrevention !== "enforced"
      ) {
        throw new MediaConfigurationError();
      }
    } catch (error) {
      if (error instanceof MediaConfigurationError) throw error;
      throw new MediaConfigurationError();
    }
  }

  async putObject({ key, data, mimeType }) {
    const url = new URL(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o`
    );
    url.searchParams.set("uploadType", "media");
    url.searchParams.set("name", key);
    url.searchParams.set("ifGenerationMatch", "0");
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const response = await this.request(url, {
      method: "POST",
      headers: { "content-type": mimeType, "content-length": String(body.length) },
      body,
    });
    const result = await response.json();
    if (result?.bucket !== this.bucket || result?.name !== key) throw new MediaPersistenceError();
    return { byteSize: Number(result.size || body.length) };
  }

  async copyObject({ source, destinationKey, allowedSourcePrefix }) {
    if (typeof allowedSourcePrefix !== "string" || !source.startsWith(allowedSourcePrefix)) {
      throw new MediaPersistenceError();
    }
    const parsed = parseGcsLocation(source);
    const url = new URL(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.key)}/rewriteTo/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(destinationKey)}`
    );
    url.searchParams.set("ifGenerationMatch", "0");
    let token;
    do {
      if (token) url.searchParams.set("rewriteToken", token);
      const response = await this.request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (result?.done === true) {
        if (result.resource?.bucket !== this.bucket || result.resource?.name !== destinationKey) {
          throw new MediaPersistenceError();
        }
        return { byteSize: Number(result.resource.size) || undefined };
      }
      token = result?.rewriteToken;
      if (typeof token !== "string" || !token) throw new MediaPersistenceError();
    } while (token);
    throw new MediaPersistenceError();
  }

  async download({ key, maximumBytes }) {
    const url = `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}?alt=media`;
    const response = await this.request(url);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) throw new MediaAssetUnavailableError();
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length || data.length > maximumBytes) throw new MediaAssetUnavailableError();
    return data;
  }

  async delete({ key }) {
    try {
      await this.request(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}`,
        { method: "DELETE" }
      );
    } catch {
      // Orphan cleanup is best effort; the authoritative write still fails.
    }
  }
}

function requireTrustedLineage(lineage) {
  for (const field of ["tenant_id", "project_id", "generation_job_id", "generation_id"]) {
    if (typeof lineage?.[field] !== "string" || !lineage[field]) throw new MediaPersistenceError();
  }
  return lineage;
}

class DurableMediaAssetStore {
  constructor({ mediaKind, repository, storage, videoSourcePrefix, now = () => new Date() }) {
    this.mediaKind = mediaKind;
    this.repository = repository;
    this.storage = storage;
    this.videoSourcePrefix = videoSourcePrefix;
    this.now = now;
  }

  async save(input) {
    const lineage = requireTrustedLineage(input?.lineage);
    const mimeType = input.mime_type || input.source?.mime_type;
    const extension = MIME_EXTENSIONS[mimeType];
    if (!extension || (this.mediaKind === "image") !== mimeType.startsWith("image/")) {
      throw new MediaPersistenceError();
    }
    const assetId = randomUUID();
    const key = objectKey({
      tenantId: lineage.tenant_id,
      projectId: lineage.project_id,
      mediaKind: this.mediaKind,
      assetId,
      extension,
    });
    let stored;
    if (this.mediaKind === "image") {
      stored = await this.storage.putObject({ key, data: input.data, mimeType });
    } else {
      stored = await this.storage.copyObject({
        source: input.source?.location,
        destinationKey: key,
        allowedSourcePrefix: this.videoSourcePrefix,
      });
    }
    try {
      const asset = await this.repository.create({
        asset_id: assetId,
        tenant_id: lineage.tenant_id,
        project_id: lineage.project_id,
        generation_job_id: lineage.generation_job_id,
        generation_id: lineage.generation_id,
        source_kind: "generated",
        media_kind: this.mediaKind,
        storage_bucket: this.storage.bucket,
        storage_key: key,
        mime_type: mimeType,
        ...(input.width || input.source?.width ? { width: input.width || input.source.width } : {}),
        ...(input.height || input.source?.height ? { height: input.height || input.source.height } : {}),
        ...(input.source?.duration_seconds ? { duration_seconds: input.source.duration_seconds } : {}),
        ...(stored.byteSize ? { byte_size: stored.byteSize } : {}),
        allowed_uses: this.mediaKind === "image"
          ? ["image.generate.reference", "video.generate.reference"]
          : [],
        status: "active",
        created_at: this.now().toISOString(),
      });
      return {
        asset_id: asset.asset_id,
        location: `gs://${asset.storage_bucket}/${asset.storage_key}`,
        mime_type: asset.mime_type,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
        ...(asset.duration_seconds ? { duration_seconds: asset.duration_seconds } : {}),
        ...(asset.byte_size ? { byte_size: asset.byte_size } : {}),
        ...(this.mediaKind === "video" ? { container: "mp4" } : {}),
      };
    } catch (error) {
      await this.storage.delete({ key });
      if (error instanceof MediaPersistenceError) throw error;
      throw new MediaPersistenceError();
    }
  }
}

class RightsAwareMediaReferenceLoader {
  constructor({ repository, storage, delivery }) {
    this.repository = repository;
    this.storage = storage;
    this.delivery = delivery;
  }

  async load(request) {
    const asset = await this.repository.findAuthorizedReference({
      assetId: request?.asset_id,
      tenantId: request?.tenant_id,
      projectId: request?.project_id,
      requiredRight: request?.required_right,
      mediaKind: "image",
    });
    if (!asset) throw new MediaAssetUnavailableError();
    if (this.delivery === "gcs") {
      return {
        asset_id: asset.asset_id,
        location: `gs://${asset.storage_bucket}/${asset.storage_key}`,
        mime_type: asset.mime_type,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
      };
    }
    return {
      asset_id: asset.asset_id,
      data: await this.storage.download({ key: asset.storage_key, maximumBytes: MAX_IMAGE_BYTES }),
      mime_type: asset.mime_type,
    };
  }
}

module.exports = {
  DurableMediaAssetStore,
  GoogleCloudMediaStorage,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  RightsAwareMediaReferenceLoader,
  objectKey,
  parseGcsLocation,
};
