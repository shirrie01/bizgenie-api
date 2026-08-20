const { VideoReferenceAssetUnavailableError } = require("./errors");

class VideoReferenceAssetLoader {
  async load(_request) {
    throw new Error("VideoReferenceAssetLoader.load is not implemented");
  }
}

class UnconfiguredVideoReferenceAssetLoader extends VideoReferenceAssetLoader {
  async load() {
    throw new VideoReferenceAssetUnavailableError();
  }
}

module.exports = {
  UnconfiguredVideoReferenceAssetLoader,
  VideoReferenceAssetLoader,
};
