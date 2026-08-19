const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  BillingService,
  DuplicateFinancialEffectError,
  EntitlementInactiveError,
  FinancialResourceUnavailableError,
  IdempotencyConflictError,
  InMemoryBillingRepository,
  InsufficientCreditsError,
} = require("../src/billing");

const NOW = "2026-08-19T12:00:00.000Z";
const PERIOD_START = "2026-08-01T00:00:00.000Z";
const PERIOD_END = "2026-09-01T00:00:00.000Z";

function policy(overrides = {}) {
  return {
    policy_id: "policy_standard_v1",
    plan_code: "standard",
    policy_version: 1,
    status: "active",
    included_monthly_credits: 10,
    bolt_on_eligible: true,
    effective_from: "2026-01-01T00:00:00.000Z",
    execution_costs: {
      "text.standard": 1,
      "image.normal": 2,
      "image.premium": 4,
      "video.normal": 6,
      "video.premium": 9,
    },
    ...overrides,
  };
}

function entitlement(tenantId, overrides = {}) {
  return {
    entitlement_id: `entitlement_${tenantId}`,
    tenant_id: tenantId,
    policy_id: "policy_standard_v1",
    plan_code: "standard",
    status: "active",
    starts_at: "2026-01-01T00:00:00.000Z",
    reference_period_start: PERIOD_START,
    reference_period_end: PERIOD_END,
    included_monthly_credit_grant: 10,
    ...overrides,
  };
}

function account(tenantId) {
  return {
    account_id: `account_${tenantId}`,
    tenant_id: tenantId,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function setup({ policies = [policy()], entitlements } = {}) {
  let nextId = 1;
  const repository = new InMemoryBillingRepository({
    policies,
    entitlements: entitlements || [
      entitlement("tenant_a"),
      entitlement("tenant_b"),
      entitlement("tenant_c", { status: "inactive" }),
    ],
    accounts: [
      account("tenant_a"),
      account("tenant_b"),
      account("tenant_c"),
    ],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a" },
      { project_id: "project_b", tenant_id: "tenant_b" },
      { project_id: "project_c", tenant_id: "tenant_c" },
    ],
    now: () => new Date(NOW),
    idFactory: () => `ledger_${String(nextId++).padStart(3, "0")}`,
  });
  const service = new BillingService({
    repository,
    now: () => new Date(NOW),
  });
  return { repository, service };
}

async function monthlyGrant(service, tenantId = "tenant_a", suffix = tenantId) {
  return service.grantMonthlyCredits({
    tenantId,
    idempotencyKey: `monthly_${suffix}_2026_08`,
  });
}

async function reserve(
  service,
  {
    tenantId = "tenant_a",
    projectId = "project_a",
    generationId = "generation_001",
    executionId = "execution_001",
    transactionCorrelationId = "transaction_001",
    executionClass = "video.normal",
    idempotencyKey = "reserve_generation_001",
  } = {}
) {
  return service.createReservation({
    tenantId,
    projectId,
    generationId,
    executionId,
    transactionCorrelationId,
    executionClass,
    idempotencyKey,
  });
}

describe("commercial policy and entitlement", () => {
  for (const [executionClass, expectedCost] of Object.entries(
    policy().execution_costs
  )) {
    it(`resolves ${executionClass} without provider coupling`, async () => {
      const { service } = setup();
      const result = await service.resolveExecutionCreditCost({
        tenantId: "tenant_a",
        executionClass,
      });
      assert.equal(result.credit_cost, expectedCost);
      assert.equal(result.execution_class, executionClass);
      assert.equal("provider" in result, false);
      assert.equal("model" in result, false);
    });
  }

  it("returns an active tenant entitlement", async () => {
    const { service } = setup();
    const result = await service.readActiveEntitlement({ tenantId: "tenant_a" });
    assert.equal(result.entitlement_id, "entitlement_tenant_a");
    assert.equal(result.included_monthly_credit_grant, 10);
  });

  it("fails closed for an inactive tenant entitlement", async () => {
    const { service } = setup();
    await assert.rejects(
      service.readActiveEntitlement({ tenantId: "tenant_c" }),
      EntitlementInactiveError
    );
  });
});

describe("grants and idempotency", () => {
  it("applies a monthly grant once for repeated identical intent", async () => {
    const { repository, service } = setup();
    const first = await monthlyGrant(service);
    const replay = await monthlyGrant(service);
    assert.equal(replay.ledger_entry_id, first.ledger_entry_id);
    assert.equal(repository.listLedger("tenant_a").length, 1);
    assert.equal((await service.readBalance({ tenantId: "tenant_a" })).available_balance, 10);
  });

  it("prevents a duplicate monthly grant even with a different idempotency key", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    await assert.rejects(
      service.grantMonthlyCredits({
        tenantId: "tenant_a",
        idempotencyKey: "monthly_accidental_second_key",
      }),
      DuplicateFinancialEffectError
    );
  });

  it("applies a bolt-on grant idempotently and rejects a duplicate payment", async () => {
    const { repository, service } = setup();
    const input = {
      tenantId: "tenant_a",
      amount: 25,
      paymentReference: "payment_001",
      idempotencyKey: "bolt_on_payment_001",
    };
    const first = await service.grantBoltOnCredits(input);
    const replay = await service.grantBoltOnCredits(input);
    assert.equal(replay.ledger_entry_id, first.ledger_entry_id);
    assert.equal(repository.listLedger("tenant_a").length, 1);
    await assert.rejects(
      service.grantBoltOnCredits({
        ...input,
        idempotencyKey: "bolt_on_payment_001_second_key",
      }),
      DuplicateFinancialEffectError
    );
  });

  it("fails closed when one idempotency key is reused for different intent", async () => {
    const { service } = setup();
    await service.grantBoltOnCredits({
      tenantId: "tenant_a",
      amount: 5,
      paymentReference: "payment_shared_key",
      idempotencyKey: "shared_financial_key",
    });
    await assert.rejects(
      service.adjustCredits({
        tenantId: "tenant_a",
        amount: 5,
        direction: "credit",
        transactionCorrelationId: "admin_shared_key",
        idempotencyKey: "shared_financial_key",
      }),
      IdempotencyConflictError
    );
  });
});

describe("reservation, debit, release, and refund", () => {
  it("reserves from derived availability", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    const reservation = await reserve(service);
    assert.equal(reservation.amount, 6);
    assert.deepEqual(await service.readBalance({ tenantId: "tenant_a" }), {
      tenant_id: "tenant_a",
      account_id: "account_tenant_a",
      available_balance: 4,
      reserved_balance: 6,
      ledger_balance: 10,
      debited_credits: 0,
      refunded_credits: 0,
      net_spent_credits: 0,
    });
  });

  it("rejects a reservation with insufficient available balance", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    await reserve(service);
    await assert.rejects(
      reserve(service, {
        generationId: "generation_002",
        executionId: "execution_002",
        transactionCorrelationId: "transaction_002",
        idempotencyKey: "reserve_generation_002",
      }),
      InsufficientCreditsError
    );
  });

  it("serializes simultaneous competing reservations", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    const results = await Promise.allSettled([
      reserve(service, {
        generationId: "generation_race_a",
        executionId: "execution_race_a",
        transactionCorrelationId: "transaction_race_a",
        idempotencyKey: "reserve_generation_race_a",
      }),
      reserve(service, {
        generationId: "generation_race_b",
        executionId: "execution_race_b",
        transactionCorrelationId: "transaction_race_b",
        idempotencyKey: "reserve_generation_race_b",
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected.reason instanceof InsufficientCreditsError);
    const balance = await service.readBalance({ tenantId: "tenant_a" });
    assert.equal(balance.available_balance, 4);
    assert.equal(balance.reserved_balance, 6);
  });

  it("releases a reservation exactly once", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    const reservation = await reserve(service);
    const input = {
      tenantId: "tenant_a",
      reservationEntryId: reservation.ledger_entry_id,
      idempotencyKey: "release_generation_001",
    };
    const release = await service.releaseReservation(input);
    const replay = await service.releaseReservation(input);
    assert.equal(replay.ledger_entry_id, release.ledger_entry_id);
    const balance = await service.readBalance({ tenantId: "tenant_a" });
    assert.equal(balance.available_balance, 10);
    assert.equal(balance.reserved_balance, 0);
  });

  it("finalizes a debit idempotently from its reservation", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    const reservation = await reserve(service);
    const input = {
      tenantId: "tenant_a",
      reservationEntryId: reservation.ledger_entry_id,
      idempotencyKey: "debit_generation_001",
      providerCostEvidenceReference: "provider_evidence_001",
    };
    const debit = await service.finalizeDebit(input);
    const replay = await service.finalizeDebit(input);
    assert.equal(replay.ledger_entry_id, debit.ledger_entry_id);
    const balance = await service.readBalance({ tenantId: "tenant_a" });
    assert.equal(balance.available_balance, 4);
    assert.equal(balance.reserved_balance, 0);
    assert.equal(balance.ledger_balance, 4);
    assert.equal(balance.debited_credits, 6);
  });

  it("prevents both release and debit for one reservation", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    const reservation = await reserve(service);
    await service.releaseReservation({
      tenantId: "tenant_a",
      reservationEntryId: reservation.ledger_entry_id,
      idempotencyKey: "release_before_debit",
    });
    await assert.rejects(
      service.finalizeDebit({
        tenantId: "tenant_a",
        reservationEntryId: reservation.ledger_entry_id,
        idempotencyKey: "debit_after_release",
      }),
      DuplicateFinancialEffectError
    );
  });

  it("refunds a finalized debit exactly once", async () => {
    const { repository, service } = setup();
    await monthlyGrant(service);
    const reservation = await reserve(service);
    const debit = await service.finalizeDebit({
      tenantId: "tenant_a",
      reservationEntryId: reservation.ledger_entry_id,
      idempotencyKey: "debit_for_refund",
    });
    const input = {
      tenantId: "tenant_a",
      debitEntryId: debit.ledger_entry_id,
      idempotencyKey: "refund_generation_001",
    };
    const refund = await service.refund(input);
    const replay = await service.refund(input);
    assert.equal(replay.ledger_entry_id, refund.ledger_entry_id);
    assert.equal(
      repository.listLedger("tenant_a").filter((entry) => entry.entry_type === "refund").length,
      1
    );
    const balance = await service.readBalance({ tenantId: "tenant_a" });
    assert.equal(balance.available_balance, 10);
    assert.equal(balance.net_spent_credits, 0);
  });
});

describe("tenant isolation, project correlation, and immutability", () => {
  it("does not let Tenant B settle Tenant A's reservation", async () => {
    const { service } = setup();
    await monthlyGrant(service, "tenant_a", "a");
    await monthlyGrant(service, "tenant_b", "b");
    const reservation = await reserve(service);
    await assert.rejects(
      service.finalizeDebit({
        tenantId: "tenant_b",
        reservationEntryId: reservation.ledger_entry_id,
        idempotencyKey: "tenant_b_cross_tenant_debit",
      }),
      FinancialResourceUnavailableError
    );
    assert.equal((await service.readBalance({ tenantId: "tenant_a" })).reserved_balance, 6);
    assert.equal((await service.readBalance({ tenantId: "tenant_b" })).available_balance, 10);
  });

  it("rejects a reservation correlated to another tenant's project", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    await assert.rejects(
      reserve(service, { projectId: "project_b" }),
      FinancialResourceUnavailableError
    );
  });

  it("derives balances only from immutable ledger copies", async () => {
    const { repository, service } = setup();
    await monthlyGrant(service);
    const returned = repository.listLedger("tenant_a");
    returned[0].amount = 999;
    returned[0].balance_delta = 999;
    const stored = repository.listLedger("tenant_a");
    assert.equal(stored[0].amount, 10);
    assert.equal(stored[0].balance_delta, 10);
    assert.equal(repository.updateLedgerEntry, undefined);
    assert.equal((await service.readBalance({ tenantId: "tenant_a" })).available_balance, 10);
  });

  it("supports positive and negative admin adjustments without overdraft", async () => {
    const { service } = setup();
    await monthlyGrant(service);
    await service.adjustCredits({
      tenantId: "tenant_a",
      amount: 5,
      direction: "credit",
      transactionCorrelationId: "admin_credit_001",
      idempotencyKey: "admin_credit_001",
    });
    await service.adjustCredits({
      tenantId: "tenant_a",
      amount: 3,
      direction: "debit",
      transactionCorrelationId: "admin_debit_001",
      idempotencyKey: "admin_debit_001",
    });
    assert.equal((await service.readBalance({ tenantId: "tenant_a" })).available_balance, 12);
    await assert.rejects(
      service.adjustCredits({
        tenantId: "tenant_a",
        amount: 13,
        direction: "debit",
        transactionCorrelationId: "admin_debit_overdraft",
        idempotencyKey: "admin_debit_overdraft",
      }),
      InsufficientCreditsError
    );
  });
});
