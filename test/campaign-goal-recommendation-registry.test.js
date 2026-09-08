const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  CampaignIdempotencyError,
  PostgresGoalRecommendationRegistry,
} = require("../src/campaigns");

const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const RECOMMENDATION_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-08T13:00:00.000Z";

const context = {
  tenant_id: "tenant_a",
  project_id: "project_a",
  actor: { kind: "customer", auth_user_id: AUTH_USER },
};

const request = {
  tenant_id: "tenant_a",
  project_id: "project_a",
  brand_id: "brand_a",
  goal: "Launch a local offer",
  display_timezone: "Europe/London",
  idempotency_key: "recommend_once",
};

describe("PostgresGoalRecommendationRegistry", () => {
  it("converges duplicate recommendation keys through PostgreSQL conflict return", async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push(sql);
        if (/insert into public\.campaign_goal_recommendations/i.test(sql)) {
          assert.match(sql, /on conflict on constraint campaign_goal_recommendations_identity_unique/i);
          assert.match(sql, /returning \*/i);
          const row = Object.fromEntries([
            "recommendation_id",
            "tenant_id",
            "project_id",
            "brand_id",
            "goal",
            "display_timezone",
            "campaign_name",
            "recommendation_kind",
            "summary",
            "not_enough_data_yet",
            "explanation",
            "next_action",
            "create_campaign_payload",
            "suggested_items",
            "generated_at",
            "recommendation_hash",
            "requested_by",
            "idempotency_key",
          ].map((column, index) => [column, params[index]]));
          row.recommendation_id = RECOMMENDATION_ID;
          return { rows: [row], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const registry = new PostgresGoalRecommendationRegistry({
      pool: { connect: async () => client },
      now: () => new Date(NOW),
      idFactory: () => "33333333-3333-4333-8333-333333333333",
    });

    const recommendation = await registry.recommend(context, request);

    assert.equal(recommendation.recommendation_id, RECOMMENDATION_ID);
    assert.equal(recommendation.next_action.code, "create_campaign");
    assert.equal(recommendation.create_campaign_payload.brand_id, "brand_a");
    assert.equal(recommendation.recommendation_hash, undefined);
    assert.equal(calls.filter((sql) => /insert into public\.campaign_goal_recommendations/i.test(sql)).length, 1);
  });

  it("rejects same key when stored recommendation hash does not match intent", async () => {
    const client = {
      async query(sql, params = []) {
        if (/insert into public\.campaign_goal_recommendations/i.test(sql)) {
          const row = Object.fromEntries([
            "recommendation_id",
            "tenant_id",
            "project_id",
            "brand_id",
            "goal",
            "display_timezone",
            "campaign_name",
            "recommendation_kind",
            "summary",
            "not_enough_data_yet",
            "explanation",
            "next_action",
            "create_campaign_payload",
            "suggested_items",
            "generated_at",
            "recommendation_hash",
            "requested_by",
            "idempotency_key",
          ].map((column, index) => [column, params[index]]));
          row.recommendation_id = RECOMMENDATION_ID;
          row.recommendation_hash = "0".repeat(64);
          return { rows: [row], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const registry = new PostgresGoalRecommendationRegistry({
      pool: { connect: async () => client },
      now: () => new Date(NOW),
      idFactory: () => RECOMMENDATION_ID,
    });

    await assert.rejects(() => registry.recommend(context, request), CampaignIdempotencyError);
  });
});
