const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  BillingConfigurationError,
  PostgresBillingRepository,
  REQUIRED_RELATIONS,
  createPostgresBillingProductionComposition,
} = require("../src/billing");
const {
  GenerationBillingOrchestrator,
  UnconfiguredGenerationBillingOrchestrator,
} = require("../src/generation-billing");

function initializationPool({
  infrastructure = {
    idempotency_index: "credit_ledger_idempotency_global_unique",
    authority_trigger: true,
  },
  unsafePrivileges = [],
} = {}) {
  return {
    connect() {
      throw new Error("not used during initialization");
    },
    async query(sql) {
      if (sql.includes("AS idempotency_index")) {
        return {
          rows: [infrastructure],
        };
      }
      if (sql.includes("to_regclass")) {
        return {
          rows: REQUIRED_RELATIONS.map((name) => ({ name, relation: name })),
        };
      }
      if (sql.includes("FROM pg_constraint")) {
        return {
          rows: [
            { conname: "generation_jobs_job_tenant_project_unique" },
            { conname: "credit_ledger_generation_job_fkey" },
            { conname: "credit_ledger_generation_authority_shape" },
          ],
        };
      }
      if (sql.includes("WITH financial_tables")) {
        return { rowCount: unsafePrivileges.length, rows: unsafePrivileges };
      }
      if (sql.includes("FROM public.commercial_policies")) {
        return {
          rows: [
            {
              policy_id: "policy_reviewed_v1",
              execution_class: "text.standard",
              credit_cost: "1",
            },
            {
              policy_id: "policy_reviewed_v1",
              execution_class: "image.normal",
              credit_cost: "2",
            },
          ],
        };
      }
      throw new Error("unexpected initialization query");
    },
  };
}

describe("durable billing production composition", () => {
  it("keeps customer generation fail-closed when activation is absent", async () => {
    const result = await createPostgresBillingProductionComposition({
      pool: initializationPool(),
      env: {},
    });
    assert.equal(result.enabled, false);
    assert.equal(result.billingRepository, null);
    assert.equal(result.billingService, null);
    assert.ok(
      result.generationBillingOrchestrator instanceof
        UnconfiguredGenerationBillingOrchestrator
    );
  });

  it("rejects partial or ambiguous activation configuration", async () => {
    await assert.rejects(
      createPostgresBillingProductionComposition({
        pool: initializationPool(),
        env: { BILLING_DURABLE_ENABLED: "yes" },
      }),
      BillingConfigurationError
    );
    await assert.rejects(
      createPostgresBillingProductionComposition({
        pool: initializationPool(),
        env: { BILLING_DURABLE_ENABLED: "true" },
      }),
      BillingConfigurationError
    );
  });

  it("initializes only with reviewed policy rows and positive execution costs", async () => {
    const result = await createPostgresBillingProductionComposition({
      pool: initializationPool(),
      env: {
        BILLING_DURABLE_ENABLED: "true",
        BILLING_APPROVED_POLICY_IDS: "policy_reviewed_v1",
        BILLING_APPROVED_EXECUTION_CLASSES: "text.standard,image.normal",
      },
    });
    assert.equal(result.enabled, true);
    assert.ok(result.billingRepository instanceof PostgresBillingRepository);
    assert.ok(
      result.generationBillingOrchestrator instanceof
        GenerationBillingOrchestrator
    );
  });

  it("fails closed for a missing authority guard or an unsafe customer role", async () => {
    const env = {
      BILLING_DURABLE_ENABLED: "true",
      BILLING_APPROVED_POLICY_IDS: "policy_reviewed_v1",
      BILLING_APPROVED_EXECUTION_CLASSES: "text.standard,image.normal",
    };
    await assert.rejects(
      createPostgresBillingProductionComposition({
        pool: initializationPool({
          infrastructure: {
            idempotency_index: null,
            authority_trigger: true,
          },
        }),
        env,
      }),
      BillingConfigurationError
    );
    await assert.rejects(
      createPostgresBillingProductionComposition({
        pool: initializationPool({
          unsafePrivileges: [{
            role_name: "authenticated",
            relation: "public.credit_ledger",
          }],
        }),
        env,
      }),
      BillingConfigurationError
    );
  });
});
