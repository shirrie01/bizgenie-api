const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { BillingService } = require("../src/billing/service");
const { InMemoryBillingRepository } = require("../src/billing/repository");
const { activatePaidBetaStandardV1 } = require("../src/billing/paidBetaProvisioning");
const { FONZO_LAUNCH_PROOF, createPaidBetaLaunchProofRouter } = require("../src/billing/paidBetaLaunchProofRouter");

function appFor({ env, billing, activation = activatePaidBetaStandardV1, logger = { error() {} } }) {
  const app = express();
  app.use(express.json());
  app.use("/internal/launch-proof/paid-beta", createPaidBetaLaunchProofRouter({ env, billing, activation, logger }));
  return app;
}

function billingFixture() {
  const repository = new InMemoryBillingRepository({ policies: [{
    policy_id: "paid-beta-standard-v1", plan_code: "standard", policy_version: 1, status: "active",
    included_monthly_credits: 60, bolt_on_eligible: true, effective_from: "2026-09-01T00:00:00.000Z",
    execution_costs: { "text.standard": 1 },
  }] });
  return { billingRepository: repository, billingService: new BillingService({ repository }) };
}

test("normal customer bearer, missing, and invalid internal authorization are rejected", async () => {
  const app = appFor({ env: { PAID_BETA_LAUNCH_PROOF_ENABLED: "true", ADMIN_KEY: "secret" }, billing: billingFixture() });
  for (const headers of [{ authorization: "Bearer customer" }, {}, { "x-admin-key": "wrong" }]) {
    assert.equal((await request(app).post("/internal/launch-proof/paid-beta/fonzo/activate").set(headers)).status, 403);
  }
});

test("canonical activation replay has one grant and no secrets or unrelated policy effects", async () => {
  const billing = billingFixture();
  const calls = [];
  const logs = [];
  const app = appFor({
    env: { PAID_BETA_LAUNCH_PROOF_ENABLED: "true", ADMIN_KEY: "secret" }, billing,
    logger: { error: (...args) => logs.push(args) },
    activation: async (input) => { calls.push(input); return activatePaidBetaStandardV1(input); },
  });
  const first = await request(app).post("/internal/launch-proof/paid-beta/fonzo/activate").set("x-admin-key", "secret").send({});
  const second = await request(app).post("/internal/launch-proof/paid-beta/fonzo/activate").set("x-admin-key", "secret").send({});
  assert.equal(first.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal(calls.length, 2);
  assert.equal(first.body.available_balance, 60);
  assert.equal(billing.billingRepository.entries.filter((entry) => entry.entry_type === "monthly_grant").length, 1);
  assert.equal(billing.billingRepository.entitlements.length, 1);
  assert.deepEqual(Object.keys(first.body).sort(), ["account_id", "available_balance", "entitlement_id", "grant_ledger_entry_id", "tenant_id"]);
  assert.equal(JSON.stringify(first.body).includes("secret"), false);
  assert.equal(JSON.stringify(logs).includes("secret"), false);
  assert.equal(calls[0].tenantId, FONZO_LAUNCH_PROOF.tenantId);
  assert.equal(calls[0].accountId, FONZO_LAUNCH_PROOF.accountId);
  assert.equal(calls[0].entitlementId, FONZO_LAUNCH_PROOF.entitlementId);
  assert.equal(calls[0].periodStart, FONZO_LAUNCH_PROOF.periodStart);
  assert.equal(calls[0].periodEnd, FONZO_LAUNCH_PROOF.periodEnd);
});

test("route is candidate-only and rejects caller-supplied identifiers", async () => {
  const billing = billingFixture();
  const disabled = appFor({ env: { ADMIN_KEY: "secret" }, billing });
  assert.equal((await request(disabled).post("/internal/launch-proof/paid-beta/fonzo/activate").set("x-admin-key", "secret")).status, 404);
  const app = appFor({ env: { PAID_BETA_LAUNCH_PROOF_ENABLED: "true", ADMIN_KEY: "secret" }, billing });
  assert.equal((await request(app).post("/internal/launch-proof/paid-beta/fonzo/activate").set("x-admin-key", "secret").send({ tenant_id: "other" })).status, 400);
});
