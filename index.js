const {
  BrandingConfigSchema,
  brandingConfig,
} = require("./src/config/branding");

console.log(`🚀 ${brandingConfig.marketingStrings.apiBooting}`);

const express = require("express");
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
  GENERATION_INCOMPLETE_CODE,
  GenerationIncompleteError,
  generateScriptWithVertex,
} = require("./src/generation");

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  const providedKey = req.header("x-admin-key");

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

function createApp({
  missionControlRepository = new InMemoryMissionControlRepository(),
  brandBrainRepository = new InMemoryBrandBrainRepository(),
  imageGenerationRepository = new InMemoryImageGenerationRepository(),
  imageProvider = new UnconfiguredImageGenerationProvider(),
  branding = brandingConfig,
  scriptGenerator = generateScriptWithVertex,
  logger = console,
} = {}) {
  const resolvedBranding = BrandingConfigSchema.parse(branding);
  const imageGenerationService = new ImageGenerationService({
    repository: imageGenerationRepository,
    provider: imageProvider,
    brandBrainRepository,
  });
  const app = express();
  app.use(express.json());

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
    createImageGenerationRouter({ service: imageGenerationService, logger })
  );

  app.post("/generate-script", requireAdmin, async (req, res) => {
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

      const generation = await scriptGenerator(compiled_prompt, {
        branding: resolvedBranding,
        promptOptions: {
          platform,
          scriptType: script_type,
          audience,
          intent: intent_stage,
          voice: voice_style,
          brandContext,
        },
      });

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
  });

  app.use((error, req, res, next) => {
    if (
      (req.path.startsWith("/_admin/mission-control") ||
        req.path.startsWith("/_admin/brand-brains") ||
        req.path.startsWith("/generate-image")) &&
      error instanceof SyntaxError &&
      error.status === 400 &&
      Object.hasOwn(error, "body")
    ) {
      if (req.path.startsWith("/generate-image")) {
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
  return {
    app: createApp({ brandBrainRepository, logger }),
    brandBrainRepository,
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
  createProductionApp,
  generateScriptWithVertex,
  requireAdmin,
  startServer,
};
