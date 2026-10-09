const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { createStripeProductionComposition } = require("../src/billing");

function stripeEnvironment(overrides = {}) {
  return {
    BIZGENIE_ENVIRONMENT: "production",
    PRODUCTION_ACTIVATION_ENABLED: "true",
    STRIPE_BILLING_ENABLED: "true",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: "sk_live_regression_not_real",
    STRIPE_WEBHOOK_SECRET: "whsec_regression_not_real",
    STRIPE_SUCCESS_URL: "https://example.com/success",
    STRIPE_CANCEL_URL: "https://example.com/cancel",
    STRIPE_PRICE_STANDARD: "price_regression",
    STRIPE_POLICY_STANDARD: "policy_regression",
    ...overrides,
  };
}

describe("production Stripe Checkout route regression", () => {
  it("mounts Checkout when the production Stripe composition is enabled", async () => {
    const env = stripeEnvironment();
    const stripe = createStripeProductionComposition({
      env,
      billingRepository: {},
      billingService: {},
      stripeFactory: () => ({}),
    });
    assert.equal(stripe.enabled, true);
    assert.ok(stripe.stripeSubscriptionService);

    const response = await request(createApp({
      env,
      stripeSubscriptionService: stripe.stripeSubscriptionService,
    })).post("/billing/stripe/checkout").send({});
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "AUTHENTICATION_REQUIRED");
  });

  it("does not silently activate Checkout when Stripe is disabled", async () => {
    const stripe = createStripeProductionComposition({
      env: stripeEnvironment({ STRIPE_BILLING_ENABLED: "false" }),
    });
    assert.equal(stripe.enabled, false);
    assert.equal(stripe.stripeSubscriptionService, null);
    const response = await request(createApp({
      stripeSubscriptionService: stripe.stripeSubscriptionService,
    })).post("/billing/stripe/checkout").send({});
    assert.equal(response.status, 404);
  });
});
