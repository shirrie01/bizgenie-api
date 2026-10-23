const express = require("express");
const { AuthenticationRequiredError } = require("../authorization");
const { extractBearerToken } = require("../authentication");
const { OnboardingError } = require("./errors");

const AUTHENTICATION_ERROR = Object.freeze({
  code: "AUTHENTICATION_REQUIRED",
  message: "Customer authentication is required",
});

function createWorkspaceOnboardingRouter({ service, tokenVerifier, logger = console }) {
  if (!service || !tokenVerifier) {
    throw new TypeError("Workspace onboarding routes require service and token verification dependencies");
  }
  const router = express.Router();
  // Scope comes only from the verified token's trusted_scope, never from the request.
  const actorFor = (req) => tokenVerifier.verifyAccessToken(extractBearerToken(req.header("authorization")));

  router.get("/", async (req, res) => {
    try {
      return res.json(await service.get({ actor: await actorFor(req) }));
    } catch (error) {
      return sendError(error, res, logger, req.path);
    }
  });

  router.put("/", async (req, res) => {
    try {
      const actor = await actorFor(req);
      return res.json(await service.save({ actor, request: req.body && typeof req.body === "object" ? req.body : {} }));
    } catch (error) {
      return sendError(error, res, logger, req.path);
    }
  });

  return router;
}

function sendError(error, res, logger, path) {
  if (error instanceof AuthenticationRequiredError) {
    return res.status(401).json({ status: "failed", error: AUTHENTICATION_ERROR });
  }
  if (error instanceof OnboardingError) {
    if (error.status >= 500) logger.error?.("workspace onboarding persistence unavailable", { code: error.code, path });
    return res.status(error.status).json({
      status: "failed",
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
  }
  logger.error?.("workspace onboarding unavailable", { code: "ONBOARDING_UNAVAILABLE", path });
  return res.status(503).json({
    status: "failed",
    error: { code: "ONBOARDING_UNAVAILABLE", message: "Onboarding is temporarily unavailable" },
  });
}

module.exports = { createWorkspaceOnboardingRouter };
