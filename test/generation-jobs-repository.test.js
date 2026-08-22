const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  InMemoryGenerationJobRepository,
} = require("../src/generation-jobs/repository");

function job(overrides = {}) {
  return Object.freeze({
    job_id: "job_1",
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    execution_class: "text.standard",
    actor_correlation: Object.freeze({
      kind: "customer",
      auth_user_id: "11111111-1111-4111-8111-111111111111",
    }),
    request_correlation_id: "execution_001",
    idempotency_key: "execution_001",
    created_at: "2026-08-21T00:00:00.000Z",
    allowed_scopes: ["generation:execute"],
    ...overrides,
  });
}

describe("InMemoryGenerationJobRepository", () => {
  it("stores a new job and its execution content once", () => {
    const repository = new InMemoryGenerationJobRepository();
    const created = repository.create(job(), {
      executionContent: { compiled_prompt: "hello" },
    });

    assert.equal(repository.size(), 1);
    assert.deepEqual(repository.getById("job_1"), created);
    assert.deepEqual(repository.getExecutionContent("job_1"), {
      compiled_prompt: "hello",
    });
    assert.equal(repository.getAttemptCount("job_1"), 1);
  });

  it("finds an existing job by its logical (tenant, project, idempotency key)", () => {
    const repository = new InMemoryGenerationJobRepository();
    repository.create(job());

    const found = repository.findByIdempotencyKey(
      "tenant_a",
      "project_a",
      "execution_001"
    );
    assert.equal(found.job_id, "job_1");

    assert.equal(
      repository.findByIdempotencyKey("tenant_b", "project_a", "execution_001"),
      null
    );
    assert.equal(
      repository.findByIdempotencyKey("tenant_a", "project_a", "unknown"),
      null
    );
  });

  it("records repeated attempts without creating a second logical job", () => {
    const repository = new InMemoryGenerationJobRepository();
    repository.create(job());

    repository.recordAttempt("job_1");
    repository.recordAttempt("job_1");

    assert.equal(repository.size(), 1);
    assert.equal(repository.getAttemptCount("job_1"), 3);
  });

  it("refuses to silently overwrite an existing job_id", () => {
    const repository = new InMemoryGenerationJobRepository();
    repository.create(job());

    assert.throws(() => repository.create(job({ tenant_id: "tenant_b" })));
    assert.equal(repository.getById("job_1").tenant_id, "tenant_a");
  });

  it("refuses a second job for the same scoped idempotency identity", () => {
    const repository = new InMemoryGenerationJobRepository();
    repository.create(job());

    assert.throws(
      () => repository.create(job({ job_id: "job_2" })),
      (error) =>
        error.code === "23505" &&
        error.constraint === "generation_jobs_idempotency_unique"
    );
    assert.equal(repository.size(), 1);
  });

  it("returns frozen job and execution-content records", () => {
    const repository = new InMemoryGenerationJobRepository();
    repository.create(job(), { executionContent: { topic: "hi" } });

    const stored = repository.getById("job_1");
    const content = repository.getExecutionContent("job_1");

    assert.equal(Object.isFrozen(stored), true);
    assert.equal(Object.isFrozen(stored.actor_correlation), true);
    assert.equal(Object.isFrozen(stored.allowed_scopes), true);
    assert.equal(Object.isFrozen(content), true);
    assert.throws(() => {
      "use strict";
      stored.tenant_id = "tenant_b";
    }, TypeError);
  });

  it("returns null for an unknown job id", () => {
    const repository = new InMemoryGenerationJobRepository();
    assert.equal(repository.getById("missing"), null);
    assert.equal(repository.getExecutionContent("missing"), null);
    assert.equal(repository.getAttemptCount("missing"), 0);
    assert.equal(repository.recordAttempt("missing"), 0);
  });
});
