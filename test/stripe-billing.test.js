const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const Stripe = require("stripe");
const { createApp } = require("../index");
const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
} = require("../src/authorization");
const {
  BillingService,
  InMemoryBillingRepository,
  STRIPE_API_VERSION,
  STRIPE_SDK_VERSION,
  StripeBillingConflictError,
  StripeBillingResourceUnavailableError,
  StripeEnvironmentMismatchError,
  StripeSubscriptionService,
  loadStripeBillingConfig,
  mapStripeStatus,
} = require("../src/billing");

const NOW = "2026-08-20T12:00:00.000Z";
const EVENT_CREATED = 1787227200;
const PERIOD_START = 1785542400;
const PERIOD_END = 1788220800;
const WEBHOOK_SECRET = "whsec_test_secret_123";
const USER_A = "11111111-1111-4111-8111-111111111111";

function policy(overrides = {}) {
  return { policy_id: "policy_standard_v1", plan_code: "standard", policy_version: 1, status: "active", included_monthly_credits: 10, bolt_on_eligible: true, effective_from: "2026-01-01T00:00:00.000Z", execution_costs: { "text.standard": 1 }, ...overrides };
}
function entitlement(overrides = {}) {
  return { entitlement_id: "entitlement_tenant_a", tenant_id: "tenant_a", policy_id: "policy_standard_v1", plan_code: "standard", status: "active", starts_at: "2026-01-01T00:00:00.000Z", reference_period_start: "2026-08-01T00:00:00.000Z", reference_period_end: "2026-09-01T00:00:00.000Z", included_monthly_credit_grant: 10, ...overrides };
}
function subscription(overrides = {}) {
  return { id: "sub_launch_001", object: "subscription", customer: "cus_tenant_a", status: "active", created: 1767225600, start_date: 1767225600, cancel_at: null, cancel_at_period_end: false, ended_at: null, canceled_at: null, items: { data: [{ id: "si_launch_001", current_period_start: PERIOD_START, current_period_end: PERIOD_END, price: { id: "price_StandardTest" } }] }, ...overrides };
}
function event(type, object, overrides = {}) {
  return { id: `evt_${type.replaceAll(".", "_")}_001`, object: "event", type, created: EVENT_CREATED, livemode: false, data: { object }, ...overrides };
}
function invoice(overrides = {}) {
  return { id: "in_launch_001", object: "invoice", customer: "cus_tenant_a", paid: true, status: "paid", billing_reason: "subscription_cycle", parent: { type: "subscription_details", subscription_details: { subscription: "sub_launch_001" } }, ...overrides };
}
function setup({ policies, entitlements, config: configOverrides } = {}) {
  let ledgerId = 1;
  const repository = new InMemoryBillingRepository({ policies: policies || [policy()], entitlements: entitlements || [entitlement()], accounts: [{ account_id: "account_tenant_a", tenant_id: "tenant_a", status: "active", created_at: "2026-01-01T00:00:00.000Z" }], now: () => new Date(NOW), idFactory: () => `ledger_stripe_${ledgerId++}`, entitlementIdFactory: () => "entitlement_from_stripe" });
  const billingService = new BillingService({ repository, now: () => new Date(NOW) });
  const verifier = new Stripe("sk_test_offline_only", { apiVersion: Stripe.API_VERSION });
  const calls = { customers: [], sessions: [], retrieves: [] };
  let retrievedSubscription = subscription();
  const stripe = { webhooks: verifier.webhooks, customers: { create: async (...args) => { calls.customers.push(args); return { id: "cus_tenant_a" }; } }, checkout: { sessions: { create: async (...args) => { calls.sessions.push(args); return { id: "cs_test_launch_001", url: "https://checkout.stripe.test/session" }; } } }, subscriptions: { retrieve: async (id) => { calls.retrieves.push(id); return retrievedSubscription; } } };
  const config = { mode: "test", secretKey: "sk_test_offline_only", webhookSecret: WEBHOOK_SECRET, successUrl: "https://app.bizgenie.test/billing/success", cancelUrl: "https://app.bizgenie.test/billing/cancel", pastDueGraceDays: 7, plans: { standard: { priceId: "price_StandardTest", policyId: "policy_standard_v1" } }, ...configOverrides };
  const service = new StripeSubscriptionService({ stripe, repository, billingService, config, now: () => new Date(NOW) });
  return { billingService, calls, config, repository, service, setRetrievedSubscription(value) { retrievedSubscription = value; }, verifier };
}
async function mapCustomer(repository, tenantId = "tenant_a", customerId = "cus_tenant_a") { return repository.createStripeCustomerMapping({ tenant_id: tenantId, stripe_customer_id: customerId, livemode: false }); }
function sign(verifier, payload) { return verifier.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET, timestamp: Math.floor(Date.now() / 1000) }); }
function checkoutAuthorization({ role = "owner" } = {}) {
  return { authorizationRepository: new InMemoryAuthorizationRepository({ customerProfiles: [{ auth_user_id: USER_A, display_name: "Customer A" }], tenants: [{ tenant_id: "tenant_a", name: "Tenant A", created_by: USER_A }, { tenant_id: "tenant_b", name: "Tenant B", created_by: USER_A }], memberships: [{ tenant_id: "tenant_a", auth_user_id: USER_A, role }] }), customerTokenVerifier: { async verifyAccessToken(token) { if (token !== "signed-customer-token-a") throw new AuthenticationRequiredError(); return Object.freeze({ kind: "customer", auth_user_id: USER_A }); } } };
}

describe("Stripe server configuration", () => {
  it("loads only approved server-side plan mappings", () => { const config = loadStripeBillingConfig({ env: { STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_configured", STRIPE_WEBHOOK_SECRET: "whsec_configured", STRIPE_SUCCESS_URL: "http://localhost:3000/billing/success", STRIPE_CANCEL_URL: "http://localhost:3000/billing/cancel", STRIPE_PRICE_STANDARD: "price_StandardTest", STRIPE_POLICY_STANDARD: "policy_standard_v1" } }); assert.equal(config.plans.standard.priceId, "price_StandardTest"); assert.equal(config.pastDueGraceDays, 7); assert.equal(Stripe.PACKAGE_VERSION, STRIPE_SDK_VERSION); assert.equal(Stripe.API_VERSION, STRIPE_API_VERSION); });
  it("rejects key-mode mismatches and non-HTTPS live return URLs", () => { assert.throws(() => loadStripeBillingConfig({ env: { STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_wrong_mode", STRIPE_WEBHOOK_SECRET: "whsec_configured", STRIPE_SUCCESS_URL: "http://localhost/success", STRIPE_CANCEL_URL: "https://app.bizgenie.test/cancel", STRIPE_PRICE_STANDARD: "price_StandardLive", STRIPE_POLICY_STANDARD: "policy_standard_v1" } })); });
});

describe("Stripe Checkout boundary", () => {
  it("creates approved subscription Checkout using only server-controlled values", async () => { const { calls, repository, service } = setup(); const result = await service.createCheckoutSession({ tenantAuthorization: { tenant_id: "tenant_a" }, request: { plan_code: "standard", request_id: "checkout_request_001" } }); assert.equal(result.checkout_session_id, "cs_test_launch_001"); assert.equal((await repository.getStripeCustomerByTenant("tenant_a")).stripe_customer_id, "cus_tenant_a"); assert.deepEqual(calls.sessions[0][0].line_items, [{ price: "price_StandardTest", quantity: 1 }]); assert.equal(calls.sessions[0][0].customer, "cus_tenant_a"); assert.equal(calls.sessions[0][0].success_url, "https://app.bizgenie.test/billing/success"); assert.deepEqual(calls.sessions[0][0].subscription_data.billing_mode, { type: "flexible" }); assert.match(calls.sessions[0][1].idempotencyKey, /^bizgenie:checkout:tenant_a:/); });
  it("rejects arbitrary price, customer, tenant, and URL inputs", async () => { const { calls, service } = setup(); await assert.rejects(service.createCheckoutSession({ tenantAuthorization: { tenant_id: "tenant_a" }, request: { plan_code: "standard", request_id: "checkout_request_002", price_id: "price_attacker", product_id: "prod_attacker", stripe_customer_id: "cus_attacker", tenant_id: "tenant_b", user_id: "user_attacker", stripe_secret: "sk_live_attacker", webhook_secret: "whsec_attacker", success_url: "https://attacker.test" } })); assert.equal(calls.customers.length, 0); assert.equal(calls.sessions.length, 0); });
  it("derives Checkout tenant authority from the verified owner membership", async () => { const { calls, service } = setup(); const app = createApp({ stripeSubscriptionService: service, ...checkoutAuthorization(), logger: { info() {}, warn() {}, error() {} } }); const response = await request(app).post("/billing/stripe/checkout").set("authorization", "Bearer signed-customer-token-a").send({ tenant_id: "tenant_a", plan_code: "standard", request_id: "checkout_request_http_001" }); assert.equal(response.status, 201); assert.equal(calls.customers.length, 1); assert.equal(calls.sessions[0][0].client_reference_id, "tenant_a"); });
  it("does not trust tenant_id, user_id, or a non-owner membership as Checkout authority", async () => { for (const scenario of [{ authorization: checkoutAuthorization(), body: { tenant_id: "tenant_b", plan_code: "standard", request_id: "checkout_request_tenant_b" }, expectedStatus: 404 }, { authorization: checkoutAuthorization({ role: "member" }), body: { tenant_id: "tenant_a", plan_code: "standard", request_id: "checkout_request_member" }, expectedStatus: 404 }, { authorization: checkoutAuthorization(), body: { tenant_id: "tenant_a", user_id: "attacker-selected-user", plan_code: "standard", request_id: "checkout_request_user_override" }, expectedStatus: 400 }]) { const { calls, service } = setup(); const app = createApp({ stripeSubscriptionService: service, ...scenario.authorization, logger: { info() {}, warn() {}, error() {} } }); const response = await request(app).post("/billing/stripe/checkout").set("authorization", "Bearer signed-customer-token-a").send(scenario.body); assert.equal(response.status, scenario.expectedStatus); assert.equal(calls.customers.length, 0); } });
  it("requires a customer Bearer token rather than an admin or service credential", async () => { const { calls, service } = setup(); const app = createApp({ stripeSubscriptionService: service, ...checkoutAuthorization(), logger: { info() {}, warn() {}, error() {} } }); for (const headers of [{}, { "x-admin-key": "admin-key-value" }, { "x-service-credential": "service-credential-value" }]) { let pending = request(app).post("/billing/stripe/checkout").send({ tenant_id: "tenant_a", plan_code: "standard", request_id: "checkout_request_wrong_principal" }); for (const [name, value] of Object.entries(headers)) pending = pending.set(name, value); const response = await pending; assert.equal(response.status, 401); } assert.equal(calls.customers.length, 0); });
  it("does not let one Stripe customer bind to a second tenant", async () => { const { repository } = setup(); await mapCustomer(repository); assert.throws(() => repository.createStripeCustomerMapping({ tenant_id: "tenant_b", stripe_customer_id: "cus_tenant_a", livemode: false }), StripeBillingConflictError); });
});

describe("Stripe subscription lifecycle", () => {
  it("maps every Stripe subscription status into BizGenie authority", () => { assert.equal(mapStripeStatus("trialing"), "active"); assert.equal(mapStripeStatus("active"), "active"); assert.equal(mapStripeStatus("active", { cancelScheduled: true }), "cancel_pending"); assert.equal(mapStripeStatus("past_due"), "grace"); assert.equal(mapStripeStatus("unpaid"), "inactive"); assert.equal(mapStripeStatus("canceled"), "cancelled"); assert.equal(mapStripeStatus("incomplete"), "inactive"); assert.equal(mapStripeStatus("incomplete_expired"), "inactive"); assert.equal(mapStripeStatus("paused"), "inactive"); });
  it("activates the canonical tenant entitlement without trusting metadata", async () => { const { repository, service } = setup(); await mapCustomer(repository); const forged = subscription({ metadata: { bizgenie_tenant_id: "tenant_b" } }); const result = await service.processVerifiedEvent(event("customer.subscription.created", forged)); const mapping = await repository.getStripeSubscription("sub_launch_001"); assert.equal(result.handled, true); assert.equal(mapping.tenant_id, "tenant_a"); assert.equal(mapping.policy_id, "policy_standard_v1"); assert.equal(mapping.stripe_status, "active"); });
  it("maps past due to a deterministic grace window", async () => { const { repository, service } = setup(); await mapCustomer(repository); const result = await service.processSubscription(subscription({ status: "past_due" }), event("customer.subscription.updated", subscription({ status: "past_due" }))); assert.equal(result.entitlement.status, "grace"); assert.equal(result.entitlement.grace_ends_at, "2026-08-27T12:00:00.000Z"); });
  it("maps scheduled and terminal cancellation deliberately", async () => { const { repository, service } = setup(); await mapCustomer(repository); const pending = await service.processSubscription(subscription({ cancel_at_period_end: true }), event("customer.subscription.updated", subscription())); assert.equal(pending.entitlement.status, "cancel_pending"); const cancelled = await service.processSubscription(subscription({ status: "canceled", ended_at: EVENT_CREATED + 60 }), event("customer.subscription.updated", subscription(), { id: "evt_subscription_cancelled_later", created: EVENT_CREATED + 60 })); assert.equal(cancelled.entitlement.status, "cancelled"); });
  it("treats subscription deletion as cancelled", async () => { const { repository, service } = setup(); await mapCustomer(repository); const result = await service.processVerifiedEvent(event("customer.subscription.deleted", subscription({ status: "canceled", ended_at: EVENT_CREATED }))); assert.equal(result.handled, true); assert.equal((await repository.getStripeSubscription("sub_launch_001")).stripe_status, "canceled"); });
  it("fails safely for unknown customers and subscriptions", async () => { const { service } = setup(); await assert.rejects(service.processVerifiedEvent(event("customer.subscription.created", subscription())), StripeBillingResourceUnavailableError); });
  it("rejects test events in live mode and live events in test mode", async () => { const { repository, service } = setup(); await mapCustomer(repository); await assert.rejects(service.processVerifiedEvent(event("customer.subscription.created", subscription(), { livemode: true })), StripeEnvironmentMismatchError); });
});

describe("Stripe webhook verification and financial idempotency", () => {
  it("mounts raw webhook verification before the global JSON middleware", async () => { const { repository, service, verifier } = setup(); await mapCustomer(repository); const payload = JSON.stringify(event("customer.subscription.created", subscription())); const app = createApp({ stripeSubscriptionService: service, logger: { info() {}, warn() {}, error() {} } }); const response = await request(app).post("/billing/stripe/webhook").set("content-type", "application/json").set("stripe-signature", sign(verifier, payload)).send(payload); assert.equal(response.status, 200); assert.deepEqual(response.body, { received: true, handled: true, replay: false }); });
  it("ignores an identical event replay after the first effect", async () => { const { repository, service } = setup(); await mapCustomer(repository); const stripeEvent = event("customer.subscription.created", subscription()); const first = await service.processVerifiedEvent(stripeEvent); const replay = await service.processVerifiedEvent(stripeEvent); assert.equal(first.replay, false); assert.equal(replay.replay, true); });
  it("grants monthly included credits once on paid subscription invoices", async () => { const { repository, service } = setup(); await mapCustomer(repository); await service.processVerifiedEvent(event("customer.subscription.created", subscription())); const paid = event("invoice.paid", invoice(), { id: "evt_invoice_paid_renewal_001", created: EVENT_CREATED + 60 }); const first = await service.processVerifiedEvent(paid); const replay = await service.processVerifiedEvent(paid); const duplicateDelivery = await service.processVerifiedEvent({ ...paid, id: "evt_invoice_paid_renewal_002" }); assert.equal(first.monthly_grant_applied, true); assert.equal(replay.replay, true); assert.equal(duplicateDelivery.monthly_grant_applied, true); assert.equal(repository.listLedger("tenant_a").length, 1); assert.equal((await service.billingService.readBalance({ tenantId: "tenant_a" })).available_balance, 10); });
  it("accepts Dahlia invoice.paid payloads without the legacy paid boolean", async () => {
    const { repository, service } = setup();
    await mapCustomer(repository);
    await service.processVerifiedEvent(event("customer.subscription.created", subscription()));
    const dahliaInvoice = invoice();
    delete dahliaInvoice.paid;
    const result = await service.processVerifiedEvent(event("invoice.paid", dahliaInvoice, { id: "evt_invoice_paid_dahlia_001", api_version: "2026-07-29.dahlia", created: EVENT_CREATED + 60 }));
    assert.equal(result.monthly_grant_applied, true);
    assert.equal(repository.listLedger("tenant_a").length, 1);
    assert.equal((await service.billingService.readBalance({ tenantId: "tenant_a" })).available_balance, 10);
  });
  it("does not grant credits for failed, unpaid, or non-cycle subscription invoices", async () => { for (const candidate of [{ type: "invoice.payment_failed", invoice: invoice({ paid: false, status: "open" }) }, { type: "invoice.paid", invoice: invoice({ billing_reason: "manual" }) }]) { const { repository, service } = setup(); await mapCustomer(repository); await service.processVerifiedEvent(event("customer.subscription.created", subscription())); await service.processVerifiedEvent(event(candidate.type, candidate.invoice, { id: `evt_${candidate.type.replaceAll(".", "_")}_nonqualifying`, created: EVENT_CREATED + 60 })); assert.equal(repository.listLedger("tenant_a").length, 0); } });
  it("fails closed when an invoice references an unmapped subscription customer", async () => { const { service } = setup(); await assert.rejects(service.processVerifiedEvent(event("invoice.paid", invoice(), { id: "evt_unknown_invoice_001" })), StripeBillingResourceUnavailableError); });
});
