class BrandBrainError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class BrandBrainValidationError extends BrandBrainError {
  constructor(details) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
  }
}

class BrandBrainNotFoundError extends BrandBrainError {
  constructor(brandId) {
    super(404, "BRAND_BRAIN_NOT_FOUND", `Brand Brain '${brandId}' was not found`);
  }
}

class BrandBrainOwnershipError extends BrandBrainError {
  constructor(brandId) {
    super(
      409,
      "BRAND_PROJECT_CONFLICT",
      `Brand Brain '${brandId}' belongs to a different project`
    );
  }
}

function formatZodIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function sendBrandBrainError(error, res) {
  if (!(error instanceof BrandBrainError)) {
    return false;
  }

  const body = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.details) {
    body.error.details = error.details;
  }

  res.status(error.status).json(body);
  return true;
}

module.exports = {
  BrandBrainError,
  BrandBrainNotFoundError,
  BrandBrainOwnershipError,
  BrandBrainValidationError,
  formatZodIssues,
  sendBrandBrainError,
};
