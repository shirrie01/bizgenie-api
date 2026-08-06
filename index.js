const {
  BrandingConfigSchema,
  brandingConfig,
} = require("./src/config/branding");

console.log(`🚀 ${brandingConfig.marketingStrings.apiBooting}`);

const express = require("express");
const {
  InMemoryMissionControlRepository,
  createMissionControlRouter,
} = require("./src/mission-control");
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
  branding = brandingConfig,
  scriptGenerator = generateScriptWithVertex,
  logger = console,
} = {}) {
  const resolvedBranding = BrandingConfigSchema.parse(branding);
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

  app.post("/generate-script", requireAdmin, async (req, res) => {
    const {
      execution_id,
      user_id,
      project_id,
      compiled_prompt
    } = req.body;

    try {
      if (!execution_id || !user_id || !project_id || !compiled_prompt) {
        return res.status(400).json({
          status: "failed",
          error: "Missing required fields",
          script_body: ""
        });
      }

      const generation = await scriptGenerator(compiled_prompt, {
        branding: resolvedBranding,
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
      req.path.startsWith("/_admin/mission-control") &&
      error instanceof SyntaxError &&
      error.status === 400 &&
      Object.hasOwn(error, "body")
    ) {
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

const app = createApp();

const port = process.env.PORT || 8080;
if (require.main === module) {
  app.listen(port, () => {
    console.log("Listening on", port);
  });
}

module.exports = {
  app,
  createApp,
  generateScriptWithVertex,
  requireAdmin,
};
