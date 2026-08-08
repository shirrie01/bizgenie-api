const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  InMemoryBrandBrainRepository,
} = require("../src/brand-brain");
const {
  BrandBrainOwnershipError,
} = require("../src/brand-brain/errors");

function record(overrides = {}) {
  return {
    brand_id: "brand_001",
    project_id: "project_001",
    name: "BizGenie",
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-08-08T09:00:00.000Z",
      updated_at: "2026-08-08T09:00:00.000Z",
    },
    ...overrides,
  };
}

describe("InMemoryBrandBrainRepository", () => {
  it("upserts and retrieves defensive copies", () => {
    const repository = new InMemoryBrandBrainRepository();
    const value = record();
    const stored = repository.upsert(value);

    value.name = "Mutated input";
    stored.name = "Mutated output";
    assert.equal(repository.getByBrandId("brand_001").name, "BizGenie");
  });

  it("updates an existing record for the same project", () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    repository.upsert(record({ name: "BizGenie Updated" }));
    assert.equal(repository.getByBrandId("brand_001").name, "BizGenie Updated");
  });

  it("returns null for a missing record or project mismatch", () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    assert.equal(repository.getByBrandId("brand_missing"), null);
    assert.equal(
      repository.getByProjectAndBrand("project_002", "brand_001"),
      null
    );
    assert.equal(
      repository.getByProjectAndBrand("project_001", "brand_001").name,
      "BizGenie"
    );
  });

  it("rejects moving an existing brand to another project", () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    assert.throws(
      () => repository.upsert(record({ project_id: "project_002" })),
      BrandBrainOwnershipError
    );
  });
});
