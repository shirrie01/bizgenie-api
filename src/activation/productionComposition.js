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
const { createVideoInspector, createHardenedVideoInspector } = require("../media/videoInspection");
const { runToolchainSelfTest } = require("../media/toolchainSelfTest");

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
  toolchainCheck = runToolchainSelfTest, // test seam only: not reachable from environment variables, so production cannot bypass it
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
      mediaPreviewStorage: null,
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
  // Fail closed: video is enabled only if the inspection toolchain demonstrably works in the isolation this deployment is configured for. Production must use hardened
  // (bubblewrap) isolation; process-local isolation is for disposable isolated staging only.
  if (videoEnabled) {
    const isolation = env.VIDEO_INSPECTION_ISOLATION === "local" ? "local" : "bubblewrap";
    if (isolation === "local" && env.BIZGENIE_ENVIRONMENT !== "staging") throw new MediaConfigurationError("VIDEO_INSPECTION_ISOLATION=local is only allowed in disposable isolated staging");
    const ready = await toolchainCheck({ isolation });
    if (!ready?.ok) throw new MediaConfigurationError(`Video generation is enabled but media inspection is not ready (${isolation}): ${ready?.failure || "UNKNOWN"}`);
  }

  const imageAssetStore = new DurableMediaAssetStore({
    mediaKind: "image",
    repository: mediaAssetRepository,
    storage,
    requireImageValidation: imageEnabled,
    now,
  });
  const videoAssetStore = new DurableMediaAssetStore({
    mediaKind: "video",
    repository: mediaAssetRepository,
    storage,
    videoSourcePrefix: env.VIDEO_PROVIDER_OUTPUT_STORAGE_URI,
    // Provider video is measured from its real bytes before an asset can exist (BG-LAUNCH-002). Isolation defaults to bubblewrap; "local" must be chosen explicitly
    // (e.g. a container that cannot run bwrap). If the tool is unavailable the job stays recoverable and is never approved.
    videoInspector: videoEnabled ? (env.VIDEO_INSPECTION_ISOLATION === "local" ? createVideoInspector({ isolation: "local" }) : createHardenedVideoInspector()) : null,
    requireVideoValidation: videoEnabled,
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
    mediaPreviewStorage: storage,
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
