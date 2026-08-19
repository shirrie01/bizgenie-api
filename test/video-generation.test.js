const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const {
  InMemoryVideoGenerationRepository,
  VideoGenerationRequestSchema,
  VideoGenerationService,
  VideoProviderTimeoutError,
  VideoProviderUnavailableError,
} = require("../src/video-generation");

const ADMIN_KEY = "video-generation-test-admin-key";

function validRequest(overrides = {}) {
  return {
    execution_id: "execution_video_001",
    generation_id: "generation_video_001",
    transaction_correlation_id: "transaction_001",
    user_id: "user_001",
    project_id: "project_001",
    brand_id: "brand_001",
    campaign_id: "campaign_001",
    content_item_id: "content_001",
    topic: "Launch a new premium drink",
    platform: "TikTok",
    audience: "Adults interested in premium soft drinks",
    goal: "Awareness",
    intent_stage: "awareness",
    product_service_context: "Use only approved product claims.",
    video_purpose: "Short product launch film",
    quality: "normal",
    aspect_ratio: "9:16",
    duration_seconds: 8,
    additional_context: "Warm studio lighting.",
    ...overrides,
  };
}

function submission(jobId = "provider-operation-001") {
  return {
    provider: "mock-google-vertex-ai",
    provider_job_id: jobId,
    provider_model: "mock-veo-model",
    cost_evidence: {
      provider_operation_id: jobId,
      provider_model: "mock-veo-model",
      transaction_correlation_id: "transaction_001",
    },
  };
}

function completedPoll(jobId = "provider-operation-001") {
  return {
    ...submission(jobId),
    status: "completed",
    asset_source: {
      location: "gs://provider-output/generated.mp4",
      mime_type: "video/mp4",
      width: 720,
      height: 1280,
      duration_seconds: 8,
      container: "mp4",
    },
  };
}

function fakeProvider({ pollResults = [completedPoll()], submitResult = submission() } = {}) {
  const state = { submitCalls: [], pollCalls: [], pollResults: [...pollResults] };
  return {
    state,
    provider: {
      async submit(value) { state.submitCalls.push(value); if (submitResult instanceof Error) throw submitResult; return submitResult; },
      async poll(value) { state.pollCalls.push(value); const next = state.pollResults.shift(); if (next instanceof Error) throw next; return next; },
    },
  };
}

function durableAsset(source, overrides = {}) {
  return { ...source, location: "s3://bizgenie-assets/video/generated.mp4", byte_size: 1024, ...overrides };
}

function harness(options = {}) {
  const repository = options.repository || new InMemoryVideoGenerationRepository();
  const fake = options.fake || fakeProvider();
  const assetState = { calls: 0 };
  const assetStore = options.assetStore || {
    async save({ source }) { assetState.calls += 1; return durableAsset(source); },
  };
  const referenceState = { calls: [] };
  const referenceAssetLoader = options.referenceAssetLoader || {
    async load(value) {
      referenceState.calls.push(value);
      return {
        asset_id: value.asset_id,
        location: `gs://bizgenie-approved-video-inputs/${value.asset_id}.png`,
        mime_type: "image/png",
      };
    },
  };
  const service = new VideoGenerationService({
    repository,
    provider: fake.provider,
    assetStore,
    referenceAssetLoader,
    brandBrainRepository: new InMemoryBrandBrainRepository(),
  });
  return { repository, fake, assetState, assetStore, referenceState, referenceAssetLoader, service };
}

function admin(agent) { return agent.set("x-admin-key", ADMIN_KEY); }

describe("video generation request contract", () => {
  it("accepts bounded Normal/Premium requests and rejects conflicting image modes", () => {
    assert.equal(VideoGenerationRequestSchema.parse(validRequest()).quality, "normal");
    assert.equal(VideoGenerationRequestSchema.parse(validRequest({ quality: "premium" })).quality, "premium");
    const invalid = VideoGenerationRequestSchema.safeParse(validRequest({
      input_image: { asset_id: "start", location: "gs://input/start.png", mime_type: "image/png" },
      reference_assets: [{ asset_id: "subject", location: "gs://input/subject.png", mime_type: "image/png" }],
    }));
    assert.equal(invalid.success, false);
    assert.equal(VideoGenerationRequestSchema.safeParse(validRequest({ duration_seconds: 6, reference_assets: [{ asset_id: "subject", location: "gs://input/subject.png", mime_type: "image/png" }] })).success, false);
    assert.equal(VideoGenerationRequestSchema.safeParse(validRequest({ input_image: { asset_id: "approved_start" } })).success, true);
    assert.equal(VideoGenerationRequestSchema.safeParse(validRequest({ generateAudio: true })).success, false);
  });
});

describe("video reference asset authority", () => {
  it("resolves an input identity with project and rights context and ignores caller-controlled locations", async () => {
    const calls = [];
    const fake = fakeProvider({ pollResults: [] });
    const test = harness({
      fake,
      referenceAssetLoader: {
        async load(value) {
          calls.push(value);
          return {
            asset_id: value.asset_id,
            location: "gs://bizgenie-approved-video-inputs/start.png",
            mime_type: "image/png",
          };
        },
      },
    });
    await test.service.submit(validRequest({
      input_image: {
        asset_id: "approved_start",
        location: "gs://attacker-controlled-bucket/private.png",
        mime_type: "image/jpeg",
      },
    }));
    assert.deepEqual(calls, [{
      asset_id: "approved_start",
      project_id: "project_001",
      requested_by_user_id: "user_001",
      required_right: "video.generate.reference",
      usage: "input_image",
      generation_id: "generation_video_001",
      execution_id: "execution_video_001",
    }]);
    assert.deepEqual(fake.state.submitCalls[0].input_image, {
      asset_id: "approved_start",
      location: "gs://bizgenie-approved-video-inputs/start.png",
      mime_type: "image/png",
    });
    assert.doesNotMatch(JSON.stringify(fake.state.submitCalls[0]), /attacker-controlled/);
  });

  it("resolves every reference identity server-side and never forwards HTTP or S3 caller locations", async () => {
    const calls = [];
    const fake = fakeProvider({ pollResults: [] });
    const test = harness({
      fake,
      referenceAssetLoader: {
        async load(value) {
          calls.push(value);
          return {
            asset_id: value.asset_id,
            location: `gs://bizgenie-approved-video-inputs/${value.asset_id}.jpg`,
            mime_type: "image/jpeg",
          };
        },
      },
    });
    await test.service.submit(validRequest({
      reference_assets: [
        { asset_id: "approved_product", location: "https://evil.example/product.jpg", mime_type: "image/png" },
        { asset_id: "approved_person", location: "s3://caller-bucket/person.jpg", mime_type: "image/png" },
      ],
    }));
    assert.equal(calls.length, 2);
    assert.equal(calls.every((value) => value.project_id === "project_001" && value.required_right === "video.generate.reference" && value.usage === "reference_asset"), true);
    assert.equal(calls.every((value) => !Object.hasOwn(value, "location") && !Object.hasOwn(value, "mime_type")), true);
    assert.deepEqual(fake.state.submitCalls[0].reference_assets.map((asset) => asset.location), [
      "gs://bizgenie-approved-video-inputs/approved_product.jpg",
      "gs://bizgenie-approved-video-inputs/approved_person.jpg",
    ]);
    assert.doesNotMatch(JSON.stringify(fake.state.submitCalls[0]), /evil\.example|caller-bucket/);
  });

  it("fails closed before provider submission when the rights-aware loader is not configured", async () => {
    process.env.ADMIN_KEY = ADMIN_KEY;
    const fake = fakeProvider({ pollResults: [] });
    const app = createApp({
      videoProvider: fake.provider,
      videoAssetStore: { async save({ source }) { return durableAsset(source); } },
      logger: { info() {}, warn() {}, error() {} },
    });
    const response = await admin(request(app).post("/generate-video").send(validRequest({
      input_image: {
        asset_id: "approved_start",
        location: "gs://attacker-controlled-bucket/private.png",
        mime_type: "image/png",
      },
    })));
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "VIDEO_REFERENCE_ASSET_UNAVAILABLE");
    assert.equal(fake.state.submitCalls.length, 0);
  });

  it("rejects a mismatched or non-GCS loader result before provider submission", async () => {
    const fake = fakeProvider({ pollResults: [] });
    const test = harness({
      fake,
      referenceAssetLoader: {
        async load() {
          return {
            asset_id: "different_asset",
            location: "https://untrusted.example/reference.png",
            mime_type: "image/png",
          };
        },
      },
    });
    await assert.rejects(
      test.service.submit(validRequest({ input_image: { asset_id: "approved_start" } })),
      (error) => error.code === "VIDEO_REFERENCE_ASSET_UNAVAILABLE"
    );
    assert.equal(fake.state.submitCalls.length, 0);
  });
});

describe("video asynchronous orchestration", () => {
  it("submits once, polls the accepted operation, and completes only after durable persistence", async () => {
    const fake = fakeProvider({ pollResults: [{ ...submission(), status: "processing" }, completedPoll()] });
    const test = harness({ fake });
    const submitted = await test.service.submit(validRequest());
    assert.equal(submitted.status, "submitted");
    assert.equal(test.fake.state.submitCalls.length, 1);
    assert.equal((await test.service.poll(submitted.generation_id)).status, "processing");
    const completed = await test.service.poll(submitted.generation_id);
    assert.equal(completed.status, "completed");
    assert.equal(completed.approval_status, "pending");
    assert.equal(completed.asset.location, "s3://bizgenie-assets/video/generated.mp4");
    assert.equal(test.fake.state.submitCalls.length, 1);
    assert.equal(test.fake.state.pollCalls.length, 2);
    assert.equal(test.assetState.calls, 1);
  });

  it("retries transient polling without another billable submission", async () => {
    const fake = fakeProvider({ pollResults: [new VideoProviderUnavailableError(), completedPoll()] });
    const test = harness({ fake });
    await test.service.submit(validRequest());
    await assert.rejects(test.service.poll("generation_video_001"), (error) => error.code === "VIDEO_PROVIDER_UNAVAILABLE");
    assert.equal(test.repository.getByGenerationId("generation_video_001").status, "processing");
    assert.equal((await test.service.poll("generation_video_001")).status, "completed");
    assert.equal(test.fake.state.submitCalls.length, 1);
  });

  it("re-polls a completed provider operation after asset persistence failure without resubmitting", async () => {
    const fake = fakeProvider({ pollResults: [completedPoll(), completedPoll()] });
    let persistenceCalls = 0;
    const test = harness({
      fake,
      assetStore: {
        async save({ source }) {
          persistenceCalls += 1;
          if (persistenceCalls === 1) throw new Error("private storage detail");
          return durableAsset(source);
        },
      },
    });
    await test.service.submit(validRequest());
    await assert.rejects(test.service.poll("generation_video_001"), (error) => error.code === "VIDEO_ASSET_PERSISTENCE_UNAVAILABLE" && !/private/.test(error.message));
    assert.equal(test.repository.getByGenerationId("generation_video_001").status, "processing");
    assert.equal((await test.service.poll("generation_video_001")).status, "completed");
    assert.equal(test.fake.state.submitCalls.length, 1);
    assert.equal(persistenceCalls, 2);
  });

  it("records provider failure without a false asset and never resurrects terminal jobs", async () => {
    const failedPoll = { ...submission(), status: "failed", error_code: "VIDEO_PROVIDER_FAILED" };
    const fake = fakeProvider({ pollResults: [failedPoll, completedPoll()] });
    const test = harness({ fake });
    await test.service.submit(validRequest());
    await assert.rejects(test.service.poll("generation_video_001"), (error) => error.code === "VIDEO_PROVIDER_FAILED");
    const failed = test.repository.getByGenerationId("generation_video_001");
    assert.equal(failed.status, "failed");
    assert.equal(failed.asset, undefined);
    assert.equal((await test.service.poll("generation_video_001")).status, "failed");
    assert.equal(test.fake.state.pollCalls.length, 1);
  });

  it("preserves regeneration lineage and immutable history", async () => {
    const fake = fakeProvider({
      submitResult: submission("provider-operation-child"),
      pollResults: [],
    });
    const repository = new InMemoryVideoGenerationRepository();
    const parentTest = harness({ repository, fake: fakeProvider({ submitResult: submission("provider-operation-parent"), pollResults: [] }) });
    await parentTest.service.submit(validRequest({ generation_id: "generation_parent" }));
    const childTest = harness({ repository, fake });
    await childTest.service.submit(validRequest({ generation_id: "generation_child", parent_generation_id: "generation_parent" }));
    assert.equal(repository.getByGenerationId("generation_child").parent_generation_id, "generation_parent");
    assert.equal(repository.getByGenerationId("generation_parent").parent_generation_id, undefined);
  });

  it("keeps polling timeout non-terminal and sanitized", async () => {
    const fake = fakeProvider({ pollResults: [new VideoProviderTimeoutError()] });
    const test = harness({ fake });
    await test.service.submit(validRequest());
    await assert.rejects(test.service.poll("generation_video_001"), (error) => error.code === "VIDEO_PROVIDER_TIMEOUT");
    assert.equal(test.repository.getByGenerationId("generation_video_001").status, "processing");
  });

  it("never retries or duplicates a submission whose outcome may be unknown", async () => {
    const fake = fakeProvider({ submitResult: new VideoProviderTimeoutError(), pollResults: [] });
    const test = harness({ fake });
    await assert.rejects(test.service.submit(validRequest()), (error) => error.code === "VIDEO_PROVIDER_TIMEOUT");
    const failed = test.repository.getByGenerationId("generation_video_001");
    assert.equal(failed.status, "failed");
    assert.equal(failed.asset, undefined);
    await assert.rejects(test.service.submit(validRequest()), (error) => error.code === "VIDEO_GENERATION_EXISTS");
    assert.equal(test.fake.state.submitCalls.length, 1);
  });

  it("keeps a malformed poll response retryable without resubmission", async () => {
    const fake = fakeProvider({ pollResults: [{ provider: "private-invalid-payload" }, completedPoll()] });
    const test = harness({ fake });
    await test.service.submit(validRequest());
    await assert.rejects(test.service.poll("generation_video_001"), (error) => error.code === "VIDEO_PROVIDER_RESPONSE_INVALID");
    assert.equal(test.repository.getByGenerationId("generation_video_001").status, "processing");
    assert.equal((await test.service.poll("generation_video_001")).status, "completed");
    assert.equal(test.fake.state.submitCalls.length, 1);
  });
});

describe("generate-video endpoint and non-regression", () => {
  it("preserves admin authentication and hides provider/model/operation details", async () => {
    process.env.ADMIN_KEY = ADMIN_KEY;
    const fake = fakeProvider();
    const app = createApp({ videoProvider: fake.provider, videoAssetStore: { async save({ source }) { return durableAsset(source); } }, logger: { info() {}, warn() {}, error() {} } });
    const unauthorised = await request(app).post("/generate-video").send(validRequest());
    assert.equal(unauthorised.status, 403);
    const submitted = await admin(request(app).post("/generate-video").send(validRequest()));
    assert.equal(submitted.status, 202);
    assert.equal(submitted.body.status, "submitted");
    assert.equal(submitted.body.video.asset, null);
    assert.equal(Object.hasOwn(submitted.body.video, "provider"), false);
    assert.doesNotMatch(JSON.stringify(submitted.body), /mock-veo-model|provider-operation/);
  });

  it("supports explicit status reads and polling to completion", async () => {
    process.env.ADMIN_KEY = ADMIN_KEY;
    const fake = fakeProvider();
    const app = createApp({ videoProvider: fake.provider, videoAssetStore: { async save({ source }) { return durableAsset(source); } }, logger: { info() {}, warn() {}, error() {} } });
    await admin(request(app).post("/generate-video").send(validRequest()));
    const current = await admin(request(app).get("/generate-video/generation_video_001"));
    assert.equal(current.status, 202);
    assert.equal(current.body.status, "submitted");
    const completed = await admin(request(app).post("/generate-video/generation_video_001/poll"));
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, "completed");
    assert.equal(completed.body.video.asset.mime_type, "video/mp4");
  });

  it("returns structured validation, malformed JSON, and explicit unconfigured-provider errors", async () => {
    process.env.ADMIN_KEY = ADMIN_KEY;
    const app = createApp({ logger: { info() {}, warn() {}, error() {} } });
    const invalid = await admin(request(app).post("/generate-video").send({ generation_id: "bad id" }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
    const malformed = await request(app).post("/generate-video").set("x-admin-key", ADMIN_KEY).set("content-type", "application/json").send('{"generation_id":');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.details[0].code, "invalid_json");
    const unconfigured = await admin(request(app).post("/generate-video").send(validRequest()));
    assert.equal(unconfigured.status, 503);
    assert.equal(unconfigured.body.error.code, "VIDEO_PROVIDER_SELECTION_REQUIRED");
  });

  it("leaves generate-script and generate-image contracts unchanged", async () => {
    process.env.ADMIN_KEY = ADMIN_KEY;
    const app = createApp({ logger: { info() {}, warn() {}, error() {} } });
    const script = await admin(request(app).post("/generate-script").send({}));
    assert.deepEqual(script.body, { status: "failed", error: "Missing required fields", script_body: "" });
    const image = await admin(request(app).post("/generate-image").send({ generation_id: "bad id" }));
    assert.equal(image.status, 400);
    assert.equal(image.body.error.code, "VALIDATION_ERROR");
  });
});
