// Premium application composition (BG-LAUNCH-001). createApp() already mounts quote/confirm generation, creative jobs, customer media intake, social publishing, learning
// and staged strategy workflows, but every one of them is null (503 SERVICE_UNAVAILABLE) unless a caller composes it, and createProductionApp() composed none of them.
// This module composes the EXISTING services from the environment, behind explicit activation flags, and fails closed:
//   * every flag defaults to false; enabling any of them requires BIZGENIE_ENVIRONMENT=staging|production (src/activation/config.js);
//   * a capability whose dependency is missing throws ActivationConfigurationError at startup instead of starting half-configured;
//   * no secret is read here except through the existing provider/storage compositions; nothing is logged but names and booleans.
// It adds no business rule. Credits, idempotency, fencing, tenancy and authority checks stay in the services it wires.
//
//   QUOTED_GENERATION_ENABLED     durable quote/confirm + creative jobs + the execution worker's services
//                                 (text needs TEXT_GENERATION_MODEL; image and video follow IMAGE_/VIDEO_GENERATION_ENABLED of the media composition)
//   MEDIA_INTAKE_ENABLED          customer media intake (needs MEDIA_RIGHTS_POLICY_VERSION + MEDIA_RIGHTS_POLICY_STATEMENT and a real inspector passed in `mediaInspector`)
//   SOCIAL_PUBLISHING_ENABLED     social OAuth, connections and the dispatch outbox (SOCIAL_PLATFORMS=comma list; each needs a registered connector AND reviewed configuration)
//   LEARNING_ENABLED              persisted performance evidence and recommendations (needs SOCIAL_PUBLISHING_ENABLED and LEARNING_EVIDENCE_MAX_AGE_HOURS)
//   STRATEGY_WORKFLOWS_ENABLED    staged strategy -> draft workflows (needs QUOTED_GENERATION_ENABLED, STRATEGY_WORKFLOW_POLICY_VERSION,
//                                 STRATEGY_WORKFLOW_PRICE_POLICY_ID; no approved workflow pricing exists yet, so this stays off until a founder-approved policy is supplied)
const { ActivationConfigurationError, activationFlag, requireActivationEnvironment } = require("./config");

const FLAGS = ["QUOTED_GENERATION_ENABLED", "MEDIA_INTAKE_ENABLED", "SOCIAL_PUBLISHING_ENABLED", "LEARNING_ENABLED", "STRATEGY_WORKFLOWS_ENABLED"];
const need = (cond, message) => { if (!cond) throw new ActivationConfigurationError(message); };
const positiveInt = (env, name, fallback = null) => {
  const raw = env[name];
  if (raw === undefined || raw === "") { need(fallback !== null, `${name} is required`); return fallback; }
  const n = Number(raw); need(Number.isSafeInteger(n) && n > 0, `${name} must be a positive integer`); return n;
};

async function createPremiumComposition({
  pool, billing, media, brandBrainRepository, videoGenerationRepository, scriptGenerator, branding,
  env = process.env, logger = console, now = () => new Date(),
  mediaInspector = null, connectors = null, workflowStageHandlerFactory = null,
} = {}) {
  const flags = Object.fromEntries(FLAGS.map((name) => [name, activationFlag(env, name)]));
  const enabled = Object.values(flags).some(Boolean);
  const off = Object.freeze({
    enabled: false, flags, capabilities: Object.freeze({}), generationQuoteService: null, generationExecutionPolicy: null, mediaIntakeService: null,
    socialPublishingService: null, learningService: null, strategyWorkflowService: null, generationWorker: null, jobs: null, describe: () => ({ enabled: false, flags }),
  });
  if (!enabled) return off;
  requireActivationEnvironment(env);
  need(pool && billing?.billingRepository && brandBrainRepository, "Premium composition requires the database pool, billing and Brand Brain");
  const billingRepository = billing.billingRepository;

  const { GenerationExecutionPolicy } = require("../generation-quotes/executionPolicy");
  const { PostgresGenerationQuoteService } = require("../generation-quotes/service");
  const { PostgresGenerationJobRepository } = require("../generation-jobs");
  const jobs = new PostgresGenerationJobRepository({ pool });

  let generationQuoteService = null; let generationExecutionPolicy = null; let generationWorker = null; let strategyWorkflowService = null;
  let mediaIntakeService = null; let socialPublishingService = null; let learningService = null;
  const capabilities = {};

  if (flags.QUOTED_GENERATION_ENABLED) {
    const profiles = {};
    if (env.TEXT_GENERATION_MODEL) { need(typeof scriptGenerator === "function", "TEXT_GENERATION_MODEL needs the script generator"); profiles["text.standard"] = { id: "vertex.text", version: 1, provider_model: env.TEXT_GENERATION_MODEL }; }
    if (media?.imageEnabled) profiles["image.normal"] = { id: "openai.image", version: 1, provider_model: media.imageProvider.model, aspect_ratio: env.IMAGE_ASPECT_RATIO || "1:1" };
    if (media?.videoEnabled) {
      const { modelForQuality } = require("../video-generation");
      const duration = positiveInt(env, "VIDEO_DURATION_SECONDS", 4); need([4, 6, 8].includes(duration), "VIDEO_DURATION_SECONDS must be 4, 6 or 8");
      const aspect = env.VIDEO_ASPECT_RATIO || "9:16"; need(["9:16", "16:9"].includes(aspect), "VIDEO_ASPECT_RATIO must be 9:16 or 16:9");
      profiles["video.normal"] = { id: "veo.normal", version: 1, provider_model: modelForQuality("normal"), aspect_ratio: aspect, duration_seconds: duration };
      profiles["video.premium"] = { id: "veo.premium", version: 1, provider_model: modelForQuality("premium"), aspect_ratio: aspect, duration_seconds: duration };
    }
    need(Object.keys(profiles).length > 0, "QUOTED_GENERATION_ENABLED needs at least one generation capability (TEXT_GENERATION_MODEL, IMAGE_GENERATION_ENABLED or VIDEO_GENERATION_ENABLED)");
    generationQuoteService = new PostgresGenerationQuoteService({ billingRepository, profiles, now });
    generationExecutionPolicy = new GenerationExecutionPolicy({ mode: "quoted_v1", quoteService: generationQuoteService });

    const { ExistingTextGenerationAdapter } = require("../generation-quotes/textAdapter");
    const { ExistingCreativeServicesAdapter } = require("../generation-quotes/creativeAdapter");
    const { QuotedExecutionRouter } = require("../generation-quotes/executionRouter");
    const { FencedGenerationWorker } = require("../generation-quotes/worker");
    let stageHandler = null;
    if (flags.STRATEGY_WORKFLOWS_ENABLED) {
      need(profiles["text.standard"], "STRATEGY_WORKFLOWS_ENABLED needs text generation (TEXT_GENERATION_MODEL)");
      const version = env.STRATEGY_WORKFLOW_POLICY_VERSION; const priceId = env.STRATEGY_WORKFLOW_PRICE_POLICY_ID; const source = env.STRATEGY_WORKFLOW_POLICY_SOURCE;
      need(version && priceId && source, "STRATEGY_WORKFLOWS_ENABLED needs STRATEGY_WORKFLOW_POLICY_VERSION, STRATEGY_WORKFLOW_POLICY_SOURCE and STRATEGY_WORKFLOW_PRICE_POLICY_ID (a founder-approved workflow price policy)");
      Object.assign(profiles["text.standard"], { workflow_policy_version: version, workflow_policy_source: source, workflow_price_policy_id: priceId });
      generationQuoteService.profiles["text.standard"] = profiles["text.standard"];
      const { StrategyWorkflowService } = require("../strategy-workflows/service");
      strategyWorkflowService = new StrategyWorkflowService({ quoteService: generationQuoteService, policyVersion: version, enabled: true });
      generationQuoteService.strategyWorkflowService = strategyWorkflowService;
      const { StrategyStageHandler } = require("../strategy-workflows/stageHandler");
      stageHandler = (workflowStageHandlerFactory || (() => new StrategyStageHandler()))();
    }
    const text = profiles["text.standard"] ? new ExistingTextGenerationAdapter({ jobs, generator: scriptGenerator, branding, executionPolicy: generationExecutionPolicy, stageHandler }) : null;
    let creative = null;
    if (media?.imageEnabled || media?.videoEnabled) {
      const { ImageGenerationService, InMemoryImageGenerationRepository } = require("../image-generation");
      const { VideoGenerationService } = require("../video-generation");
      // The same services createApp builds, over the same repositories, so a job executed by the worker and one inspected through a route agree.
      const imageService = media.imageEnabled ? new ImageGenerationService({ repository: new InMemoryImageGenerationRepository(), provider: media.imageProvider, brandBrainRepository }) : null;
      const videoService = media.videoEnabled ? new VideoGenerationService({ repository: videoGenerationRepository, provider: media.videoProvider, assetStore: media.videoAssetStore, referenceAssetLoader: media.videoReferenceAssetLoader, brandBrainRepository, now }) : null;
      need(!media.videoEnabled || videoGenerationRepository, "VIDEO_GENERATION_ENABLED needs the video generation repository");
      creative = new ExistingCreativeServicesAdapter({ jobs, mediaAssets: media.mediaAssetRepository, imageService, videoService, executionPolicy: generationExecutionPolicy });
    }
    const router = new QuotedExecutionRouter({ jobs, executionPolicy: generationExecutionPolicy, text, creative });
    generationWorker = new FencedGenerationWorker({ quoteService: generationQuoteService, provider: router, executionPolicy: generationExecutionPolicy });
    Object.assign(capabilities, { text: Boolean(text), image: Boolean(media?.imageEnabled), video: Boolean(media?.videoEnabled), strategyWorkflows: Boolean(strategyWorkflowService) });
  } else if (flags.STRATEGY_WORKFLOWS_ENABLED) need(false, "STRATEGY_WORKFLOWS_ENABLED requires QUOTED_GENERATION_ENABLED");

  if (flags.MEDIA_INTAKE_ENABLED) {
    need(media?.mediaEnabled && media.mediaPreviewStorage && typeof media.mediaPreviewStorage.putImmutableObject === "function", "MEDIA_INTAKE_ENABLED requires durable media storage (MEDIA_STORAGE_ENABLED)");
    need(mediaInspector && typeof mediaInspector.inspect === "function", "MEDIA_INTAKE_ENABLED requires a configured malware/decoder inspector; none is composed by default");
    need(env.MEDIA_RIGHTS_POLICY_VERSION && env.MEDIA_RIGHTS_POLICY_STATEMENT, "MEDIA_INTAKE_ENABLED requires MEDIA_RIGHTS_POLICY_VERSION and MEDIA_RIGHTS_POLICY_STATEMENT (reviewed rights wording)");
    const { CustomerMediaIntakeService } = require("../media-intake/service");
    mediaIntakeService = new CustomerMediaIntakeService({
      billingRepository, storage: media.mediaPreviewStorage, inspector: mediaInspector, enabled: true, now,
      rightsPolicy: { version: env.MEDIA_RIGHTS_POLICY_VERSION, statement: env.MEDIA_RIGHTS_POLICY_STATEMENT, allowed_uses: ["campaign.preview", "image.generate.reference", "video.generate.reference"] },
    });
    capabilities.mediaIntake = true;
  }

  if (flags.SOCIAL_PUBLISHING_ENABLED) {
    const wanted = String(env.SOCIAL_PLATFORMS || "").split(",").map((s) => s.trim()).filter(Boolean);
    need(wanted.length > 0, "SOCIAL_PUBLISHING_ENABLED requires SOCIAL_PLATFORMS (for example tiktok,linkedin)");
    const registry = connectors || require("../social-connectors").registry;
    const platforms = {};
    for (const name of wanted) {
      const factory = registry[name];
      need(typeof factory === "function", `No connector is registered for ${name}; it cannot be enabled`);
      platforms[name] = await factory({ env, pool, logger, now }); // a factory throws unless its reviewed configuration and credentials are present
    }
    const { DurableSocialPublishing } = require("../social-publishing/service");
    socialPublishingService = new DurableSocialPublishing({ billingRepository, platforms, enabled: true, now });
    capabilities.social = wanted;
  }

  if (flags.LEARNING_ENABLED) {
    need(socialPublishingService, "LEARNING_ENABLED requires SOCIAL_PUBLISHING_ENABLED");
    const hours = positiveInt(env, "LEARNING_EVIDENCE_MAX_AGE_HOURS");
    const { DurableLearningService } = require("../learning-persistence/service");
    const analytics = {};
    for (const [name, platform] of Object.entries(socialPublishingService.platforms)) if (platform.analytics) analytics[name] = platform.analytics;
    learningService = new DurableLearningService({ billingRepository, socialService: socialPublishingService, connectors: analytics, maxAgeMs: hours * 3600000, enabled: true, now });
    capabilities.learning = Object.keys(analytics);
  }

  const result = {
    enabled: true, flags, capabilities, generationQuoteService, generationExecutionPolicy, generationWorker, jobs, mediaIntakeService, socialPublishingService, learningService, strategyWorkflowService,
    describe: () => ({ enabled: true, flags, capabilities }),
  };
  logger.log?.("Premium composition", JSON.stringify(result.describe()));
  return Object.freeze(result);
}

module.exports = { FLAGS, createPremiumComposition };
