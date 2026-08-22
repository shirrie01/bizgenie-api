const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  EXECUTION_INPUT_ALLOWED_KEYS,
  sanitizeExecutionInput,
} = require("../src/generation-jobs/executionInput");

describe("sanitizeExecutionInput", () => {
  it("keeps only allow-listed scalar fields", () => {
    const result = sanitizeExecutionInput({
      compiled_prompt: "Write a hook",
      platform: "tiktok",
      topic: "planning workflow",
      unrelated_field: "should be dropped",
    });

    assert.deepEqual(result, {
      compiled_prompt: "Write a hook",
      platform: "tiktok",
      topic: "planning workflow",
    });
  });

  it("strips provider, model, price, cost, secret, callback, and asset-location smuggling attempts", () => {
    const result = sanitizeExecutionInput({
      compiled_prompt: "Write a hook",
      provider: "openai",
      model: "gpt-x",
      price: 999,
      cost: 999,
      admin_key: "should-not-appear",
      authorization: "Bearer some.jwt",
      callback_url: "https://attacker.example/callback",
      asset_location: "gs://bucket/secret.png",
      reference_assets: [{ location: "gs://bucket/secret.png" }],
      tenant_id: "tenant_a",
      project_id: "project_a",
      brand_id: "brand_a",
      user_id: "user_a",
    });

    assert.deepEqual(result, { compiled_prompt: "Write a hook" });
    for (const forbidden of [
      "provider",
      "model",
      "price",
      "cost",
      "admin_key",
      "authorization",
      "callback_url",
      "asset_location",
      "reference_assets",
      "tenant_id",
      "project_id",
      "brand_id",
      "user_id",
    ]) {
      assert.equal(forbidden in result, false);
    }
  });

  it("drops nested objects and arrays even under an allow-listed key name", () => {
    const result = sanitizeExecutionInput({
      // additional_context is allow-listed, but only as a scalar string.
      additional_context: { nested: "gs://bucket/secret.png" },
      platform: ["tiktok"],
    });

    assert.deepEqual(result, {});
  });

  it("trims and bounds string length", () => {
    const result = sanitizeExecutionInput({
      platform: "  tiktok  ",
      topic: "x".repeat(9_000),
    });

    assert.equal(result.platform, "tiktok");
    assert.equal(result.topic.length, 8_000);
  });

  it("tolerates missing or non-object input", () => {
    assert.deepEqual(sanitizeExecutionInput(undefined), {});
    assert.deepEqual(sanitizeExecutionInput(null), {});
    assert.deepEqual(sanitizeExecutionInput("not an object"), {});
  });

  it("never exposes a key outside the published allow-list", () => {
    const result = sanitizeExecutionInput(
      Object.fromEntries(
        [...EXECUTION_INPUT_ALLOWED_KEYS, "provider", "model", "callback_url"].map(
          (key) => [key, `value-${key}`]
        )
      )
    );

    for (const key of Object.keys(result)) {
      assert.equal(EXECUTION_INPUT_ALLOWED_KEYS.includes(key), true);
    }
  });
});
