class StripeBillingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
}

class StripeBillingValidationError extends StripeBillingError {
  constructor() {
    super(400, "STRIPE_BILLING_VALIDATION_ERROR", "Billing request validation failed");
  }
}

class StripeSignatureVerificationError extends StripeBillingError {
  constructor() {
    super(400, "STRIPE_SIGNATURE_INVALID", "Webhook signature verification failed");
  }
}

class StripeEnvironmentMismatchError extends StripeBillingError {
  constructor() {
    super(400, "STRIPE_ENVIRONMENT_MISMATCH", "Webhook environment mismatch");
  }
}

class StripeBillingResourceUnavailableError extends StripeBillingError {
  constructor() {
    super(404, "STRIPE_BILLING_RESOURCE_NOT_AVAILABLE", "Billing resource is not available");
  }
}

class StripeBillingConflictError extends StripeBillingError {
  constructor(message = "Billing state conflicts with the canonical tenant mapping") {
    super(409, "STRIPE_BILLING_CONFLICT", message);
  }
}

class StripeEventConflictError extends StripeBillingError {
  constructor() {
    super(409, "STRIPE_EVENT_CONFLICT", "Stripe event identity was reused inconsistently");
  }
}

class StripeEventInProgressError extends StripeBillingError {
  constructor() {
    super(503, "STRIPE_EVENT_IN_PROGRESS", "Stripe event processing is already in progress");
  }
}

class StripeBillingConfigurationError extends StripeBillingError {
  constructor() {
    super(503, "STRIPE_BILLING_NOT_CONFIGURED", "Stripe billing is not configured");
  }
}

class StripeBillingStateError extends StripeBillingError {
  constructor() {
    super(422, "STRIPE_BILLING_STATE_INVALID", "Stripe billing state is not supported");
  }
}

function sendStripeBillingError(error, res) {
  if (!(error instanceof StripeBillingError)) return false;
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
    },
  });
  return true;
}

module.exports = {
  StripeBillingConfigurationError,
  StripeBillingConflictError,
  StripeBillingError,
  StripeBillingResourceUnavailableError,
  StripeBillingStateError,
  StripeBillingValidationError,
  StripeEnvironmentMismatchError,
  StripeEventConflictError,
  StripeEventInProgressError,
  StripeSignatureVerificationError,
  sendStripeBillingError,
};
