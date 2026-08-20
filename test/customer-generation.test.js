const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");

const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const {
  SupabaseCustomerTokenVerifier,
} = require("../src/authentication");
const {
  InMemoryBrandBrainRepository,
} = require("../src/brand-brain");
const {
  InMemoryImageGenerationRepository,
} = require("../src/image-generation");
const { createApp } = require("../index");

const ADMIN_KEY = "customer-generation-admin-key";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_URL = "https://bizgenie-test.supabase.co";
const RAW_INVALID_TOKEN = "invalid.raw.jwt-that-must-never-leak";
const COMPLETE_OUTPUT = [
  "Hook: Stop scrolling and make planning work for you.",
  "Concept: Show a simple plan becoming a finished post.",
  "Script: Start with one clear goal, choose the next action, and publish consistently.",
  "CTA: Try the planning workflow today.",
  "Caption: A practical plan turns ideas into progress.",
  "Hashtags: #Planning #Content #SmallBusiness",
  "Filming instructions:",
  "- Open on a close-up of the written plan.",
].join("\n");

function authorizationRepository() {
  return new InMemoryAuthorizationRepository({
    customerProfiles: [
      { auth_user_id: USER_A, display_name: "Customer A" },
      { auth_user_id: USER_B, display_name: "Customer B" },
    ],
    tenants: [
      { tenant_id: "tenant_a", name: "Tenant A", created_by: USER_A },
      { tenant_id: "tenant_b", name: "Tenant B", created_by: USER_B },
    ],
    memberships: [
      { tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" },
      { tenant_id: "tenant_b", auth_user_id: USER_B, role: "owner" },
    ],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a", name: "Project A" },
      { project_id: "project_b", tenant_id: "tenant_b", name: "Project B" },
    ],
    brands: [
      { brand_id: "brand_a", project_id: "project_a", name: "Brand A" },
      { brand_id: "brand_b", project_id: "project_b", name: "Brand B" },
    ],
  });
}

function brandBrainRecord({
  brandId = "brand_a",
  projectId = "project_a",
  name = "Tenant A Brand",
} = {}) {
  return {
    brand_id: brandId,
    project_id: projectId,
    name,
    identity: { positioning: `${name} private positioning` },
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-08-19T09:00:00.000Z",
      updated_at: "2026-08-19T09:00:00.000Z",
    },
  };
}

function brandBrainRepository() {
  const repository = new InMemoryBrandBrainRepository();
  repository.upsert(brandBrainRecord());
  repository.upsert(
    brandBrainRecord({
      brandId: "brand_b",
      projectId: "project_b",
      name: "Tenant B Brand",
    })
  );
  return repository;
}

class FixtureTokenVerifier {
  constructor() {
    this.calls = [];
  }

  async verifyAccessToken(token) {
    this.calls.push(token);
    if (token === "token-a") {
      return createCustomerActorFromVerifiedIdentity({
        verifiedAuthUserId: USER_A,
      });
    }
    if (token === "token-b") {
      return createCustomerActorFromVerifiedIdentity({
        verifiedAuthUserId: USER_B,
      });
    }
    throw new AuthenticationRequiredError();
  }
}

function scriptRequest(overrides = {}) {
  return {
    execution_id: "execution_customer_001",
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    compiled_prompt: "Create a customer-authorized script",
    ...overrides,
  };
}

function imageRequest(overrides = {}) {
  return {
    execution_id: "execution_image_customer_001",
    generation_id: "generation_customer_001",
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    topic: "A calm planning workflow",
    image_purpose: "Social media campaign image",
    aspect_ratio: "1:1",
    ...overrides,
  };
}

function customer(client, token = "token-a") {
  return client.set("authorization", `Bearer ${token}`);
}

function appFixture(overrides = {}) {
  const tokenVerifier = overrides.customerTokenVerifier || new FixtureTokenVerifier();
  const imageGenerationRepository = new InMemoryImageGenerationRepository();
  const providerCalls = [];
  let scriptCalls = 0;
  let scriptOptions;
  const logs = [];
  const logger = {
    info(message, details) {
      logs.push({ level: "info", message, details });
    },
    warn(message, details) {
      logs.push({ level: "warn", message, details });
    },
    error(message, details) {
      logs.push({ level: "error", message, details });
    },
  };
  const app = createApp({
    authorizationRepository: authorizationRepository(),
    brandBrainRepository: brandBrainRepository(),
    customerTokenVerifier: tokenVerifier,
    imageGenerationRepository,
    imageProvider: {
      async generate(value) {
        providerCalls.push(structuredClone(value));
        return {
          provider: "fixture-image-provider",
          provider_job_id: "fixture-job-001",
          asset: {
            location: "gs://fixture-assets/generated/image.png",
            mime_type: "image/png",
            width: 1024,
            height: 1024,
          },
        };
      },
    },
    scriptGenerator: async (_prompt, options) => {
      scriptCalls += 1;
      scriptOptions = options;
      return { text: COMPLETE_OUTPUT, metadata: { provider: "fixture" } };
    },
    logger,
  });

  return {
    app,
    imageGenerationRepository,
    logs,
    providerCalls,
    scriptCallCount: () => scriptCalls,
    scriptOptions: () => scriptOptions,
    tokenVerifier,
  };
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("customer generation authentication", () => {
  it("rejects a missing, malformed, expired, or invalid token before generation", async () => {
    const fixture = appFixture();

    const missing = await request(fixture.app)
      .post("/customer/generate-script")
      .send(scriptRequest());
    const malformed = await request(fixture.app)
      .post("/customer/generate-script")
      .set("authorization", "Basic not-a-bearer-token")
      .send(scriptRequest());
    const invalid = await customer(
      request(fixture.app).post("/customer/generate-script"),
      "invalid-token"
    ).send(scriptRequest());

    for (const response of [missing, malformed, invalid]) {
      assert.equal(response.status, 401);
      assert.deepEqual(response.body, {
        status: "failed",
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Customer authentication is required",
        },
        script_body: "",
      });
    }
    assert.equal(fixture.scriptCallCount(), 0);

    const expiredVerifier = new SupabaseCustomerTokenVerifier({
      projectUrl: PROJECT_URL,
      now: () => new Date("2026-08-19T12:00:00.000Z"),
      supabaseClient: {
        auth: {
          async getClaims() {
            return {
              data: {
                claims: {
                  iss: `${PROJECT_URL}/auth/v1`,
                  sub: USER_A,
                  aud: "authenticated",
                  exp: 1787140800,
                },
              },
              error: null,
            };
          },
        },
      },
    });
    const expiredFixture = appFixture({
      customerTokenVerifier: expiredVerifier,
    });
    const expired = await customer(
      request(expiredFixture.app).post("/customer/generate-script"),
      "expired-token"
    ).send(scriptRequest());
    assert.equal(expired.status, 401);
    assert.equal(expiredFixture.scriptCallCount(), 0);
  });

  it("never returns or logs a raw JWT or provider verification details", async () => {
    const verifier = new SupabaseCustomerTokenVerifier({
      projectUrl: PROJECT_URL,
      supabaseClient: {
        auth: {
          async getClaims() {
            return {
              data: null,
              error: new Error(
                `signature verification failed for ${RAW_INVALID_TOKEN}`
              ),
            };
          },
        },
      },
    });
    const fixture = appFixture({ customerTokenVerifier: verifier });

    const response = await customer(
      request(fixture.app).post("/customer/generate-script"),
      RAW_INVALID_TOKEN
    ).send(scriptRequest());
    const observable = JSON.stringify({ body: response.body, logs: fixture.logs });

    assert.equal(response.status, 401);
    assert.doesNotMatch(observable, /invalid\.raw\.jwt-that-must-never-leak/);
    assert.doesNotMatch(observable, /signature verification failed/i);
    assert.doesNotMatch(observable, /authorization/i);
  });
});

describe("customer tenant, project, and Brand Brain enforcement", () => {
  it("authorizes Tenant A and ignores an impersonating body user_id", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest({ user_id: USER_B }));

    assert.equal(response.status, 200);
    assert.equal(fixture.scriptCallCount(), 1);
    assert.match(
      fixture.scriptOptions().promptOptions.brandContext,
      /Tenant A Brand private positioning/
    );
    assert.doesNotMatch(
      fixture.scriptOptions().promptOptions.brandContext,
      /Tenant B Brand/
    );
  });

  it("does not require body user_id because verified identity is authoritative", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest());

    assert.equal(response.status, 200);
    assert.equal(fixture.scriptCallCount(), 1);
  });

  it("returns one non-enumerating denial for cross-tenant, cross-brand, and unknown resources", async () => {
    const attempts = [
      scriptRequest({ tenant_id: "tenant_b", project_id: "project_b", brand_id: undefined }),
      scriptRequest({ brand_id: "brand_b" }),
      scriptRequest({
        tenant_id: "tenant_missing",
        project_id: "project_missing",
        brand_id: "brand_missing",
      }),
    ];

    for (const body of attempts) {
      const fixture = appFixture();
      const response = await customer(
        request(fixture.app).post("/customer/generate-script")
      ).send(body);

      assert.equal(response.status, 404);
      assert.deepEqual(response.body, {
        status: "failed",
        error: {
          code: "RESOURCE_NOT_AVAILABLE",
          message: "The requested resource is not available",
        },
        script_body: "",
      });
      assert.equal(fixture.scriptCallCount(), 0);
    }
  });

  it("protects image generation with the same actor and ownership chain", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-image")
    ).send(imageRequest({ user_id: USER_B }));

    assert.equal(response.status, 200);
    const stored = fixture.imageGenerationRepository.getByGenerationId(
      "generation_customer_001"
    );
    assert.equal(stored.user_id, USER_A);
    assert.equal(fixture.providerCalls[0].metadata.user_id, USER_A);
    assert.equal(fixture.providerCalls[0].metadata.project_id, "project_a");
    assert.doesNotMatch(JSON.stringify(fixture.providerCalls), /token-a/i);
  });

  it("blocks cross-tenant image generation before persistence or provider access", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-image")
    ).send(
      imageRequest({
        tenant_id: "tenant_b",
        project_id: "project_b",
        brand_id: "brand_b",
      })
    );

    assert.equal(response.status, 404);
    assert.equal(fixture.providerCalls.length, 0);
    assert.equal(
      fixture.imageGenerationRepository.getByGenerationId(
        "generation_customer_001"
      ),
      null
    );
  });
});

describe("customer and administrator principal separation", () => {
  it("does not grant administrator authority to a valid customer token", async () => {
    const fixture = appFixture();
    const response = await customer(request(fixture.app).get("/_admin/ping"));

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Forbidden" });
  });

  it("does not accept ADMIN_KEY as a customer session", async () => {
    const fixture = appFixture();
    const response = await request(fixture.app)
      .post("/customer/generate-script")
      .set("x-admin-key", ADMIN_KEY)
      .send(scriptRequest());

    assert.equal(response.status, 401);
    assert.equal(fixture.scriptCallCount(), 0);
  });

  it("preserves the existing ADMIN_KEY script and image paths", async () => {
    const fixture = appFixture();
    const script = await request(fixture.app)
      .post("/generate-script")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        execution_id: "admin_execution_001",
        user_id: "internal_user_001",
        project_id: "project_a",
        compiled_prompt: "Preserve the internal contract",
      });
    const image = await request(fixture.app)
      .post("/generate-image")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        ...imageRequest({
          generation_id: "admin_generation_001",
          user_id: "internal_user_001",
        }),
        tenant_id: undefined,
      });

    assert.equal(script.status, 200);
    assert.equal(image.status, 200);
    assert.equal(
      fixture.imageGenerationRepository.getByGenerationId(
        "admin_generation_001"
      ).user_id,
      "internal_user_001"
    );
  });
});
