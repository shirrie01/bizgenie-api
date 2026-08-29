const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { GenerationBillingOrchestrator } = require("../src/generation-billing");
const { InMemoryGenerationJobRepository } = require("../src/generation-jobs");
const {
  InMemoryVideoGenerationRepository,
  VideoGenerationProvider,
} = require("../src/video-generation");
const { createApp } = require("../index");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

class Tokens {
  async verifyAccessToken(token) {
    if (token === "token-a") return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A });
    if (token === "token-b") return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_B });
    throw new AuthenticationRequiredError();
  }
}

class FixtureVideoProvider extends VideoGenerationProvider {
  constructor({ fail = false } = {}) {
    super();
    this.fail = fail;
    this.submissions = 0;
    this.polls = 0;
  }
  async submit() {
    this.submissions += 1;
    return {
      provider: "fixture",
      provider_job_id: "operation_video_001",
      provider_model: "fixture-video-model",
    };
  }
  async poll() {
    this.polls += 1;
    if (this.fail) {
      return {
        provider: "fixture",
        provider_job_id: "operation_video_001",
        provider_model: "fixture-video-model",
        status: "failed",
        error_code: "VIDEO_PROVIDER_FAILED",
      };
    }
    return {
      provider: "fixture",
      provider_job_id: "operation_video_001",
      provider_model: "fixture-video-model",
      status: "completed",
      asset_source: {
        location: "gs://provider-staging/output/video.mp4",
        mime_type: "video/mp4",
        width: 1280,
        height: 720,
        duration_seconds: 4,
        container: "mp4",
      },
    };
  }
}

function authorizationRepository() {
  return new InMemoryAuthorizationRepository({
    customerProfiles: [
      { auth_user_id: USER_A, display_name: "A" },
      { auth_user_id: USER_B, display_name: "B" },
    ],
    tenants: [
      { tenant_id: "tenant_a", name: "A", created_by: USER_A },
      { tenant_id: "tenant_b", name: "B", created_by: USER_B },
    ],
    memberships: [
      { tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" },
      { tenant_id: "tenant_b", auth_user_id: USER_B, role: "owner" },
    ],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a", name: "A" },
      { project_id: "project_b", tenant_id: "tenant_b", name: "B" },
    ],
  });
}

function videoRequest(overrides = {}) {
  return {
    tenant_id: "tenant_a",
    project_id: "project_a",
    execution_id: "execution_video_001",
    generation_id: "generation_video_001",
    topic: "Staging launch",
    video_purpose: "Golden Journey proof",
    quality: "normal",
    aspect_ratio: "16:9",
    duration_seconds: 4,
    ...overrides,
  };
}

function fixture({ fail = false } = {}) {
  const effects = { reserve: 0, debit: 0, release: 0 };
  const billingService = {
    async createReservation(input) {
      effects.reserve += 1;
      effects.reservationInput = input;
      return { ledger_entry_id: "reservation_video_001", generation_id: input.generationId };
    },
    async finalizeDebit(input) {
      effects.debit += 1;
      effects.debitInput = input;
      return { ledger_entry_id: "debit_video_001", generation_id: "unused" };
    },
    async releaseReservation(input) {
      effects.release += 1;
      effects.releaseInput = input;
      return { ledger_entry_id: "release_video_001" };
    },
  };
  const generationBillingOrchestrator = new GenerationBillingOrchestrator({
    billingService,
    logger: { error() {} },
  });
  const provider = new FixtureVideoProvider({ fail });
  const generationJobRepository = new InMemoryGenerationJobRepository();
  const videoGenerationRepository = new InMemoryVideoGenerationRepository();
  const app = createApp({
    authorizationRepository: authorizationRepository(),
    brandBrainRepository: new InMemoryBrandBrainRepository(),
    customerTokenVerifier: new Tokens(),
    generationBillingOrchestrator,
    generationJobRepository,
    videoGenerationRepository,
    videoProvider: provider,
    videoAssetStore: {
      async save({ lineage, source }) {
        assert.equal(lineage.tenant_id, "tenant_a");
        assert.match(lineage.generation_job_id, /^[0-9a-f-]{36}$/);
        return {
          asset_id: "33333333-3333-4333-8333-333333333333",
          location: "gs://bizgenie-staging-media/durable/video.mp4",
          mime_type: source.mime_type,
          width: source.width,
          height: source.height,
          duration_seconds: source.duration_seconds,
          container: "mp4",
          byte_size: 1024,
        };
      },
    },
    videoReferenceAssetLoader: { async load() { throw new Error("not used"); } },
    logger: { info() {}, warn() {}, error() {} },
  });
  return { app, effects, provider, generationJobRepository, videoGenerationRepository };
}

function customer(client, token = "token-a") {
  return client.set("authorization", `Bearer ${token}`);
}

describe("customer Video Auth -> immutable job -> Billing -> async settlement", () => {
  it("authorizes and reserves submission, then debits only after durable completion", async () => {
    const f = fixture();
    const submitted = await customer(
      request(f.app).post("/customer/generate-video")
    ).send(videoRequest({ user_id: USER_B }));
    assert.equal(submitted.status, 202);
    assert.equal(f.effects.reserve, 1);
    assert.equal(f.effects.debit, 0);
    assert.equal(f.provider.submissions, 1);

    const [job] = [...f.generationJobRepository.jobsById.values()];
    assert.equal(job.tenant_id, "tenant_a");
    assert.equal(job.project_id, "project_a");
    assert.equal(job.actor_correlation.auth_user_id, USER_A);
    assert.equal(job.execution_class, "video.normal");

    const completed = await customer(
      request(f.app).post("/customer/generate-video/generation_video_001/poll")
    );
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, "completed");
    assert.equal(f.effects.debit, 1);
    assert.equal(f.effects.release, 0);
    assert.equal(completed.body.video.asset.asset_id, "33333333-3333-4333-8333-333333333333");

    const repeated = await customer(
      request(f.app).post("/customer/generate-video/generation_video_001/poll")
    );
    assert.equal(repeated.status, 200);
    assert.equal(f.effects.debit, 1);
    assert.equal(f.provider.submissions, 1);
  });

  it("reconstructs an accepted async Video in a fresh app instance without resubmission", async () => {
    const durableVideoRepository = new InMemoryVideoGenerationRepository();
    const durableJobRepository = new InMemoryGenerationJobRepository();
    const provider = new FixtureVideoProvider();
    const effects = { reserve: 0, debit: 0, release: 0 };

    const billingService = {
      async createReservation(input) {
        effects.reserve += 1;
        return {
          ledger_entry_id: "reservation_restart_001",
          generation_id: input.generationId,
        };
      },
      async finalizeDebit() {
        effects.debit += 1;
        return { ledger_entry_id: "debit_restart_001" };
      },
      async releaseReservation() {
        effects.release += 1;
        return { ledger_entry_id: "release_restart_001" };
      },
    };

    const generationBillingOrchestrator = new GenerationBillingOrchestrator({
      billingService,
      logger: { error() {} },
    });

    function freshApp() {
      return createApp({
        authorizationRepository: authorizationRepository(),
        brandBrainRepository: new InMemoryBrandBrainRepository(),
        customerTokenVerifier: new Tokens(),
        generationBillingOrchestrator,
        generationJobRepository: durableJobRepository,
        videoGenerationRepository: durableVideoRepository,
        videoProvider: provider,
        videoAssetStore: {
          async save({ source }) {
            return {
              asset_id: "44444444-4444-4444-8444-444444444444",
              location: "gs://bizgenie-staging-media/reconstructed/video.mp4",
              mime_type: source.mime_type,
              width: source.width,
              height: source.height,
              duration_seconds: source.duration_seconds,
              container: "mp4",
              byte_size: 2048,
            };
          },
        },
        videoReferenceAssetLoader: {
          async load() {
            throw new Error("not used");
          },
        },
        logger: { info() {}, warn() {}, error() {} },
      });
    }

    const firstApp = freshApp();

    const submitted = await customer(
      request(firstApp).post("/customer/generate-video")
    ).send(videoRequest({
      execution_id: "execution_video_restart_001",
      generation_id: "generation_video_restart_001",
    }));

    assert.equal(submitted.status, 202);
    assert.equal(provider.submissions, 1);
    assert.equal(effects.reserve, 1);
    assert.equal(effects.debit, 0);

    // Simulate process replacement: discard the first Express/service graph
    // and construct a new one against the same durable authorities.
    const restartedApp = freshApp();

    const completed = await customer(
      request(restartedApp).post(
        "/customer/generate-video/generation_video_restart_001/poll"
      )
    );

    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, "completed");
    assert.equal(provider.submissions, 1);
    assert.equal(provider.polls, 1);
    assert.equal(effects.reserve, 1);
    assert.equal(effects.debit, 1);
    assert.equal(effects.release, 0);

    const repeated = await customer(
      request(restartedApp).post(
        "/customer/generate-video/generation_video_restart_001/poll"
      )
    );

    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.status, "completed");
    assert.equal(provider.submissions, 1);
    assert.equal(provider.polls, 1);
    assert.equal(effects.debit, 1);
  });

  it("denies cross-tenant status/poll access before provider or Billing settlement", async () => {
    const f = fixture();
    await customer(request(f.app).post("/customer/generate-video")).send(videoRequest());
    const denied = await customer(
      request(f.app).post("/customer/generate-video/generation_video_001/poll"),
      "token-b"
    );
    assert.equal(denied.status, 404);
    assert.equal(denied.body.error.code, "RESOURCE_NOT_AVAILABLE");
    assert.equal(f.provider.polls, 0);
    assert.equal(f.effects.debit, 0);
    assert.equal(f.effects.release, 0);
  });

  it("releases the reservation exactly once after a terminal provider failure", async () => {
    const f = fixture({ fail: true });
    await customer(request(f.app).post("/customer/generate-video")).send(videoRequest());
    const failed = await customer(
      request(f.app).post("/customer/generate-video/generation_video_001/poll")
    );
    assert.equal(failed.status, 502);
    assert.equal(f.effects.reserve, 1);
    assert.equal(f.effects.debit, 0);
    assert.equal(f.effects.release, 1);

    const repeated = await customer(
      request(f.app).get("/customer/generate-video/generation_video_001")
    );
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.status, "failed");
    assert.equal(f.effects.release, 1);
  });

  it("rejects cross-tenant submission before job, reservation, or provider access", async () => {
    const f = fixture();
    const denied = await customer(
      request(f.app).post("/customer/generate-video")
    ).send(videoRequest({ tenant_id: "tenant_b", project_id: "project_b" }));
    assert.equal(denied.status, 404);
    assert.equal(f.generationJobRepository.size(), 0);
    assert.equal(f.effects.reserve, 0);
    assert.equal(f.provider.submissions, 0);
  });
});
