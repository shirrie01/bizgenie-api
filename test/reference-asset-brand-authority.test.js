const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { describe, it } = require("node:test");

const {
  InMemoryMediaAssetRepository,
  MediaAssetSchema,
  MediaPersistenceError,
  objectKey,
} = require("../src/media");

const MIGRATION = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260924110000_add_reference_asset_brand_authority.sql"),
  "utf8"
);

const A = "11111111-1111-4111-8111-111111111111";

function reference(overrides = {}) {
  return {
    asset_id: A,
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    source_kind: "reference",
    media_kind: "image",
    storage_bucket: "bizgenie-staging-media",
    storage_key: objectKey({
      tenantId: "tenant_a",
      projectId: "project_a",
      mediaKind: "image",
      assetId: A,
      extension: "png",
    }),
    mime_type: "image/png",
    allowed_uses: ["image.generate.reference", "campaign.preview"],
    status: "active",
    created_at: "2026-09-24T10:00:00.000Z",
    ...overrides,
  };
}

describe("reference asset brand authority migration", () => {
  it("adds an immutable brand binding without rewriting generated provenance", () => {
    assert.match(MIGRATION, /add column if not exists brand_id text/i);
    assert.match(MIGRATION, /media_assets_reference_brand_fkey[\s\S]*foreign key \(project_id, brand_id\)[\s\S]*references public\.brand_brains \(project_id, brand_id\)/i);
    assert.match(MIGRATION, /new\.brand_id is distinct from old\.brand_id/i);
    assert.doesNotMatch(MIGRATION, /update\s+public\.media_assets/i);
    assert.doesNotMatch(MIGRATION, /insert\s+into\s+public\.media_assets/i);
  });
});

describe("customer reference asset brand boundary", () => {
  it("accepts the exact selected brand and denies another brand in the same project", async () => {
    const repository = new InMemoryMediaAssetRepository();
    await repository.create(reference());
    assert.ok(await repository.findAuthorizedReference({
      assetId: A,
      tenantId: "tenant_a",
      projectId: "project_a",
      brandId: "brand_a",
      requiredRight: "campaign.preview",
    }));
    assert.equal(await repository.findAuthorizedReference({
      assetId: A,
      tenantId: "tenant_a",
      projectId: "project_a",
      brandId: "brand_b",
      requiredRight: "campaign.preview",
    }), null);
  });

  it("denies missing brand, foreign ownership, revoked state and missing rights", async () => {
    const repository = new InMemoryMediaAssetRepository();
    await repository.create(reference());
    const base = { assetId: A, tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a", requiredRight: "campaign.preview" };
    assert.equal(await repository.findAuthorizedReference({ ...base, brandId: undefined }), null);
    assert.equal(await repository.findAuthorizedReference({ ...base, tenantId: "tenant_b" }), null);
    assert.equal(await repository.findAuthorizedReference({ ...base, projectId: "project_b" }), null);
    assert.equal(await repository.findAuthorizedReference({ ...base, requiredRight: "campaign.publish" }), null);

    const revoked = new InMemoryMediaAssetRepository();
    await revoked.create(reference({ status: "revoked" }));
    assert.equal(await revoked.findAuthorizedReference(base), null);
  });

  it("rejects creation of a new unbound reference while legacy unbound rows remain parseable", async () => {
    const unbound = reference();
    delete unbound.brand_id;
    assert.doesNotThrow(() => MediaAssetSchema.parse(unbound));
    const repository = new InMemoryMediaAssetRepository();
    await assert.rejects(repository.create(unbound), MediaPersistenceError);
  });

  it("keeps generated asset brand authority on GenerationJob rather than mutable media brand_id", () => {
    const generated = {
      ...reference({
        source_kind: "generated",
        generation_job_id: "job_image",
        generation_id: "generation_image",
      }),
    };
    delete generated.brand_id;
    assert.doesNotThrow(() => MediaAssetSchema.parse(generated));
    assert.throws(() => MediaAssetSchema.parse({ ...generated, brand_id: "brand_a" }));
  });
});
