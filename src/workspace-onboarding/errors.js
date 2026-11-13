class OnboardingError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

class OnboardingValidationError extends OnboardingError {
  constructor(details = []) {
    super("Onboarding request is invalid", { code: "ONBOARDING_VALIDATION_ERROR", status: 400, details });
  }
}

class OnboardingIncompleteError extends OnboardingError {
  constructor(missing = []) {
    super("Onboarding cannot be completed until required answers are saved", {
      code: "ONBOARDING_INCOMPLETE",
      status: 422,
      details: missing.map((path) => ({ path, code: "required", message: "Required to complete onboarding" })),
    });
  }
}

class OnboardingNotAuthorizedError extends OnboardingError {
  constructor() {
    super("Workspace selection is not authorized", { code: "WORKSPACE_NOT_AUTHORIZED", status: 403 });
  }
}

class OnboardingVersionConflictError extends OnboardingError {
  constructor(currentVersion) {
    super("Onboarding was changed elsewhere; reload and retry", {
      code: "VERSION_CONFLICT",
      status: 409,
      details: { current_version: currentVersion },
    });
  }
}

class OnboardingIdempotencyError extends OnboardingError {
  constructor() {
    super("Idempotency key was already used with a different request", {
      code: "IDEMPOTENCY_KEY_CONFLICT",
      status: 409,
    });
  }
}

class OnboardingPersistenceError extends OnboardingError {
  constructor() {
    super("Onboarding is temporarily unavailable", { code: "ONBOARDING_UNAVAILABLE", status: 503 });
  }
}

module.exports = {
  OnboardingError,
  OnboardingIdempotencyError,
  OnboardingIncompleteError,
  OnboardingNotAuthorizedError,
  OnboardingPersistenceError,
  OnboardingValidationError,
  OnboardingVersionConflictError,
};
