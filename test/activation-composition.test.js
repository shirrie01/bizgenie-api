const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const {
  ActivationConfigurationError,
  createMediaProductionComposition,
  loadCorsConfig,
} = require("../src/activation");
const {
  StripeBillingConfigurationError,
  StripeSubscriptionService,
  createStripeProductionComposition,
} = require("../src/billing");
const {
  OpenAIImageProvider,
  UnconfiguredImageGenerationProvider,
} = require("../src/image-generation");
const {
  GoogleVertexVeoProvider,
  UnconfiguredVideoGenerationProvider,
} = require("../src/video-generation");
const { createApp } = require("../index");

function mediaPool() {
  return {
    async query(sql) {
      if (sql.includes("to_regclass('public.media_assets')")) {
        return { rows: [{ relation: "media_assets", generation_authority: true, authority_trigger: true }] };
      }
      if (sql.includes("information_schema.role_table_grants")) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error("unexpected media initialization query");
    },
  };
}

function bucketFetch() {
  return Promise.resolve({
    ok: true,
    async json() {
      return {
        name: "bizgenie-staging-media",
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: true },
          publicAccessPrevention: "enforced",
        },
      };
    },
  });
}

function mediaEnv(overrides = {}) {
  return {
    BIZGENIE_ENVIRONMENT: "staging",
    MEDIA_STORAGE_ENABLED: "true",
    MEDIA_STORAGE_BUCKET: "bizgenie-staging-media",
    IMAGE_GENERATION_ENABLED: "true",
    VIDEO_GENERATION_ENABLED: "true",
    OPENAI_API_KEY: "test-openai-key",
    GOOGLE_CLOUD_PROJECT: "bizgenie-staging-12345",
    VIDEO_PROVIDER_OUTPUT_STORAGE_URI: "gs://bizgenie-veo-staging/output/",
    ...overrides,
  };
}

function stripeEnv(overrides = {}) {
  return {
    BIZGENIE_ENVIRONMENT: "staging",
    STRIPE_BILLING_ENABLED: "true",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_staging",
    STRIPE_WEBHOOK_SECRET: "whsec_staging",
    STRIPE_SUCCESS_URL: "https://staging-frontend.example/billing/success",
    STRIPE_CANCEL_URL: "https://staging-frontend.example/billing/cancel",
    STRIPE_PRICE_STANDARD: "price_StagingStandard",
    STRIPE_POLICY_STANDARD: "policy_staging_standard_v1",
    ...overrides,
  };
}

describe("Image/Video production composition gates", () => {
  it("keeps both providers disabled by default", async () => {
    const result = await createMediaProductionComposition({ pool: mediaPool(), env: {} });
    assert.equal(result.mediaEnabled, false);
    assert.ok(result.imageProvider instanceof UnconfiguredImageGenerationProvider);
    assert.ok(result.videoProvider instanceof UnconfiguredVideoGenerationProvider);
  });

  it("rejects provider activation without durable storage", async () => {
    await assert.rejects(
      createMediaProductionComposition({
        pool: mediaPool(),
        env: { IMAGE_GENERATION_ENABLED: "true" },
      }),
      /durable media storage/i
    );
  });

  it("composes approved Image and Video providers only with explicit staging storage", async () => {
    const result = await createMediaProductionComposition({
      pool: mediaPool(),
      env: mediaEnv(),
      fetchImpl: bucketFetch,
      accessTokenProvider: async () => "staging-access-token",
    });
    assert.equal(result.mediaEnabled, true);
    assert.equal(result.imageEnabled, true);
    assert.equal(result.videoEnabled, true);
    assert.ok(result.imageProvider instanceof OpenAIImageProvider);
    assert.ok(result.videoProvider instanceof GoogleVertexVeoProvider);
  });

  it("does not permit production activation without the separate production gate", async () => {
    await assert.rejects(
      createMediaProductionComposition({
        pool: mediaPool(),
        env: mediaEnv({ BIZGENIE_ENVIRONMENT: "production" }),
        fetchImpl: bucketFetch,
        accessTokenProvider: async () => "token",
      }),
      ActivationConfigurationError
    );
  });
});

describe("Stripe production composition gates", () => {
  const dependencies = {
    billingRepository: {},
    billingService: {},
    stripeFactory: () => ({}),
  };

  it("keeps Stripe routes disabled by default", () => {
    const result = createStripeProductionComposition({ env: {} });
    assert.equal(result.enabled, false);
    assert.equal(result.stripeSubscriptionService, null);
  });

  it("enables test-mode Stripe only for explicit staging composition", () => {
    const result = createStripeProductionComposition({
      ...dependencies,
      env: stripeEnv(),
    });
    assert.equal(result.enabled, true);
    assert.ok(result.stripeSubscriptionService instanceof StripeSubscriptionService);
    assert.equal(result.config.mode, "test");
  });

  it("rejects live Stripe in staging and production without production activation", () => {
    assert.throws(
      () => createStripeProductionComposition({
        ...dependencies,
        env: stripeEnv({
          STRIPE_MODE: "live",
          STRIPE_SECRET_KEY: "sk_live_staging",
        }),
      }),
      StripeBillingConfigurationError
    );
    assert.throws(
      () => createStripeProductionComposition({
        ...dependencies,
        env: stripeEnv({ BIZGENIE_ENVIRONMENT: "production" }),
      }),
      ActivationConfigurationError
    );
  });
});

describe("strict staging CORS allowlist", () => {
  it("rejects cross-origin requests when CORS is disabled", async () => {
    const response = await request(createApp()).get("/").set("origin", "https://frontend.example");
    assert.equal(response.status, 403);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
  });

  it("echoes only an explicitly configured allowed origin", async () => {
    const config = loadCorsConfig({
      env: {
        BIZGENIE_ENVIRONMENT: "staging",
        CORS_ENABLED: "true",
        CORS_ALLOWED_ORIGINS: "https://frontend-a.example,https://frontend-b.example",
      },
    });
    const app = createApp({ corsConfig: config });
    const allowed = await request(app).get("/").set("origin", "https://frontend-a.example");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers["access-control-allow-origin"], "https://frontend-a.example");
    const denied = await request(app).get("/").set("origin", "https://attacker.example");
    assert.equal(denied.status, 403);

    const preflight = await request(app)
      .options("/customer/generate-video")
      .set("origin", "https://frontend-a.example")
      .set("access-control-request-method", "POST")
      .set("access-control-request-headers", "authorization, content-type");
    assert.equal(preflight.status, 204);
    const widened = await request(app)
      .options("/customer/generate-video")
      .set("origin", "https://frontend-a.example")
      .set("access-control-request-method", "POST")
      .set("access-control-request-headers", "x-admin-key");
    assert.equal(widened.status, 403);
  });

  it("rejects wildcard, path-bearing, and partial allowlist configuration", () => {
    for (const allowedOrigins of ["*", "https://frontend.example/path", ""]) {
      assert.throws(
        () => loadCorsConfig({
          env: {
            BIZGENIE_ENVIRONMENT: "staging",
            CORS_ENABLED: "true",
            CORS_ALLOWED_ORIGINS: allowedOrigins,
          },
        }),
        ActivationConfigurationError
      );
    }
  });
});
