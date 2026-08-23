const { MediaAssetUnavailableError, MediaConfigurationError, MediaPersistenceError } = require("./errors");
const { MediaAssetSchema } = require("./schema");

function copy(value) {
  return value ? structuredClone(value) : value;
}

class MediaAssetRepository {
  async initialize() {}
  async create(_asset) { throw new Error("MediaAssetRepository.create is not implemented"); }
  async findOwned(_input) { throw new Error("MediaAssetRepository.findOwned is not implemented"); }
  async findAuthorizedReference(_input) { throw new Error("MediaAssetRepository.findAuthorizedReference is not implemented"); }
}

class InMemoryMediaAssetRepository extends MediaAssetRepository {
  constructor({ assets = [] } = {}) {
    super();
    this.assets = new Map();
    for (const asset of assets) this.create(asset);
  }

  async create(value) {
    const asset = MediaAssetSchema.parse(value);
    if (this.assets.has(asset.asset_id)) throw new MediaPersistenceError();
    if ([...this.assets.values()].some((row) => row.storage_bucket === asset.storage_bucket && row.storage_key === asset.storage_key)) {
      throw new MediaPersistenceError();
    }
    this.assets.set(asset.asset_id, copy(asset));
    return copy(asset);
  }

  async findOwned({ assetId, tenantId, projectId }) {
    const asset = this.assets.get(assetId);
    if (!asset || asset.tenant_id !== tenantId || asset.project_id !== projectId || asset.status !== "active") return null;
    return copy(asset);
  }

  async findAuthorizedReference({ assetId, tenantId, projectId, requiredRight, mediaKind = "image" }) {
    const asset = await this.findOwned({ assetId, tenantId, projectId });
    if (!asset || asset.media_kind !== mediaKind || !asset.allowed_uses.includes(requiredRight)) return null;
    return asset;
  }
}

class PostgresMediaAssetRepository extends MediaAssetRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required");
    this.pool = pool;
  }

  async initialize() {
    try {
      const result = await this.pool.query(`
        SELECT to_regclass('public.media_assets') AS relation,
               EXISTS (
                 SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.media_assets'::regclass
                    AND conname = 'media_assets_generation_authority_fkey'
               ) AS generation_authority,
               EXISTS (
                 SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.media_assets'::regclass
                    AND tgname = 'protect_media_asset_authority'
                    AND NOT tgisinternal
               ) AS authority_trigger`);
      const row = result.rows[0];
      if (!row?.relation || row.generation_authority !== true || row.authority_trigger !== true) {
        throw new MediaConfigurationError();
      }
      const unsafe = await this.pool.query(`
        SELECT grantee FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'media_assets'
           AND grantee IN ('anon', 'authenticated', 'service_role')`);
      if (unsafe.rowCount > 0) throw new MediaConfigurationError();
    } catch (error) {
      if (error instanceof MediaConfigurationError) throw error;
      throw new MediaConfigurationError();
    }
  }

  async create(value) {
    const asset = MediaAssetSchema.parse(value);
    try {
      const result = await this.pool.query(
        `INSERT INTO public.media_assets
          (asset_id, tenant_id, project_id, generation_job_id, generation_id,
           source_kind, media_kind, storage_bucket, storage_key, mime_type,
           width, height, duration_seconds, byte_size, allowed_uses, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [asset.asset_id, asset.tenant_id, asset.project_id,
          asset.generation_job_id || null, asset.generation_id || null,
          asset.source_kind, asset.media_kind, asset.storage_bucket,
          asset.storage_key, asset.mime_type, asset.width || null,
          asset.height || null, asset.duration_seconds || null,
          asset.byte_size || null, asset.allowed_uses, asset.status,
          asset.created_at]
      );
      return this.toAsset(result.rows[0]);
    } catch (_error) {
      throw new MediaPersistenceError();
    }
  }

  async findOwned({ assetId, tenantId, projectId }) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM public.media_assets
          WHERE asset_id = $1 AND tenant_id = $2 AND project_id = $3
            AND status = 'active'`,
        [assetId, tenantId, projectId]
      );
      return result.rows[0] ? this.toAsset(result.rows[0]) : null;
    } catch (_error) {
      throw new MediaPersistenceError();
    }
  }

  async findAuthorizedReference({ assetId, tenantId, projectId, requiredRight, mediaKind = "image" }) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM public.media_assets
          WHERE asset_id = $1 AND tenant_id = $2 AND project_id = $3
            AND media_kind = $4 AND status = 'active' AND $5 = ANY(allowed_uses)`,
        [assetId, tenantId, projectId, mediaKind, requiredRight]
      );
      return result.rows[0] ? this.toAsset(result.rows[0]) : null;
    } catch (_error) {
      throw new MediaPersistenceError();
    }
  }

  toAsset(row) {
    if (!row) throw new MediaAssetUnavailableError();
    return MediaAssetSchema.parse({
      asset_id: row.asset_id,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      ...(row.generation_job_id ? { generation_job_id: row.generation_job_id } : {}),
      ...(row.generation_id ? { generation_id: row.generation_id } : {}),
      source_kind: row.source_kind,
      media_kind: row.media_kind,
      storage_bucket: row.storage_bucket,
      storage_key: row.storage_key,
      mime_type: row.mime_type,
      ...(row.width ? { width: Number(row.width) } : {}),
      ...(row.height ? { height: Number(row.height) } : {}),
      ...(row.duration_seconds ? { duration_seconds: Number(row.duration_seconds) } : {}),
      ...(row.byte_size ? { byte_size: Number(row.byte_size) } : {}),
      allowed_uses: row.allowed_uses || [],
      status: row.status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    });
  }
}

module.exports = {
  InMemoryMediaAssetRepository,
  MediaAssetRepository,
  PostgresMediaAssetRepository,
};
