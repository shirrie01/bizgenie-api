const { createHash, randomUUID } = require("node:crypto");
const {
  CreditAccountUnavailableError,
  DuplicateFinancialEffectError,
  FinancialResourceUnavailableError,
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvalidFinancialOperationError,
} = require("./errors");
const {
  CommercialPolicySchema,
  CreditAccountSchema,
  CreditLedgerEntrySchema,
  TenantEntitlementSchema,
} = require("./schema");

const ENTITLED_STATUSES = new Set(["active", "grace", "cancel_pending"]);
const GENERIC_ENTRY_TYPES = new Set([
  "monthly_grant",
  "bolt_on_grant",
  "admin_adjustment",
  "expiry_reset",
]);

function copy(value) {
  return value === undefined || value === null ? value : structuredClone(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function hashIntent(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function isEffective(record, at, startField, endField) {
  const instant = Date.parse(at);
  return (
    Date.parse(record[startField]) <= instant &&
    (!record[endField] || instant < Date.parse(record[endField]))
  );
}

function logicalKeyFor(input) {
  switch (input.entry_type) {
    case "monthly_grant":
      return `monthly:${input.entitlement_id}:${input.reference_period_start}`;
    case "bolt_on_grant":
      return `bolt-on:${input.payment_ref}`;
    case "reservation":
      return `reservation:${input.generation_id}`;
    case "reservation_release":
    case "debit":
      return `reservation-settlement:${input.reservation_entry_id}`;
    case "refund":
      return `refund:${input.debit_entry_id}`;
    default:
      return null;
  }
}

class BillingRepository {
  getActiveEntitlement(_tenantId, _at) {
    throw new Error("BillingRepository.getActiveEntitlement is not implemented");
  }

  getCommercialPolicy(_policyId, _at) {
    throw new Error("BillingRepository.getCommercialPolicy is not implemented");
  }

  getCreditAccountByTenant(_tenantId) {
    throw new Error(
      "BillingRepository.getCreditAccountByTenant is not implemented"
    );
  }

  readBalance(_tenantId) {
    throw new Error("BillingRepository.readBalance is not implemented");
  }

  appendFinancialTransaction(_input) {
    throw new Error(
      "BillingRepository.appendFinancialTransaction is not implemented"
    );
  }

  createReservation(_input) {
    throw new Error("BillingRepository.createReservation is not implemented");
  }

  releaseReservation(_input) {
    throw new Error("BillingRepository.releaseReservation is not implemented");
  }

  finalizeDebit(_input) {
    throw new Error("BillingRepository.finalizeDebit is not implemented");
  }

  refund(_input) {
    throw new Error("BillingRepository.refund is not implemented");
  }
}

class InMemoryBillingRepository extends BillingRepository {
  constructor({
    policies = [],
    entitlements = [],
    accounts = [],
    projects = [],
    now = () => new Date(),
    idFactory = () => `ledger_${randomUUID()}`,
  } = {}) {
    super();
    this.policies = new Map(
      policies.map((value) => {
        const policy = CommercialPolicySchema.parse(value);
        return [policy.policy_id, copy(policy)];
      })
    );
    this.entitlements = entitlements.map((value) =>
      copy(TenantEntitlementSchema.parse(value))
    );
    this.accountsByTenant = new Map();
    this.accountsById = new Map();
    for (const value of accounts) {
      const account = CreditAccountSchema.parse(value);
      if (this.accountsByTenant.has(account.tenant_id)) {
        throw new InvalidFinancialOperationError(
          "A tenant can have only one credit account"
        );
      }
      this.accountsByTenant.set(account.tenant_id, copy(account));
      this.accountsById.set(account.account_id, copy(account));
    }
    this.projects = new Map(
      projects.map((project) => [project.project_id, copy(project)])
    );
    this.entries = [];
    this.entriesById = new Map();
    this.idempotency = new Map();
    this.logicalEffects = new Map();
    this.accountLocks = new Map();
    this.now = now;
    this.idFactory = idFactory;
  }

  getActiveEntitlement(tenantId, at) {
    const candidates = this.entitlements
      .filter(
        (entitlement) =>
          entitlement.tenant_id === tenantId &&
          ENTITLED_STATUSES.has(entitlement.status) &&
          isEffective(entitlement, at, "starts_at", "ends_at")
      )
      .sort((left, right) => Date.parse(right.starts_at) - Date.parse(left.starts_at));
    if (candidates.length > 1) {
      throw new InvalidFinancialOperationError(
        "Multiple serving entitlements were found for one tenant"
      );
    }
    return copy(candidates[0] || null);
  }

  getCommercialPolicy(policyId, at) {
    const policy = this.policies.get(policyId);
    if (
      !policy ||
      policy.status !== "active" ||
      !isEffective(policy, at, "effective_from", "effective_to")
    ) {
      return null;
    }
    return copy(policy);
  }

  getCreditAccountByTenant(tenantId) {
    return copy(this.accountsByTenant.get(tenantId) || null);
  }

  listLedger(tenantId) {
    return this.entries
      .filter((entry) => entry.tenant_id === tenantId)
      .map(copy);
  }

  readBalance(tenantId) {
    const account = this.accountsByTenant.get(tenantId);
    if (!account) throw new CreditAccountUnavailableError();
    const entries = this.entries.filter(
      (entry) => entry.account_id === account.account_id
    );
    const balance = entries.reduce((total, entry) => total + entry.balance_delta, 0);
    const reserved = entries.reduce(
      (total, entry) => total + entry.reserved_delta,
      0
    );
    const debited = entries
      .filter((entry) => entry.entry_type === "debit")
      .reduce((total, entry) => total + entry.amount, 0);
    const refunded = entries
      .filter((entry) => entry.entry_type === "refund")
      .reduce((total, entry) => total + entry.amount, 0);
    return Object.freeze({
      tenant_id: tenantId,
      account_id: account.account_id,
      available_balance: balance - reserved,
      reserved_balance: reserved,
      ledger_balance: balance,
      debited_credits: debited,
      refunded_credits: refunded,
      net_spent_credits: debited - refunded,
    });
  }

  async withAccountLock(accountId, operation) {
    const prior = this.accountLocks.get(accountId) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const queued = prior.then(() => gate);
    this.accountLocks.set(accountId, queued);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.accountLocks.get(accountId) === queued) {
        this.accountLocks.delete(accountId);
      }
    }
  }

  requireAccount(tenantId) {
    const account = this.accountsByTenant.get(tenantId);
    if (!account || account.status !== "active") {
      throw new CreditAccountUnavailableError();
    }
    return account;
  }

  verifyProject(tenantId, projectId) {
    if (!projectId) return;
    const project = this.projects.get(projectId);
    if (!project || project.tenant_id !== tenantId) {
      throw new FinancialResourceUnavailableError();
    }
  }

  replayFor(accountId, idempotencyKey, intentHash) {
    const entryId = this.idempotency.get(`${accountId}\u0000${idempotencyKey}`);
    if (!entryId) return null;
    const entry = this.entriesById.get(entryId);
    if (!entry || entry.intent_hash !== intentHash) {
      throw new IdempotencyConflictError();
    }
    return copy(entry);
  }

  appendLocked(account, input) {
    const intent_hash = hashIntent({
      ...input,
      account_id: account.account_id,
      tenant_id: account.tenant_id,
    });
    const replay = this.replayFor(
      account.account_id,
      input.idempotency_key,
      intent_hash
    );
    if (replay) return replay;

    const logicalKey = logicalKeyFor(input);
    if (
      logicalKey &&
      this.logicalEffects.has(`${account.account_id}\u0000${logicalKey}`)
    ) {
      throw new DuplicateFinancialEffectError();
    }

    this.verifyProject(account.tenant_id, input.project_id);
    const createdAt = this.now().toISOString();
    const entry = CreditLedgerEntrySchema.parse({
      ...copy(input),
      ledger_entry_id: this.idFactory(),
      account_id: account.account_id,
      tenant_id: account.tenant_id,
      intent_hash,
      occurred_at: input.occurred_at || createdAt,
      created_at: createdAt,
    });
    const current = this.readBalance(account.tenant_id);
    const projectedLedger = current.ledger_balance + entry.balance_delta;
    const projectedReserved = current.reserved_balance + entry.reserved_delta;
    if (
      projectedReserved < 0 ||
      projectedLedger - projectedReserved < 0
    ) {
      throw new InsufficientCreditsError();
    }

    const stored = Object.freeze(copy(entry));
    this.entries.push(stored);
    this.entriesById.set(stored.ledger_entry_id, stored);
    this.idempotency.set(
      `${account.account_id}\u0000${stored.idempotency_key}`,
      stored.ledger_entry_id
    );
    if (logicalKey) {
      this.logicalEffects.set(
        `${account.account_id}\u0000${logicalKey}`,
        stored.ledger_entry_id
      );
    }
    return copy(stored);
  }

  async appendFinancialTransaction(input) {
    if (!GENERIC_ENTRY_TYPES.has(input.entry_type)) {
      throw new InvalidFinancialOperationError(
        "Reservation, debit, release, and refund require dedicated operations"
      );
    }
    const account = this.requireAccount(input.tenant_id);
    return this.withAccountLock(account.account_id, () =>
      this.appendLocked(account, input)
    );
  }

  async createReservation(input) {
    const account = this.requireAccount(input.tenant_id);
    return this.withAccountLock(account.account_id, () =>
      this.appendLocked(account, {
        ...input,
        entry_type: "reservation",
        balance_delta: 0,
        reserved_delta: input.amount,
      })
    );
  }

  requireRelatedEntry(tenantId, entryId, expectedType) {
    const account = this.requireAccount(tenantId);
    const entry = this.entriesById.get(entryId);
    if (
      !entry ||
      entry.account_id !== account.account_id ||
      entry.tenant_id !== tenantId ||
      entry.entry_type !== expectedType
    ) {
      throw new FinancialResourceUnavailableError();
    }
    return { account, entry };
  }

  async releaseReservation(input) {
    const { account, entry: reservation } = this.requireRelatedEntry(
      input.tenant_id,
      input.reservation_entry_id,
      "reservation"
    );
    return this.withAccountLock(account.account_id, () =>
      this.appendLocked(account, {
        ...input,
        amount: reservation.amount,
        project_id: reservation.project_id,
        generation_id: reservation.generation_id,
        execution_id: reservation.execution_id,
        transaction_correlation_id: reservation.transaction_correlation_id,
        entry_type: "reservation_release",
        balance_delta: 0,
        reserved_delta: -reservation.amount,
      })
    );
  }

  async finalizeDebit(input) {
    const { account, entry: reservation } = this.requireRelatedEntry(
      input.tenant_id,
      input.reservation_entry_id,
      "reservation"
    );
    return this.withAccountLock(account.account_id, () =>
      this.appendLocked(account, {
        ...input,
        amount: reservation.amount,
        project_id: reservation.project_id,
        generation_id: reservation.generation_id,
        execution_id: reservation.execution_id,
        transaction_correlation_id: reservation.transaction_correlation_id,
        entry_type: "debit",
        balance_delta: -reservation.amount,
        reserved_delta: -reservation.amount,
      })
    );
  }

  async refund(input) {
    const { account, entry: debit } = this.requireRelatedEntry(
      input.tenant_id,
      input.debit_entry_id,
      "debit"
    );
    return this.withAccountLock(account.account_id, () =>
      this.appendLocked(account, {
        ...input,
        amount: debit.amount,
        project_id: debit.project_id,
        generation_id: debit.generation_id,
        execution_id: debit.execution_id,
        transaction_correlation_id: debit.transaction_correlation_id,
        reservation_entry_id: undefined,
        entry_type: "refund",
        balance_delta: debit.amount,
        reserved_delta: 0,
      })
    );
  }
}

module.exports = {
  BillingRepository,
  ENTITLED_STATUSES,
  InMemoryBillingRepository,
  hashIntent,
};
