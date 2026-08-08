const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  PostgresBrandBrainRepository,
  createPostgresBrandBrainRepositoryFromEnv,
} = require("../src/brand-brain");
const {
  BrandBrainConfigurationError,
  BrandBrainOwnershipError,
  BrandBrainPersistenceError,
} = require("../src/brand-brain/errors");
const { FakeBrandBrainPool } = require("./helpers/fake-brand-brain-pool");

function record(overrides = {}) {
  return {
    brand_id: "brand_001",
    project_id: "project_001",
    name: "BizGenie",
    identity: { positioning: "An AI Brand Operating System." },
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-08-08T09:00:00.000Z",
      updated_at: "2026-08-08T09:00:00.000Z",
    },
    ...overrides,
  };
}

describe("PostgresBrandBrainRepository", () => {
  it("inserts, retrieves, updates, and returns defensive copies", async () => {
    const repository = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool(),
    });
    const inserted = await repository.upsert(record());
    inserted.name = "Mutated response";

    const updated = record({
      name: "BizGenie Updated",
      metadata: {
        ...record().metadata,
        updated_at: "2026-08-08T10:00:00.000Z",
      },
    });
    await repository.upsert(updated);
    updated.name = "Mutated input";

    assert.equal((await repository.getByBrandId("brand_001")).name, "BizGenie Updated");
    assert.equal(
      (await repository.getByBrandId("brand_001")).metadata.created_at,
      "2026-08-08T09:00:00.000Z"
    );
  });

  it("returns null for unknown brands and project mismatches", async () => {
    const pool = new FakeBrandBrainPool();
    const repository = new PostgresBrandBrainRepository({ pool });
    await repository.upsert(record());

    assert.equal(await repository.getByBrandId("brand_missing"), null);
    assert.equal(
      await repository.getByProjectAndBrand("project_002", "brand_001"),
      null
    );
    assert.equal(
      (await repository.getByProjectAndBrand("project_001", "brand_001")).name,
      "BizGenie"
    );
    const scopedQuery = pool.queries.find(({ text }) =>
      text.includes("WHERE project_id = $1")
    );
    assert.deepEqual(scopedQuery.values, ["project_002", "brand_001"]);
  });

  it("preserves status values and rejects ownership reassignment atomically", async () => {
    const repository = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool(),
    });
    for (const status of ["approved", "draft", "archived"]) {
      const value = record({
        brand_id: `brand_${status}`,
        metadata: { ...record().metadata, status },
      });
      assert.equal((await repository.upsert(value)).metadata.status, status);
    }

    await repository.upsert(record());
    await assert.rejects(
      repository.upsert(record({ project_id: "project_002" })),
      BrandBrainOwnershipError
    );
  });

  it("rejects malformed stored data without returning content", async () => {
    const records = new Map([
      [
        "brand_001",
        {
          brand_id: "brand_001",
          project_id: "project_001",
          name: "Malformed",
          identity: ["not-an-object"],
          version: 1,
          status: "approved",
          created_at: "2026-08-08T09:00:00.000Z",
          updated_at: "2026-08-08T09:00:00.000Z",
        },
      ],
    ]);
    const repository = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool({ records }),
    });

    await assert.rejects(
      repository.getByProjectAndBrand("project_001", "brand_001"),
      (error) =>
        error instanceof BrandBrainPersistenceError &&
        !JSON.stringify(error).includes("Malformed")
    );
  });

  it("sanitises database and initialization failures", async () => {
    const repository = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool({
        failure: new Error("private provider diagnostic details"),
      }),
    });
    for (const operation of [
      () => repository.initialize(),
      () => repository.getByBrandId("brand_001"),
      () => repository.getByProjectAndBrand("project_001", "brand_001"),
      () => repository.upsert(record()),
    ]) {
      await assert.rejects(operation(), (error) => {
        assert.ok(error instanceof BrandBrainPersistenceError);
        assert.doesNotMatch(error.message, /private|provider|diagnostic/);
        return true;
      });
    }
  });

  it("persists across repository instance recreation with a shared database", async () => {
    const records = new Map();
    const writer = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool({ records }),
    });
    await writer.upsert(record());

    const reader = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool({ records }),
    });
    assert.deepEqual(await reader.getByBrandId("brand_001"), record());
  });
});

describe("Postgres Brand Brain configuration", () => {
  it("fails deterministically for missing and malformed configuration", () => {
    for (const env of [
      {},
      { BRAND_BRAIN_DATABASE_URL: "https://not-postgres.example" },
      {
        BRAND_BRAIN_DATABASE_URL: "postgresql://example.invalid/database",
        BRAND_BRAIN_DB_POOL_MAX: "unbounded",
      },
    ]) {
      assert.throws(
        () => createPostgresBrandBrainRepositoryFromEnv({ env }),
        BrandBrainConfigurationError
      );
    }
  });

  it("creates one bounded pool from environment configuration", () => {
    let config;
    class CapturingPool extends FakeBrandBrainPool {
      constructor(value) {
        super();
        config = value;
      }
    }

    const repository = createPostgresBrandBrainRepositoryFromEnv({
      env: {
        BRAND_BRAIN_DATABASE_URL: "postgresql://example.invalid/database",
        BRAND_BRAIN_DB_POOL_MAX: "4",
        BRAND_BRAIN_DB_CONNECTION_TIMEOUT_MS: "6000",
        BRAND_BRAIN_DB_IDLE_TIMEOUT_MS: "45000",
      },
      PoolClass: CapturingPool,
    });

    assert.ok(repository instanceof PostgresBrandBrainRepository);
    assert.equal(config.max, 4);
    assert.equal(config.connectionTimeoutMillis, 6000);
    assert.equal(config.idleTimeoutMillis, 45000);
  });
});
