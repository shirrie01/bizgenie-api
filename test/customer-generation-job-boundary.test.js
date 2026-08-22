const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");

const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { InMemoryImageGenerationRepository } = require("../src/image-generation");
const {
  GENERATION_JOB_UNAVAILABLE_ERROR,
  GenerationJobService,
  InMemoryGenerationJobRepository,
} = require("../src/generation-jobs");
const {
  SERVICE_CREDENTIAL_HEADER,
  StaticServiceCredentialVerifier,
} = require("../src/service-principal");
const { createApp } = require("../index");

const ADMIN_KEY = "job-boundary-admin-key";
const SERVICE_CREDENTIAL = "job-boundary-service-principal-credential";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
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
    brandBrainRecord({ brandId: "brand_b", projectId: "project_b", name: "Tenant B Brand" })
  );
  return repository;
}

class FixtureTokenVerifier {
  async verifyAccessToken(token) {
    if (token === "token-a") {
      return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A });
    }
    if (token === "token-b") {
      return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_B });
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

function customer(client, token = "token-a") {
  return client.set("authorization", `Bearer ${token}`);
}

function appFixture(overrides = {}) {
  const generationJobRepository = new InMemoryGenerationJobRepository();
  const servicePrincipalVerifier = new StaticServiceCredentialVerifier({
    serviceId: "make",
    credential: SERVICE_CREDENTIAL,
    scopes: ["generation:execute"],
  });
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
    customerTokenVerifier: new FixtureTokenVerifier(),
    imageGenerationRepository: new InMemoryImageGenerationRepository(),
    generationJobRepository,
    servicePrincipalVerifier,
    scriptGenerator: async () => ({
      text: COMPLETE_OUTPUT,
      metadata: { provider: "fixture" },
    }),
    logger,
    ...overrides,
  });
  return { app, generationJobRepository, logs };
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("customer -> immutable generation job -> service execution boundary", () => {
  it("creates one authorized job after the existing customer script authorization succeeds", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest());

    assert.equal(response.status, 200);
    assert.equal(fixture.generationJobRepository.size(), 1);

    const [job] = [...fixture.generationJobRepository.jobsById.values()];
    assert.equal(job.tenant_id, "tenant_a");
    assert.equal(job.project_id, "project_a");
    assert.equal(job.brand_id, "brand_a");
    assert.equal(job.execution_class, "text.standard");
    assert.equal(job.actor_correlation.auth_user_id, USER_A);
    assert.deepEqual(job.allowed_scopes, ["generation:execute"]);
  });

  it("derives job ownership from the verified actor, never from a spoofed body user_id", async () => {
    const fixture = appFixture();
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest({ user_id: USER_B })
    );

    const [job] = [...fixture.generationJobRepository.jobsById.values()];
    assert.equal(job.actor_correlation.auth_user_id, USER_A);
  });

  it("preserves one logical job across an HTTP retry with the same execution_id", async () => {
    const fixture = appFixture();
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest()
    );
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest()
    );

    assert.equal(fixture.generationJobRepository.size(), 1);
  });

  it("fails Text closed and never calls the generator when async job persistence rejects", async () => {
    let generatorCalls = 0;
    const generationJobService = new GenerationJobService({
      repository: {
        async findByIdempotencyKey() {
          return null;
        },
        async create() {
          throw new Error("database unavailable");
        },
        async recordAttempt() {
          throw new Error("recordAttempt should not be called");
        },
      },
    });
    const fixture = appFixture({
      generationJobService,
      scriptGenerator: async () => {
        generatorCalls += 1;
        throw new Error("generator must not run");
      },
    });

    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest());

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      status: "failed",
      error: GENERATION_JOB_UNAVAILABLE_ERROR,
      script_body: "",
    });
    assert.equal(generatorCalls, 0);
    assert.equal(fixture.generationJobRepository.size(), 0);
  });

  it("fails Image closed and never calls the provider when job persistence rejects", async () => {
    let providerCalls = 0;
    const generationJobService = new GenerationJobService({
      repository: {
        async findByIdempotencyKey() {
          return null;
        },
        async create() {
          throw new Error("database unavailable");
        },
        async recordAttempt() {
          throw new Error("recordAttempt should not be called");
        },
      },
    });
    const fixture = appFixture({
      generationJobService,
      imageProvider: {
        async generate() {
          providerCalls += 1;
          throw new Error("provider must not run");
        },
      },
    });

    const response = await customer(
      request(fixture.app).post("/customer/generate-image")
    ).send({
      execution_id: "execution_image_001",
      generation_id: "generation_image_001",
      tenant_id: "tenant_a",
      project_id: "project_a",
      brand_id: "brand_a",
      topic: "Planning workflow",
      image_purpose: "social post",
      aspect_ratio: "1:1",
    });

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      status: "failed",
      error: GENERATION_JOB_UNAVAILABLE_ERROR,
      media: null,
    });
    assert.equal(providerCalls, 0);
  });

  it("does not create a job for a denied cross-tenant customer request", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(
      scriptRequest({ tenant_id: "tenant_b", project_id: "project_b", brand_id: "brand_b" })
    );

    assert.equal(response.status, 404);
    assert.equal(fixture.generationJobRepository.size(), 0);
  });

  it("lets a correctly scoped service principal retrieve the bounded payload for that job", async () => {
    const fixture = appFixture();
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest()
    );
    const [job] = [...fixture.generationJobRepository.jobsById.values()];

    const response = await request(fixture.app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, SERVICE_CREDENTIAL);

    assert.equal(response.status, 200);
    assert.equal(response.body.job_id, job.job_id);
    assert.equal(response.body.execution_class, "text.standard");
    assert.equal(
      response.body.execution_input.compiled_prompt,
      "Create a customer-authorized script"
    );
  });

  it("never lets the customer JWT authenticate the service execution boundary", async () => {
    const fixture = appFixture();
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest()
    );
    const [job] = [...fixture.generationJobRepository.jobsById.values()];

    const response = await request(fixture.app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, "Bearer token-a");

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Forbidden" });
  });

  it("does not let Tenant A's customer credential access Tenant B's job", async () => {
    const fixture = appFixture();
    await customer(
      request(fixture.app).post("/customer/generate-script"),
      "token-b"
    ).send(
      scriptRequest({
        execution_id: "execution_tenant_b_001",
        tenant_id: "tenant_b",
        project_id: "project_b",
        brand_id: "brand_b",
      })
    );
    const tenantBJob = [...fixture.generationJobRepository.jobsById.values()]
      .find((job) => job.tenant_id === "tenant_b");

    const response = await request(fixture.app)
      .get(
        `/_service/generation-jobs/jobs/${tenantBJob.job_id}/execution-payload`
      )
      .set("authorization", "Bearer token-a");

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Forbidden" });
  });

  it("never lets ADMIN_KEY authenticate the service execution boundary", async () => {
    const fixture = appFixture();
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest()
    );
    const [job] = [...fixture.generationJobRepository.jobsById.values()];

    const response = await request(fixture.app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, ADMIN_KEY);

    assert.equal(response.status, 403);
  });

  it("never lets the service principal credential authenticate customer or admin routes", async () => {
    const fixture = appFixture();

    const asAdmin = await request(fixture.app)
      .get("/_admin/ping")
      .set("x-admin-key", SERVICE_CREDENTIAL);
    assert.equal(asAdmin.status, 403);

    const asCustomer = await request(fixture.app)
      .post("/customer/generate-script")
      .set("authorization", `Bearer ${SERVICE_CREDENTIAL}`)
      .send(scriptRequest());
    assert.equal(asCustomer.status, 401);
  });

  it("never forwards the customer JWT, ADMIN_KEY, or SERVICE credential in the Make payload or logs", async () => {
    const fixture = appFixture();
    await customer(request(fixture.app).post("/customer/generate-script")).send(
      scriptRequest()
    );
    const [job] = [...fixture.generationJobRepository.jobsById.values()];

    const response = await request(fixture.app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, SERVICE_CREDENTIAL);

    const observable = JSON.stringify({ body: response.body, logs: fixture.logs });
    assert.doesNotMatch(observable, /token-a/);
    assert.doesNotMatch(observable, new RegExp(ADMIN_KEY));
    assert.doesNotMatch(observable, new RegExp(SERVICE_CREDENTIAL));
    assert.doesNotMatch(observable, /tenant_a/);
    assert.doesNotMatch(observable, /project_a/);
    assert.doesNotMatch(observable, /brand_a/);
    assert.doesNotMatch(observable, new RegExp(USER_A));
  });

  it("does not change the existing customer script response contract", async () => {
    const fixture = appFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest());

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: "completed",
      execution_id: "execution_customer_001",
      script_body: COMPLETE_OUTPUT,
    });
  });

  it("does not change the existing ADMIN_KEY script/image contract", async () => {
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

    assert.equal(script.status, 200);
    // The admin-authenticated path never touches the customer generation
    // job boundary at all.
    assert.equal(fixture.generationJobRepository.size(), 0);
  });
});
