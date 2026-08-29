const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { BillingService, InMemoryBillingRepository } = require("../src/billing");
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
  constructor({ fail = false, processingPolls = 0 } = {}) {
    super();
    this.fail = fail;
    this.processingPolls = processingPolls;
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
    if (this.processingPolls > 0) {
      this.processingPolls -= 1;
      return {
        provider: "fixture",
        provider_job_id: "operation_video_001",
        provider_model: "fixture-video-model",
        status: "processing",
      };
    }
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

async function durableRestartFixture({ fail = false, processingPolls = 0 } = {}) {
  const now = () => new Date("2026-08-29T20:00:00.000Z");
  const billingRepository = new InMemoryBillingRepository({
    policies: [{
      policy_id: "restart_policy",
      plan_code: "test",
      policy_version: 1,
      status: "active",
      included_monthly_credits: 100,
      bolt_on_eligible: false,
      effective_from: "2026-01-01T00:00:00.000Z",
      execution_costs: { "video.normal": 5, "video.premium": 9 },
    }],
    entitlements: [{
      entitlement_id: "restart_entitlement",
      tenant_id: "tenant_a",
      policy_id: "restart_policy",
      plan_code: "test",
      status: "active",
      starts_at: "2026-01-01T00:00:00.000Z",
      reference_period_start: "2026-08-01T00:00:00.000Z",
      reference_period_end: "2026-09-01T00:00:00.000Z",
      included_monthly_credit_grant: 100,
    }],
    accounts: [{
      account_id: "restart_account",
      tenant_id: "tenant_a",
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
    }],
    projects: [{ project_id: "project_a", tenant_id: "tenant_a" }],
    now,
  });
  const billingService = new BillingService({ repository: billingRepository, now });
  await billingService.adjustCredits({
    tenantId: "tenant_a",
    amount: 100,
    direction: "credit",
    transactionCorrelationId: "restart_fixture_funding",
    idempotencyKey: "restart_fixture_funding",
  });

  const videoGenerationRepository = new InMemoryVideoGenerationRepository();
  const generationJobRepository = new InMemoryGenerationJobRepository();
  const provider = new FixtureVideoProvider({ fail, processingPolls });
  let assetSaves = 0;
  function freshApp() {
    const generationBillingOrchestrator = new GenerationBillingOrchestrator({
      billingService,
      logger: { error() {} },
    });
    return createApp({
      authorizationRepository: authorizationRepository(),
      brandBrainRepository: new InMemoryBrandBrainRepository(),
      customerTokenVerifier: new Tokens(),
      generationBillingOrchestrator,
      generationJobRepository,
      videoGenerationRepository,
      videoProvider: provider,
      videoAssetStore: {
        async save({ source }) {
          assetSaves += 1;
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
      videoReferenceAssetLoader: { async load() { throw new Error("not used"); } },
      logger: { info() {}, warn() {}, error() {} },
    });
  }
  return {
    billingRepository,
    billingService,
    freshApp,
    generationJobRepository,
    provider,
    assetSaves: () => assetSaves,
  };
}

function financialEffects(repository) {
  const ledger = repository.listLedger("tenant_a");
  return Object.fromEntries(
    ["reservation", "debit", "reservation_release"].map((type) => [
      type,
      ledger.filter((entry) => entry.entry_type === type).length,
    ])
  );
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
    const f = await durableRestartFixture();
    const firstApp = f.freshApp();

    const submitted = await customer(
      request(firstApp).post("/customer/generate-video")
    ).send(videoRequest({
      execution_id: "execution_video_restart_001",
      generation_id: "generation_video_restart_001",
    }));

    assert.equal(submitted.status, 202);
    assert.equal(f.provider.submissions, 1);
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 0,
      reservation_release: 0,
    });

    // Simulate process replacement: discard the first Express/service graph
    // and construct a new one against the same durable authorities.
    const restartedApp = f.freshApp();

    const completed = await customer(
      request(restartedApp).post(
        "/customer/generate-video/generation_video_restart_001/poll"
      )
    );

    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, "completed");
    assert.equal(f.provider.submissions, 1);
    assert.equal(f.provider.polls, 1);
    assert.equal(f.assetSaves(), 1);
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 1,
      reservation_release: 0,
    });

    const alreadySettledRestart = f.freshApp();
    const repeated = await customer(
      request(alreadySettledRestart).post(
        "/customer/generate-video/generation_video_restart_001/poll"
      )
    );

    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.status, "completed");
    assert.equal(f.provider.submissions, 1);
    assert.equal(f.provider.polls, 1);
    assert.equal(f.assetSaves(), 1);
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 1,
      reservation_release: 0,
    });
  });

  it("keeps a reconstructed reservation open while Video is still processing", async () => {
    const f = await durableRestartFixture({ processingPolls: 1 });
    await customer(request(f.freshApp()).post("/customer/generate-video")).send(
      videoRequest({
        execution_id: "execution_video_processing_restart",
        generation_id: "generation_video_processing_restart",
      })
    );

    const processing = await customer(
      request(f.freshApp()).post(
        "/customer/generate-video/generation_video_processing_restart/poll"
      )
    );
    assert.equal(processing.status, 202);
    assert.equal(processing.body.status, "processing");
    assert.equal(f.provider.submissions, 1);
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 0,
      reservation_release: 0,
    });
  });

  it("reconstructs and releases a terminal provider failure exactly once", async () => {
    const f = await durableRestartFixture({ fail: true });
    await customer(request(f.freshApp()).post("/customer/generate-video")).send(
      videoRequest({
        execution_id: "execution_video_failure_restart",
        generation_id: "generation_video_failure_restart",
      })
    );

    const failed = await customer(
      request(f.freshApp()).post(
        "/customer/generate-video/generation_video_failure_restart/poll"
      )
    );
    assert.equal(failed.status, 502);
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 0,
      reservation_release: 1,
    });

    const repeated = await customer(
      request(f.freshApp()).get(
        "/customer/generate-video/generation_video_failure_restart"
      )
    );
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.status, "failed");
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 0,
      reservation_release: 1,
    });
  });

  it("fails closed when reconstructed job or reservation authority is mismatched", async () => {
    const f = await durableRestartFixture();
    await customer(request(f.freshApp()).post("/customer/generate-video")).send(
      videoRequest({
        execution_id: "execution_video_mismatch_restart",
        generation_id: "generation_video_mismatch_restart",
      })
    );
    const [job] = [...f.generationJobRepository.jobsById.values()];
    const forged = { ...job, execution_class: "video.premium" };
    const restarted = new GenerationBillingOrchestrator({
      billingService: f.billingService,
      logger: { error() {} },
    });
    await assert.rejects(
      restarted.settleSuccessfulExecution({ job: forged }),
      (error) => error.code === "GENERATION_BILLING_UNAVAILABLE"
    );

    const canonicalLookup = f.billingRepository.findGenerationBillingState.bind(
      f.billingRepository
    );
    f.billingRepository.findGenerationBillingState = async (input) => {
      const state = await canonicalLookup(input);
      return {
        ...state,
        reservation: { ...state.reservation, project_id: "project_b" },
      };
    };
    await assert.rejects(
      new GenerationBillingOrchestrator({
        billingService: f.billingService,
        logger: { error() {} },
      }).settleSuccessfulExecution({ job }),
      (error) => error.code === "GENERATION_BILLING_UNAVAILABLE"
    );
    assert.deepEqual(financialEffects(f.billingRepository), {
      reservation: 1,
      debit: 0,
      reservation_release: 0,
    });
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
