const { VideoProviderResponseError, VideoProviderSelectionRequiredError } = require("./errors");
const { VideoProviderPollSchema, VideoProviderSubmissionSchema } = require("./schema");

class VideoGenerationProvider {
  async submit(_request) { throw new Error("VideoGenerationProvider.submit is not implemented"); }
  async poll(_request) { throw new Error("VideoGenerationProvider.poll is not implemented"); }
}

class UnconfiguredVideoGenerationProvider extends VideoGenerationProvider {
  async submit() { throw new VideoProviderSelectionRequiredError(); }
  async poll() { throw new VideoProviderSelectionRequiredError(); }
}

function normalizeSubmission(value) {
  const result = VideoProviderSubmissionSchema.safeParse(value);
  if (!result.success) throw new VideoProviderResponseError();
  return result.data;
}

function normalizePoll(value) {
  const result = VideoProviderPollSchema.safeParse(value);
  if (!result.success) throw new VideoProviderResponseError();
  return result.data;
}

module.exports = { VideoGenerationProvider, UnconfiguredVideoGenerationProvider, normalizePoll, normalizeSubmission };
