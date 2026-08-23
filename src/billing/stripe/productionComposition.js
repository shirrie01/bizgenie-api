const { activationFlag, requireActivationEnvironment } = require("../../activation/config");
const { StripeBillingConfigurationError } = require("./errors");
const { createStripeClient, loadStripeBillingConfig } = require("./config");
const { StripeSubscriptionService } = require("./service");

function createStripeProductionComposition({
  billingRepository,
  billingService,
  env = process.env,
  stripeFactory = createStripeClient,
  now = () => new Date(),
} = {}) {
  const enabled = activationFlag(env, "STRIPE_BILLING_ENABLED");
  if (!enabled) return Object.freeze({ enabled: false, stripeSubscriptionService: null });
  const environment = requireActivationEnvironment(env);
  if (!billingRepository || !billingService) throw new StripeBillingConfigurationError();
  const config = loadStripeBillingConfig({ env });
  if (
    (environment === "staging" && config.mode !== "test") ||
    (environment === "production" && config.mode !== "live")
  ) {
    throw new StripeBillingConfigurationError();
  }
  const stripe = stripeFactory({ config });
  return Object.freeze({
    enabled: true,
    config,
    stripeSubscriptionService: new StripeSubscriptionService({
      stripe,
      repository: billingRepository,
      billingService,
      config,
      now,
    }),
  });
}

module.exports = { createStripeProductionComposition };
