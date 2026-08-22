const { GenerationJobRepository } = require("./repository");
const { freezeGenerationJob } = require("./schema");

// Mirrors PostgresAuthorizationRepository's shape. createProductionApp uses
// this repository, but the accompanying migration remains deliberately
// unapplied in this task. Production rollout is a separate, reviewed gate.
class PostgresGenerationJobRepository extends GenerationJobRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") {
      throw new TypeError("A PostgreSQL connection pool is required");
    }
    this.pool = pool;
  }

  async findByIdempotencyKey(tenantId, projectId, idempotencyKey) {
    const result = await this.pool.query(
      `SELECT job_id, tenant_id, project_id, brand_id, execution_class,
              auth_user_id, request_correlation_id, idempotency_key,
              allowed_scopes, created_at
         FROM public.generation_jobs
        WHERE tenant_id = $1
          AND project_id = $2
          AND idempotency_key = $3`,
      [tenantId, projectId, idempotencyKey]
    );
    return result.rows[0] ? this.toJob(result.rows[0]) : null;
  }

  async create(job, { executionContent = {} } = {}) {
    await this.pool.query(
      `INSERT INTO public.generation_jobs
         (job_id, tenant_id, project_id, brand_id, execution_class,
          auth_user_id, request_correlation_id, idempotency_key,
          allowed_scopes, execution_content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        job.job_id,
        job.tenant_id,
        job.project_id,
        job.brand_id || null,
        job.execution_class,
        job.actor_correlation.auth_user_id,
        job.request_correlation_id,
        job.idempotency_key,
        JSON.stringify(job.allowed_scopes),
        JSON.stringify(executionContent),
        job.created_at,
      ]
    );
    return job;
  }

  async getById(jobId) {
    const result = await this.pool.query(
      `SELECT job_id, tenant_id, project_id, brand_id, execution_class,
              auth_user_id, request_correlation_id, idempotency_key,
              allowed_scopes, created_at
         FROM public.generation_jobs
        WHERE job_id = $1`,
      [jobId]
    );
    return result.rows[0] ? this.toJob(result.rows[0]) : null;
  }

  async getExecutionContent(jobId) {
    const result = await this.pool.query(
      `SELECT execution_content FROM public.generation_jobs WHERE job_id = $1`,
      [jobId]
    );
    return result.rows[0] ? result.rows[0].execution_content : null;
  }

  async recordAttempt(_jobId) {
    // Attempt counts are an observability aid only, never an ownership
    // field, and are intentionally not persisted server-side here to avoid
    // adding a mutable column to an otherwise append-only table. A future
    // task may add a separate, non-authoritative attempts log if needed.
    return 0;
  }

  // eslint-disable-next-line class-methods-use-this
  toJob(row) {
    return freezeGenerationJob({
      job_id: row.job_id,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      brand_id: row.brand_id || undefined,
      execution_class: row.execution_class,
      actor_correlation: {
        kind: "customer",
        auth_user_id: row.auth_user_id,
      },
      request_correlation_id: row.request_correlation_id,
      idempotency_key: row.idempotency_key,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      allowed_scopes:
        typeof row.allowed_scopes === "string"
          ? JSON.parse(row.allowed_scopes)
          : row.allowed_scopes,
    });
  }
}

module.exports = { PostgresGenerationJobRepository };
