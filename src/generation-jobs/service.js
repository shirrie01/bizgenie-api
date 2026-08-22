const { randomUUID } = require("node:crypto");
const { freezeGenerationJob, ownershipFingerprint } = require("./schema");
const { GenerationJobConflictError } = require("./errors");
const { sanitizeExecutionInput } = require("./executionInput");
const { isIdempotencyConflict } = require("./repository");

// Builds the minimal shape ownershipFingerprint needs from a not-yet-created
// candidate, so a prospective retry can be compared against an existing job
// without first constructing (and validating) a full job record.
function prospectiveOwnership({
  tenantId,
  projectId,
  brandId,
  executionClass,
  requestCorrelationId,
  actor,
  allowedScopes,
}) {
  return {
    tenant_id: tenantId,
    project_id: projectId,
    brand_id: brandId,
    execution_class: executionClass,
    request_correlation_id: requestCorrelationId,
    actor_correlation: actor,
    allowed_scopes: allowedScopes,
  };
}

function requireSameLogicalJob(existing, prospective) {
  if (ownershipFingerprint(existing) !== ownershipFingerprint(prospective)) {
    throw new GenerationJobConflictError();
  }
}

class GenerationJobService {
  constructor({ repository, now = () => new Date() }) {
    if (!repository) {
      throw new TypeError("A generation job repository is required");
    }
    this.repository = repository;
    this.now = now;
  }

  // The only entry point into this module. It accepts the authorization
  // object already produced by AuthorizationService.authorizeProject /
  // authorizeProjectBrand (verified customer, verified tenant/project/brand
  // membership, action === "generation:create") and transitions it into one
  // immutable internal generation job. There is no path here that accepts a
  // caller-supplied tenant_id, project_id, brand_id, or user_id directly:
  // every ownership field comes from the trusted authorization object.
  async authorizeAndCreateJob({
    authorization,
    executionClass,
    requestCorrelationId,
    idempotencyKey,
    allowedScopes,
    executionInput = {},
  }) {
    if (
      !authorization ||
      !authorization.actor ||
      authorization.actor.kind !== "customer" ||
      authorization.action !== "generation:create" ||
      typeof authorization.tenant_id !== "string" ||
      typeof authorization.project_id !== "string"
    ) {
      throw new TypeError(
        "A generation job may only be created from a verified customer generation:create authorization"
      );
    }

    const prospective = prospectiveOwnership({
      tenantId: authorization.tenant_id,
      projectId: authorization.project_id,
      brandId: authorization.brand_id,
      executionClass,
      requestCorrelationId,
      actor: authorization.actor,
      allowedScopes,
    });

    const existing = await this.repository.findByIdempotencyKey(
      authorization.tenant_id,
      authorization.project_id,
      idempotencyKey
    );

    if (existing) {
      requireSameLogicalJob(existing, prospective);
      await this.repository.recordAttempt(existing.job_id);
      return existing;
    }

    const job = freezeGenerationJob({
      job_id: randomUUID(),
      tenant_id: authorization.tenant_id,
      project_id: authorization.project_id,
      brand_id: authorization.brand_id,
      execution_class: executionClass,
      actor_correlation: authorization.actor,
      request_correlation_id: requestCorrelationId,
      idempotency_key: idempotencyKey,
      created_at: this.now().toISOString(),
      allowed_scopes: allowedScopes,
    });

    try {
      await this.repository.create(job, {
        executionContent: sanitizeExecutionInput(executionInput),
      });
    } catch (error) {
      if (!isIdempotencyConflict(error)) {
        throw error;
      }

      // Two asynchronous requests may both observe no row before the first
      // INSERT commits. The database uniqueness guard decides the winner;
      // the loser resolves the committed row and treats it as a retry only
      // when every immutable authority field is identical.
      const racedExisting = await this.repository.findByIdempotencyKey(
        authorization.tenant_id,
        authorization.project_id,
        idempotencyKey
      );
      if (!racedExisting) {
        throw error;
      }
      requireSameLogicalJob(racedExisting, prospective);
      await this.repository.recordAttempt(racedExisting.job_id);
      return racedExisting;
    }

    return job;
  }
}

module.exports = { GenerationJobService };
