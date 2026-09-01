class PaidBetaError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

class PaidBetaValidationError extends PaidBetaError {
  constructor(details) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
  }
}

class PaidBetaPayloadTooLargeError extends PaidBetaError {
  constructor() {
    super(413, "PAYLOAD_TOO_LARGE", "Request payload is too large");
  }
}

class PaidBetaRateLimitError extends PaidBetaError {
  constructor() {
    super(429, "PAID_BETA_RATE_LIMITED", "Request could not be accepted");
  }
}

class PaidBetaIdempotencyConflictError extends PaidBetaError {
  constructor() {
    super(409, "IDEMPOTENCY_KEY_CONFLICT", "Submission identity was reused inconsistently");
  }
}

class PaidBetaPersistenceError extends PaidBetaError {
  constructor() {
    super(503, "PAID_BETA_CAPTURE_UNAVAILABLE", "Paid-beta interest capture is unavailable");
  }
}

class PaidBetaConfigurationError extends Error {
  constructor(message = "Paid-beta capture configuration is invalid") {
    super(message);
    this.name = "PaidBetaConfigurationError";
    this.code = "PAID_BETA_CONFIGURATION_INVALID";
  }
}

function sendPaidBetaError(error, res) {
  if (!(error instanceof PaidBetaError)) return false;
  const body = {
    error: {
      code: error.code,
      message: error.message,
    },
  };
  if (error.details) body.error.details = error.details;
  res.status(error.status).json(body);
  return true;
}

module.exports = {
  PaidBetaConfigurationError,
  PaidBetaError,
  PaidBetaIdempotencyConflictError,
  PaidBetaPayloadTooLargeError,
  PaidBetaPersistenceError,
  PaidBetaRateLimitError,
  PaidBetaValidationError,
  sendPaidBetaError,
};
