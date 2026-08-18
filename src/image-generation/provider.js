const {
  ImageProviderResponseError,
  ImageProviderSelectionRequiredError,
} = require("./errors");
const { NormalizedImageProviderResultSchema } = require("./schema");

class ImageGenerationProvider {
  async generate(_request) {
    throw new Error("ImageGenerationProvider.generate is not implemented");
  }
}

class UnconfiguredImageGenerationProvider extends ImageGenerationProvider {
  async generate() {
    throw new ImageProviderSelectionRequiredError();
  }
}

function normalizeProviderResult(value) {
  const result = NormalizedImageProviderResultSchema.safeParse(value);
  if (!result.success) {
    throw new ImageProviderResponseError();
  }
  return result.data;
}

module.exports = {
  ImageGenerationProvider,
  UnconfiguredImageGenerationProvider,
  normalizeProviderResult,
};
