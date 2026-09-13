const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  BillingService,
  InMemoryBillingRepository,
  IdempotencyConflictError,
} = require("../src/billing");
const { hashIntent } = require("../src/billing/repository");

const tenant = "fonzo-founder";
const periodStart = "2026-09-01T00:00:00.000Z";
const periodEnd = "2026-10-01T00:00:00.000Z";

function setup(accounts = []) {
  const repository = new InMemoryBillingRepository({
    policies: [{
      policy_id: "paid-beta-standard-v1", plan_code: "standard", policy_version: 1,
      status: "active", included_monthly_credits: 60, bolt_on_eligible: true,
      effective_from: "2026-09-01T00:00:00.000Z", execution_costs: { "text.standard": 1 },
    }],
    entitlements: [{
      entitlement_id: "entitlement-fonzo", tenant_id: tenant, policy_id: "paid-beta-standard-v1",
      plan_code: "standard", status: "active", starts_at: periodStart,
      reference_period_start: periodStart, reference_period_end: periodEnd,
      included_monthly_credit_grant: 60,
    }],
    accounts,
    projects: [{ project_id: "project-fonzo", tenant_id: tenant }],
    now: () => new Date("2026-09-10T00:00:00.000Z"),
    idFactory: (() => { let n = 0; return () => `ledger_${++n}`; })(),
  });
  return { repository, service: new BillingService({ repository, now: () => new Date("2026-09-10T00:00:00.000Z") }) };
}

const account = { account_id: "account-fonzo", tenant_id: tenant, status: "active", created_at: periodStart };

describe("Paid-Beta v1 executable billing contract", () => {
  it("proves monthly grant replay is one exact 60-credit financial effect", async () => {
    const { repository, service } = setup([account]);
    const first = await service.grantMonthlyCredits({ tenantId: tenant, idempotencyKey: "monthly-fonzo-2026-09" });
    const replay = await service.grantMonthlyCredits({ tenantId: tenant, idempotencyKey: "monthly-fonzo-2026-09" });
    assert.equal(first.ledger_entry_id, replay.ledger_entry_id);
    assert.equal(repository.readBalance(tenant).ledger_balance, 60);
    assert.equal(repository.listLedger(tenant).length, 1);
    assert.equal(first.intent_hash, hashIntent({
      tenant_id: tenant, entry_type: "monthly_grant", amount: 60, balance_delta: 60,
      reserved_delta: 0, idempotency_key: "monthly-fonzo-2026-09",
      entitlement_id: "entitlement-fonzo", reference_period_start: periodStart,
      reference_period_end: periodEnd, account_id: "account-fonzo",
    }));
  });

  it("rejects an idempotency replay with a different financial intent", async () => {
    const { service } = setup([account]);
    await service.grantMonthlyCredits({ tenantId: tenant, idempotencyKey: "monthly-fonzo-2026-09" });
    await assert.rejects(
      service.appendFinancialTransaction({ tenantId: tenant, idempotencyKey: "monthly-fonzo-2026-09", entry_type: "monthly_grant", amount: 61, balance_delta: 61, reserved_delta: 0, entitlement_id: "entitlement-fonzo", reference_period_start: periodStart, reference_period_end: periodEnd }),
      IdempotencyConflictError
    );
  });

  it("uses the existing authoritative account and supports reservation/debit at text.standard cost", async () => {
    const { repository, service } = setup([account]);
    await service.grantMonthlyCredits({ tenantId: tenant, idempotencyKey: "monthly-fonzo-2026-09" });
    const reservation = await service.createReservation({ tenantId: tenant, projectId: "project-fonzo", generationId: "job-1", executionId: "exec-1", transactionCorrelationId: "corr-1", executionClass: "text.standard", idempotencyKey: "reservation-job-1" });
    assert.equal(reservation.amount, 1);
    const debit = await service.finalizeDebit({ tenantId: tenant, reservationEntryId: reservation.ledger_entry_id, idempotencyKey: "debit-job-1" });
    assert.equal(debit.amount, 1);
    assert.equal(repository.readBalance(tenant).ledger_balance, 59);
  });

  it("has no image/video approval in the Paid-Beta policy", () => {
    const { repository } = setup([account]);
    const policy = repository.getCommercialPolicy("paid-beta-standard-v1", "2026-09-10T00:00:00.000Z");
    assert.deepEqual(Object.keys(policy.execution_costs), ["text.standard"]);
    assert.equal(repository.getCommercialPolicy("paid-beta-standard-v1", "2026-09-10T00:00:00.000Z").execution_costs["image.normal"], undefined);
  });
});
