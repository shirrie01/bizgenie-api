const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  createStripeWebhookIngress,
} = require("../stripe-webhook-ingress");
const {
  StripeSignatureVerificationError,
} = require("../src/billing/stripe/errors");

test("ingress exposes health and only dedicated webhook surface", async () => {
  const app = createStripeWebhookIngress({
    service: {
      async handleWebhook() {
        return { handled: true, replay: false };
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const health = await request(app).get("/");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, {
    status: "ok",
    service: "stripe-webhook-ingress",
  });

  assert.equal((await request(app).post("/billing/stripe/checkout")).status, 404);
  assert.equal((await request(app).get("/_admin/ping")).status, 404);
  assert.equal((await request(app).post("/customer/generate-script")).status, 404);
});

test("webhook preserves exact raw bytes and Stripe signature header", async () => {
  const seen = [];
  const app = createStripeWebhookIngress({
    service: {
      async handleWebhook(input) {
        seen.push(input);
        return {
          event_id: "evt_test_001",
          event_type: "invoice.paid",
          handled: true,
          replay: false,
          stale: false,
        };
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });
  const payload = '{"id":"evt_test_001","type":"invoice.paid"}';
  const expectedBytes = Buffer.from(payload, "utf8");

  const response = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=test")
    .send(payload);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    received: true,
    handled: true,
    replay: false,
  });
  assert.equal(seen.length, 1);
  assert.equal(Buffer.isBuffer(seen[0].rawBody), true);
  assert.deepEqual(seen[0].rawBody, expectedBytes);
  assert.equal(seen[0].signature, "t=1,v1=test");
});

test("invalid Stripe signature is fail-closed and sanitized", async () => {
  const app = createStripeWebhookIngress({
    service: {
      async handleWebhook() {
        throw new StripeSignatureVerificationError();
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const response = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .send('{"id":"evt_bad"}');

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: {
      code: "STRIPE_SIGNATURE_INVALID",
      message: "Webhook signature verification failed",
    },
  });
});

test("unexpected ingress failures do not expose internals", async () => {
  const app = createStripeWebhookIngress({
    service: {
      async handleWebhook() {
        throw new Error("database password should never leak");
      },
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const response = await request(app)
    .post("/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=test")
    .send('{"id":"evt_internal"}');

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: {
      code: "STRIPE_WEBHOOK_INTERNAL_ERROR",
      message: "Webhook processing failed",
    },
  });
  assert.equal(JSON.stringify(response.body).includes("database password"), false);
});
