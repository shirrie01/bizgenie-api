const {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} = require("../authorization");

const AUTHENTICATION_ERROR = Object.freeze({
  code: "AUTHENTICATION_REQUIRED",
  message: "Customer authentication is required",
});
const AUTHORIZATION_ERROR = Object.freeze({
  code: "RESOURCE_NOT_AVAILABLE",
  message: "The requested resource is not available",
});
const AUTHORIZATION_UNAVAILABLE_ERROR = Object.freeze({
  code: "AUTHORIZATION_UNAVAILABLE",
  message: "Customer authorization is temporarily unavailable",
});

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    throw new AuthenticationRequiredError();
  }

  const match = authorizationHeader.match(/^Bearer ([^\s,]+)$/i);
  if (!match) {
    throw new AuthenticationRequiredError();
  }
  return match[1];
}

function responseBody(kind, error) {
  if (kind === "script") {
    return {
      status: "failed",
      error,
      script_body: "",
    };
  }
  return {
    status: "failed",
    error,
    media: null,
  };
}

function createCustomerGenerationBoundary({
  tokenVerifier,
  authorizationService,
  kind,
  logger = console,
}) {
  if (!tokenVerifier || !authorizationService) {
    throw new TypeError(
      "Customer generation requires token verification and authorization dependencies"
    );
  }
  if (!new Set(["script", "image"]).has(kind)) {
    throw new TypeError("Customer generation kind must be script or image");
  }

  return async function requireAuthorizedCustomer(req, res, next) {
    try {
      const accessToken = extractBearerToken(req.header("authorization"));
      const actor = await tokenVerifier.verifyAccessToken(accessToken);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { tenant_id: tenantId, ...generationRequest } = body;

      const authorization = body.brand_id
        ? await authorizationService.authorizeProjectBrand({
            actor,
            tenantId,
            projectId: body.project_id,
            brandId: body.brand_id,
            action: "generation:create",
          })
        : await authorizationService.authorizeProject({
            actor,
            tenantId,
            projectId: body.project_id,
            action: "generation:create",
          });

      req.body = {
        ...generationRequest,
        user_id: actor.auth_user_id,
      };
      res.locals.customerAuthorization = authorization;
      return next();
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        logger.warn?.("customer authentication rejected", {
          code: AUTHENTICATION_ERROR.code,
          path: req.path,
        });
        return res.status(401).json(responseBody(kind, AUTHENTICATION_ERROR));
      }

      if (error instanceof AuthorizationDeniedError) {
        logger.warn?.("customer authorization rejected", {
          code: AUTHORIZATION_ERROR.code,
          path: req.path,
        });
        return res.status(404).json(responseBody(kind, AUTHORIZATION_ERROR));
      }

      logger.error?.("customer authorization unavailable", {
        code: AUTHORIZATION_UNAVAILABLE_ERROR.code,
        path: req.path,
      });
      return res
        .status(503)
        .json(responseBody(kind, AUTHORIZATION_UNAVAILABLE_ERROR));
    }
  };
}

module.exports = {
  AUTHENTICATION_ERROR,
  AUTHORIZATION_ERROR,
  AUTHORIZATION_UNAVAILABLE_ERROR,
  createCustomerGenerationBoundary,
  extractBearerToken,
};
