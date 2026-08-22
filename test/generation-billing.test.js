const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const {
  BillingService,
  InMemoryBillingRepository,
} = require("../src/billing");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const {
  GenerationBillingAuthorityError,
  GenerationBillingOrchestrator,
  GenerationBillingUnavailableError,
} = require("../src/generation-billing");
const { freezeGenerationJob } = require("../src/generation-jobs");
const { InMemoryImageGenerationRepository } = require("../src/image-generation");
const { buildMakeExecutionPayload } = require("../src/service-execution");
const { createApp } = require("../index");

const NOW = "2026-08-23T08:00:00.000Z";
const USER_A = "11111111-1111-4111-8111-111111111111";
const TEST_EXECUTION_COSTS = Object.freeze({
  "text.standard": 3,
  "image.normal": 5,
  "image.premium": 7,
  "video.normal": 11,
  "video.premium": 17,
});
const COMPLETE_OUTPUT = [
  "Hook: Make the next step obvious.",
  "Concept: Turn one clear plan into useful content.",
  "Script: Choose the goal, write the message, and publish consistently.",
  "CTA: Build your next campaign today.",
  "Caption: Clear plans create useful work.",
  "Hashtags: #Planning #Marketing #SmallBusiness",
  "Filming instructions:",
  "- Show the plan becoming a finished post.",
].join("\n");

function testJob(overrides = {}) {
  return freezeGenerationJob({
    job_id: "11111111-2222-4333-8444-555555555555",
    tenant_id: "tenant_a",
    project_id: "project_a",
    execution_class: "text.standard",
    actor_correlation: {
      kind: "customer",
      auth_user_id: USER_A,
    },
    request_correlation_id: "request_correlation_001",
    idempotency_key: "customer_request_001",
    created_at: NOW,
    allowed_scopes: ["generation:execute"],
    ...overrides,
  });
}

async function billingFixture({
  credits = 100,
  executionCosts = TEST_EXECUTION_COSTS,
  qualifiesForRefund,
  logger = { error() {} },
} = {}) {
  const repository = new InMemoryBillingRepository({
    policies: [
      {
        policy_id: "policy_launch_fixture",
        plan_code: "test_plan",
        policy_version: 1,
        status: "active",
        included_monthly_credits: 100,
        bolt_on_eligible: true,
        effective_from: "2026-01-01T00:00:00.000Z",
        execution_costs: executionCosts,
      },
    ],
    entitlements: [
      {
        entitlement_id: "entitlement_a",
        tenant_id: "tenant_a",
        policy_id: "policy_launch_fixture",
        plan_code: "test_plan",
        status: "active",
        starts_at: "2026-01-01T00:00:00.000Z",
        reference_period_start: "2026-08-01T00:00:00.000Z",
        reference_period_end: "2026-09-01T00:00:00.000Z",
        included_monthly_credit_grant: 100,
      },
    ],
    accounts: [
      {
        account_id: "account_a",
        tenant_id: "tenant_a",
        status: "active",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    projects: [{ project_id: "project_a", tenant_id: "tenant_a" }],
    now: () => new Date(NOW),
  });
  const billingService = new BillingService({
    repository,
    now: () => new Date(NOW),
  });
  if (credits > 0) {
    await billingService.adjustCredits({
      tenantId: "tenant_a",
      amount: credits,
      direction: "credit",
      transactionCorrelationId: "fixture_credit_funding",
      idempotencyKey: "fixture_credit_funding",
    });
  }
  const orchestrator = new GenerationBillingOrchestrator({
    billingService,
    qualifiesForRefund,
    logger,
  });
  return { billingService, orchestrator, repository };
}

function ledgerTypes(repository) {
  return repository.listLedger("tenant_a").map((entry) => entry.entry_type);
}

function authorizationRepository() {
  return new InMemoryAuthorizationRepository({
    customerProfiles: [{ auth_user_id: USER_A, display_name: "Customer A" }],
    tenants: [{ tenant_id: "tenant_a", name: "Tenant A", created_by: USER_A }],
    memberships: [
      { tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" },
    ],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a", name: "Project A" },
    ],
  });
}

class FixtureTokenVerifier {
  async verifyAccessToken(token) {
    if (token !== "token-a") throw new AuthenticationRequiredError();
    return createCustomerActorFromVerifiedIdentity({
      verifiedAuthUserId: USER_A,
    });
  }
}

async function customerAppFixture({
  credits = 100,
  orchestrator,
  scriptGenerator,
  imageProvider,
} = {}) {
  const billing = orchestrator ? null : await billingFixture({ credits });
  const providerCalls = { text: 0, image: 0 };
  const app = createApp({
    authorizationRepository: authorizationRepository(),
    brandBrainRepository: new InMemoryBrandBrainRepository(),
    customerTokenVerifier: new FixtureTokenVerifier(),
    generationBillingOrchestrator: orchestrator || billing.orchestrator,
    imageGenerationRepository: new InMemoryImageGenerationRepository(),
    imageProvider: imageProvider || {
      async generate() {
        providerCalls.image += 1;
        return {
          provider: "fixture-image-provider",
          provider_job_id: "fixture-image-job",
          asset: {
            location: "gs://fixture-assets/image.png",
            mime_type: "image/png",
            width: 1024,
            height: 1024,
          },
        };
      },
    },
    scriptGenerator: scriptGenerator || (async () => {
      providerCalls.text += 1;
      return { text: COMPLETE_OUTPUT, metadata: { provider: "fixture" } };
    }),
    logger: { info() {}, warn() {}, error() {} },
  });
  return {
    app,
    billing,
    providerCalls,
  };
}

function customer(client) {
  return client.set("authorization", "Bearer token-a");
}

function scriptRequest(overrides = {}) {
  return {
    execution_id: "customer_text_execution_001",
    tenant_id: "tenant_a",
    project_id: "project_a",
    compiled_prompt: "Create a useful campaign script",
    ...overrides,
  };
}

function imageRequest(overrides = {}) {
  return {
    execution_id: "customer_image_execution_001",
    generation_id: "customer_image_generation_001",
    tenant_id: "tenant_a",
    project_id: "project_a",
    topic: "A useful campaign image",
    image_purpose: "Campaign launch",
    aspect_ratio: "1:1",
    ...overrides,
  };
}

describe("generation credit orchestration", () => {
  it("reserves from the immutable job before execution and debits exactly once", async () => {
    const fixture = await billingFixture();
    let observedTypes;
    const result = await fixture.orchestrator.execute({
      job: testJob(),
      expectedExecutionClass: "text.standard",
      operation: async () => {
        observedTypes = ledgerTypes(fixture.repository);
        return { output: "completed" };
      },
    });

    assert.deepEqual(result, { output: "completed" });
    assert.deepEqual(observedTypes, ["admin_adjustment", "reservation"]);
    assert.deepEqual(ledgerTypes(fixture.repository), [
      "admin_adjustment",
      "reservation",
      "debit",
    ]);
    const entries = fixture.repository.listLedger("tenant_a");
    assert.equal(entries[1].generation_id, testJob().job_id);
    assert.equal(entries[1].execution_id, testJob().request_correlation_id);
    assert.equal(entries[1].amount, TEST_EXECUTION_COSTS["text.standard"]);
    assert.equal(entries[2].reservation_entry_id, entries[1].ledger_entry_id);
  });

  it("fails closed before execution for insufficient credits or unavailable Billing", async () => {
    const insufficient = await billingFixture({ credits: 0 });
    let calls = 0;
    await assert.rejects(
      insufficient.orchestrator.execute({
        job: testJob(),
        expectedExecutionClass: "text.standard",
        operation: async () => { calls += 1; },
      }),
      (error) => error.code === "GENERATION_CREDITS_UNAVAILABLE" && error.status === 402
    );
    assert.equal(calls, 0);

    const unavailable = new GenerationBillingOrchestrator({
      billingService: {
        async createReservation() {
          throw new Error("database connection detail that must stay private");
        },
      },
    });
    await assert.rejects(
      unavailable.execute({
        job: testJob(),
        expectedExecutionClass: "text.standard",
        operation: async () => { calls += 1; },
      }),
      (error) =>
        error instanceof GenerationBillingUnavailableError &&
        !error.message.includes("database")
    );
    assert.equal(calls, 0);
  });

  it("coalesces concurrent and repeated delivery into one execution and one financial effect", async () => {
    const fixture = await billingFixture();
    let calls = 0;
    let releaseExecution;
    const gate = new Promise((resolve) => { releaseExecution = resolve; });
    const operation = async () => {
      calls += 1;
      await gate;
      return { output: "same-result" };
    };
    const input = {
      job: testJob(),
      expectedExecutionClass: "text.standard",
      operation,
    };

    const first = fixture.orchestrator.execute(input);
    const duplicate = fixture.orchestrator.execute(input);
    releaseExecution();
    const [left, right] = await Promise.all([first, duplicate]);
    const replay = await fixture.orchestrator.execute(input);

    assert.equal(calls, 1);
    assert.deepEqual(left, right);
    assert.deepEqual(replay, left);
    assert.equal(
      fixture.repository.listLedger("tenant_a")
        .filter((entry) => entry.entry_type === "reservation").length,
      1
    );
    assert.equal(
      fixture.repository.listLedger("tenant_a")
        .filter((entry) => entry.entry_type === "debit").length,
      1
    );
  });

  it("releases once on execution failure and preserves the original error", async () => {
    const fixture = await billingFixture();
    const providerError = new Error("fixture provider failure");
    providerError.code = "FIXTURE_PROVIDER_FAILURE";
    let calls = 0;
    const input = {
      job: testJob(),
      expectedExecutionClass: "text.standard",
      operation: async () => {
        calls += 1;
        throw providerError;
      },
    };

    await assert.rejects(fixture.orchestrator.execute(input), (error) => error === providerError);
    await assert.rejects(fixture.orchestrator.execute(input), (error) => error === providerError);
    assert.equal(calls, 1);
    assert.equal(
      fixture.repository.listLedger("tenant_a")
        .filter((entry) => entry.entry_type === "reservation_release").length,
      1
    );
    const balance = await fixture.billingService.readBalance({ tenantId: "tenant_a" });
    assert.equal(balance.available_balance, 100);
    assert.equal(balance.reserved_balance, 0);
  });

  it("does not repeat provider execution when debit settlement is retried", async () => {
    const fixture = await billingFixture();
    let debitAttempts = 0;
    let calls = 0;
    const recoveringBillingService = {
      createReservation: (input) => fixture.billingService.createReservation(input),
      releaseReservation: (input) => fixture.billingService.releaseReservation(input),
      refund: (input) => fixture.billingService.refund(input),
      async finalizeDebit(input) {
        debitAttempts += 1;
        if (debitAttempts === 1) throw new Error("temporary settlement outage");
        return fixture.billingService.finalizeDebit(input);
      },
    };
    const orchestrator = new GenerationBillingOrchestrator({
      billingService: recoveringBillingService,
    });
    const input = {
      job: testJob(),
      expectedExecutionClass: "text.standard",
      operation: async () => {
        calls += 1;
        return "completed";
      },
    };

    await assert.rejects(
      orchestrator.execute(input),
      (error) => error.code === "GENERATION_BILLING_UNAVAILABLE"
    );
    assert.equal(await orchestrator.execute(input), "completed");
    assert.equal(calls, 1);
    assert.equal(debitAttempts, 2);
    assert.deepEqual(ledgerTypes(fixture.repository), [
      "admin_adjustment",
      "reservation",
      "debit",
    ]);
  });

  it("rejects execution-class and immutable-job authority changes", async () => {
    const fixture = await billingFixture();
    let calls = 0;
    await assert.rejects(
      fixture.orchestrator.execute({
        job: testJob(),
        expectedExecutionClass: "image.normal",
        operation: async () => { calls += 1; },
      }),
      GenerationBillingAuthorityError
    );
    assert.equal(calls, 0);

    await fixture.orchestrator.execute({
      job: testJob(),
      expectedExecutionClass: "text.standard",
      operation: async () => "ok",
    });
    const forged = testJob({ project_id: "project_forged" });
    await assert.rejects(
      fixture.orchestrator.execute({
        job: forged,
        expectedExecutionClass: "text.standard",
        operation: async () => { calls += 1; },
      }),
      GenerationBillingAuthorityError
    );
    assert.equal(calls, 0);
  });

  it("keeps automatic refund inactive and exposes an idempotent debit-bound seam", async () => {
    const inactive = await billingFixture();
    const job = testJob();
    await inactive.orchestrator.execute({
      job,
      expectedExecutionClass: "text.standard",
      operation: async () => "completed",
    });
    const debit = inactive.repository.listLedger("tenant_a")
      .find((entry) => entry.entry_type === "debit");
    assert.equal(
      await inactive.orchestrator.refundDebit({
        job,
        debitEntryId: debit.ledger_entry_id,
        reason: "non_qualifying_failure",
      }),
      null
    );
    assert.equal(
      inactive.repository.listLedger("tenant_a")
        .filter((entry) => entry.entry_type === "refund").length,
      0
    );

    const qualified = await billingFixture({
      qualifiesForRefund: ({ reason }) => reason === "fixture.proven_post_debit_failure",
    });
    const qualifiedJob = testJob({ job_id: "22222222-3333-4444-8555-666666666666" });
    await qualified.orchestrator.execute({
      job: qualifiedJob,
      expectedExecutionClass: "text.standard",
      operation: async () => "completed",
    });
    const qualifiedDebit = qualified.repository.listLedger("tenant_a")
      .find((entry) => entry.entry_type === "debit");
    const refundInput = {
      job: qualifiedJob,
      debitEntryId: qualifiedDebit.ledger_entry_id,
      reason: "fixture.proven_post_debit_failure",
    };
    const refund = await qualified.orchestrator.refundDebit(refundInput);
    const replay = await qualified.orchestrator.refundDebit(refundInput);
    assert.equal(replay.ledger_entry_id, refund.ledger_entry_id);
    assert.equal(refund.debit_entry_id, qualifiedDebit.ledger_entry_id);
    assert.equal(refund.generation_id, qualifiedJob.job_id);
    assert.equal(
      qualified.repository.listLedger("tenant_a")
        .filter((entry) => entry.entry_type === "refund").length,
      1
    );
    await assert.rejects(
      qualified.orchestrator.refundDebit({
        job: qualifiedJob,
        debitEntryId: "ledger_not_the_original_debit",
        reason: "fixture.proven_post_debit_failure",
      }),
      GenerationBillingAuthorityError
    );
  });

  it("keeps Video reserved at submission and settles only a later qualifying outcome", async () => {
    const fixture = await billingFixture();
    for (const [quality, cost] of [["normal", 11], ["premium", 17]]) {
      const job = testJob({
        job_id: quality === "normal"
          ? "33333333-4444-4555-8666-777777777777"
          : "44444444-5555-4666-8777-888888888888",
        execution_class: `video.${quality}`,
        request_correlation_id: `video_${quality}_request`,
        idempotency_key: `video_${quality}_request`,
      });
      const value = await fixture.orchestrator.beginExecution({
        job,
        expectedExecutionClass: `video.${quality}`,
        operation: async () => ({ status: "provider-dormant" }),
      });
      assert.deepEqual(value, { status: "provider-dormant" });
      const reservation = fixture.repository.listLedger("tenant_a")
        .find((entry) =>
          entry.entry_type === "reservation" && entry.generation_id === job.job_id
        );
      assert.equal(reservation.amount, cost);
      assert.equal(
        fixture.repository.listLedger("tenant_a").some((entry) =>
          entry.entry_type === "debit" && entry.generation_id === job.job_id
        ),
        false
      );

      if (quality === "normal") {
        await fixture.orchestrator.settleSuccessfulExecution({ job });
        const debit = fixture.repository.listLedger("tenant_a").find((entry) =>
          entry.entry_type === "debit" && entry.generation_id === job.job_id
        );
        assert.equal(debit.reservation_entry_id, reservation.ledger_entry_id);
      } else {
        await fixture.orchestrator.releaseFailedExecution({ job });
        const release = fixture.repository.listLedger("tenant_a").find((entry) =>
          entry.entry_type === "reservation_release" &&
          entry.generation_id === job.job_id
        );
        assert.equal(release.reservation_entry_id, reservation.ledger_entry_id);
      }
    }
  });
});

describe("customer Text and Image billing boundary", () => {
  it("settles one debit for successful Text and Image while preserving responses", async () => {
    const fixture = await customerAppFixture();
    const text = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest());
    const image = await customer(
      request(fixture.app).post("/customer/generate-image")
    ).send(imageRequest());

    assert.equal(text.status, 200);
    assert.equal(text.body.status, "completed");
    assert.equal(text.body.script_body, COMPLETE_OUTPUT);
    assert.equal(image.status, 200);
    assert.equal(image.body.status, "completed");
    assert.equal(image.body.media.provider, "fixture-image-provider");
    assert.deepEqual(fixture.providerCalls, { text: 1, image: 1 });
    const ledger = fixture.billing.repository.listLedger("tenant_a");
    assert.equal(ledger.filter((entry) => entry.entry_type === "reservation").length, 2);
    assert.equal(ledger.filter((entry) => entry.entry_type === "debit").length, 2);
    assert.deepEqual(
      ledger.filter((entry) => entry.entry_type === "reservation")
        .map((entry) => entry.amount).sort((a, b) => a - b),
      [3, 5]
    );
  });

  it("rejects insufficient credits before Text provider execution with a sanitized contract", async () => {
    const fixture = await customerAppFixture({ credits: 0 });
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest());

    assert.equal(response.status, 402);
    assert.deepEqual(response.body, {
      status: "failed",
      error: {
        code: "GENERATION_CREDITS_UNAVAILABLE",
        message: "There are not enough credits to run this generation",
      },
      script_body: "",
    });
    assert.equal(fixture.providerCalls.text, 0);
    assert.doesNotMatch(JSON.stringify(response.body), /balance|provider|ledger|policy/i);
  });

  it("ignores customer cost, ledger, and alternate billing-tenant fields", async () => {
    const fixture = await customerAppFixture();
    const response = await customer(
      request(fixture.app).post("/customer/generate-script")
    ).send(scriptRequest({
      credit_cost: 0,
      reservation_amount: 0,
      debit_amount: 0,
      refund_amount: 999999,
      provider_cost: 1,
      billing_tenant_id: "tenant_b",
      billing_idempotency_key: "caller_controlled",
    }));

    assert.equal(response.status, 200);
    const reservation = fixture.billing.repository.listLedger("tenant_a")
      .find((entry) => entry.entry_type === "reservation");
    assert.equal(reservation.tenant_id, "tenant_a");
    assert.equal(reservation.amount, TEST_EXECUTION_COSTS["text.standard"]);
    assert.notEqual(reservation.idempotency_key, "caller_controlled");
  });

  it("coalesces concurrent duplicate customer requests before provider execution", async () => {
    const fixture = await customerAppFixture();
    const payload = scriptRequest({ execution_id: "concurrent_customer_request" });
    const [first, duplicate] = await Promise.all([
      customer(request(fixture.app).post("/customer/generate-script")).send(payload),
      customer(request(fixture.app).post("/customer/generate-script")).send(payload),
    ]);

    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.deepEqual(duplicate.body, first.body);
    assert.equal(fixture.providerCalls.text, 1);
    const ledger = fixture.billing.repository.listLedger("tenant_a");
    assert.equal(ledger.filter((entry) => entry.entry_type === "reservation").length, 1);
    assert.equal(ledger.filter((entry) => entry.entry_type === "debit").length, 1);
  });

  it("fails closed when no production Billing authority is configured", async () => {
    let calls = 0;
    const app = createApp({
      authorizationRepository: authorizationRepository(),
      brandBrainRepository: new InMemoryBrandBrainRepository(),
      customerTokenVerifier: new FixtureTokenVerifier(),
      scriptGenerator: async () => {
        calls += 1;
        return { text: COMPLETE_OUTPUT, metadata: { provider: "fixture" } };
      },
      logger: { info() {}, warn() {}, error() {} },
    });
    const response = await customer(
      request(app).post("/customer/generate-script")
    ).send(scriptRequest());

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "GENERATION_BILLING_UNAVAILABLE");
    assert.equal(calls, 0);
  });

  it("keeps service/Make payloads outside financial authority", () => {
    const payload = buildMakeExecutionPayload(testJob(), {
      compiled_prompt: "Safe bounded content",
      tenant_id: "tenant_b",
      credit_cost: 0,
      reservation_amount: 0,
      debit_amount: 0,
      refund_amount: 100,
      billing_idempotency_key: "caller_controlled",
      provider: "caller-provider",
      model: "caller-model",
    });
    assert.deepEqual(payload, {
      job_id: testJob().job_id,
      execution_class: "text.standard",
      execution_input: { compiled_prompt: "Safe bounded content" },
    });
  });
});
