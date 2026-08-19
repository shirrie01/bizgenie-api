const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  GOOGLE_VEO_NORMAL_MODEL,
  GOOGLE_VEO_PREMIUM_MODEL,
  GOOGLE_VEO_NATIVE_AUDIO,
  GoogleVertexVeoProvider,
  VideoProviderResponseError,
  VideoProviderTimeoutError,
} = require("../src/video-generation");

const projectId = "bizgenie-video-test";
const outputStorageUri = "gs://bizgenie-test/video-output/";

function operation(model, id = "operation-001") {
  return `projects/${projectId}/locations/us-central1/publishers/google/models/${model}/operations/${id}`;
}

function providerWith(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    provider: new GoogleVertexVeoProvider({
      projectId,
      outputStorageUri,
      transport: {
        async post(url, body) {
          calls.push({ url, body });
          const next = queue.shift();
          if (next instanceof Error) throw next;
          return next;
        },
      },
    }),
  };
}

function submitRequest(overrides = {}) {
  return {
    prompt: "A premium product moves through warm studio light.",
    quality: "normal",
    aspect_ratio: "16:9",
    duration_seconds: 6,
    reference_assets: [],
    metadata: { transaction_correlation_id: "txn_001" },
    ...overrides,
  };
}

describe("Google Vertex Veo submission mapping", () => {
  it("maps Normal to the approved fast model without native audio", async () => {
    const op = operation(GOOGLE_VEO_NORMAL_MODEL);
    const test = providerWith([{ payload: { name: op }, requestId: "request-001" }]);
    const result = await test.provider.submit(submitRequest());
    assert.equal(result.provider_model, GOOGLE_VEO_NORMAL_MODEL);
    assert.equal(result.provider_job_id, op);
    assert.equal(result.cost_evidence.transaction_correlation_id, "txn_001");
    assert.match(test.calls[0].url, new RegExp(`${GOOGLE_VEO_NORMAL_MODEL}:predictLongRunning$`));
    assert.deepEqual(test.calls[0].body.instances, [{ prompt: submitRequest().prompt }]);
    assert.deepEqual(test.calls[0].body.parameters, {
      storageUri: outputStorageUri,
      sampleCount: 1,
      aspectRatio: "16:9",
      durationSeconds: 6,
      resolution: "720p",
      generateAudio: false,
      task: "textToVideo",
    });
    assert.equal(GOOGLE_VEO_NATIVE_AUDIO, false);
  });

  it("maps Premium to the approved quality model", async () => {
    const op = operation(GOOGLE_VEO_PREMIUM_MODEL);
    const test = providerWith([{ name: op }]);
    const result = await test.provider.submit(submitRequest({ quality: "premium" }));
    assert.equal(result.provider_model, GOOGLE_VEO_PREMIUM_MODEL);
    assert.match(test.calls[0].url, new RegExp(`${GOOGLE_VEO_PREMIUM_MODEL}:predictLongRunning$`));
    assert.equal(test.calls[0].body.parameters.generateAudio, false);
  });

  it("maps a starting image to image-to-video", async () => {
    const test = providerWith([{ name: operation(GOOGLE_VEO_NORMAL_MODEL) }]);
    await test.provider.submit(submitRequest({
      input_image: { asset_id: "image_001", location: "gs://bizgenie-test/input/start.png", mime_type: "image/png" },
    }));
    assert.deepEqual(test.calls[0].body.instances[0].image, {
      gcsUri: "gs://bizgenie-test/input/start.png",
      mimeType: "image/png",
    });
    assert.equal(test.calls[0].body.parameters.task, "imageToVideo");
  });

  it("maps supported subject references and locks them to eight seconds", async () => {
    const test = providerWith([{ name: operation(GOOGLE_VEO_NORMAL_MODEL) }]);
    await test.provider.submit(submitRequest({
      duration_seconds: 8,
      reference_assets: [
        { asset_id: "product_001", location: "gs://bizgenie-test/input/product.jpg", mime_type: "image/jpeg" },
      ],
    }));
    assert.deepEqual(test.calls[0].body.instances[0].referenceImages, [{
      image: { gcsUri: "gs://bizgenie-test/input/product.jpg", mimeType: "image/jpeg" },
      referenceType: "asset",
    }]);
    assert.equal(test.calls[0].body.parameters.task, "referenceToVideo");
  });
});

describe("Google Vertex Veo operation polling", () => {
  it("normalizes processing and completed long-running operations", async () => {
    const op = operation(GOOGLE_VEO_NORMAL_MODEL);
    const test = providerWith([
      { name: op, done: false },
      { name: op, done: true, response: { raiMediaFilteredCount: 0, videos: [{ gcsUri: "gs://bizgenie-test/video-output/result.mp4", mimeType: "video/mp4" }] } },
    ]);
    const request = { provider_job_id: op, quality: "normal", aspect_ratio: "9:16", duration_seconds: 8 };
    assert.equal((await test.provider.poll(request)).status, "processing");
    const completed = await test.provider.poll(request);
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.asset_source, {
      location: "gs://bizgenie-test/video-output/result.mp4",
      mime_type: "video/mp4",
      width: 720,
      height: 1280,
      duration_seconds: 8,
      container: "mp4",
    });
    assert.equal(test.calls[0].body.operationName, op);
    assert.match(test.calls[0].url, /:fetchPredictOperation$/);
  });

  it("normalizes a provider terminal failure without exposing diagnostics", async () => {
    const op = operation(GOOGLE_VEO_NORMAL_MODEL);
    const test = providerWith([{ name: op, done: true, error: { code: 13, message: "private provider trace" } }]);
    const result = await test.provider.poll({ provider_job_id: op, quality: "normal", aspect_ratio: "16:9", duration_seconds: 4 });
    assert.deepEqual(result.error_code, "VIDEO_PROVIDER_FAILED");
    assert.doesNotMatch(JSON.stringify(result), /private provider trace/);
  });

  it("preserves a sanitized timeout and rejects malformed success", async () => {
    const op = operation(GOOGLE_VEO_NORMAL_MODEL);
    const timedOut = providerWith([new VideoProviderTimeoutError()]);
    await assert.rejects(
      timedOut.provider.poll({ provider_job_id: op, quality: "normal", aspect_ratio: "16:9", duration_seconds: 4 }),
      (error) => error.code === "VIDEO_PROVIDER_TIMEOUT"
    );
    const malformed = providerWith([{ name: op, done: true, response: { videos: [] } }]);
    await assert.rejects(
      malformed.provider.poll({ provider_job_id: op, quality: "normal", aspect_ratio: "16:9", duration_seconds: 4 }),
      VideoProviderResponseError
    );
  });
});
