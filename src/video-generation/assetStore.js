const { VideoAssetPersistenceError } = require("./errors");

class VideoAssetStore {
  async save(_request) {
    throw new Error("VideoAssetStore.save is not implemented");
  }
}

class UnconfiguredVideoAssetStore extends VideoAssetStore {
  async save() {
    throw new VideoAssetPersistenceError();
  }
}

module.exports = { VideoAssetStore, UnconfiguredVideoAssetStore };
