const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  GenerationJobConflictError,
  GenerationJobSchema,
  GenerationJobService,
  InMemoryGenerationJobRepository,
} = require("../src/generation-jobs");
const {
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function actorA() {
  return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A });
}

function authorization(overrides = {}) {
  return {
    actor: actorA(),
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    membership_role: "owner",
    action: "generation:create",
    ...overrides,
  };
}

function service() {
  const repository = new InMemoryGenerationJobRepository();
  return {
    repository,
    service: new GenerationJobService({
      repository,
      now: () => new Date("2026-08-21T00:00:00.000Z"),
    }),
  };
}

describe("GenerationJobSchema", () => {
  it("has no field that grants provider, model, price, cost, secret, callback, or asset-location authority", () => {
    const keys = Object.keys(GenerationJobSchema.shape);
    for (const forbidden of [
      "provider",
      "model",
      "price",
      "cost",
      "secret",
      "callback",
      "callback_url",
      "asset_location",
      "user_id",
    ]) {
      assert.equal(keys.includes(forbidden), false);
    }
  });

  it("rejects an unknown field (no room for a caller to widen the contract)", () => {
    const parsed = GenerationJobSchema.safeParse({
      job_id: "job_1",
      tenant_id: "tenant_a",
      project_id: "project_a",
      execution_class: "text.standard",
      actor_correlation: { kind: "customer", auth_user_id: USER_A },
      request_correlation_id: "execution_001",
      idempotency_key: "execution_001",
      created_at: "2026-08-21T00:00:00.000Z",
      allowed_scopes: ["generation:execute"],
      provider: "vertex-ai",
    });
    assert.equal(parsed.success, false);
  });
});

describe("GenerationJobService.authorizeAndCreateJob", () => {
  it("creates one immutable job from a verified customer authorization", async () => {
    const { service: jobService } = service();
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: "Write a hook" },
    });

    assert.equal(job.tenant_id, "tenant_a");
    assert.equal(job.project_id, "project_a");
    assert.equal(job.brand_id, "brand_a");
    assert.equal(job.execution_class, "text.standard");
    assert.equal(job.actor_correlation.auth_user_id, USER_A);
    assert.equal(Object.isFrozen(job), true);
    assert.equal(Object.isFrozen(job.actor_correlation), true);
    assert.equal(Object.isFrozen(job.allowed_scopes), true);
    assert.match(
      job.job_id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("never lets a client-supplied user_id or actor establish job ownership", async () => {
    const { service: jobService } = service();
    // authorization.actor always comes from AuthorizationService, which in
    // turn only ever accepts createCustomerActorFromVerifiedIdentity output.
    // This test asserts the job service does not accept an alternate actor
    // field (e.g. a raw body actor) anywhere in its input shape.
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: "x", user_id: USER_B },
    });

    assert.equal(job.actor_correlation.auth_user_id, USER_A);
  });

  it("rejects job creation from anything other than a customer generation:create authorization", async () => {
    const { service: jobService } = service();
    for (const badAuthorization of [
      null,
      { ...authorization(), actor: { kind: "administrator" } },
      { ...authorization(), actor: { kind: "service", service_id: "make", scopes: [] } },
      { ...authorization(), action: "project:read" },
      { ...authorization(), tenant_id: undefined },
    ]) {
      await assert.rejects(
        jobService.authorizeAndCreateJob({
          authorization: badAuthorization,
          executionClass: "text.standard",
          requestCorrelationId: "execution_001",
          idempotencyKey: "execution_001",
          allowedScopes: ["generation:execute"],
        }),
        TypeError
      );
    }
  });

  it("preserves one logical job across a retry with the same idempotency key", async () => {
    const { service: jobService, repository } = service();
    const first = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: "Write a hook" },
    });
    const retry = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: "Write a hook" },
    });

    assert.equal(retry.job_id, first.job_id);
    assert.equal(repository.size(), 1);
    assert.equal(repository.getAttemptCount(first.job_id), 2);
  });

  it("rejects a replayed scoped idempotency key that changes immutable authority", async () => {
    const { service: jobService } = service();
    await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
    });

    for (const mutated of [
      authorization({ brand_id: "brand_b" }),
      authorization({ brand_id: undefined }),
      authorization({
        actor: createCustomerActorFromVerifiedIdentity({
          verifiedAuthUserId: USER_B,
        }),
      }),
    ]) {
      await assert.rejects(
        jobService.authorizeAndCreateJob({
          authorization: mutated,
          executionClass: "text.standard",
          requestCorrelationId: "execution_001",
          idempotencyKey: "execution_001",
          allowedScopes: ["generation:execute"],
        }),
        GenerationJobConflictError
      );
    }

    await assert.rejects(
      jobService.authorizeAndCreateJob({
        authorization: authorization(),
        executionClass: "image.normal",
        requestCorrelationId: "execution_001",
        idempotencyKey: "execution_001",
        allowedScopes: ["generation:execute"],
      }),
      GenerationJobConflictError
    );

    await assert.rejects(
      jobService.authorizeAndCreateJob({
        authorization: authorization(),
        executionClass: "text.standard",
        requestCorrelationId: "execution_changed",
        idempotencyKey: "execution_001",
        allowedScopes: ["generation:execute"],
      }),
      GenerationJobConflictError
    );

    await assert.rejects(
      jobService.authorizeAndCreateJob({
        authorization: authorization(),
        executionClass: "text.standard",
        requestCorrelationId: "execution_001",
        idempotencyKey: "execution_001",
        allowedScopes: ["generation:other"],
      }),
      GenerationJobConflictError
    );
  });

  it("does not let a different tenant's retry with the same idempotency key touch tenant A's job", async () => {
    const { service: jobService, repository } = service();
    await jobService.authorizeAndCreateJob({
      authorization: authorization({ tenant_id: "tenant_a", project_id: "project_a" }),
      executionClass: "text.standard",
      requestCorrelationId: "execution_shared",
      idempotencyKey: "execution_shared",
      allowedScopes: ["generation:execute"],
    });

    const tenantBJob = await jobService.authorizeAndCreateJob({
      authorization: authorization({
        actor: createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_B }),
        tenant_id: "tenant_b",
        project_id: "project_b",
        brand_id: "brand_b",
      }),
      executionClass: "text.standard",
      requestCorrelationId: "execution_shared",
      idempotencyKey: "execution_shared",
      allowedScopes: ["generation:execute"],
    });

    assert.equal(tenantBJob.tenant_id, "tenant_b");
    assert.equal(repository.size(), 2);
  });
});
