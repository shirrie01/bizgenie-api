const express = require("express");
const {
  ImageGenerationValidationError,
  formatZodIssues,
  sendImageGenerationError,
} = require("./errors");
const { ImageGenerationRequestSchema } = require("./schema");

function parseRequest(value) {
  const result = ImageGenerationRequestSchema.safeParse(value);
  if (!result.success) {
    throw new ImageGenerationValidationError(
      formatZodIssues(result.error.issues)
    );
  }
  return result.data;
}

function createImageGenerationRouter({ service, logger = console }) {
  if (!service) {
    throw new Error("An image generation service is required");
  }

  const router = express.Router();

  router.post("/", async (req, res, next) => {
    let input;
    try {
      input = parseRequest(req.body);
      const record = await service.generate(input);
      logger.info?.("image generation completed", {
        execution_id: record.execution_id,
        generation_id: record.generation_id,
        status: record.status,
        provider: record.provider,
      });

      return res.json({
        status: record.status,
        execution_id: record.execution_id,
        generation_id: record.generation_id,
        media: {
          provider: record.provider,
          provider_job_id: record.provider_job_id,
          asset: record.asset,
          aspect_ratio: record.aspect_ratio,
          approval_status: record.approval_status,
          created_at: record.created_at,
          completed_at: record.completed_at,
        },
      });
    } catch (error) {
      logger.warn?.("image generation failed", {
        execution_id: input?.execution_id,
        generation_id: input?.generation_id,
        code: error?.code || "IMAGE_GENERATION_INTERNAL_ERROR",
      });
      return next(error);
    }
  });

  router.use((error, _req, res, next) => {
    if (sendImageGenerationError(error, res)) {
      return;
    }
    next(error);
  });

  return router;
}

module.exports = { createImageGenerationRouter };
