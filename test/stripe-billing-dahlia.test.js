const assert = require("node:assert/strict");
const { it } = require("node:test");
const { StripeSubscriptionService } = require("../src/billing");

it("accepts Dahlia invoice.paid payloads without the legacy paid boolean", async () => {
  const grants = [];
  const subscription = {
    id: "sub_launch_001",
    customer: "cus_tenant_a",
    items: {
      data: [{
        current_period_start: 1785542400,
        current_period_end: 1788220800,
      }],
    },
  };
  const service = new StripeSubscriptionService({
    stripe: {
      subscriptions: {
        async retrieve(id) {
          assert.equal(id, "sub_launch_001");
          return subscription;
        },
      },
    },
    repository: {},
    billingService: {
      async grantMonthlyCredits(input) {
        grants.push(input);
        return { applied: true };
      },
    },
    config: { mode: "test" },
  });
  service.processSubscription = async () => ({
    entitlement: { tenant_id: "tenant_a" },
  });

  const result = await service.processInvoice({
    type: "invoice.paid",
    data: {
      object: {
        id: "in_launch_001",
        object: "invoice",
        customer: "cus_tenant_a",
        status: "paid",
        billing_reason: "subscription_create",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_launch_001" },
        },
      },
    },
  });

  assert.equal(result.grant.applied, true);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].tenantId, "tenant_a");
  assert.equal(grants[0].stripeEventReference, "in_launch_001");
});
