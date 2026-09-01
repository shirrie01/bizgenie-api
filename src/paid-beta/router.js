const express = require("express");
const {
  PaidBetaPayloadTooLargeError,
  PaidBetaValidationError,
  sendPaidBetaError,
} = require("./errors");

function defaultClientIdentity(req) {
  return req.socket?.remoteAddress || req.ip || "unresolved-client";
}

function createPaidBetaRouter({
  service,
  logger = console,
  resolveClientIdentity = defaultClientIdentity,
}) {
  if (!service) throw new TypeError("A paid-beta capture service is required");
  const router = express.Router();

  router.post(
    "/",
    async (req, _res, next) => {
      try {
        await service.consumeAttempt({ clientIdentity: resolveClientIdentity(req) });
        next();
      } catch (error) {
        next(error);
      }
    },
    express.json({ limit: "16kb", strict: true }),
    async (req, res, next) => {
      try {
        const result = await service.capture(req.body);
        logger.info?.("paid-beta interest received", {
          reference_id: result.reference_id,
        });
        return res.status(202).json(result);
      } catch (error) {
        logger.warn?.("paid-beta interest rejected", {
          code: error?.code || "PAID_BETA_CAPTURE_INTERNAL_ERROR",
        });
        return next(error);
      }
    }
  );

  router.use((error, _req, res, _next) => {
    if (error?.type === "entity.too.large") {
      return sendPaidBetaError(new PaidBetaPayloadTooLargeError(), res);
    }
    if (error instanceof SyntaxError && error.status === 400) {
      return sendPaidBetaError(new PaidBetaValidationError([{
        path: "",
        code: "invalid_json",
        message: "Malformed JSON request body",
      }]), res);
    }
    if (sendPaidBetaError(error, res)) return;
    logger.error?.("paid-beta capture internal error", {
      code: error?.code || "PAID_BETA_CAPTURE_INTERNAL_ERROR",
    });
    return res.status(500).json({
      error: {
        code: "PAID_BETA_CAPTURE_INTERNAL_ERROR",
        message: "Paid-beta interest capture failed",
      },
    });
  });

  return router;
}

module.exports = {
  createPaidBetaRouter,
  defaultClientIdentity,
};
