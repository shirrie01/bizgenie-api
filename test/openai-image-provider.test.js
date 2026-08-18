const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const supertest = require("supertest");
const {
  InMemoryImageGenerationRepository,
  OPENAI_IMAGE_MODEL,
  OpenAIImageProvider,
  createOpenAIImageProviderFromEnv,
} = require("../src/image-generation");
const { createApp } = require("../index");

const API_KEY = "test-openai-api-key";
const REQUEST_ID = "req_image_001";
const GENERATED_BYTES = Buffer.from("deterministic generated image");

function response({
  status = 200,
  requestId = REQUEST_ID,
  payload = {
    data: [{ b64_json: GENERATED_BYTES.toString("base64") }],
  },
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "x-request-id" ? requestId : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

function dependencies(overrides = {}) {
  const saved = [];
  const loaded = [];
  return {
    saved,
    loaded,
    assetStore: {
      async save(value) {
        saved.push(value);
        return {
          location: "https://media.example.test/generated/image-001.jpg",
        };
      },
    },
    referenceAssetLoader: {
      async load(value) {
        loaded.push(value);
        return {
          data: Buffer.from(`reference:${value.asset_id}`),
          mime_type: value.mime_type || "image/png",
          filename: `${value.asset_id}.png`,
        };
      },
    },
    ...overrides,
  };
}

function provider({ fetchImpl, ...overrides } = {}) {
  const deps = dependencies(overrides);
  return {
    deps,
    instance: new OpenAIImageProvider({
      apiKey: API_KEY,
      assetStore: deps.assetStore,
      referenceAssetLoader: deps.referenceAssetLoader,
      fetchImpl: fetchImpl || (async () => response()),
      sleepImpl: async () => {},
      ...overrides.providerOptions,
    }),
  };
}

function request(overrides = {}) {
  return {
    prompt: "Compiled BizGenie prompt",
    aspect_ratio: "16:9",
    reference_assets: [],
    metadata: {
      generation_id: "generation_001",
      execution_id: "execution_001",
      project_id: "project_001",
      arbitrary_provider_parameter: "must-not-pass-through",
    },
    ...overrides,
  };
}

describe("OpenAIImageProvider generation", () => {
  it("uses the approved GPT Image 2 generation contract and persists normalized media", async () => {
    const calls = [];
    const { instance, deps } = provider({
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return response();
      },
    });

    const result = await instance.generate(request());

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://api.openai.com/v1/images/generations"
    );
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${API_KEY}`);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body, {
      model: OPENAI_IMAGE_MODEL,
      prompt: "Compiled BizGenie prompt",
      size: "2048x1152",
      quality: "medium",
      output_format: "jpeg",
      moderation: "auto",
      n: 1,
      output_compression: 90,
    });
    assert.doesNotMatch(calls[0].init.body, /generation_001|arbitrary/);

    assert.equal(deps.saved.length, 1);
    assert.deepEqual(deps.saved[0].data, GENERATED_BYTES);
    assert.equal(deps.saved[0].mime_type, "image/jpeg");
    assert.equal(deps.saved[0].width, 2048);
    assert.equal(deps.saved[0].height, 1152);
    assert.equal(deps.saved[0].lineage.generation_id, "generation_001");
    assert.equal(deps.saved[0].lineage.provider_job_id, REQUEST_ID);
    assert.equal(deps.saved[0].lineage.model, OPENAI_IMAGE_MODEL);
    assert.equal(
      deps.saved[0].lineage.arbitrary_provider_parameter,
      undefined
    );
    assert.deepEqual(result, {
      provider: "openai",
      provider_job_id: REQUEST_ID,
      asset: {
        location: "https://media.example.test/generated/image-001.jpg",
        mime_type: "image/jpeg",
        width: 2048,
        height: 1152,
      },
    });
  });

  it("maps every public aspect ratio to an approved multiples-of-16 size", async () => {
    const expected = {
      "1:1": "1024x1024",
      "4:5": "1024x1280",
      "9:16": "1152x2048",
      "16:9": "2048x1152",
    };

    for (const [aspectRatio, size] of Object.entries(expected)) {
      let body;
      const { instance } = provider({
        fetchImpl: async (_url, init) => {
          body = JSON.parse(init.body);
          return response();
        },
      });
      await instance.generate(
        request({ aspect_ratio: aspectRatio, metadata: {} })
      );
      assert.equal(body.size, size);
      const [width, height] = size.split("x").map(Number);
      assert.equal(width % 16, 0);
      assert.equal(height % 16, 0);
    }
  });

  it("rejects blank prompts and excess references before provider access", async () => {
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async () => {
        calls += 1;
        return response();
      },
    });

    await assert.rejects(
      instance.generate(request({ prompt: "   " })),
      (error) => error.code === "IMAGE_PROVIDER_REJECTED"
    );
    await assert.rejects(
      instance.generate(
        request({
          reference_assets: Array.from({ length: 6 }, (_value, index) => ({
            asset_id: `asset_${index}`,
            mime_type: "image/png",
          })),
        })
      ),
      (error) => error.code === "IMAGE_PROVIDER_REJECTED"
    );
    assert.equal(calls, 0);
  });
});

describe("OpenAIImageProvider reference-image editing", () => {
  it("loads approved references and uses multipart image[] edits without mutable fidelity", async () => {
    let captured;
    const { instance, deps } = provider({
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return response({ requestId: "req_edit_001" });
      },
    });
    const references = [
      {
        asset_id: "product_front",
        location: "https://private.example.test/product-front.png",
        mime_type: "image/png",
      },
      {
        asset_id: "product_side",
        location: "s3://private-bucket/product-side.webp",
        mime_type: "image/webp",
      },
    ];

    await instance.generate(
      request({ aspect_ratio: "4:5", reference_assets: references })
    );

    assert.equal(
      captured.url,
      "https://api.openai.com/v1/images/edits"
    );
    assert.equal(captured.init.headers.Authorization, `Bearer ${API_KEY}`);
    assert.equal(captured.init.headers["Content-Type"], undefined);
    assert.ok(captured.init.body instanceof FormData);
    assert.equal(captured.init.body.get("model"), OPENAI_IMAGE_MODEL);
    assert.equal(captured.init.body.get("prompt"), "Compiled BizGenie prompt");
    assert.equal(captured.init.body.get("size"), "1024x1280");
    assert.equal(captured.init.body.get("quality"), "medium");
    assert.equal(captured.init.body.get("input_fidelity"), null);
    const images = captured.init.body.getAll("image[]");
    assert.equal(images.length, 2);
    assert.equal(images[0].type, "image/png");
    assert.equal(images[1].type, "image/webp");
    assert.deepEqual(deps.loaded, references);
  });

  it("rejects invalid reference data without provider calls or retries", async () => {
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async () => {
        calls += 1;
        return response();
      },
      referenceAssetLoader: {
        async load() {
          return {
            data: Buffer.from("gif"),
            mime_type: "image/gif",
          };
        },
      },
    });

    await assert.rejects(
      instance.generate(
        request({
          reference_assets: [
            {
              asset_id: "unapproved_reference",
              location: "https://private.example.test/reference.gif",
              mime_type: "image/gif",
            },
          ],
        })
      ),
      (error) => error.code === "IMAGE_PROVIDER_REJECTED"
    );
    assert.equal(calls, 0);
  });
});

describe("OpenAIImageProvider retry and error integrity", () => {
  it("retries one 429 response and then completes", async () => {
    let calls = 0;
    const delays = [];
    const deps = dependencies();
    const instance = new OpenAIImageProvider({
      apiKey: API_KEY,
      assetStore: deps.assetStore,
      referenceAssetLoader: deps.referenceAssetLoader,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? response({ status: 429 }) : response();
      },
      sleepImpl: async (delay) => delays.push(delay),
    });

    await instance.generate(request());
    assert.equal(calls, 2);
    assert.deepEqual(delays, [250]);
  });

  it("retries a network failure but never exceeds the configured bound", async () => {
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError("connection reset with private diagnostics");
        }
        return response();
      },
    });

    await instance.generate(request());
    assert.equal(calls, 2);
  });

  it("maps exhausted 5xx responses to a sanitized unavailable error", async () => {
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async () => {
        calls += 1;
        return response({
          status: 503,
          payload: { raw: "credential and compiled prompt" },
        });
      },
    });

    await assert.rejects(instance.generate(request()), (error) => {
      assert.equal(error.code, "IMAGE_PROVIDER_UNAVAILABLE");
      assert.doesNotMatch(error.message, /credential|compiled prompt/);
      return true;
    });
    assert.equal(calls, 2);
  });

  it("does not retry moderation, validation, rights, or authentication failures", async () => {
    for (const [status, code] of [
      [400, "IMAGE_PROVIDER_REJECTED"],
      [403, "IMAGE_PROVIDER_REJECTED"],
      [422, "IMAGE_PROVIDER_REJECTED"],
      [401, "IMAGE_PROVIDER_UNAVAILABLE"],
    ]) {
      let calls = 0;
      const { instance } = provider({
        fetchImpl: async () => {
          calls += 1;
          return response({
            status,
            payload: {
              error: {
                code: "moderation_blocked",
                raw_provider_response: "must never escape",
              },
            },
          });
        },
      });
      await assert.rejects(
        instance.generate(request()),
        (error) => error.code === code
      );
      assert.equal(calls, 1);
    }
  });

  it("maps bounded request abortion to a sanitized timeout", async () => {
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async (_url, init) => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("private timeout detail", "AbortError"));
          });
        });
      },
      providerOptions: { timeoutMs: 5, maxAttempts: 1 },
    });

    await assert.rejects(instance.generate(request()), (error) => {
      assert.equal(error.code, "IMAGE_PROVIDER_TIMEOUT");
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
    assert.equal(calls, 1);
  });

  it("rejects malformed success responses and never stores raw provider data", async () => {
    const { instance, deps } = provider({
      fetchImpl: async () =>
        response({
          requestId: null,
          payload: {
            data: [{ provider_binary: "raw-secret-output" }],
          },
        }),
    });

    await assert.rejects(
      instance.generate(request()),
      (error) => error.code === "IMAGE_PROVIDER_RESPONSE_INVALID"
    );
    assert.equal(deps.saved.length, 0);
  });

  it("rejects invalid base64 output without persisting it", async () => {
    const { instance, deps } = provider({
      fetchImpl: async () =>
        response({ payload: { data: [{ b64_json: "not-actually-base64!" }] } }),
    });

    await assert.rejects(
      instance.generate(request()),
      (error) => error.code === "IMAGE_PROVIDER_RESPONSE_INVALID"
    );
    assert.equal(deps.saved.length, 0);
  });

  it("does not retry asset persistence failures", async () => {
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async () => {
        calls += 1;
        return response();
      },
      assetStore: {
        async save() {
          throw new Error("private storage diagnostic");
        },
      },
    });

    await assert.rejects(
      instance.generate(request()),
      (error) => error.code === "IMAGE_PROVIDER_UNAVAILABLE"
    );
    assert.equal(calls, 1);
  });
});

describe("OpenAIImageProvider configuration allowlist", () => {
  it("rejects unapproved model, quality, format, moderation, and retry settings", () => {
    const deps = dependencies();
    const create = (overrides) =>
      new OpenAIImageProvider({
        apiKey: API_KEY,
        assetStore: deps.assetStore,
        referenceAssetLoader: deps.referenceAssetLoader,
        fetchImpl: async () => response(),
        ...overrides,
      });

    assert.throws(() => create({ model: "gpt-image-latest" }), /not approved/);
    assert.throws(() => create({ quality: "ultra" }), /not approved/);
    assert.throws(() => create({ outputFormat: "svg" }), /not approved/);
    assert.throws(() => create({ moderation: "low" }), /not approved/);
    assert.throws(() => create({ maxAttempts: 10 }), /between 1 and 3/);
  });

  it("builds only allowlisted runtime configuration from environment values", () => {
    const deps = dependencies();
    const instance = createOpenAIImageProviderFromEnv({
      env: {
        OPENAI_API_KEY: API_KEY,
        OPENAI_IMAGE_QUALITY: "high",
        OPENAI_IMAGE_OUTPUT_FORMAT: "webp",
        OPENAI_IMAGE_OUTPUT_COMPRESSION: "80",
        OPENAI_IMAGE_TIMEOUT_MS: "120000",
        OPENAI_IMAGE_MAX_ATTEMPTS: "2",
        OPENAI_IMAGE_RETRY_DELAY_MS: "500",
        OPENAI_IMAGE_MODEL: "unapproved-client-model",
      },
      assetStore: deps.assetStore,
      referenceAssetLoader: deps.referenceAssetLoader,
      fetchImpl: async () => response(),
    });

    assert.equal(instance.model, OPENAI_IMAGE_MODEL);
    assert.equal(instance.quality, "high");
    assert.equal(instance.outputFormat, "webp");
    assert.equal(instance.outputCompression, 80);
    assert.equal(instance.timeoutMs, 120000);
    assert.equal(instance.maxAttempts, 2);
    assert.equal(instance.retryDelayMs, 500);
  });
});

describe("OpenAIImageProvider route integration", () => {
  it("preserves the public generate-image response and state contract", async () => {
    process.env.ADMIN_KEY = "openai-route-test-admin-key";
    const { instance } = provider();
    const repository = new InMemoryImageGenerationRepository();
    const app = createApp({
      imageProvider: instance,
      imageGenerationRepository: repository,
      logger: { info() {}, warn() {}, error() {} },
    });

    const result = await supertest(app)
      .post("/generate-image")
      .set("x-admin-key", process.env.ADMIN_KEY)
      .send({
        execution_id: "execution_openai_route_001",
        generation_id: "generation_openai_route_001",
        user_id: "user_001",
        project_id: "project_001",
        topic: "A launch campaign",
        image_purpose: "Social campaign image",
        aspect_ratio: "1:1",
      });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      status: "completed",
      execution_id: "execution_openai_route_001",
      generation_id: "generation_openai_route_001",
      media: {
        provider: "openai",
        provider_job_id: REQUEST_ID,
        asset: {
          location: "https://media.example.test/generated/image-001.jpg",
          mime_type: "image/jpeg",
          width: 1024,
          height: 1024,
        },
        aspect_ratio: "1:1",
        approval_status: "pending",
        created_at: result.body.media.created_at,
        completed_at: result.body.media.completed_at,
      },
    });
    const stored = repository.getByGenerationId(
      "generation_openai_route_001"
    );
    assert.equal(stored.status, "completed");
    assert.equal(stored.provider, "openai");
    assert.equal(stored.provider_job_id, REQUEST_ID);
    assert.equal(stored.approval_status, "pending");
  });

  it("sanitizes a provider rejection and preserves a failed record without media", async () => {
    process.env.ADMIN_KEY = "openai-route-test-admin-key";
    let calls = 0;
    const { instance } = provider({
      fetchImpl: async () => {
        calls += 1;
        return response({
          status: 400,
          payload: {
            error: {
              code: "moderation_blocked",
              message: "private provider moderation detail",
            },
          },
        });
      },
    });
    const repository = new InMemoryImageGenerationRepository();
    const app = createApp({
      imageProvider: instance,
      imageGenerationRepository: repository,
      logger: { info() {}, warn() {}, error() {} },
    });

    const result = await supertest(app)
      .post("/generate-image")
      .set("x-admin-key", process.env.ADMIN_KEY)
      .send({
        execution_id: "execution_openai_route_failed_001",
        generation_id: "generation_openai_route_failed_001",
        user_id: "user_001",
        project_id: "project_001",
        topic: "A rejected campaign",
        image_purpose: "Social campaign image",
        aspect_ratio: "1:1",
      });

    assert.equal(calls, 1);
    assert.equal(result.status, 422);
    assert.deepEqual(result.body, {
      status: "failed",
      error: {
        code: "IMAGE_PROVIDER_REJECTED",
        message: "The image rendering provider rejected the request",
      },
      media: null,
    });
    assert.doesNotMatch(JSON.stringify(result.body), /private|moderation_blocked/);
    const stored = repository.getByGenerationId(
      "generation_openai_route_failed_001"
    );
    assert.equal(stored.status, "failed");
    assert.equal(stored.error_code, "IMAGE_PROVIDER_REJECTED");
    assert.equal(stored.asset, undefined);
    assert.equal(stored.approval_status, undefined);
  });
});
