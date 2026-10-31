class MediaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class MediaConfigurationError extends MediaError {
  constructor(message = "Media storage is not configured") {
    super("MEDIA_STORAGE_NOT_CONFIGURED", message);
  }
}

class MediaPersistenceError extends MediaError {
  constructor() {
    super("MEDIA_PERSISTENCE_UNAVAILABLE", "Media persistence is temporarily unavailable");
  }
}

class MediaAssetUnavailableError extends MediaError {
  constructor() {
    super("MEDIA_ASSET_NOT_AVAILABLE", "The requested media asset is not available");
  }
}

module.exports = {
  MediaAssetUnavailableError,
  MediaConfigurationError,
  MediaError,
  MediaPersistenceError,
};

// A generated file that was fetched and measured and does NOT meet the contract. Definitive (retrying cannot fix it), unlike MediaPersistenceError (storage/tool unavailable).
class MediaValidationError extends MediaError {
  constructor(reasons = []) {
    super("MEDIA_OUTPUT_INVALID", "The generated media did not pass validation");
    this.reasons = Object.freeze([...reasons].map(String).slice(0, 12));
  }
}
module.exports.MediaValidationError = MediaValidationError;
