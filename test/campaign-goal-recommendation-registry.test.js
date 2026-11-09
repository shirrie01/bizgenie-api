const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  CampaignIdempotencyError,
  PostgresGoalRecommendationRegistry,
  createDefaultGoalRecommendationRegistry,
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
            "evidence_summary",
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
            "evidence_summary",
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

it("trade acquisition objective is classified as lead and receives trade-specific recommendations", async () => {
  const registry = createDefaultGoalRecommendationRegistry({
    idFactory: () => "recommendation-trade-proof",
    now: () => new Date("2026-09-25T00:00:00.000Z"),
  });

  const recommendation = await registry.recommend(
    {
      tenant_id: "tenant_fairway",
      project_id: "project_fairway",
      actor: {
        kind: "customer",
        auth_user_id: "33333333-3333-4333-8333-333333333333",
      },
      brand_brain: {
        status: "approved",
        identity: {
          positioning: "Soft drinks manufacturer and brand owner",
          mission: "Build strong drinks brands and distribution",
        },
        audience: {
          summary: "Independent retailers, wholesalers and distributors",
          goals: ["Stock profitable drinks brands"],
        },
        commercial: {
          primary_cta: "Enquire about stocking or distribution",
        },
      },
    },
    {
      tenant_id: "tenant_fairway",
      project_id: "project_fairway",
      brand_id: "brand_fairway",
      goal: "Win new independent retailers, wholesalers and distributors for Fairway's drinks portfolio, generating qualified trade enquiries from businesses interested in stocking our brands or discussing distribution opportunities.",
      display_timezone: "Europe/London",
      idempotency_key: "fairway_trade_acquisition_proof",
    },
    { evidence: [] }
  );

  assert.equal(recommendation.recommendation_kind, "lead");
  assert.equal(recommendation.suggested_items.length, 3);

  assert.deepEqual(
    recommendation.suggested_items.map((item) => item.name),
    [
      "Trade stockist acquisition post",
      "Retailer and distributor enquiry post",
      "Trade outreach email",
    ]
  );

  assert.deepEqual(
    recommendation.suggested_items.map((item) => item.platform),
    ["linkedin", "facebook", "email"]
  );

  assert.equal(
    recommendation.suggested_items.some((item) =>
      /launch announcement|facebook launch post|launch email/i.test(item.name)
    ),
    false
  );
});
it('SM Properties full lead goal gets a complete property title and grounded item/calendar payload',async()=>{
 const goal='Generate more enquiries for residential property sales and lettings, build a professional social media presence, create engaging property marketing content and convert more enquiries into customers.';
 const registry=createDefaultGoalRecommendationRegistry({idFactory:()=>RECOMMENDATION_ID,now:()=>new Date(NOW)});
 const record=await registry.recommend({...context,brand_brain:{name:'SM Properties'}},{...request,goal,idempotency_key:'property_once'});
 assert.equal(record.campaign_name,'Property sales and lettings enquiries');assert.equal(record.recommendation_kind,'lead');
 assert.equal(record.create_campaign_payload.goal,goal);assert.equal(record.create_campaign_payload.display_timezone,'Europe/London');assert.match(record.suggested_items[0].name,/Property/);
 assert.doesNotMatch(JSON.stringify(record),/Northgate|stockist|clinic|Birmingham|guaranteed|£\d/);assert.equal(record.not_enough_data_yet,true);
});

it('F1/F2 preserve landlord/property/booking conversion intent without five-word title truncation',async()=>{
 for(const [goal,title] of [['Get more valuation requests from landlords','Landlord valuation requests'],['Get more enquiries for vacant rental property','Rental property enquiries'],['Get more sales and lettings instructions','Sales and lettings instructions'],['Get more booking requests','Booking requests'],['Generate consultation enquiries','Consultation enquiries']]){
  const registry=createDefaultGoalRecommendationRegistry({idFactory:()=>RECOMMENDATION_ID,now:()=>new Date(NOW)});
  const r=await registry.recommend(context,{...request,goal});assert.equal(r.recommendation_kind,'lead',goal);assert.equal(r.campaign_name,title,goal);assert.equal(r.create_campaign_payload.goal,goal);assert.doesNotMatch(r.campaign_name,/From Campaign$|Campaign$/);
 }
});
it('industry-neutral short goals retain their full wording and long goals retain full payload not a chopped title',async()=>{
 const registry=createDefaultGoalRecommendationRegistry({idFactory:()=>RECOMMENDATION_ID,now:()=>new Date(NOW)});
 const goal='Help more customers discover our locally made ceramics';const r=await registry.recommend(context,{...request,goal});assert.equal(r.campaign_name,goal);
 const longGoal='Build brand awareness '+ 'through thoughtful customer stories '.repeat(8);const q=await createDefaultGoalRecommendationRegistry().recommend(context,{...request,goal:longGoal,idempotency_key:'long_intent'});assert.equal(q.campaign_name,'Brand awareness');assert.equal(q.create_campaign_payload.goal,longGoal.trim());
});
