const { z } = require("zod");
const { StripeBillingConfigurationError } = require("./errors");

const STRIPE_SDK_VERSION = "22.5.0";
const STRIPE_API_VERSION = "2026-07-29.dahlia";

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"));
const testUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
});

const CHECKOUT_SUCCESS_PATH = "/billing/checkout/success";
const CHECKOUT_CANCEL_PATH = "/billing/checkout/cancel";

const plan = z.object({
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
  policyId: z.string().trim().min(1).max(128),
}).strict();

const StripeBillingConfigSchema = z.object({
  mode: z.enum(["test", "live"]),
  secretKey: z.string().min(1),
  webhookSecret: z.string().regex(/^whsec_[A-Za-z0-9_]+$/),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  pastDueGraceDays: z.number().int().min(0).max(90),
  plans: z.partialRecord(z.enum(["standard", "pro"]), plan),
}).strict().superRefine((config, ctx) => {
  const expectedPrefix = config.mode === "live" ? "sk_live_" : "sk_test_";
  if (!config.secretKey.startsWith(expectedPrefix)) {
    ctx.addIssue({ code: "custom", path: ["secretKey"], message: "Stripe key mode mismatch" });
  }
  const urlSchema = config.mode === "live" ? httpsUrl : testUrl;
  for (const key of ["successUrl", "cancelUrl"]) {
    if (!urlSchema.safeParse(config[key]).success) {
      ctx.addIssue({ code: "custom", path: [key], message: "Unsafe Stripe return URL" });
    }
  }
  const success = new URL(config.successUrl);
  const cancel = new URL(config.cancelUrl);
  if (success.origin !== cancel.origin) {
    ctx.addIssue({ code: "custom", path: ["cancelUrl"], message: "Stripe return origins must match" });
  }
  for (const [key, url, expectedPath] of [
    ["successUrl", success, CHECKOUT_SUCCESS_PATH],
    ["cancelUrl", cancel, CHECKOUT_CANCEL_PATH],
  ]) {
    if (
      url.pathname !== expectedPath || url.search || url.hash ||
      url.username || url.password
    ) {
      ctx.addIssue({ code: "custom", path: [key], message: "Unsafe Stripe return route" });
    }
  }
  if (Object.keys(config.plans).length === 0) {
    ctx.addIssue({ code: "custom", path: ["plans"], message: "At least one plan is required" });
  }
  const priceIds = Object.values(config.plans).map((value) => value.priceId);
  if (new Set(priceIds).size !== priceIds.length) {
    ctx.addIssue({ code: "custom", path: ["plans"], message: "Stripe prices must be unique" });
  }
});

function loadStripeBillingConfig({ env = process.env } = {}) {
  const plans = {};
  if (env.STRIPE_PRICE_STANDARD && env.STRIPE_POLICY_STANDARD) {
    plans.standard = {
      priceId: env.STRIPE_PRICE_STANDARD,
      policyId: env.STRIPE_POLICY_STANDARD,
    };
  }
  if (env.STRIPE_PRICE_PRO && env.STRIPE_POLICY_PRO) {
    plans.pro = {
      priceId: env.STRIPE_PRICE_PRO,
      policyId: env.STRIPE_POLICY_PRO,
    };
  }

  const parsed = StripeBillingConfigSchema.safeParse({
    mode: env.STRIPE_MODE,
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    successUrl: env.STRIPE_SUCCESS_URL,
    cancelUrl: env.STRIPE_CANCEL_URL,
    pastDueGraceDays: Number(env.STRIPE_PAST_DUE_GRACE_DAYS || 7),
    plans,
  });
  if (!parsed.success) throw new StripeBillingConfigurationError();
  return Object.freeze({
    ...parsed.data,
    plans: Object.freeze(parsed.data.plans),
  });
}

function createStripeClient({ config }) {
  const Stripe = require("stripe");
  if (Stripe.PACKAGE_VERSION !== STRIPE_SDK_VERSION || Stripe.API_VERSION !== STRIPE_API_VERSION) {
    throw new StripeBillingConfigurationError();
  }
  return new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: "BizGenie", version: "BG-BILL-002B" },
  });
}

module.exports = {
  CHECKOUT_CANCEL_PATH,
  CHECKOUT_SUCCESS_PATH,
  STRIPE_API_VERSION,
  STRIPE_SDK_VERSION,
  StripeBillingConfigSchema,
  createStripeClient,
  loadStripeBillingConfig,
};
