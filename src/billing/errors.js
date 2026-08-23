class BillingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class BillingConfigurationError extends BillingError {
  constructor(message = "Durable billing is not configured") {
    super("BILLING_NOT_CONFIGURED", message);
  }
}

class BillingPersistenceError extends BillingError {
  constructor() {
    super(
      "BILLING_PERSISTENCE_UNAVAILABLE",
      "Durable billing persistence is unavailable"
    );
  }
}

class CommercialPolicyUnavailableError extends BillingError {
  constructor() {
    super(
      "COMMERCIAL_POLICY_UNAVAILABLE",
      "The requested commercial policy is not available"
    );
  }
}

class EntitlementInactiveError extends BillingError {
  constructor() {
    super("ENTITLEMENT_INACTIVE", "The tenant has no active entitlement");
  }
}

class CreditAccountUnavailableError extends BillingError {
  constructor() {
    super(
      "CREDIT_ACCOUNT_UNAVAILABLE",
      "The tenant credit account is not available"
    );
  }
}

class ExecutionPriceUnavailableError extends BillingError {
  constructor() {
    super(
      "EXECUTION_PRICE_UNAVAILABLE",
      "The execution class has no active credit price"
    );
  }
}

class InsufficientCreditsError extends BillingError {
  constructor() {
    super(
      "INSUFFICIENT_AVAILABLE_CREDITS",
      "The tenant does not have enough available credits"
    );
  }
}

class IdempotencyConflictError extends BillingError {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_CONFLICT",
      "The idempotency key was already used for different financial intent"
    );
  }
}

class DuplicateFinancialEffectError extends BillingError {
  constructor() {
    super(
      "DUPLICATE_FINANCIAL_EFFECT",
      "The logical financial event has already been recorded"
    );
  }
}

class FinancialResourceUnavailableError extends BillingError {
  constructor() {
    super(
      "FINANCIAL_RESOURCE_NOT_AVAILABLE",
      "The requested financial resource is not available"
    );
  }
}

class InvalidFinancialOperationError extends BillingError {
  constructor(message = "The financial operation is not valid") {
    super("INVALID_FINANCIAL_OPERATION", message);
  }
}

module.exports = {
  BillingConfigurationError,
  BillingError,
  BillingPersistenceError,
  CommercialPolicyUnavailableError,
  CreditAccountUnavailableError,
  DuplicateFinancialEffectError,
  EntitlementInactiveError,
  ExecutionPriceUnavailableError,
  FinancialResourceUnavailableError,
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvalidFinancialOperationError,
};
