const { extractBearerToken } = require("./customerGenerationBoundary");

const BILLING_CHECKOUT_ACTION = "billing:checkout";

function createCustomerBillingTenantResolver({
  tokenVerifier,
  authorizationService,
}) {
  if (!tokenVerifier || !authorizationService) {
    throw new TypeError(
      "Customer billing requires token verification and authorization dependencies"
    );
  }

  return async function resolveAuthorizedBillingTenant(req, { action } = {}) {
    if (action !== BILLING_CHECKOUT_ACTION) {
      throw new TypeError("Unsupported customer billing action");
    }

    const accessToken = extractBearerToken(req.header("authorization"));
    const actor = await tokenVerifier.verifyAccessToken(accessToken);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { tenant_id: tenantId, ...billingRequest } = body;
    const authorization = await authorizationService.authorizeTenant({
      actor,
      tenantId,
      action,
    });

    // tenant_id is only a requested resource selector. The verified
    // membership result above is the authority passed to Stripe. All other
    // fields remain for the strict Checkout schema to accept or reject.
    req.body = billingRequest;
    return authorization;
  };
}

module.exports = {
  BILLING_CHECKOUT_ACTION,
  createCustomerBillingTenantResolver,
};
