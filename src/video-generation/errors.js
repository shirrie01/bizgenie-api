class VideoGenerationError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class VideoGenerationValidationError extends VideoGenerationError {
  constructor(details) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
  }
}

class VideoGenerationConflictError extends VideoGenerationError {
  constructor(generationId) {
    super(409, "VIDEO_GENERATION_EXISTS", `Video generation '${generationId}' already exists`);
  }
}

class VideoGenerationNotFoundError extends VideoGenerationError {
  constructor(generationId) {
    super(404, "VIDEO_GENERATION_NOT_FOUND", `Video generation '${generationId}' was not found`);
  }
}

class VideoProviderSelectionRequiredError extends VideoGenerationError {
  constructor() {
    super(503, "VIDEO_PROVIDER_SELECTION_REQUIRED", "No approved video rendering provider has been configured");
  }
}

class VideoProviderUnavailableError extends VideoGenerationError {
  constructor() {
    super(503, "VIDEO_PROVIDER_UNAVAILABLE", "The video rendering provider is temporarily unavailable");
  }
}

class VideoProviderRejectedError extends VideoGenerationError {
  constructor() {
    super(422, "VIDEO_PROVIDER_REJECTED", "The video rendering provider rejected the request");
  }
}

class VideoProviderTimeoutError extends VideoGenerationError {
  constructor() {
    super(504, "VIDEO_PROVIDER_TIMEOUT", "The video rendering provider timed out");
  }
}

class VideoProviderResponseError extends VideoGenerationError {
  constructor() {
    super(502, "VIDEO_PROVIDER_RESPONSE_INVALID", "The video rendering provider returned an invalid result");
  }
}

class VideoProviderOperationFailedError extends VideoGenerationError {
  constructor() {
    super(502, "VIDEO_PROVIDER_FAILED", "The video rendering provider could not complete the generation");
  }
}

class VideoAssetPersistenceError extends VideoGenerationError {
  constructor() {
    super(503, "VIDEO_ASSET_PERSISTENCE_UNAVAILABLE", "The generated video could not yet be stored durably");
  }
}

class VideoReferenceAssetUnavailableError extends VideoGenerationError {
  constructor() {
    super(503, "VIDEO_REFERENCE_ASSET_UNAVAILABLE", "An approved video reference asset could not be resolved");
  }
}

class VideoContextUnavailableError extends VideoGenerationError {
  constructor() {
    super(503, "VIDEO_CONTEXT_UNAVAILABLE", "Approved video-generation context is temporarily unavailable");
  }
}

class VideoGenerationInternalError extends VideoGenerationError {
  constructor() {
    super(500, "VIDEO_GENERATION_INTERNAL_ERROR", "Video generation failed");
  }
}

function formatZodIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function sendVideoGenerationError(error, res) {
  if (!(error instanceof VideoGenerationError)) return false;
  const body = {
    status: "failed",
    error: { code: error.code, message: error.message },
    video: null,
  };
  if (error.details) body.error.details = error.details;
  res.status(error.status).json(body);
  return true;
}

module.exports = {
  VideoAssetPersistenceError,
  VideoContextUnavailableError,
  VideoGenerationConflictError,
  VideoGenerationError,
  VideoGenerationInternalError,
  VideoGenerationNotFoundError,
  VideoGenerationValidationError,
  VideoProviderOperationFailedError,
  VideoProviderRejectedError,
  VideoProviderResponseError,
  VideoProviderSelectionRequiredError,
  VideoProviderTimeoutError,
  VideoProviderUnavailableError,
  VideoReferenceAssetUnavailableError,
  formatZodIssues,
  sendVideoGenerationError,
};
