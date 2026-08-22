const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  GenerationJobConflictError,
  GenerationJobService,
  InMemoryGenerationJobRepository,
} = require("../src/generation-jobs");

const AUTH_USER = "11111111-1111-4111-8111-111111111111";

function authorization(overrides = {}) {
  return {
    actor: { kind: "customer", auth_user_id: AUTH_USER },
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    action: "generation:create",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    authorization: authorization(),
    executionClass: "text.standard",
    requestCorrelationId: "execution_001",
    idempotencyKey: "execution_001",
    allowedScopes: ["generation:execute"],
    executionInput: { compiled_prompt: "Write a hook" },
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class AsyncRaceRepository {
  constructor() {
    this.job = null;
    this.executionContent = null;
    this.attempts = 0;
    this.initialFinds = 0;
    this.releaseFirstFind = null;
  }

  async findByIdempotencyKey() {
    if (this.job) {
      return this.job;
    }

    this.initialFinds += 1;
    if (this.initialFinds === 1) {
      await new Promise((resolve) => {
        this.releaseFirstFind = resolve;
      });
    } else if (this.initialFinds === 2) {
      this.releaseFirstFind();
      await Promise.resolve();
    }
    return null;
  }

  async create(job, { executionContent }) {
    await new Promise((resolve) => setImmediate(resolve));
    if (this.job) {
      const error = new Error("duplicate idempotency identity");
      error.code = "23505";
      error.constraint = "generation_jobs_idempotency_unique";
      throw error;
    }
    this.job = job;
    this.executionContent = executionContent;
    this.attempts = 1;
    return job;
  }

  async recordAttempt() {
    await Promise.resolve();
    this.attempts += 1;
    return this.attempts;
  }
}

describe("GenerationJobService asynchronous persistence", () => {
  it("does not establish a job until asynchronous create persistence completes", async () => {
    const create = deferred();
    const repository = {
      async findByIdempotencyKey() {
        return null;
      },
      create() {
        return create.promise;
      },
      async recordAttempt() {
        throw new Error("recordAttempt should not be called");
      },
    };
    const service = new GenerationJobService({ repository });
    let settled = false;
    const pending = service.authorizeAndCreateJob(input()).then((job) => {
      settled = true;
      return job;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    create.resolve();
    const job = await pending;
    assert.equal(settled, true);
    assert.equal(job.request_correlation_id, "execution_001");
  });

  it("propagates asynchronous persistence rejection", async () => {
    const persistenceError = new Error("database unavailable");
    const repository = {
      async findByIdempotencyKey() {
        return null;
      },
      async create() {
        throw persistenceError;
      },
      async recordAttempt() {
        throw new Error("recordAttempt should not be called");
      },
    };
    const service = new GenerationJobService({ repository });

    await assert.rejects(
      service.authorizeAndCreateJob(input()),
      (error) => error === persistenceError
    );
  });

  it("awaits asynchronous retry-attempt persistence", async () => {
    const raceRepository = new InMemoryGenerationJobRepository();
    const firstService = new GenerationJobService({
      repository: raceRepository,
    });
    const existing = await firstService.authorizeAndCreateJob(input());
    const attempt = deferred();
    raceRepository.recordAttempt = () => attempt.promise;

    let settled = false;
    const pending = firstService.authorizeAndCreateJob(input()).then((job) => {
      settled = true;
      return job;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    attempt.resolve(2);
    const replay = await pending;
    assert.equal(replay.job_id, existing.job_id);
  });

  it("resolves concurrent identical requests to one logical persisted job", async () => {
    const repository = new AsyncRaceRepository();
    const service = new GenerationJobService({ repository });

    const [left, right] = await Promise.all([
      service.authorizeAndCreateJob(input()),
      service.authorizeAndCreateJob(input()),
    ]);

    assert.equal(left.job_id, right.job_id);
    assert.equal(repository.initialFinds, 2);
    assert.equal(repository.attempts, 2);
    assert.equal(repository.job.job_id, left.job_id);
  });

  it("rejects a concurrent replay that changes immutable authority", async () => {
    const repository = new AsyncRaceRepository();
    const service = new GenerationJobService({ repository });

    const results = await Promise.allSettled([
      service.authorizeAndCreateJob(input()),
      service.authorizeAndCreateJob(
        input({ executionClass: "image.normal" })
      ),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.ok(rejection.reason instanceof GenerationJobConflictError);
    assert.equal(repository.job !== null, true);
  });
});
