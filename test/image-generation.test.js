const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");
const {
  InMemoryBrandBrainRepository,
} = require("../src/brand-brain");
const {
  ImageGenerationProvider,
  ImageGenerationRequestSchema,
  ImageGenerationService,
  ImageProviderRejectedError,
  InMemoryImageGenerationRepository,
  UnconfiguredImageGenerationProvider,
  compileImagePrompt,
  imageGenerationStates,
  normalizeProviderResult,
} = require("../src/image-generation");
const { createApp } = require("../index");

const ADMIN_KEY = "image-generation-test-key";

function validRequest(overrides = {}) {
  return {
    execution_id: "execution_image_001",
    generation_id: "image_generation_001",
    user_id: "user_001",
    project_id: "project_001",
    brand_id: "brand_001",
    campaign_id: "campaign_001",
    content_item_id: "content_001",
    topic: "Launch a practical planning workflow",
    platform: "LinkedIn",
    audience: "Founder-led small businesses",
    goal: "Build qualified awareness",
    intent_stage: "cold",
    product_service_context: "A guided content planning workflow.",
    image_purpose: "Campaign hero image",
    aspect_ratio: "16:9",
    additional_context: "Use a calm editorial composition.",
    reference_assets: [
      {
        asset_id: "logo_001",
        location: "https://assets.example.test/logo.png",
        mime_type: "image/png",
        width: 1200,
        height: 1200,
      },
    ],
    ...overrides,
  };
}

function brandRecord() {
  return {
    brand_id: "brand_001",
    project_id: "project_001",
    name: "Test Brand",
    identity: { positioning: "A precise planning partner." },
    commercial: {
      approved_claims: ["Uses approved brand context"],
      prohibited_claims: ["Guaranteed revenue"],
    },
    visual: {
      colours: ["Midnight blue"],
      photography_style: "Natural editorial workplace photography.",
    },
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-08-15T12:00:00.000Z",
      updated_at: "2026-08-15T12:00:00.000Z",
    },
  };
}

function normalizedResult() {
  return {
    provider: "test-image-provider",
    provider_job_id: "provider_job_001",
    asset: {
      location: "https://assets.example.test/generated/image-001.webp",
      mime_type: "image/webp",
      width: 1600,
      height: 900,
    },
  };
}

class SuccessfulProvider extends ImageGenerationProvider {
  constructor() {
    super();
    this.requests = [];
  }

  async generate(value) {
    this.requests.push(structuredClone(value));
    return normalizedResult();
  }
}

class TrackingRepository extends InMemoryImageGenerationRepository {
  constructor() {
    super();
    this.states = [];
  }

  create(record) {
    const created = super.create(record);
    this.states.push(created.status);
    return created;
  }

  update(generationId, patch) {
    const updated = super.update(generationId, patch);
    this.states.push(updated.status);
    return updated;
  }
}

function brandRepository() {
  const repository = new InMemoryBrandBrainRepository();
  repository.upsert(brandRecord());
  return repository;
}

function clock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 15, 12, 0, tick++));
}

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

function admin(client) {
  return client.set("x-admin-key", ADMIN_KEY);
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("image generation request and prompt contracts", () => {
  it("validates the bounded provider-neutral request contract", () => {
    const parsed = ImageGenerationRequestSchema.parse(validRequest());
    assert.equal(parsed.generation_id, "image_generation_001");
    assert.equal(parsed.reference_assets.length, 1);
    assert.deepEqual(imageGenerationStates, [
      "queued",
      "processing",
      "completed",
      "failed",
    ]);

    assert.equal(
      ImageGenerationRequestSchema.safeParse(
        validRequest({ aspect_ratio: "provider-wide", secret_key: "no" })
      ).success,
      false
    );
  });

  it("compiles supplied campaign context and explicit anti-fabrication rules", () => {
    const prompt = compileImagePrompt(validRequest(), {
      brandContext: [
        "[BRAND BRAIN]",
        "Brand: Test Brand",
        "Prohibited claims:",
        "- Guaranteed revenue",
      ].join("\n"),
    });

    assert.match(prompt, /\[BRAND BRAIN\]/);
    assert.match(prompt, /Topic: Launch a practical planning workflow/);
    assert.match(prompt, /Audience: Founder-led small businesses/);
    assert.match(prompt, /Image purpose: Campaign hero image/);
    assert.match(prompt, /Reference asset logo_001 \(image\/png\)/);
    assert.match(prompt, /Do not fabricate products, prices, stockists/);
    assert.doesNotMatch(prompt, /assets\.example\.test/);
  });
});

describe("image provider abstraction", () => {
  it("normalizes only the stable provider result contract", () => {
    assert.deepEqual(normalizeProviderResult(normalizedResult()), normalizedResult());
    assert.throws(
      () => normalizeProviderResult({ providerPayload: { binary: "raw" } }),
      (error) => error.code === "IMAGE_PROVIDER_RESPONSE_INVALID"
    );
  });

  it("keeps provider selection explicit when no provider is approved", async () => {
    await assert.rejects(
      new UnconfiguredImageGenerationProvider().generate({}),
      (error) => error.code === "IMAGE_PROVIDER_SELECTION_REQUIRED"
    );
  });
});

describe("image generation orchestration and media metadata", () => {
  it("moves queued to processing to completed and returns normalized metadata", async () => {
    const repository = new TrackingRepository();
    const provider = new SuccessfulProvider();
    const service = new ImageGenerationService({
      repository,
      provider,
      brandBrainRepository: brandRepository(),
      now: clock(),
    });

    const record = await service.generate(validRequest());

    assert.deepEqual(repository.states, ["queued", "processing", "completed"]);
    assert.equal(record.status, "completed");
    assert.equal(record.approval_status, "pending");
    assert.equal(record.provider, "test-image-provider");
    assert.equal(record.provider_job_id, "provider_job_001");
    assert.deepEqual(record.asset, normalizedResult().asset);
    assert.match(provider.requests[0].prompt, /Natural editorial workplace/);
    assert.match(provider.requests[0].prompt, /Guaranteed revenue/);
    assert.equal(provider.requests[0].aspect_ratio, "16:9");
    assert.equal(provider.requests[0].reference_assets[0].asset_id, "logo_001");
    assert.equal(provider.requests[0].metadata.project_id, "project_001");
  });

  it("records provider failure without a false successful media asset", async () => {
    class RejectingProvider extends ImageGenerationProvider {
      async generate() {
        throw new ImageProviderRejectedError();
      }
    }
    const repository = new TrackingRepository();
    const service = new ImageGenerationService({
      repository,
      provider: new RejectingProvider(),
      brandBrainRepository: brandRepository(),
      now: clock(),
    });

    await assert.rejects(
      service.generate(validRequest()),
      (error) => error.code === "IMAGE_PROVIDER_REJECTED"
    );
    const record = repository.getByGenerationId("image_generation_001");
    assert.deepEqual(repository.states, ["queued", "processing", "failed"]);
    assert.equal(record.status, "failed");
    assert.equal(record.error_code, "IMAGE_PROVIDER_REJECTED");
    assert.equal(record.asset, undefined);
    assert.equal(record.approval_status, undefined);
  });

  it("does not send Brand Brain context across project boundaries", async () => {
    const provider = new SuccessfulProvider();
    const service = new ImageGenerationService({
      repository: new InMemoryImageGenerationRepository(),
      provider,
      brandBrainRepository: brandRepository(),
      now: clock(),
    });

    await service.generate(
      validRequest({
        project_id: "project_002",
        generation_id: "image_generation_project_002",
      })
    );

    assert.doesNotMatch(provider.requests[0].prompt, /Test Brand/);
    assert.doesNotMatch(provider.requests[0].prompt, /Midnight blue/);
    assert.doesNotMatch(provider.requests[0].prompt, /Guaranteed revenue/);
    assert.match(
      provider.requests[0].prompt,
      /No approved Brand Brain context was resolved/
    );
  });

  it("does not expose raw provider diagnostics", async () => {
    class RawFailureProvider extends ImageGenerationProvider {
      async generate() {
        throw new Error("secret provider credential and internal trace");
      }
    }
    const repository = new InMemoryImageGenerationRepository();
    const service = new ImageGenerationService({
      repository,
      provider: new RawFailureProvider(),
      brandBrainRepository: brandRepository(),
      now: clock(),
    });

    await assert.rejects(service.generate(validRequest()), (error) => {
      assert.equal(error.code, "IMAGE_PROVIDER_UNAVAILABLE");
      assert.doesNotMatch(error.message, /secret|credential|trace/);
      return true;
    });
    assert.equal(
      repository.getByGenerationId("image_generation_001").status,
      "failed"
    );
  });

  it("requires a new identity for regeneration and preserves history", async () => {
    const repository = new InMemoryImageGenerationRepository();
    const provider = new SuccessfulProvider();
    const service = new ImageGenerationService({
      repository,
      provider,
      brandBrainRepository: brandRepository(),
      now: clock(),
    });

    const first = await service.generate(validRequest());
    await assert.rejects(
      service.generate(validRequest({ additional_context: "Try again." })),
      (error) => error.code === "IMAGE_GENERATION_EXISTS"
    );
    assert.deepEqual(
      repository.getByGenerationId("image_generation_001"),
      first
    );

    const variation = await service.generate(
      validRequest({
        generation_id: "image_generation_002",
        parent_generation_id: "image_generation_001",
      })
    );
    assert.equal(variation.parent_generation_id, "image_generation_001");
  });
});

describe("generate-image endpoint", () => {
  it("preserves existing authentication and returns structured validation", async () => {
    const app = createApp({ logger: silentLogger() });
    const unauthorised = await request(app)
      .post("/generate-image")
      .send(validRequest());
    assert.equal(unauthorised.status, 403);
    assert.deepEqual(unauthorised.body, { error: "Forbidden" });

    const invalid = await admin(
      request(app).post("/generate-image").send({ generation_id: "bad id" })
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.status, "failed");
    assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
    assert.equal(invalid.body.media, null);
  });

  it("returns a normalized successful result from an injected provider", async () => {
    const repository = new InMemoryImageGenerationRepository();
    const app = createApp({
      brandBrainRepository: brandRepository(),
      imageGenerationRepository: repository,
      imageProvider: new SuccessfulProvider(),
      logger: silentLogger(),
    });

    const response = await admin(
      request(app).post("/generate-image").send(validRequest())
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "completed");
    assert.equal(response.body.generation_id, "image_generation_001");
    assert.equal(response.body.media.provider, "test-image-provider");
    assert.deepEqual(response.body.media.asset, normalizedResult().asset);
    assert.equal(
      repository.getByGenerationId("image_generation_001").status,
      "completed"
    );
  });

  it("returns the explicit provider-selection blocker by default", async () => {
    const repository = new InMemoryImageGenerationRepository();
    const app = createApp({
      imageGenerationRepository: repository,
      logger: silentLogger(),
    });
    const response = await admin(
      request(app)
        .post("/generate-image")
        .send(validRequest({ brand_id: undefined }))
    );

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "IMAGE_PROVIDER_SELECTION_REQUIRED");
    assert.equal(response.body.media, null);
    const stored = repository.getByGenerationId("image_generation_001");
    assert.equal(stored.status, "failed");
    assert.equal(stored.asset, undefined);
  });

  it("returns structured malformed JSON without changing other route contracts", async () => {
    const app = createApp({ logger: silentLogger() });
    const malformed = await admin(
      request(app)
        .post("/generate-image")
        .set("content-type", "application/json")
        .send('{"generation_id":')
    );
    assert.equal(malformed.status, 400);
    assert.deepEqual(malformed.body, {
      status: "failed",
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            path: "",
            code: "invalid_json",
            message: "Malformed JSON request body",
          },
        ],
      },
      media: null,
    });

    const script = await admin(
      request(
        createApp({
          scriptGenerator: async () => ({
            text: "Existing text output",
            metadata: { provider: "test" },
          }),
          logger: silentLogger(),
        })
      )
        .post("/generate-script")
        .send({
          execution_id: "execution_text_001",
          user_id: "user_001",
          project_id: "project_001",
          compiled_prompt: "Preserve the existing text contract.",
        })
    );
    assert.equal(script.status, 200);
    assert.deepEqual(script.body, {
      status: "completed",
      execution_id: "execution_text_001",
      script_body: "Existing text output",
    });
  });
});
