const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { describe, it } = require("node:test");

const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const {
  ImageGenerationService,
  InMemoryImageGenerationRepository,
  OpenAIImageProvider,
  ImageProviderRejectedError,
} = require("../src/image-generation");
const {
  InMemoryMediaAssetRepository,
  MediaAssetUnavailableError,
  RightsAwareMediaReferenceLoader,
  objectKey,
} = require("../src/media");

const MIGRATION = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260823133000_create_durable_media_assets.sql"),
  "utf8"
);
const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

function asset(overrides = {}) {
  return {
    asset_id: ASSET_ID,
    tenant_id: "tenant_a",
    project_id: "project_a",
    generation_job_id: JOB_ID,
    generation_id: "generation_source_001",
    source_kind: "generated",
    media_kind: "image",
    storage_bucket: "bizgenie-staging-media",
    storage_key: objectKey({
      tenantId: "tenant_a",
      projectId: "project_a",
      mediaKind: "image",
      assetId: ASSET_ID,
      extension: "png",
    }),
    mime_type: "image/png",
    width: 1024,
    height: 1024,
    byte_size: 100,
    allowed_uses: ["image.generate.reference", "video.generate.reference"],
    status: "active",
    created_at: "2026-08-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("durable media authority migration", () => {
  it("binds generated assets to immutable tenant, project, and generation-job authority", () => {
    assert.match(MIGRATION, /create table if not exists public\.media_assets/i);
    assert.match(MIGRATION, /foreign key \(project_id, tenant_id\)/i);
    assert.match(MIGRATION, /foreign key \(generation_job_id, tenant_id, project_id\)/i);
    assert.match(MIGRATION, /protect_media_asset_authority/i);
    assert.match(MIGRATION, /storage_key ~ '\^assets\//i);
  });

  it("keeps the table server-only with RLS and explicit customer-role revocation", () => {
    assert.match(MIGRATION, /enable row level security/i);
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.match(MIGRATION, new RegExp(`revoke all on table public\\.media_assets from ${role}`, "i"));
    }
  });
});

describe("tenant/project media ownership and rights", () => {
  it("denies cross-tenant and cross-project reference access without enumeration", async () => {
    const repository = new InMemoryMediaAssetRepository();
    await repository.create(asset());
    const loader = new RightsAwareMediaReferenceLoader({
      repository,
      storage: {},
      delivery: "gcs",
    });

    for (const request of [
      { tenant_id: "tenant_b", project_id: "project_a" },
      { tenant_id: "tenant_a", project_id: "project_b" },
    ]) {
      await assert.rejects(
        loader.load({
          asset_id: ASSET_ID,
          required_right: "video.generate.reference",
          ...request,
        }),
        MediaAssetUnavailableError
      );
    }
  });

  it("denies revoked or disallowed reference use before storage access", async () => {
    const repository = new InMemoryMediaAssetRepository();
    await repository.create(asset({ allowed_uses: ["video.generate.reference"] }));
    let downloads = 0;
    const loader = new RightsAwareMediaReferenceLoader({
      repository,
      storage: { async download() { downloads += 1; } },
      delivery: "bytes",
    });
    await assert.rejects(
      loader.load({
        asset_id: ASSET_ID,
        tenant_id: "tenant_a",
        project_id: "project_a",
        required_right: "image.generate.reference",
      }),
      MediaAssetUnavailableError
    );
    assert.equal(downloads, 0);
  });

  it("derives storage keys from trusted ownership and never from a requested location", () => {
    const first = objectKey({
      tenantId: "tenant_a",
      projectId: "project_a",
      mediaKind: "image",
      assetId: ASSET_ID,
      extension: "png",
    });
    const second = objectKey({
      tenantId: "tenant_a",
      projectId: "project_b",
      mediaKind: "image",
      assetId: ASSET_ID,
      extension: "png",
    });
    assert.match(first, /^assets\/[a-f0-9]{64}\/[a-f0-9]{64}\/image\//);
    assert.notEqual(first, second);
    assert.doesNotMatch(first, /attacker|https?:|gs:\/\//);
  });
});

describe("Image reference-rights boundary", () => {
  it("denies a cross-project reference before any OpenAI request", async () => {
    const repository = new InMemoryMediaAssetRepository();
    await repository.create(asset());
    let providerCalls = 0;
    const provider = new OpenAIImageProvider({
      apiKey: "test-key",
      assetStore: { async save() { throw new Error("must not store"); } },
      referenceAssetLoader: new RightsAwareMediaReferenceLoader({
        repository,
        storage: { async download() { throw new Error("must not download"); } },
        delivery: "bytes",
      }),
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error("must not call provider");
      },
    });
    const service = new ImageGenerationService({
      repository: new InMemoryImageGenerationRepository(),
      provider,
      brandBrainRepository: new InMemoryBrandBrainRepository(),
    });
    await assert.rejects(
      service.generate({
        execution_id: "execution_cross_project_001",
        generation_id: "generation_cross_project_001",
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: "project_b",
        topic: "Safe media",
        image_purpose: "reference rights test",
        aspect_ratio: "1:1",
        reference_assets: [{ asset_id: ASSET_ID }],
      }, {
        job: {
          job_id: JOB_ID,
          tenant_id: "tenant_a",
          project_id: "project_b",
          actor_correlation: {
            kind: "customer",
            auth_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        },
      }),
      ImageProviderRejectedError
    );
    assert.equal(providerCalls, 0);
  });

  it("strips arbitrary locations and supplies only job-derived ownership to the provider", async () => {
    let providerRequest;
    const service = new ImageGenerationService({
      repository: new InMemoryImageGenerationRepository(),
      provider: { async generate(request) {
        providerRequest = request;
        return {
          provider: "fixture",
          provider_job_id: "provider_job_001",
          asset: {
            location: "gs://bizgenie-staging-media/generated.png",
            mime_type: "image/png",
            width: 1024,
            height: 1024,
          },
        };
      } },
      brandBrainRepository: new InMemoryBrandBrainRepository(),
    });
    await service.generate({
      execution_id: "execution_image_001",
      generation_id: "generation_image_001",
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      project_id: "project_a",
      topic: "Safe media",
      image_purpose: "reference rights test",
      aspect_ratio: "1:1",
      reference_assets: [{
        asset_id: ASSET_ID,
        location: "https://attacker.example/asset.png",
        mime_type: "image/png",
      }],
    }, {
      job: {
        job_id: JOB_ID,
        tenant_id: "tenant_a",
        project_id: "project_a",
        actor_correlation: {
          kind: "customer",
          auth_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      },
    });

    assert.deepEqual(providerRequest.reference_assets, [{
      asset_id: ASSET_ID,
      tenant_id: "tenant_a",
      project_id: "project_a",
      requested_by_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      required_right: "image.generate.reference",
      generation_id: "generation_image_001",
      execution_id: "execution_image_001",
    }]);
    assert.doesNotMatch(JSON.stringify(providerRequest.reference_assets), /attacker\.example/);
  });
});
