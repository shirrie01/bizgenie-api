const {
  freezeGenerationJob,
} = require("./schema");

const IDEMPOTENCY_CONSTRAINT = "generation_jobs_idempotency_unique";

function idempotencyConflictError() {
  const error = new Error(
    "A generation job with this idempotency identity already exists"
  );
  error.code = "23505";
  error.constraint = IDEMPOTENCY_CONSTRAINT;
  return error;
}

function isIdempotencyConflict(error) {
  return (
    error?.code === "23505" &&
    error?.constraint === IDEMPOTENCY_CONSTRAINT
  );
}

class GenerationJobRepository {
  findByIdempotencyKey(_tenantId, _projectId, _idempotencyKey) {
    throw new Error(
      "GenerationJobRepository.findByIdempotencyKey is not implemented"
    );
  }

  create(_job, _options) {
    throw new Error("GenerationJobRepository.create is not implemented");
  }

  getById(_jobId) {
    throw new Error("GenerationJobRepository.getById is not implemented");
  }

  getExecutionContent(_jobId) {
    throw new Error(
      "GenerationJobRepository.getExecutionContent is not implemented"
    );
  }

  recordAttempt(_jobId) {
    throw new Error("GenerationJobRepository.recordAttempt is not implemented");
  }
}

function idempotencyMapKey(tenantId, projectId, idempotencyKey) {
  return `${tenantId}\u0000${projectId}\u0000${idempotencyKey}`;
}

// Process-local reference implementation. A generation job, once created, is
// never mutated: retries either return the exact same frozen record (after
// recording an attempt for observability) or are rejected outright as a
// conflict. There is no update path at all, by design.
class InMemoryGenerationJobRepository extends GenerationJobRepository {
  constructor() {
    super();
    this.jobsById = new Map();
    this.jobIdByIdempotencyKey = new Map();
    this.executionContentByJobId = new Map();
    this.attemptCountByJobId = new Map();
  }

  findByIdempotencyKey(tenantId, projectId, idempotencyKey) {
    const jobId = this.jobIdByIdempotencyKey.get(
      idempotencyMapKey(tenantId, projectId, idempotencyKey)
    );
    return jobId ? this.jobsById.get(jobId) || null : null;
  }

  create(job, { executionContent = {} } = {}) {
    const storedJob = freezeGenerationJob(job);
    if (this.jobsById.has(storedJob.job_id)) {
      // Defense in depth: job_id is server-generated (randomUUID), so this
      // should be unreachable, but a duplicate id must never silently
      // overwrite an existing immutable job.
      throw new Error("A generation job with this job_id already exists");
    }

    const logicalKey = idempotencyMapKey(
      storedJob.tenant_id,
      storedJob.project_id,
      storedJob.idempotency_key
    );
    if (this.jobIdByIdempotencyKey.has(logicalKey)) {
      throw idempotencyConflictError();
    }

    this.jobsById.set(storedJob.job_id, storedJob);
    this.jobIdByIdempotencyKey.set(
      logicalKey,
      storedJob.job_id
    );
    this.executionContentByJobId.set(
      storedJob.job_id,
      Object.freeze({ ...executionContent })
    );
    this.attemptCountByJobId.set(storedJob.job_id, 1);
    return storedJob;
  }

  getById(jobId) {
    return this.jobsById.get(jobId) || null;
  }

  getExecutionContent(jobId) {
    return this.executionContentByJobId.get(jobId) || null;
  }

  recordAttempt(jobId) {
    if (!this.jobsById.has(jobId)) {
      return 0;
    }
    const next = (this.attemptCountByJobId.get(jobId) || 0) + 1;
    this.attemptCountByJobId.set(jobId, next);
    return next;
  }

  getAttemptCount(jobId) {
    return this.attemptCountByJobId.get(jobId) || 0;
  }

  // Test/operational convenience: the number of distinct logical jobs held
  // by this repository, independent of how many times each was retried.
  size() {
    return this.jobsById.size;
  }
}

module.exports = {
  GenerationJobRepository,
  IDEMPOTENCY_CONSTRAINT,
  InMemoryGenerationJobRepository,
  idempotencyMapKey,
  isIdempotencyConflict,
};
