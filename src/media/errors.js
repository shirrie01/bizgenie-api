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
