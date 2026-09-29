const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryBillingRepository } = require("../src/billing");
const { AuthenticationRequiredError } = require("../src/authorization");

const NOW = new Date("2026-09-29T00:00:00.000Z");
const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";

function actor(tenantId) {
  return Object.freeze({
    auth_user_id: "11111111-1111-4111-8111-111111111111",
    tenant_id: tenantId,
    project_id: "project_a",
    brand_id: "brand_a",
  });
}

function entitlement(overrides = {}) {
  return {
    entitlement_id: "entitlement_a",
    tenant_id: TENANT_A,
    policy_id: "paid-beta-standard-v1",
    plan_code: "standard",
    status: "active",
    starts_at: "2026-09-01T00:00:00.000Z",
    ends_at: null,
    reference_period_start: "2026-09-01T00:00:00.000Z",
    reference_period_end: "2026-10-01T00:00:00.000Z",
    included_monthly_credit_grant: 60,
    stripe_subscription_ref: "sub_test_a",
    cancellation_effective_at: null,
    grace_ends_at: null,
    ...overrides,
  };
}

function fixture({ tenantId = TENANT_A, entitlements = [entitlement()], entries = [] } = {}) {
  const billingRepository = new InMemoryBillingRepository({
    now: () => NOW,
    entitlements,
    accounts: [{ account_id: "account_a", tenant_id: TENANT_A, status: "active", created_at: NOW.toISOString() }],
    entries,
  });
  const customerTokenVerifier = {
    async verifyAccessToken(token) {
      if (token !== "valid-token") throw new AuthenticationRequiredError();
      return actor(tenantId);
    },
  };
  return request(createApp({ billingRepository, customerTokenVerifier }));
}

test("customer billing requires verified authentication", async () => {
  const response = await fixture().get("/customer/billing/subscription");
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "AUTHENTICATION_REQUIRED");
});

test("customer billing returns only customer-safe active entitlement state", async () => {
  const response = await fixture()
    .get("/customer/billing/subscription")
    .set("authorization", "Bearer valid-token");
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.status, "ready");
  assert.deepEqual(response.body.subscription, {
    plan_code: "standard",
    entitlement_status: "active",
    included_monthly_credit_grant: 60,
    starts_at: "2026-09-01T00:00:00.000Z",
    ends_at: null,
    reference_period_start: "2026-09-01T00:00:00.000Z",
    reference_period_end: "2026-10-01T00:00:00.000Z",
    cancellation_effective_at: null,
    grace_ends_at: null,
  });
  assert.equal(response.body.available_credits, 0);
  assert.equal(response.body.subscription.stripe_subscription_ref, undefined);
  assert.equal(response.body.subscription.policy_id, undefined);
  assert.equal(response.body.subscription.tenant_id, undefined);
});

for (const state of [
  { status: "grace", grace_ends_at: "2026-09-30T00:00:00.000Z" },
  { status: "cancel_pending", cancellation_effective_at: "2026-10-01T00:00:00.000Z" },
]) {
  test(`customer billing represents serving ${state.status} entitlement truthfully`, async () => {
    const response = await fixture({ entitlements: [entitlement(state)] })
      .get("/customer/billing/subscription")
      .set("authorization", "Bearer valid-token");
    assert.equal(response.status, 200);
    assert.equal(response.body.subscription.entitlement_status, state.status);
  });
}

test("inactive or cancelled entitlement is represented as not subscribed", async () => {
  for (const status of ["inactive", "cancelled"]) {
    const response = await fixture({ entitlements: [entitlement({ status })] })
      .get("/customer/billing/subscription")
      .set("authorization", "Bearer valid-token");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      status: "not_subscribed",
      subscription: null,
      available_credits: null,
    });
  }
});

test("customer billing does not accept browser tenant authority or reveal another tenant", async () => {
  const response = await fixture({ tenantId: TENANT_B })
    .get("/customer/billing/subscription?tenant_id=tenant_a")
    .set("authorization", "Bearer valid-token");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: "not_subscribed",
    subscription: null,
    available_credits: null,
  });
});

test("customer billing is read-only", async () => {
  const repository = new InMemoryBillingRepository({
    now: () => NOW,
    entitlements: [entitlement()],
    accounts: [{ account_id: "account_a", tenant_id: TENANT_A, status: "active", created_at: NOW.toISOString() }],
  });
  const beforeEntries = repository.entries.length;
  const client = request(createApp({
    billingRepository: repository,
    customerTokenVerifier: { async verifyAccessToken() { return actor(TENANT_A); } },
  }));
  const response = await client.get("/customer/billing/subscription").set("authorization", "Bearer valid-token");
  assert.equal(response.status, 200);
  assert.equal(repository.entries.length, beforeEntries);
});
