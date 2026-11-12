const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { ImageGenerationService, InMemoryImageGenerationRepository } = require("../src/image-generation");
const { VideoGenerationService, InMemoryVideoGenerationRepository } = require("../src/video-generation");
const { InMemoryMediaAssetRepository, RightsAwareMediaReferenceLoader, objectKey } = require("../src/media");
const { InMemoryCampaignRepository } = require("../src/campaigns");
const { scenario, content, NOW } = require("./helpers/campaign-regressions");

async function referenceFlow(kind, { jobBrand = "brand_a", requestBrand = "brand_a", assetPatch = {}, videoMode = "input_image" } = {}) {
  const assetId = randomUUID();
  const repository = new InMemoryMediaAssetRepository();
  await repository.create({ asset_id: assetId, tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", source_kind: "reference", media_kind: "image",
    storage_bucket: "private-test-media", storage_key: objectKey({ tenantId: "tenant_a", projectId: "project_a", mediaKind: "image", assetId, extension: "png" }), mime_type: "image/png",
    allowed_uses: ["image.generate.reference", "video.generate.reference", "campaign.preview"], status: "active", created_at: NOW, ...assetPatch });
  const state = { loaded: [], downloads: 0, providerCompletions: 0 };
  const realLoader = new RightsAwareMediaReferenceLoader({ repository,
    storage: { async download() { state.downloads++; return Buffer.from("fixture image bytes, not a real provider call"); } }, delivery: kind === "image" ? "bytes" : "gcs" });
  const loader = { async load(input) { state.loaded.push(input); return realLoader.load(input); } };
  const service = kind === "image" ? new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), brandBrainRepository: new InMemoryBrandBrainRepository(),
    provider: { async generate(input) { for (const ref of input.reference_assets) await loader.load(ref); state.providerCompletions++; return { provider: "fixture", provider_job_id: "fixture-operation", asset: { location: "gs://private-test-media/fixture.png", mime_type: "image/png" } }; } } }) :
    new VideoGenerationService({ repository: new InMemoryVideoGenerationRepository(), brandBrainRepository: new InMemoryBrandBrainRepository(), referenceAssetLoader: loader,
      assetStore: { async save() { throw new Error("not used by submit"); } }, provider: { async submit() { state.providerCompletions++; return { provider: "fixture", provider_job_id: "fixture-operation", provider_model: "fixture-model" }; } } });
  const request = { execution_id: "execution_1", generation_id: "generation_1", user_id: "user_a", project_id: "project_a", brand_id: requestBrand, topic: "Existing authorised reference", aspect_ratio: kind === "image" ? "1:1" : "9:16",
    ...(kind === "image" ? { image_purpose: "Reference repair test", reference_assets: [{ asset_id: assetId, location: "https://untrusted.invalid/never-use.png" }] } :
      { video_purpose: "Reference repair test", quality: "normal", duration_seconds: 8, [videoMode]: videoMode === "input_image" ? { asset_id: assetId } : [{ asset_id: assetId }] }) };
  const job = { job_id: "job_1", tenant_id: "tenant_a", project_id: "project_a", brand_id: jobBrand, actor_correlation: { auth_user_id: "user_a" } };
  return { state, run: () => kind === "image" ? service.generate(request, { job }) : service.submit(request, { job }) };
}
for (const kind of ["image", "video"]) {
  test(`${kind} forwards the trusted brand through the real reference-rights loader`, async () => {
    const f = await referenceFlow(kind), result = await f.run();
    assert.equal(result.status, kind === "image" ? "completed" : "submitted");
    assert.equal(f.state.loaded[0].brand_id, "brand_a");
    assert.equal(f.state.providerCompletions, 1);
    assert.equal(f.state.downloads, kind === "image" ? 1 : 0);
    assert.equal(f.state.loaded[0].location, undefined);
  });
  test(`${kind} cannot use request brand to override an immutable job's different or absent brand`, async () => {
    for (const jobBrand of ["brand_b", null]) {
      const f = await referenceFlow(kind, { jobBrand, requestBrand: "brand_a" });
      await assert.rejects(f.run()); assert.equal(f.state.loaded[0].brand_id, jobBrand || undefined);
      assert.equal(f.state.downloads, 0); assert.equal(f.state.providerCompletions, 0);
    }
  });
  test(`${kind} keeps tenant/project, revoked-state and reference-right controls`, async () => {
    for (const assetPatch of [{ tenant_id: "tenant_b" }, { project_id: "project_b" }, { brand_id: "brand_b" }, { status: "revoked" }, { allowed_uses: [] }]) {
      const f = await referenceFlow(kind, { assetPatch });
      await assert.rejects(f.run()); assert.equal(f.state.downloads, 0); assert.equal(f.state.providerCompletions, 0);
    }
  });
}
test("video multi-reference mode carries the same trusted brand", async () => {
  const f = await referenceFlow("video", { videoMode: "reference_assets" });
  assert.equal((await f.run()).status, "submitted"); assert.equal(f.state.loaded[0].brand_id, "brand_a");
});
test("characterises the unrepaired hybrid save boundary: a reference image is not a generated text output", async () => {
  const assetId = randomUUID();
  const repository = new InMemoryCampaignRepository({ authorize: async () => true, now: () => new Date(NOW), captureBrandSnapshot: async () => ({
    brand_snapshot_id: randomUUID(), tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", source_version: 1,
    source_updated_at: NOW, source_schema_version: "brand-brain.v1", snapshot: { name: "A" }, snapshot_hash: "a".repeat(64), captured_at: NOW }),
    resolveMedia: async () => ({ asset_id: assetId, tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", source_kind: "reference", media_kind: "image", status: "active", allowed_uses: ["campaign.preview"] }) });
  const s = await scenario(repository), target = await s.add(), before = await s.get();
  await assert.rejects(() => s.cmd("save_revision", { variant_id: target.variant_id, content: { ...content, asset_refs: [{ asset_id: assetId, role: "supporting" }] }, change_reason: "Hybrid source reference" }), error => error.code === "RESOURCE_NOT_AVAILABLE");
  assert.deepEqual(await s.get(), before);
});
