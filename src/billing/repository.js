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
  identifier,
} = require("./schema");
const {
  StripeBillingConflictError,
  StripeBillingResourceUnavailableError,
  StripeEventConflictError,
  StripeEventInProgressError,
} = require("./stripe/errors");

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

  getStripeCustomerByTenant(_tenantId) {
    throw new Error("BillingRepository.getStripeCustomerByTenant is not implemented");
  }

  getStripeCustomerById(_stripeCustomerId) {
    throw new Error("BillingRepository.getStripeCustomerById is not implemented");
  }

  createStripeCustomerMapping(_input) {
    throw new Error("BillingRepository.createStripeCustomerMapping is not implemented");
  }

  getStripeSubscription(_stripeSubscriptionId) {
    throw new Error("BillingRepository.getStripeSubscription is not implemented");
  }

  applyStripeSubscriptionState(_input) {
    throw new Error("BillingRepository.applyStripeSubscriptionState is not implemented");
  }

  beginStripeEvent(_input) {
    throw new Error("BillingRepository.beginStripeEvent is not implemented");
  }

  completeStripeEvent(_input) {
    throw new Error("BillingRepository.completeStripeEvent is not implemented");
  }

  abandonStripeEvent(_eventId) {
    throw new Error("BillingRepository.abandonStripeEvent is not implemented");
  }

  recordBoltOnPaymentEvidence(_input) {
    throw new Error("BillingRepository.recordBoltOnPaymentEvidence is not implemented");
  }
}

class InMemoryBillingRepository extends BillingRepository {
  constructor({
    policies = [],
    entitlements = [],
    accounts = [],
    projects = [],
    stripeCustomers = [],
    stripeSubscriptions = [],
    now = () => new Date(),
    idFactory = () => `ledger_${randomUUID()}`,
    entitlementIdFactory = () => `entitlement_${randomUUID()}`,
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
    this.stripeCustomersByTenant = new Map();
    this.stripeCustomersById = new Map();
    this.stripeSubscriptions = new Map();
    this.stripeEvents = new Map();
    this.boltOnPaymentEvidence = new Map();
    this.now = now;
    this.idFactory = idFactory;
    this.entitlementIdFactory = entitlementIdFactory;
    for (const mapping of stripeCustomers) this.createStripeCustomerMapping(mapping);
    for (const mapping of stripeSubscriptions) {
      this.stripeSubscriptions.set(mapping.stripe_subscription_id, copy(mapping));
    }
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

  getStripeCustomerByTenant(tenantId) {
    return copy(this.stripeCustomersByTenant.get(identifier.parse(tenantId)) || null);
  }

  getStripeCustomerById(stripeCustomerId) {
    return copy(this.stripeCustomersById.get(identifier.parse(stripeCustomerId)) || null);
  }

  createStripeCustomerMapping({ tenant_id, stripe_customer_id, livemode, created_at }) {
    const tenantId = identifier.parse(tenant_id);
    const customerId = identifier.parse(stripe_customer_id);
    const candidate = Object.freeze({
      tenant_id: tenantId,
      stripe_customer_id: customerId,
      livemode: Boolean(livemode),
      created_at: created_at || this.now().toISOString(),
    });
    const byTenant = this.stripeCustomersByTenant.get(tenantId);
    const byCustomer = this.stripeCustomersById.get(customerId);
    if (byTenant || byCustomer) {
      if (
        byTenant?.stripe_customer_id === customerId &&
        byCustomer?.tenant_id === tenantId &&
        byTenant.livemode === candidate.livemode
      ) {
        return copy(byTenant);
      }
      throw new StripeBillingConflictError();
    }
    this.stripeCustomersByTenant.set(tenantId, candidate);
    this.stripeCustomersById.set(customerId, candidate);
    return copy(candidate);
  }

  getStripeSubscription(stripeSubscriptionId) {
    return copy(this.stripeSubscriptions.get(identifier.parse(stripeSubscriptionId)) || null);
  }

  applyStripeSubscriptionState(input) {
    const tenantId = identifier.parse(input.tenant_id);
    const subscriptionId = identifier.parse(input.stripe_subscription_id);
    const customerId = identifier.parse(input.stripe_customer_id);
    const eventId = identifier.parse(input.event_id);
    const customer = this.stripeCustomersByTenant.get(tenantId);
    if (
      !customer ||
      customer.stripe_customer_id !== customerId ||
      customer.livemode !== Boolean(input.livemode)
    ) {
      throw new StripeBillingResourceUnavailableError();
    }

    const existingMapping = this.stripeSubscriptions.get(subscriptionId);
    const existingEntitlement = existingMapping
      ? this.entitlements.find(
        (value) => value.entitlement_id === existingMapping.entitlement_id
      )
      : null;
    const staleResult = (reason) => Object.freeze({
      stale: true,
      stale_reason: reason,
      mapping: copy(existingMapping),
      entitlement: copy(existingEntitlement),
    });
    if (existingMapping) {
      for (const [field, value] of [
        ["tenant_id", tenantId],
        ["stripe_customer_id", customerId],
        ["policy_id", input.policy_id],
        ["plan_code", input.plan_code],
        ["stripe_price_id", input.stripe_price_id],
        ["livemode", Boolean(input.livemode)],
      ]) {
        if (existingMapping[field] !== value) throw new StripeBillingConflictError();
      }
      if (eventId === existingMapping.last_event_id) {
        return staleResult("same_event");
      }
      if (input.event_created < existingMapping.last_event_created) {
        return staleResult("older_event");
      }

      const existingTerminal =
        existingMapping.stripe_status === "canceled" ||
        existingEntitlement?.status === "cancelled";
      const incomingTerminal = input.entitlement_status === "cancelled";
      if (input.event_created === existingMapping.last_event_created) {
        if (existingTerminal) return staleResult("terminal_state");
        if (!incomingTerminal) return staleResult("same_second_ambiguous");
      } else if (existingTerminal && !incomingTerminal) {
        return staleResult("terminal_state");
      }
    }

    let entitlement = this.entitlements.find(
      (value) => value.stripe_subscription_ref === subscriptionId
    );
    if (entitlement && entitlement.tenant_id !== tenantId) {
      throw new StripeBillingConflictError();
    }
    if (!entitlement) {
      const candidates = this.entitlements.filter(
        (value) =>
          value.tenant_id === tenantId &&
          value.policy_id === input.policy_id &&
          !value.stripe_subscription_ref
      );
      if (candidates.length > 1) throw new StripeBillingConflictError();
      entitlement = candidates[0];
    }

    const serving = ENTITLED_STATUSES.has(input.entitlement_status);
    const otherServing = this.entitlements.find(
      (value) =>
        value.tenant_id === tenantId &&
        value !== entitlement &&
        ENTITLED_STATUSES.has(value.status)
    );
    if (serving && otherServing) throw new StripeBillingConflictError();

    const nextEntitlement = TenantEntitlementSchema.parse({
      entitlement_id: entitlement?.entitlement_id || this.entitlementIdFactory(),
      tenant_id: tenantId,
      policy_id: entitlement?.policy_id || input.policy_id,
      plan_code: entitlement?.plan_code || input.plan_code,
      status: input.entitlement_status,
      starts_at: entitlement?.starts_at || input.starts_at,
      ends_at: input.ends_at,
      reference_period_start: input.reference_period_start,
      reference_period_end: input.reference_period_end,
      included_monthly_credit_grant:
        entitlement?.included_monthly_credit_grant ?? input.included_monthly_credit_grant,
      stripe_subscription_ref: subscriptionId,
      cancellation_effective_at: input.cancellation_effective_at,
      grace_ends_at: input.grace_ends_at,
    });
    if (
      nextEntitlement.policy_id !== input.policy_id ||
      nextEntitlement.plan_code !== input.plan_code
    ) {
      throw new StripeBillingConflictError("A Stripe event cannot change a historical commercial policy version");
    }

    if (entitlement) {
      const index = this.entitlements.indexOf(entitlement);
      this.entitlements[index] = copy(nextEntitlement);
    } else {
      this.entitlements.push(copy(nextEntitlement));
    }

    const mapping = Object.freeze({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      tenant_id: tenantId,
      entitlement_id: nextEntitlement.entitlement_id,
      policy_id: nextEntitlement.policy_id,
      plan_code: nextEntitlement.plan_code,
      stripe_price_id: identifier.parse(input.stripe_price_id),
      stripe_status: input.stripe_status,
      entitlement_status: nextEntitlement.status,
      livemode: Boolean(input.livemode),
      last_event_created: input.event_created,
      last_event_id: eventId,
      updated_at: this.now().toISOString(),
    });
    this.stripeSubscriptions.set(subscriptionId, mapping);
    return Object.freeze({
      stale: false,
      mapping: copy(mapping),
      entitlement: copy(nextEntitlement),
    });
  }

  beginStripeEvent({ event_id, event_type, livemode, intent_hash, received_at }) {
    const eventId = identifier.parse(event_id);
    const existing = this.stripeEvents.get(eventId);
    if (existing) {
      if (
        existing.event_type !== event_type ||
        existing.livemode !== Boolean(livemode) ||
        existing.intent_hash !== intent_hash
      ) {
        throw new StripeEventConflictError();
      }
      if (existing.status === "processed") {
        return Object.freeze({ replay: true, result: copy(existing.result) });
      }
      if (existing.status === "failed") {
        existing.status = "processing";
        return Object.freeze({ replay: false });
      }
      throw new StripeEventInProgressError();
    }
    this.stripeEvents.set(eventId, {
      event_id: eventId,
      event_type,
      livemode: Boolean(livemode),
      intent_hash,
      status: "processing",
      received_at: received_at || this.now().toISOString(),
    });
    return Object.freeze({ replay: false });
  }

  completeStripeEvent({ event_id, result }) {
    const record = this.stripeEvents.get(identifier.parse(event_id));
    if (!record || record.status !== "processing") throw new StripeEventConflictError();
    record.status = "processed";
    record.processed_at = this.now().toISOString();
    record.result = copy(result);
    return copy(record);
  }

  abandonStripeEvent(eventId) {
    const parsed = identifier.parse(eventId);
    const record = this.stripeEvents.get(parsed);
    if (record?.status === "processing") record.status = "failed";
  }

  recordBoltOnPaymentEvidence(input) {
    const customer = this.stripeCustomersByTenant.get(identifier.parse(input.tenant_id));
    if (!customer || customer.stripe_customer_id !== input.stripe_customer_id) {
      throw new StripeBillingResourceUnavailableError();
    }
    const reference = identifier.parse(input.payment_reference);
    const existing = this.boltOnPaymentEvidence.get(reference);
    const evidence = Object.freeze({
      tenant_id: customer.tenant_id,
      stripe_customer_id: customer.stripe_customer_id,
      payment_reference: reference,
      stripe_event_id: identifier.parse(input.stripe_event_id),
      stripe_price_id: identifier.parse(input.stripe_price_id),
      credits: input.credits,
      status: "verified",
      created_at: this.now().toISOString(),
    });
    if (existing) {
      const comparable = ({ created_at, ...value }) => value;
      if (hashIntent(comparable(existing)) !== hashIntent(comparable(evidence))) {
        throw new StripeBillingConflictError();
      }
      return copy(existing);
    }
    this.boltOnPaymentEvidence.set(reference, evidence);
    return copy(evidence);
  }
}

module.exports = {
  BillingRepository,
  ENTITLED_STATUSES,
  InMemoryBillingRepository,
  hashIntent,
};
