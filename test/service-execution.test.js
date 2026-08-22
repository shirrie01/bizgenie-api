const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");

const {
  StaticServiceCredentialVerifier,
  SERVICE_CREDENTIAL_HEADER,
} = require("../src/service-principal");
const {
  GenerationJobService,
  InMemoryGenerationJobRepository,
} = require("../src/generation-jobs");
const { createServiceExecutionRouter } = require("../src/service-execution");

const CREDENTIAL = "make-service-principal-credential-001";
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

function appFixture({ scopes = ["generation:execute"] } = {}) {
  const jobRepository = new InMemoryGenerationJobRepository();
  const jobService = new GenerationJobService({ repository: jobRepository });
  const servicePrincipalVerifier = new StaticServiceCredentialVerifier({
    serviceId: "make",
    credential: CREDENTIAL,
    scopes,
  });
  const app = express();
  app.use(express.json());
  app.use(
    "/_service/generation-jobs",
    createServiceExecutionRouter({
      jobRepository,
      servicePrincipalVerifier,
      requiredScope: "generation:execute",
    })
  );
  return { app, jobRepository, jobService };
}

describe("service execution boundary", () => {
  it("returns the bounded payload for an existing job with the correct scope and credential", async () => {
    const { app, jobService } = appFixture();
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: "Write a hook", platform: "tiktok" },
    });

    const response = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, CREDENTIAL);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      job_id: job.job_id,
      execution_class: "text.standard",
      execution_input: { compiled_prompt: "Write a hook", platform: "tiktok" },
    });
  });

  it("denies a missing job id without disclosing whether it exists", async () => {
    const { app } = appFixture();
    const response = await request(app)
      .get("/_service/generation-jobs/jobs/unknown-job/execution-payload")
      .set(SERVICE_CREDENTIAL_HEADER, CREDENTIAL);

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Forbidden" });
  });

  it("denies a verified service principal that lacks the required scope", async () => {
    const { app, jobService } = appFixture({ scopes: ["some:other:scope"] });
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
    });

    const response = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, CREDENTIAL);

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Forbidden" });
  });

  it("does not let request headers, query, or body widen service scopes", async () => {
    const { app, jobService } = appFixture({ scopes: ["generation:read"] });
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
    });

    const response = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, CREDENTIAL)
      .set("scope", "generation:execute")
      .set("scopes", "generation:execute")
      .set("allowed_scopes", "generation:execute")
      .query({
        scope: "generation:execute",
        scopes: "generation:execute",
        allowed_scopes: "generation:execute",
      })
      .send({
        scope: "generation:execute",
        scopes: ["generation:execute"],
        allowed_scopes: ["generation:execute"],
      });

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Forbidden" });
  });

  it("denies a job whose own allowed_scopes do not include the required scope", async () => {
    const { app, jobService } = appFixture();
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["some:narrower:scope"],
    });

    const response = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, CREDENTIAL);

    assert.equal(response.status, 403);
  });

  it("never authenticates with a customer bearer token or the admin key", async () => {
    const { app, jobService } = appFixture();
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
    });

    const withJwt = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, "Bearer some.customer.jwt");
    const withAdminKey = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, "admin-key-value-should-not-work");
    const withNoHeader = await request(app).get(
      `/_service/generation-jobs/jobs/${job.job_id}/execution-payload`
    );

    for (const response of [withJwt, withAdminKey, withNoHeader]) {
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { error: "Forbidden" });
    }
  });

  it("returns a payload that never contains tenant, project, brand, or actor identity", async () => {
    const { app, jobService } = appFixture();
    const job = await jobService.authorizeAndCreateJob({
      authorization: authorization(),
      executionClass: "text.standard",
      requestCorrelationId: "execution_001",
      idempotencyKey: "execution_001",
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: "Write a hook" },
    });

    const response = await request(app)
      .get(`/_service/generation-jobs/jobs/${job.job_id}/execution-payload`)
      .set(SERVICE_CREDENTIAL_HEADER, CREDENTIAL);

    const serialized = JSON.stringify(response.body);
    for (const forbidden of ["tenant_a", "project_a", "brand_a", AUTH_USER]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});
