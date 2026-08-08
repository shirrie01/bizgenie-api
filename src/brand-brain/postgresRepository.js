const { Pool } = require("pg");
const { BrandBrainSchema } = require("./schema");
const { BrandBrainRepository } = require("./repository");
const {
  BrandBrainConfigurationError,
  BrandBrainOwnershipError,
  BrandBrainPersistenceError,
} = require("./errors");

const DEFAULT_POOL_MAX = 5;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 30000;

const SELECT_COLUMNS = [
  "brand_id",
  "project_id",
  "name",
  "identity",
  "voice",
  "audience",
  "commercial",
  "competitors",
  "visual",
  "version",
  "status",
  "created_at",
  "updated_at",
].join(", ");

function safePositiveInteger(value, defaultValue, name) {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BrandBrainConfigurationError(`${name} must be a positive integer`);
  }
  return parsed;
}

function validateConnectionString(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BrandBrainConfigurationError(
      "BRAND_BRAIN_DATABASE_URL is required"
    );
  }

  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new BrandBrainConfigurationError(
      "BRAND_BRAIN_DATABASE_URL must be a valid PostgreSQL connection string"
    );
  }

  return value;
}

function mapRow(row) {
  if (!row) {
    return null;
  }

  const candidate = {
    brand_id: row.brand_id,
    project_id: row.project_id,
    name: row.name,
    metadata: {
      version: row.version,
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    },
  };

  for (const section of [
    "identity",
    "voice",
    "audience",
    "commercial",
    "competitors",
    "visual",
  ]) {
    if (row[section] !== null && row[section] !== undefined) {
      candidate[section] = row[section];
    }
  }

  const parsed = BrandBrainSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new BrandBrainPersistenceError();
  }
  return structuredClone(parsed.data);
}

class PostgresBrandBrainRepository extends BrandBrainRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") {
      throw new BrandBrainConfigurationError(
        "A PostgreSQL connection pool is required"
      );
    }
    this.pool = pool;
  }

  async initialize() {
    try {
      await this.pool.query(
        "SELECT brand_id FROM public.brand_brains LIMIT 0"
      );
    } catch {
      throw new BrandBrainPersistenceError();
    }
  }

  async close() {
    if (typeof this.pool.end === "function") {
      await this.pool.end();
    }
  }

  async getByBrandId(brandId) {
    try {
      const result = await this.pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM public.brand_brains
          WHERE brand_id = $1`,
        [brandId]
      );
      return mapRow(result.rows[0]);
    } catch (error) {
      if (error instanceof BrandBrainPersistenceError) {
        throw error;
      }
      throw new BrandBrainPersistenceError();
    }
  }

  async getByProjectAndBrand(projectId, brandId) {
    try {
      const result = await this.pool.query(
        `SELECT ${SELECT_COLUMNS}
           FROM public.brand_brains
          WHERE project_id = $1
            AND brand_id = $2`,
        [projectId, brandId]
      );
      return mapRow(result.rows[0]);
    } catch (error) {
      if (error instanceof BrandBrainPersistenceError) {
        throw error;
      }
      throw new BrandBrainPersistenceError();
    }
  }

  async upsert(record) {
    const values = [
      record.brand_id,
      record.project_id,
      record.name,
      record.identity ?? null,
      record.voice ?? null,
      record.audience ?? null,
      record.commercial ?? null,
      record.competitors ?? null,
      record.visual ?? null,
      record.metadata.version,
      record.metadata.status,
      record.metadata.created_at,
      record.metadata.updated_at,
    ];

    try {
      const result = await this.pool.query(
        `INSERT INTO public.brand_brains (
           brand_id, project_id, name, identity, voice, audience, commercial,
           competitors, visual, version, status, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         )
         ON CONFLICT (brand_id) DO UPDATE SET
           name = EXCLUDED.name,
           identity = EXCLUDED.identity,
           voice = EXCLUDED.voice,
           audience = EXCLUDED.audience,
           commercial = EXCLUDED.commercial,
           competitors = EXCLUDED.competitors,
           visual = EXCLUDED.visual,
           version = EXCLUDED.version,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at
         WHERE public.brand_brains.project_id = EXCLUDED.project_id
         RETURNING ${SELECT_COLUMNS}`,
        values
      );

      if (result.rowCount === 0) {
        throw new BrandBrainOwnershipError(record.brand_id);
      }
      return mapRow(result.rows[0]);
    } catch (error) {
      if (
        error instanceof BrandBrainOwnershipError ||
        error instanceof BrandBrainPersistenceError
      ) {
        throw error;
      }
      throw new BrandBrainPersistenceError();
    }
  }
}

function createPostgresBrandBrainRepositoryFromEnv({
  env = process.env,
  PoolClass = Pool,
} = {}) {
  const connectionString = validateConnectionString(
    env.BRAND_BRAIN_DATABASE_URL
  );
  const pool = new PoolClass({
    connectionString,
    max: safePositiveInteger(
      env.BRAND_BRAIN_DB_POOL_MAX,
      DEFAULT_POOL_MAX,
      "BRAND_BRAIN_DB_POOL_MAX"
    ),
    connectionTimeoutMillis: safePositiveInteger(
      env.BRAND_BRAIN_DB_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECTION_TIMEOUT_MS,
      "BRAND_BRAIN_DB_CONNECTION_TIMEOUT_MS"
    ),
    idleTimeoutMillis: safePositiveInteger(
      env.BRAND_BRAIN_DB_IDLE_TIMEOUT_MS,
      DEFAULT_IDLE_TIMEOUT_MS,
      "BRAND_BRAIN_DB_IDLE_TIMEOUT_MS"
    ),
    allowExitOnIdle: false,
  });

  return new PostgresBrandBrainRepository({ pool });
}

module.exports = {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_POOL_MAX,
  PostgresBrandBrainRepository,
  createPostgresBrandBrainRepositoryFromEnv,
  mapRow,
};
