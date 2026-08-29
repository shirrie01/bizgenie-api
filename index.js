const {
  BrandingConfigSchema,
  brandingConfig,
} = require("./src/config/branding");

console.log(`🚀 ${brandingConfig.marketingStrings.apiBooting}`);

const express = require("express");
const {
  AuthorizationService,
  InMemoryAuthorizationRepository,
  PostgresAuthorizationRepository,
} = require("./src/authorization");
const {
  UnconfiguredCustomerTokenVerifier,
  createCustomerBillingTenantResolver,
  createCustomerGenerationBoundary,
  createCustomerVideoStatusBoundary,
  createSupabaseCustomerTokenVerifierFromEnv,
} = require("./src/authentication");
const {
  createCorsMiddleware,
  createMediaProductionComposition,
  loadCorsConfig,
} = require("./src/activation");
const {
  InMemoryBrandBrainRepository,
  createPostgresBrandBrainRepositoryFromEnv,
  createBrandBrainRouter,
  resolveBrandBrainContext,
} = require("./src/brand-brain");
const {
  BrandBrainPersistenceError,
} = require("./src/brand-brain/errors");
const {
  InMemoryMissionControlRepository,
  createMissionControlRouter,
} = require("./src/mission-control");
const {
  ImageGenerationService,
  InMemoryImageGenerationRepository,
  UnconfiguredImageGenerationProvider,
  createImageGenerationRouter,
} = require("./src/image-generation");
const {
  InMemoryVideoGenerationRepository,
  PostgresVideoGenerationRepository,
  UnconfiguredVideoAssetStore,
  UnconfiguredVideoGenerationProvider,
  UnconfiguredVideoReferenceAssetLoader,
  VideoGenerationService,
  createVideoGenerationRouter,
} = require("./src/video-generation");
const {
  GENERATION_INCOMPLETE_CODE,
  GenerationIncompleteError,
  generateScriptWithVertex,
} = require("./src/generation");
const {
  GenerationJobService,
  InMemoryGenerationJobRepository,
  PostgresGenerationJobRepository,
  createGenerationJobRecorder,
} = require("./src/generation-jobs");
const {
  UnconfiguredGenerationBillingOrchestrator,
  sendGenerationBillingError,
} = require("./src/generation-billing");
const {
  UnconfiguredServiceCredentialVerifier,
  createServiceCredentialVerifierFromEnv,
} = require("./src/service-principal");
const {
  createServiceExecutionRouter,
} = require("./src/service-execution");

// The single scope this task defines. A future task may add narrower,
// per-execution-class scopes; for now every generation job authorizes
// exactly this one bounded downstream capability.
const GENERATION_EXECUTE_SCOPE = "generation:execute";
const {
  createPostgresBillingProductionComposition,
  createStripeBillingRouter,
  createStripeProductionComposition,
} = require("./src/billing");

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  const providedKey = req.header("x-admin-key");

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

function createGenerateScriptHandler({
  brandBrainRepository,
  branding,
  generationBillingOrchestrator,
  scriptGenerator,
  logger,
}) {
  return async function generateScript(req, res) {
    const {
      execution_id,
      user_id,
      project_id,
      compiled_prompt,
      platform,
      script_type,
      audience,
      intent_stage,
      voice_style,
      brand_id,
    } = req.body;

    try {
      if (!execution_id || !user_id || !project_id || !compiled_prompt) {
        return res.status(400).json({
          status: "failed",
          error: "Missing required fields",
          script_body: ""
        });
      }

      const execute = async () => {
        const brandContext = await resolveBrandBrainContext({
          repository: brandBrainRepository,
          projectId: project_id,
          brandId: brand_id,
          generationContext: {
            platform,
            scriptType: script_type,
            audience,
            intent: intent_stage,
            voice: voice_style,
          },
        });

        return scriptGenerator(compiled_prompt, {
          branding,
          promptOptions: {
            platform,
            scriptType: script_type,
            audience,
            intent: intent_stage,
            voice: voice_style,
            brandContext,
          },
        });
      };

      const generation = res.locals.generationJob
        ? await generationBillingOrchestrator.execute({
            job: res.locals.generationJob,
            expectedExecutionClass: "text.standard",
            operation: execute,
          })
        : await execute();

      logger.info?.("generation completed", {
        execution_id,
        ...generation.metadata,
      });

      return res.json({
        status: "completed",
        execution_id,
        script_body: generation.text
      });

    } catch (err) {
      if (sendGenerationBillingError(err, res, { kind: "script" })) {
        return;
      }

      if (err instanceof BrandBrainPersistenceError) {
        logger.error?.("brand brain persistence unavailable", {
          execution_id,
          name: err.name,
          code: err.code,
        });

        return res.status(err.status).json({
          status: "failed",
          error: {
            code: err.code,
            message: err.message,
          },
          script_body: ""
        });
      }

      if (err instanceof GenerationIncompleteError) {
        logger.warn?.("generation incomplete", {
          execution_id,
          ...err.metadata,
          missing_sections: err.details.missing_sections,
          retryable: err.details.retryable,
        });

        return res.status(502).json({
          status: "failed",
          error: {
            code: GENERATION_INCOMPLETE_CODE,
            message: err.message,
            details: err.details,
          },
          script_body: ""
        });
      }

      logger.error?.("generate-script error", {
        name: err?.name || "Error",
        code: err?.code || null,
      });

      return res.status(500).json({
        status: "failed",
        error: "Internal execution error",
        script_body: ""
      });
    }
  };
}

function createApp({
  missionControlRepository = new InMemoryMissionControlRepository(),
  brandBrainRepository = new InMemoryBrandBrainRepository(),
  imageGenerationRepository = new InMemoryImageGenerationRepository(),
  imageProvider = new UnconfiguredImageGenerationProvider(),
  videoGenerationRepository = new InMemoryVideoGenerationRepository(),
  videoProvider = new UnconfiguredVideoGenerationProvider(),
  videoAssetStore = new UnconfiguredVideoAssetStore(),
  videoReferenceAssetLoader = new UnconfiguredVideoReferenceAssetLoader(),
  branding = brandingConfig,
  scriptGenerator = generateScriptWithVertex,
  authorizationRepository = new InMemoryAuthorizationRepository(),
  authorizationService,
  customerTokenVerifier = new UnconfiguredCustomerTokenVerifier(),
  generationJobRepository = new InMemoryGenerationJobRepository(),
  generationJobService,
  generationBillingOrchestrator = new UnconfiguredGenerationBillingOrchestrator(),
  servicePrincipalVerifier = new UnconfiguredServiceCredentialVerifier(),
  stripeSubscriptionService,
  corsConfig = { enabled: false, allowedOrigins: [] },
  logger = console,
} = {}) {
  const resolvedBranding = BrandingConfigSchema.parse(branding);
  const resolvedAuthorizationService =
    authorizationService || new AuthorizationService({
      repository: authorizationRepository,
    });
  const resolvedGenerationJobService =
    generationJobService ||
    new GenerationJobService({ repository: generationJobRepository });
  const imageGenerationService = new ImageGenerationService({
    repository: imageGenerationRepository,
    provider: imageProvider,
    brandBrainRepository,
  });
  const videoGenerationService = new VideoGenerationService({
    repository: videoGenerationRepository,
    provider: videoProvider,
    assetStore: videoAssetStore,
    referenceAssetLoader: videoReferenceAssetLoader,
    brandBrainRepository,
  });
  const app = express();
  app.use(createCorsMiddleware({ config: corsConfig }));

  // Stripe signature verification must see the exact request bytes. Mount
  // this isolated router before the normal JSON parser; its Checkout handler
  // installs its own bounded parser after the raw webhook route.
  if (stripeSubscriptionService) {
    app.use(
      "/billing/stripe",
      createStripeBillingRouter({
        service: stripeSubscriptionService,
        authorizeTenantRequest: createCustomerBillingTenantResolver({
          tokenVerifier: customerTokenVerifier,
          authorizationService: resolvedAuthorizationService,
        }),
        logger,
      })
    );
  }

  app.use(express.json());
  const scriptHandler = createGenerateScriptHandler({
    brandBrainRepository,
    branding: resolvedBranding,
    generationBillingOrchestrator,
    scriptGenerator,
    logger,
  });
  const customerScriptBoundary = createCustomerGenerationBoundary({
    tokenVerifier: customerTokenVerifier,
    authorizationService: resolvedAuthorizationService,
    kind: "script",
    logger,
  });
  const customerImageBoundary = createCustomerGenerationBoundary({
    tokenVerifier: customerTokenVerifier,
    authorizationService: resolvedAuthorizationService,
    kind: "image",
    logger,
  });
  const customerVideoBoundary = createCustomerGenerationBoundary({
    tokenVerifier: customerTokenVerifier,
    authorizationService: resolvedAuthorizationService,
    kind: "video",
    logger,
  });
  const customerVideoStatusBoundary = createCustomerVideoStatusBoundary({
    tokenVerifier: customerTokenVerifier,
    authorizationService: resolvedAuthorizationService,
    videoGenerationService,
    generationJobRepository,
    logger,
  });
  const recordScriptGenerationJob = createGenerationJobRecorder({
    generationJobService: resolvedGenerationJobService,
    executionClass: "text.standard",
    allowedScopes: [GENERATION_EXECUTE_SCOPE],
    kind: "script",
    logger,
  });
  const recordImageGenerationJob = createGenerationJobRecorder({
    generationJobService: resolvedGenerationJobService,
    executionClass: "image.normal",
    allowedScopes: [GENERATION_EXECUTE_SCOPE],
    kind: "image",
    logger,
  });
  const recordVideoGenerationJob = createGenerationJobRecorder({
    generationJobService: resolvedGenerationJobService,
    executionClass: (body) => `video.${body?.quality}`,
    allowedScopes: [GENERATION_EXECUTE_SCOPE],
    kind: "video",
    logger,
  });

  app.get("/", (_req, res) => {
    res.send(resolvedBranding.marketingStrings.serviceStatus);
  });

  app.get("/_admin/ping", requireAdmin, (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    "/_admin/mission-control",
    requireAdmin,
    createMissionControlRouter({ repository: missionControlRepository })
  );

  app.use(
    "/_admin/brand-brains",
    requireAdmin,
    createBrandBrainRouter({ repository: brandBrainRepository })
  );

  app.use(
    "/generate-image",
    requireAdmin,
    createImageGenerationRouter({
      service: imageGenerationService,
      generationBillingOrchestrator,
      logger,
    })
  );

  app.use(
    "/generate-video",
    requireAdmin,
    createVideoGenerationRouter({
      service: videoGenerationService,
      generationBillingOrchestrator,
      logger,
    })
  );

  app.post("/generate-script", requireAdmin, scriptHandler);

  app.post(
    "/customer/generate-script",
    customerScriptBoundary,
    recordScriptGenerationJob,
    scriptHandler
  );

  app.use(
    "/customer/generate-image",
    customerImageBoundary,
    recordImageGenerationJob,
    createImageGenerationRouter({
      service: imageGenerationService,
      generationBillingOrchestrator,
      logger,
    })
  );

  const customerVideoRouter = createVideoGenerationRouter({
    service: videoGenerationService,
    generationBillingOrchestrator,
    logger,
  });
  app.use(
    "/customer/generate-video",
    (req, res, next) =>
      req.method === "POST" && req.path === "/"
        ? customerVideoBoundary(req, res, next)
        : next(),
    (req, res, next) =>
      req.method === "POST" && req.path === "/"
        ? recordVideoGenerationJob(req, res, next)
        : next(),
    (req, res, next) =>
      req.path !== "/"
        ? customerVideoStatusBoundary(req, res, next)
        : next(),
    customerVideoRouter
  );

  // Future bounded server-to-server execution seam. Customer generation is
  // currently executed in-process only after the mandatory job recorder
  // above succeeds; this route does not dispatch to Make or a provider.
  app.use(
    "/_service/generation-jobs",
    createServiceExecutionRouter({
      jobRepository: generationJobRepository,
      servicePrincipalVerifier,
      requiredScope: GENERATION_EXECUTE_SCOPE,
      logger,
    })
  );

  app.use((error, req, res, next) => {
    if (
      (req.path.startsWith("/_admin/mission-control") ||
        req.path.startsWith("/_admin/brand-brains") ||
        req.path.startsWith("/generate-image") ||
        req.path.startsWith("/generate-video") ||
        req.path.startsWith("/customer/generate-image") ||
        req.path.startsWith("/customer/generate-video") ||
        req.path.startsWith("/customer/generate-script")) &&
      error instanceof SyntaxError &&
      error.status === 400 &&
      Object.hasOwn(error, "body")
    ) {
      if (
        req.path.startsWith("/generate-image") ||
        req.path.startsWith("/customer/generate-image")
      ) {
        return res.status(400).json({
          status: "failed",
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: [
              {
                path: "",
                code: "invalid_json",
                message: "Malformed JSON request body",
              },
            ],
          },
          media: null,
        });
      }

      if (
        req.path.startsWith("/generate-video") ||
        req.path.startsWith("/customer/generate-video")
      ) {
        return res.status(400).json({
          status: "failed",
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: [{ path: "", code: "invalid_json", message: "Malformed JSON request body" }],
          },
          video: null,
        });
      }

      if (req.path.startsWith("/customer/generate-script")) {
        return res.status(400).json({
          status: "failed",
          error: {
            code: "VALIDATION_ERROR",
            message: "Malformed JSON request body",
          },
          script_body: "",
        });
      }

      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [
            {
              path: "",
              code: "invalid_json",
              message: "Malformed JSON request body",
            },
          ],
        },
      });
    }

    return next(error);
  });

  return app;
}

const port = process.env.PORT || 8080;

async function createProductionApp({ env = process.env, logger = console } = {}) {
  const brandBrainRepository = createPostgresBrandBrainRepositoryFromEnv({
    env,
  });
  await brandBrainRepository.initialize();
  const authorizationRepository = new PostgresAuthorizationRepository({
    pool: brandBrainRepository.pool,
  });
  const customerTokenVerifier = createSupabaseCustomerTokenVerifierFromEnv({
    env,
  });
  const generationJobRepository = new PostgresGenerationJobRepository({
    pool: brandBrainRepository.pool,
  });
  const videoGenerationRepository = new PostgresVideoGenerationRepository({
    pool: brandBrainRepository.pool,
  });
  await videoGenerationRepository.initialize();
  const billing = await createPostgresBillingProductionComposition({
    pool: brandBrainRepository.pool,
    env,
    logger,
  });
  const media = await createMediaProductionComposition({
    pool: brandBrainRepository.pool,
    env,
  });
  const stripe = createStripeProductionComposition({
    billingRepository: billing.billingRepository,
    billingService: billing.billingService,
    env,
  });
  const servicePrincipalVerifier = createServiceCredentialVerifierFromEnv({
    env,
  });
  return {
    app: createApp({
      authorizationRepository,
      brandBrainRepository,
      customerTokenVerifier,
      generationJobRepository,
      generationBillingOrchestrator: billing.generationBillingOrchestrator,
      imageProvider: media.imageProvider,
      videoGenerationRepository,
      servicePrincipalVerifier,
      stripeSubscriptionService: stripe.stripeSubscriptionService,
      videoProvider: media.videoProvider,
      videoAssetStore: media.videoAssetStore,
      videoReferenceAssetLoader: media.videoReferenceAssetLoader,
      corsConfig: loadCorsConfig({ env }),
      logger,
    }),
    authorizationRepository,
    brandBrainRepository,
    customerTokenVerifier,
    generationJobRepository,
    videoGenerationRepository,
    billingRepository: billing.billingRepository,
    billingService: billing.billingService,
    generationBillingOrchestrator: billing.generationBillingOrchestrator,
    mediaAssetRepository: media.mediaAssetRepository,
    media,
    servicePrincipalVerifier,
    stripeSubscriptionService: stripe.stripeSubscriptionService,
    stripe,
  };
}

async function startServer({ env = process.env, logger = console } = {}) {
  const production = await createProductionApp({ env, logger });
  const server = production.app.listen(env.PORT || port, () => {
    logger.log?.("Listening on", env.PORT || port);
  });
  return { ...production, server };
}

const app = require.main === module ? null : createApp();

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Startup failed", {
      name: error?.name || "Error",
      code: error?.code || "STARTUP_ERROR",
    });
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  createApp,
  createGenerateScriptHandler,
  createProductionApp,
  generateScriptWithVertex,
  requireAdmin,
  startServer,
};
