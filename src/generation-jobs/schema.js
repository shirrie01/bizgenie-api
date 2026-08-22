const { z } = require("zod");
const { identifier, executionClass } = require("../billing/schema");
const { CustomerActorSchema } = require("../authorization/schema");

const IDENTIFIER_MAX_LENGTH = 128;
const MAX_ALLOWED_SCOPES = 5;
const timestamp = z.string().datetime({ offset: true });

// The scope grammar matches the identifier grammar used for every other
// bounded identifier in this codebase (billing execution classes, tenant and
// project ids, and so on).
const scope = identifier;

// This is the one canonical, immutable internal generation-job contract.
// It binds generation identity, tenant/project/optional-brand ownership, a
// safe customer actor correlation, the execution/media class, request
// correlation/idempotency, a creation timestamp, and the bounded downstream
// scope(s) this job authorizes for service-principal execution.
//
// Deliberately absent, by design, from this schema: user_id (the actor
// correlation below is the only permitted identity reference and it is
// never caller-supplied), provider, model, price, cost, any secret, any
// callback URL, and any asset location. None of those may ever gain
// authority through this contract.
const GenerationJobSchema = z
  .object({
    job_id: identifier,
    tenant_id: identifier,
    project_id: identifier,
    brand_id: identifier.optional(),
    execution_class: executionClass,
    actor_correlation: CustomerActorSchema,
    request_correlation_id: identifier,
    idempotency_key: identifier,
    created_at: timestamp,
    allowed_scopes: z.array(scope).min(1).max(MAX_ALLOWED_SCOPES),
  })
  .strict();

// The fields that define a job's identity and ownership. Two creation
// attempts that share (tenant_id, project_id, idempotency_key) must agree on
// every one of these fields, or the second attempt is a conflict rather than
// a retry of the same logical job.
const OWNERSHIP_FIELDS = Object.freeze([
  "tenant_id",
  "project_id",
  "brand_id",
  "execution_class",
  "request_correlation_id",
]);

function ownershipFingerprint(job) {
  return JSON.stringify({
    tenant_id: job.tenant_id,
    project_id: job.project_id,
    brand_id: job.brand_id ?? null,
    execution_class: job.execution_class,
    request_correlation_id: job.request_correlation_id,
    auth_user_id: job.actor_correlation.auth_user_id,
    allowed_scopes: [...job.allowed_scopes].sort(),
  });
}

function freezeGenerationJob(value) {
  const parsed = GenerationJobSchema.parse(value);
  return Object.freeze({
    ...parsed,
    actor_correlation: Object.freeze({ ...parsed.actor_correlation }),
    allowed_scopes: Object.freeze([...parsed.allowed_scopes]),
  });
}

module.exports = {
  GenerationJobSchema,
  IDENTIFIER_MAX_LENGTH,
  MAX_ALLOWED_SCOPES,
  OWNERSHIP_FIELDS,
  freezeGenerationJob,
  ownershipFingerprint,
};
