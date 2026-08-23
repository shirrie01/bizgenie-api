const { VertexAI } = require("@google-cloud/vertexai");
const {
  UnconfiguredImageGenerationProvider,
  createOpenAIImageProviderFromEnv,
} = require("../image-generation");
const {
  GoogleVertexRestTransport,
  GoogleVertexVeoProvider,
  UnconfiguredVideoAssetStore,
  UnconfiguredVideoGenerationProvider,
  UnconfiguredVideoReferenceAssetLoader,
} = require("../video-generation");
const {
  DurableMediaAssetStore,
  GoogleCloudMediaStorage,
  PostgresMediaAssetRepository,
  RightsAwareMediaReferenceLoader,
  MediaConfigurationError,
} = require("../media");
const { activationFlag, requireActivationEnvironment } = require("./config");

function googleProject(env) {
  return env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || env.GCP_PROJECT;
}

function createAccessTokenProvider({ env, vertexFactory = (options) => new VertexAI(options) }) {
  const project = googleProject(env);
  if (typeof project !== "string" || !project) throw new MediaConfigurationError();
  const vertex = vertexFactory({ project, location: "us-central1" });
  if (!vertex?.googleAuth || typeof vertex.googleAuth.getAccessToken !== "function") {
    throw new MediaConfigurationError();
  }
  return async () => vertex.googleAuth.getAccessToken();
}

async function createMediaProductionComposition({
  pool,
  env = process.env,
  fetchImpl = globalThis.fetch,
  vertexFactory,
  accessTokenProvider,
  now = () => new Date(),
} = {}) {
  const mediaEnabled = activationFlag(env, "MEDIA_STORAGE_ENABLED");
  const imageEnabled = activationFlag(env, "IMAGE_GENERATION_ENABLED");
  const videoEnabled = activationFlag(env, "VIDEO_GENERATION_ENABLED");
  if (!mediaEnabled && (imageEnabled || videoEnabled)) {
    throw new MediaConfigurationError("Provider activation requires durable media storage");
  }
  if (!mediaEnabled) {
    return Object.freeze({
      mediaEnabled: false,
      imageEnabled: false,
      videoEnabled: false,
      mediaAssetRepository: null,
      imageProvider: new UnconfiguredImageGenerationProvider(),
      videoProvider: new UnconfiguredVideoGenerationProvider(),
      videoAssetStore: new UnconfiguredVideoAssetStore(),
      videoReferenceAssetLoader: new UnconfiguredVideoReferenceAssetLoader(),
    });
  }

  requireActivationEnvironment(env);
  const tokenProvider = accessTokenProvider || createAccessTokenProvider({ env, vertexFactory });
  const mediaAssetRepository = new PostgresMediaAssetRepository({ pool });
  const storage = new GoogleCloudMediaStorage({
    bucket: env.MEDIA_STORAGE_BUCKET,
    accessTokenProvider: tokenProvider,
    fetchImpl,
  });
  await mediaAssetRepository.initialize();
  await storage.initialize();

  const imageReferenceAssetLoader = new RightsAwareMediaReferenceLoader({
    repository: mediaAssetRepository,
    storage,
    delivery: "bytes",
  });
  const videoReferenceAssetLoader = new RightsAwareMediaReferenceLoader({
    repository: mediaAssetRepository,
    storage,
    delivery: "gcs",
  });
  const imageAssetStore = new DurableMediaAssetStore({
    mediaKind: "image",
    repository: mediaAssetRepository,
    storage,
    now,
  });
  const videoAssetStore = new DurableMediaAssetStore({
    mediaKind: "video",
    repository: mediaAssetRepository,
    storage,
    videoSourcePrefix: env.VIDEO_PROVIDER_OUTPUT_STORAGE_URI,
    now,
  });

  let imageProvider = new UnconfiguredImageGenerationProvider();
  if (imageEnabled) {
    imageProvider = createOpenAIImageProviderFromEnv({
      env,
      assetStore: imageAssetStore,
      referenceAssetLoader: imageReferenceAssetLoader,
      fetchImpl,
    });
  }

  let videoProvider = new UnconfiguredVideoGenerationProvider();
  if (videoEnabled) {
    const projectId = googleProject(env);
    const transport = new GoogleVertexRestTransport({
      accessTokenProvider: tokenProvider,
      fetchImpl,
      timeoutMs: env.VIDEO_PROVIDER_TIMEOUT_MS
        ? Number(env.VIDEO_PROVIDER_TIMEOUT_MS)
        : undefined,
    });
    videoProvider = new GoogleVertexVeoProvider({
      projectId,
      outputStorageUri: env.VIDEO_PROVIDER_OUTPUT_STORAGE_URI,
      transport,
    });
  }

  return Object.freeze({
    mediaEnabled: true,
    imageEnabled,
    videoEnabled,
    mediaAssetRepository,
    imageAssetStore,
    imageReferenceAssetLoader,
    imageProvider,
    videoAssetStore,
    videoReferenceAssetLoader,
    videoProvider,
  });
}

module.exports = {
  createAccessTokenProvider,
  createMediaProductionComposition,
  googleProject,
};
