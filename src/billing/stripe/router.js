const express = require("express");
const {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} = require("../../authorization");
const {
  StripeBillingError,
  sendStripeBillingError,
} = require("./errors");

function createStripeBillingRouter({ service, authorizeTenantRequest, logger = console }) {
  if (!service) throw new TypeError("A Stripe subscription service is required");
  if (typeof authorizeTenantRequest !== "function") {
    throw new TypeError("An authorized tenant resolver is required");
  }

  const router = express.Router();

  router.post(
    "/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res, next) => {
      try {
        const result = await service.handleWebhook({
          rawBody: req.body,
          signature: req.header("stripe-signature"),
        });
        logger.info?.("stripe webhook processed", {
          event_id: result.event_id,
          event_type: result.event_type,
          handled: result.handled,
          replay: result.replay,
          stale: result.stale,
        });
        return res.json({
          received: true,
          handled: result.handled,
          replay: result.replay,
        });
      } catch (error) {
        logger.warn?.("stripe webhook rejected", {
          code: error?.code || "STRIPE_WEBHOOK_INTERNAL_ERROR",
        });
        return next(error);
      }
    }
  );

  router.post("/checkout", express.json({ limit: "32kb" }), async (req, res, next) => {
    try {
      const tenantAuthorization = await authorizeTenantRequest(req, {
        action: "billing:checkout",
      });
      const result = await service.createCheckoutSession({
        tenantAuthorization,
        request: req.body,
      });
      logger.info?.("stripe checkout created", {
        tenant_id: tenantAuthorization.tenant_id,
        checkout_session_id: result.checkout_session_id,
      });
      return res.status(201).json(result);
    } catch (error) {
      logger.warn?.("stripe checkout rejected", {
        code: error?.code || "STRIPE_CHECKOUT_INTERNAL_ERROR",
      });
      return next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    if (sendStripeBillingError(error, res)) return;
    if (error instanceof AuthenticationRequiredError) {
      return res.status(401).json({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Customer authentication is required",
        },
      });
    }
    if (error instanceof AuthorizationDeniedError) {
      return res.status(404).json({
        error: {
          code: "RESOURCE_NOT_AVAILABLE",
          message: "The requested resource is not available",
        },
      });
    }
    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({
        error: {
          code: "STRIPE_BILLING_VALIDATION_ERROR",
          message: "Billing request validation failed",
        },
      });
    }
    if (!(error instanceof StripeBillingError)) {
      logger.error?.("stripe billing internal error", {
        code: error?.code || "STRIPE_BILLING_INTERNAL_ERROR",
      });
    }
    return res.status(500).json({
      error: {
        code: "STRIPE_BILLING_INTERNAL_ERROR",
        message: "Billing request failed",
      },
    });
  });

  return router;
}

module.exports = { createStripeBillingRouter };
