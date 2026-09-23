const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { sanitizeExecutionInput } = require("../src/generation-jobs/executionInput");
const { InMemoryMediaAssetRepository, objectKey } = require("../src/media");

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
    storage_key: objectKey({ tenantId: "tenant_a", projectId: "project_a", mediaKind: "image", assetId: A, extension: "png" }),
    mime_type: "image/png",
    allowed_uses: ["campaign.preview"],
    status: "active",
    created_at: "2026-09-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("campaign execution provenance contract", () => {
  it("persists only bounded scalar execution provenance and drops injected authority", () => {
    const result = sanitizeExecutionInput({
      compiled_prompt: "safe",
      execution_mode: "hybrid",
      execution_brief: "Use the founder-supplied demonstration clip as supporting creative direction.",
      supplied_asset_refs: "primary:" + A,
      provider: "attacker",
      model: "attacker",
      tenant_id: "tenant_b",
      brand_id: "brand_b",
      storage_location: "gs://secret/object",
      callback: { url: "https://attacker.example" },
    });
    assert.deepEqual(result, {
      compiled_prompt: "safe",
      execution_mode: "hybrid",
      execution_brief: "Use the founder-supplied demonstration clip as supporting creative direction.",
      supplied_asset_refs: "primary:" + A,
    });
  });

  it("authorizes a supplied reference only for its exact brand and right", async () => {
    const repository = new InMemoryMediaAssetRepository();
    await repository.create(reference());
    assert.ok(await repository.findAuthorizedReference({
      assetId: A, tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a",
      requiredRight: "campaign.preview", mediaKind: "image",
    }));
    assert.equal(await repository.findAuthorizedReference({
      assetId: A, tenantId: "tenant_a", projectId: "project_a", brandId: "brand_b",
      requiredRight: "campaign.preview", mediaKind: "image",
    }), null);
  });

  it("does not expose storage authority in execution provenance", () => {
    const result = sanitizeExecutionInput({
      supplied_asset_refs: "supporting:" + A,
      storage_bucket: "private",
      storage_key: "assets/private",
      asset_location: "gs://private/object",
    });
    assert.equal(result.supplied_asset_refs, "supporting:" + A);
    assert.equal(result.storage_bucket, undefined);
    assert.equal(result.storage_key, undefined);
    assert.equal(result.asset_location, undefined);
  });
});
