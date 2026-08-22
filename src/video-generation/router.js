const express = require("express");
const { sendGenerationBillingError } = require("../generation-billing");
const {
  VideoGenerationValidationError,
  formatZodIssues,
  sendVideoGenerationError,
} = require("./errors");
const { VideoGenerationRequestSchema, identifier } = require("./schema");

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new VideoGenerationValidationError(formatZodIssues(result.error.issues));
  return result.data;
}

function publicRecord(record) {
  return {
    status: record.status,
    execution_id: record.execution_id,
    generation_id: record.generation_id,
    video: {
      parent_generation_id: record.parent_generation_id || null,
      quality: record.quality,
      aspect_ratio: record.aspect_ratio,
      duration_seconds: record.duration_seconds,
      approval_status: record.approval_status || null,
      asset: record.asset || null,
      created_at: record.created_at,
      updated_at: record.updated_at,
      completed_at: record.completed_at || null,
    },
  };
}

function responseStatus(record) {
  return ["submitted", "processing"].includes(record.status) ? 202 : 200;
}

function createVideoGenerationRouter({
  service,
  generationBillingOrchestrator,
  logger = console,
}) {
  if (!service) throw new Error("A video generation service is required");
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    let input;
    try {
      input = parse(VideoGenerationRequestSchema, req.body);
      const operation = () => service.submit(input);
      const record = res.locals.generationJob
        ? await generationBillingOrchestrator.beginExecution({
            job: res.locals.generationJob,
            expectedExecutionClass: `video.${input.quality}`,
            operation,
          })
        : await operation();
      logger.info?.("video generation submitted", {
        execution_id: record.execution_id,
        generation_id: record.generation_id,
        status: record.status,
      });
      return res.status(202).json(publicRecord(record));
    } catch (error) {
      logger.warn?.("video generation submission failed", {
        execution_id: input?.execution_id,
        generation_id: input?.generation_id,
        code: error?.code || "VIDEO_GENERATION_INTERNAL_ERROR",
      });
      return next(error);
    }
  });

  router.post("/:generationId/poll", async (req, res, next) => {
    try {
      const generationId = parse(identifier, req.params.generationId);
      const record = await service.poll(generationId);
      logger.info?.("video generation status checked", {
        execution_id: record.execution_id,
        generation_id: record.generation_id,
        status: record.status,
      });
      return res.status(responseStatus(record)).json(publicRecord(record));
    } catch (error) {
      logger.warn?.("video generation poll failed", {
        generation_id: req.params.generationId,
        code: error?.code || "VIDEO_GENERATION_INTERNAL_ERROR",
      });
      return next(error);
    }
  });

  router.get("/:generationId", (req, res, next) => {
    try {
      const generationId = parse(identifier, req.params.generationId);
      const record = service.get(generationId);
      return res.status(responseStatus(record)).json(publicRecord(record));
    } catch (error) {
      return next(error);
    }
  });

  router.use((error, _req, res, next) => {
    if (sendGenerationBillingError(error, res, { kind: "video" })) return;
    if (sendVideoGenerationError(error, res)) return;
    next(error);
  });

  return router;
}

module.exports = { createVideoGenerationRouter, publicRecord };
