const {
  CommercialPolicyUnavailableError,
  EntitlementInactiveError,
  ExecutionPriceUnavailableError,
  InvalidFinancialOperationError,
} = require("./errors");
const { executionClass, identifier } = require("./schema");

function parseIdentifier(value) {
  return identifier.parse(value);
}

function parseAmount(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidFinancialOperationError(
      "Credit amounts must be positive safe integers"
    );
  }
  return value;
}

class BillingService {
  constructor({ repository, now = () => new Date() }) {
    if (!repository) throw new TypeError("A billing repository is required");
    this.repository = repository;
    this.now = now;
  }

  timestamp() {
    return this.now().toISOString();
  }

  async readActiveEntitlement({ tenantId, at = this.timestamp() }) {
    const tenant_id = parseIdentifier(tenantId);
    const entitlement = await this.repository.getActiveEntitlement(tenant_id, at);
    if (!entitlement) throw new EntitlementInactiveError();
    return entitlement;
  }

  async resolveExecutionCreditCost({
    tenantId,
    executionClass: requestedClass,
    at = this.timestamp(),
  }) {
    const entitlement = await this.readActiveEntitlement({ tenantId, at });
    const policy = await this.repository.getCommercialPolicy(
      entitlement.policy_id,
      at
    );
    if (!policy || policy.plan_code !== entitlement.plan_code) {
      throw new CommercialPolicyUnavailableError();
    }
    const normalizedClass = executionClass.parse(requestedClass);
    const cost = policy.execution_costs[normalizedClass];
    if (!Number.isSafeInteger(cost) || cost <= 0) {
      throw new ExecutionPriceUnavailableError();
    }
    return Object.freeze({
      tenant_id: entitlement.tenant_id,
      entitlement_id: entitlement.entitlement_id,
      policy_id: policy.policy_id,
      plan_code: policy.plan_code,
      execution_class: normalizedClass,
      credit_cost: cost,
    });
  }

  async readBalance({ tenantId }) {
    return this.repository.readBalance(parseIdentifier(tenantId));
  }

  async appendFinancialTransaction(input) {
    const { tenantId, idempotencyKey, ...transaction } = input;
    return this.repository.appendFinancialTransaction({
      ...transaction,
      tenant_id: parseIdentifier(tenantId),
      idempotency_key: parseIdentifier(idempotencyKey),
    });
  }

  async grantMonthlyCredits({ tenantId, idempotencyKey }) {
    const entitlement = await this.readActiveEntitlement({ tenantId });
    const amount = entitlement.included_monthly_credit_grant;
    if (amount <= 0) {
      throw new InvalidFinancialOperationError(
        "The entitlement has no monthly credit grant"
      );
    }
    return this.repository.appendFinancialTransaction({
      tenant_id: entitlement.tenant_id,
      entry_type: "monthly_grant",
      amount,
      balance_delta: amount,
      reserved_delta: 0,
      idempotency_key: parseIdentifier(idempotencyKey),
      entitlement_id: entitlement.entitlement_id,
      reference_period_start: entitlement.reference_period_start,
      reference_period_end: entitlement.reference_period_end,
    });
  }

  async grantBoltOnCredits({
    tenantId,
    amount,
    paymentReference,
    idempotencyKey,
    stripeEventReference,
  }) {
    const entitlement = await this.readActiveEntitlement({ tenantId });
    const policy = await this.repository.getCommercialPolicy(
      entitlement.policy_id,
      this.timestamp()
    );
    if (!policy || !policy.bolt_on_eligible) {
      throw new InvalidFinancialOperationError(
        "The tenant plan is not eligible for bolt-on credits"
      );
    }
    const parsedAmount = parseAmount(amount);
    return this.repository.appendFinancialTransaction({
      tenant_id: entitlement.tenant_id,
      entry_type: "bolt_on_grant",
      amount: parsedAmount,
      balance_delta: parsedAmount,
      reserved_delta: 0,
      idempotency_key: parseIdentifier(idempotencyKey),
      payment_ref: parseIdentifier(paymentReference),
      stripe_event_ref: stripeEventReference
        ? parseIdentifier(stripeEventReference)
        : undefined,
    });
  }

  async createReservation({
    tenantId,
    projectId,
    generationId,
    executionId,
    transactionCorrelationId,
    executionClass: requestedClass,
    idempotencyKey,
  }) {
    const price = await this.resolveExecutionCreditCost({
      tenantId,
      executionClass: requestedClass,
    });
    return this.repository.createReservation({
      tenant_id: price.tenant_id,
      amount: price.credit_cost,
      project_id: parseIdentifier(projectId),
      generation_id: parseIdentifier(generationId),
      execution_id: parseIdentifier(executionId),
      transaction_correlation_id: parseIdentifier(transactionCorrelationId),
      idempotency_key: parseIdentifier(idempotencyKey),
    });
  }

  async releaseReservation({ tenantId, reservationEntryId, idempotencyKey }) {
    return this.repository.releaseReservation({
      tenant_id: parseIdentifier(tenantId),
      reservation_entry_id: parseIdentifier(reservationEntryId),
      idempotency_key: parseIdentifier(idempotencyKey),
    });
  }

  async finalizeDebit({
    tenantId,
    reservationEntryId,
    idempotencyKey,
    providerCostEvidenceReference,
  }) {
    return this.repository.finalizeDebit({
      tenant_id: parseIdentifier(tenantId),
      reservation_entry_id: parseIdentifier(reservationEntryId),
      idempotency_key: parseIdentifier(idempotencyKey),
      provider_cost_evidence_ref: providerCostEvidenceReference
        ? parseIdentifier(providerCostEvidenceReference)
        : undefined,
    });
  }

  async refund({ tenantId, debitEntryId, idempotencyKey }) {
    return this.repository.refund({
      tenant_id: parseIdentifier(tenantId),
      debit_entry_id: parseIdentifier(debitEntryId),
      idempotency_key: parseIdentifier(idempotencyKey),
    });
  }

  async adjustCredits({
    tenantId,
    amount,
    direction,
    transactionCorrelationId,
    idempotencyKey,
  }) {
    if (!["credit", "debit"].includes(direction)) {
      throw new InvalidFinancialOperationError(
        "Admin adjustment direction must be credit or debit"
      );
    }
    const parsedAmount = parseAmount(amount);
    return this.repository.appendFinancialTransaction({
      tenant_id: parseIdentifier(tenantId),
      entry_type: "admin_adjustment",
      amount: parsedAmount,
      balance_delta: direction === "credit" ? parsedAmount : -parsedAmount,
      reserved_delta: 0,
      transaction_correlation_id: parseIdentifier(transactionCorrelationId),
      idempotency_key: parseIdentifier(idempotencyKey),
    });
  }
}

module.exports = { BillingService };
