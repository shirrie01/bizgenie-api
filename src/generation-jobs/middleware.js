const { randomUUID } = require("node:crypto");

const GENERATION_JOB_UNAVAILABLE_ERROR = Object.freeze({
  code: "GENERATION_JOB_UNAVAILABLE",
  message: "Generation authorization is temporarily unavailable",
});

function failureBody(kind) {
  if (kind === "script") {
    return {
      status: "failed",
      error: GENERATION_JOB_UNAVAILABLE_ERROR,
      script_body: "",
    };
  }
  return {
    status: "failed",
    error: GENERATION_JOB_UNAVAILABLE_ERROR,
    media: null,
  };
}

// Mounted after the existing customer generation boundary
// (createCustomerGenerationBoundary), which already performed the real
// security decision: verified customer -> membership -> tenant -> project
// -> optional Brand Brain -> generation:create. This middleware only
// records that authorized transition as one immutable internal generation
// job. Establishing that job is mandatory: the existing in-process
// Text/Image handler is the active execution adapter at this foundation
// stage, but it may run only after authoritative persistence succeeds.
function createGenerationJobRecorder({
  generationJobService,
  executionClass,
  allowedScopes,
  kind,
  logger = console,
}) {
  if (!generationJobService) {
    throw new TypeError("A generation job service is required");
  }
  if (typeof executionClass !== "string" || !executionClass.trim()) {
    throw new TypeError("An execution class is required");
  }
  if (!Array.isArray(allowedScopes) || allowedScopes.length === 0) {
    throw new TypeError("At least one allowed scope is required");
  }
  if (!new Set(["script", "image"]).has(kind)) {
    throw new TypeError("Generation job response kind must be script or image");
  }

  return async function recordGenerationJob(req, res, next) {
    const authorization = res.locals.customerAuthorization;

    if (!authorization) {
      logger.error?.("generation job authorization missing", {
        path: req.path,
        code: GENERATION_JOB_UNAVAILABLE_ERROR.code,
      });
      return res.status(503).json(failureBody(kind));
    }

    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const requestCorrelationId =
        typeof body.execution_id === "string" && body.execution_id.trim()
          ? body.execution_id
          : randomUUID();

      const job = await generationJobService.authorizeAndCreateJob({
        authorization,
        executionClass,
        requestCorrelationId,
        idempotencyKey: requestCorrelationId,
        allowedScopes,
        executionInput: body,
      });

      res.locals.generationJob = job;
    } catch (error) {
      logger.error?.("generation job establishment failed", {
        path: req.path,
        code: error?.code || error?.name || "GENERATION_JOB_ERROR",
      });
      return res.status(503).json(failureBody(kind));
    }

    return next();
  };
}

module.exports = {
  GENERATION_JOB_UNAVAILABLE_ERROR,
  createGenerationJobRecorder,
};
