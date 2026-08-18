class ImageGenerationError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ImageGenerationValidationError extends ImageGenerationError {
  constructor(details) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
  }
}

class ImageGenerationConflictError extends ImageGenerationError {
  constructor(generationId) {
    super(
      409,
      "IMAGE_GENERATION_EXISTS",
      `Image generation '${generationId}' already exists`
    );
  }
}

class ImageProviderSelectionRequiredError extends ImageGenerationError {
  constructor() {
    super(
      503,
      "IMAGE_PROVIDER_SELECTION_REQUIRED",
      "No approved image rendering provider has been configured"
    );
  }
}

class ImageProviderUnavailableError extends ImageGenerationError {
  constructor() {
    super(
      503,
      "IMAGE_PROVIDER_UNAVAILABLE",
      "The image rendering provider is temporarily unavailable"
    );
  }
}

class ImageProviderRejectedError extends ImageGenerationError {
  constructor() {
    super(
      422,
      "IMAGE_PROVIDER_REJECTED",
      "The image rendering provider rejected the request"
    );
  }
}

class ImageProviderTimeoutError extends ImageGenerationError {
  constructor() {
    super(504, "IMAGE_PROVIDER_TIMEOUT", "The image rendering provider timed out");
  }
}

class ImageProviderResponseError extends ImageGenerationError {
  constructor() {
    super(
      502,
      "IMAGE_PROVIDER_RESPONSE_INVALID",
      "The image rendering provider returned an invalid result"
    );
  }
}

class ImageContextUnavailableError extends ImageGenerationError {
  constructor() {
    super(
      503,
      "IMAGE_CONTEXT_UNAVAILABLE",
      "Approved image-generation context is temporarily unavailable"
    );
  }
}

class ImageGenerationInternalError extends ImageGenerationError {
  constructor() {
    super(500, "IMAGE_GENERATION_INTERNAL_ERROR", "Image generation failed");
  }
}

function formatZodIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function sendImageGenerationError(error, res) {
  if (!(error instanceof ImageGenerationError)) {
    return false;
  }

  const body = {
    status: "failed",
    error: {
      code: error.code,
      message: error.message,
    },
    media: null,
  };

  if (error.details) {
    body.error.details = error.details;
  }

  res.status(error.status).json(body);
  return true;
}

module.exports = {
  ImageContextUnavailableError,
  ImageGenerationConflictError,
  ImageGenerationError,
  ImageGenerationInternalError,
  ImageGenerationValidationError,
  ImageProviderRejectedError,
  ImageProviderResponseError,
  ImageProviderSelectionRequiredError,
  ImageProviderTimeoutError,
  ImageProviderUnavailableError,
  formatZodIssues,
  sendImageGenerationError,
};
