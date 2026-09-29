const express = require("express");
const {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} = require("../authorization");
const { extractBearerToken } = require("../authentication");
const { CreditAccountUnavailableError } = require("./errors");

const AUTHENTICATION_ERROR = Object.freeze({
  code: "AUTHENTICATION_REQUIRED",
  message: "Customer authentication is required",
});

const RESOURCE_ERROR = Object.freeze({
  code: "RESOURCE_NOT_AVAILABLE",
  message: "The requested resource is not available",
});

function customerSubscription(entitlement) {
  if (!entitlement) return null;
  return Object.freeze({
    plan_code: entitlement.plan_code,
    entitlement_status: entitlement.status,
    included_monthly_credit_grant: entitlement.included_monthly_credit_grant,
    starts_at: entitlement.starts_at,
    ends_at: entitlement.ends_at,
    reference_period_start: entitlement.reference_period_start,
    reference_period_end: entitlement.reference_period_end,
    cancellation_effective_at: entitlement.cancellation_effective_at,
    grace_ends_at: entitlement.grace_ends_at,
  });
}

function createCustomerBillingRouter({
  repository,
  tokenVerifier,
  authorizationService,
  now = () => new Date(),
  logger = console,
}) {
  if (!repository || !tokenVerifier || !authorizationService) {
    throw new TypeError(
      "Customer billing routes require repository, token verification, and authorization dependencies"
    );
  }

  const router = express.Router();

  router.get("/subscription", async (req, res) => {
    try {
      const accessToken = extractBearerToken(req.header("authorization"));
      const actor =
        typeof tokenVerifier.verifyIdentityAccessToken === "function"
          ? await tokenVerifier.verifyIdentityAccessToken(accessToken)
          : await tokenVerifier.verifyAccessToken(accessToken);
      const tenantAuthorization = await authorizationService.authorizeTenant({
        actor,
        tenantId: req.query.tenant_id,
        action: "tenant:read",
      });
      const tenantId = tenantAuthorization.tenant_id;

      const entitlement = await repository.getActiveEntitlement(tenantId, now().toISOString());
      if (!entitlement) {
        return res.json({ status: "not_subscribed", subscription: null, available_credits: null });
      }

      let availableCredits = null;
      try {
        const balance = await repository.readBalance(tenantId);
        availableCredits = balance.available_balance;
      } catch (error) {
        if (!(error instanceof CreditAccountUnavailableError)) throw error;
      }

      return res.json({
        status: "ready",
        subscription: customerSubscription(entitlement),
        available_credits: availableCredits,
      });
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        logger.warn?.("customer billing authentication rejected", {
          code: AUTHENTICATION_ERROR.code,
          path: req.path,
        });
        return res.status(401).json({ status: "failed", error: AUTHENTICATION_ERROR });
      }
      if (error instanceof AuthorizationDeniedError) {
        return res.status(404).json({ status: "failed", error: RESOURCE_ERROR });
      }

      logger.error?.("customer billing state unavailable", {
        code: "BILLING_STATE_UNAVAILABLE",
        path: req.path,
      });
      return res.status(503).json({
        status: "failed",
        error: {
          code: "BILLING_STATE_UNAVAILABLE",
          message: "Billing status is temporarily unavailable",
        },
      });
    }
  });

  return router;
}

module.exports = {
  AUTHENTICATION_ERROR,
  RESOURCE_ERROR,
  createCustomerBillingRouter,
  customerSubscription,
};
