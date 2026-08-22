const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { buildMakeExecutionPayload } = require("../src/service-execution/makePayload");

function job(overrides = {}) {
  return Object.freeze({
    job_id: "job_1",
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    execution_class: "text.standard",
    actor_correlation: Object.freeze({
      kind: "customer",
      auth_user_id: "11111111-1111-4111-8111-111111111111",
    }),
    request_correlation_id: "execution_001",
    idempotency_key: "execution_001",
    created_at: "2026-08-21T00:00:00.000Z",
    allowed_scopes: ["generation:execute"],
    ...overrides,
  });
}

describe("buildMakeExecutionPayload", () => {
  it("carries only the opaque job id, execution class, and bounded content", () => {
    const payload = buildMakeExecutionPayload(job(), {
      compiled_prompt: "Write a hook",
      platform: "tiktok",
    });

    assert.deepEqual(payload, {
      job_id: "job_1",
      execution_class: "text.standard",
      execution_input: {
        compiled_prompt: "Write a hook",
        platform: "tiktok",
      },
    });
  });

  it("never includes tenant, project, brand, actor, or idempotency identity", () => {
    const payload = buildMakeExecutionPayload(job(), { topic: "hi" });
    const serialized = JSON.stringify(payload);

    for (const forbidden of [
      "tenant_a",
      "project_a",
      "brand_a",
      "11111111-1111-4111-8111-111111111111",
      "execution_001",
      "generation:execute",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("reapplies the content allow-list at the final downstream boundary", () => {
    const payload = buildMakeExecutionPayload(job(), {
      compiled_prompt: "Write a hook",
      authorization: "Bearer customer.jwt",
      service_credential: "service-secret",
      provider: "openai",
      model: "gpt-x",
      price: 999,
      cost: 999,
      provider_secret: "provider-secret",
      callback_url: "https://attacker.example/callback",
      asset_location: "gs://private-bucket/asset.png",
      additional_context: { callback_url: "https://attacker.example/nested" },
    });

    assert.deepEqual(payload.execution_input, {
      compiled_prompt: "Write a hook",
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      "customer.jwt",
      "service-secret",
      "openai",
      "gpt-x",
      "provider-secret",
      "attacker.example",
      "private-bucket",
      "price",
      "cost",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("returns a frozen payload and a frozen execution_input", () => {
    const payload = buildMakeExecutionPayload(job(), { topic: "hi" });
    assert.equal(Object.isFrozen(payload), true);
    assert.equal(Object.isFrozen(payload.execution_input), true);
  });

  it("defaults to an empty execution_input when no content is stored", () => {
    const payload = buildMakeExecutionPayload(job());
    assert.deepEqual(payload.execution_input, {});
  });
});
