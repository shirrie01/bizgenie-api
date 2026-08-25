const express = require("express");
const { createPostgresBrandBrainRepositoryFromEnv } = require("./src/brand-brain");
const {
  createPostgresBillingProductionComposition,
  createStripeProductionComposition,
} = require("./src/billing");
const {
  StripeBillingError,
  sendStripeBillingError,
} = require("./src/billing/stripe/errors");

function createStripeWebhookIngress({ service, logger = console } = {}) {
  if (!service || typeof service.handleWebhook !== "function") {
    throw new TypeError("A Stripe subscription service is required");
  }

  const app = express();

  app.get("/", (_req, res) => {
    res.status(200).json({ status: "ok", service: "stripe-webhook-ingress" });
  });

  app.post(
    "/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res, next) => {
      try {
        const result = await service.handleWebhook({
          rawBody: req.body,
          signature: req.header("stripe-signature"),
        });
        logger.info?.("stripe ingress webhook processed", {
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
        logger.warn?.("stripe ingress webhook rejected", {
          code: error?.code || "STRIPE_WEBHOOK_INTERNAL_ERROR",
        });
        return next(error);
      }
    }
  );

  app.use((error, _req, res, _next) => {
    if (sendStripeBillingError(error, res)) return;
    if (!(error instanceof StripeBillingError)) {
      logger.error?.("stripe ingress internal error", {
        code: error?.code || "STRIPE_WEBHOOK_INTERNAL_ERROR",
      });
    }
    return res.status(500).json({
      error: {
        code: "STRIPE_WEBHOOK_INTERNAL_ERROR",
        message: "Webhook processing failed",
      },
    });
  });

  return app;
}

async function createProductionStripeWebhookIngress({ env = process.env, logger = console } = {}) {
  const database = createPostgresBrandBrainRepositoryFromEnv({ env });
  const billing = await createPostgresBillingProductionComposition({
    pool: database.pool,
    env,
    logger,
  });
  const stripe = createStripeProductionComposition({
    billingRepository: billing.billingRepository,
    billingService: billing.billingService,
    env,
  });
  if (!stripe.enabled || !stripe.stripeSubscriptionService) {
    throw new Error("Stripe webhook ingress is not configured");
  }
  return {
    app: createStripeWebhookIngress({
      service: stripe.stripeSubscriptionService,
      logger,
    }),
    database,
    billing,
    stripe,
  };
}

async function startStripeWebhookIngress({ env = process.env, logger = console } = {}) {
  const production = await createProductionStripeWebhookIngress({ env, logger });
  const port = env.PORT || 8080;
  const server = production.app.listen(port, () => {
    logger.log?.("Stripe webhook ingress listening on", port);
  });
  return { ...production, server };
}

if (require.main === module) {
  startStripeWebhookIngress().catch((error) => {
    console.error("Stripe webhook ingress startup failed", {
      name: error?.name || "Error",
      code: error?.code || "STARTUP_ERROR",
    });
    process.exitCode = 1;
  });
}

module.exports = {
  createProductionStripeWebhookIngress,
  createStripeWebhookIngress,
  startStripeWebhookIngress,
};
