const { AuthenticationRequiredError } = require("../authorization");
const { extractBearerToken } = require("../authentication");
const {
  CustomerWorkspacePersistenceError,
  CustomerWorkspaceValidationError,
} = require("./errors");
const express = require("express");

const AUTHENTICATION_ERROR = Object.freeze({
  code: "AUTHENTICATION_REQUIRED",
  message: "Customer authentication is required",
});

function errorBody(error) {
  return {
    status: "failed",
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

function createCustomerWorkspaceRouter({ service, tokenVerifier, logger = console }) {
  if (!service || !tokenVerifier) {
    throw new TypeError(
      "Customer workspace routes require service and token verification dependencies"
    );
  }

  const router = express.Router();

  async function actorForRequest(req) {
    const accessToken = extractBearerToken(req.header("authorization"));
    if (typeof tokenVerifier.verifyIdentityAccessToken === "function") {
      return tokenVerifier.verifyIdentityAccessToken(accessToken);
    }
    return tokenVerifier.verifyAccessToken(accessToken);
  }

  router.get("/", async (req, res) => {
    try {
      const actor = await actorForRequest(req);
      return res.json(await service.getWorkspace({ actor }));
    } catch (error) {
      return sendWorkspaceError({ error, res, logger, path: req.path });
    }
  });

  router.post("/bootstrap", async (req, res) => {
    try {
      const actor = await actorForRequest(req);
      return res.status(201).json(
        await service.bootstrapWorkspace({
          actor,
          request: req.body && typeof req.body === "object" ? req.body : {},
        })
      );
    } catch (error) {
      return sendWorkspaceError({ error, res, logger, path: req.path });
    }
  });

  return router;
}

function sendWorkspaceError({ error, res, logger, path }) {
  if (error instanceof AuthenticationRequiredError) {
    logger.warn?.("customer workspace authentication rejected", {
      code: AUTHENTICATION_ERROR.code,
      path,
    });
    return res.status(401).json({ status: "failed", error: AUTHENTICATION_ERROR });
  }

  if (error instanceof CustomerWorkspaceValidationError) {
    return res.status(error.status).json(errorBody(error));
  }

  if (error instanceof CustomerWorkspacePersistenceError) {
    logger.error?.("customer workspace persistence unavailable", {
      code: error.code,
      path,
    });
    return res.status(error.status).json(errorBody(error));
  }

  logger.error?.("customer workspace unavailable", {
    code: "WORKSPACE_UNAVAILABLE",
    path,
  });
  return res.status(503).json({
    status: "failed",
    error: {
      code: "WORKSPACE_UNAVAILABLE",
      message: "Workspace setup is temporarily unavailable",
    },
  });
}

module.exports = {
  AUTHENTICATION_ERROR,
  createCustomerWorkspaceRouter,
};
