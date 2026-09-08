const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const { createApp } = require("../index");
const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const {
  FORBIDDEN_RECOMMENDATION_FIELDS,
  InMemoryGoalRecommendationRegistry,
} = require("../src/campaigns");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const RECOMMENDATION_ID = "33333333-3333-4333-8333-333333333333";

class FixtureTokenVerifier {
  async verifyAccessToken(token) {
    if (token === "token-a") return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A });
    if (token === "token-b") return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_B });
    throw new AuthenticationRequiredError();
  }
}

function authorizationRepository() {
  return new InMemoryAuthorizationRepository({
    customerProfiles: [
      { auth_user_id: USER_A, display_name: "Customer A" },
      { auth_user_id: USER_B, display_name: "Customer B" },
    ],
    tenants: [
      { tenant_id: "tenant_a", name: "Tenant A", created_by: USER_A },
      { tenant_id: "tenant_b", name: "Tenant B", created_by: USER_B },
    ],
    memberships: [
      { tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" },
      { tenant_id: "tenant_b", auth_user_id: USER_B, role: "owner" },
    ],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a", name: "Project A" },
      { project_id: "project_b", tenant_id: "tenant_b", name: "Project B" },
    ],
    brands: [
      { brand_id: "brand_a", project_id: "project_a", name: "Brand A", status: "approved" },
      { brand_id: "brand_draft", project_id: "project_a", name: "Draft Brand", status: "draft" },
      { brand_id: "brand_b", project_id: "project_b", name: "Brand B", status: "approved" },
    ],
  });
}

function fixture() {
  let id = 0;
  const app = createApp({
    authorizationRepository: authorizationRepository(),
    goalRecommendationRegistry: new InMemoryGoalRecommendationRegistry({
      now: () => new Date("2026-09-08T13:00:00.000Z"),
      idFactory: () => id++ === 0 ? RECOMMENDATION_ID : "44444444-4444-4444-8444-444444444444",
    }),
    customerTokenVerifier: new FixtureTokenVerifier(),
    logger: { info() {}, warn() {}, error() {} },
  });
  return request(app);
}

function customer(client, token = "token-a") {
  return client.set("authorization", `Bearer ${token}`);
}

function body(overrides = {}) {
  return {
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    goal: "Launch a September offer for local shops",
    display_timezone: "Europe/London",
    idempotency_key: "goal_once",
    ...overrides,
  };
}

function hasKeyDeep(value, field) {
  if (!value || typeof value !== "object") return false;
  if (Object.hasOwn(value, field)) return true;
  return Object.values(value).some((child) => hasKeyDeep(child, field));
}

describe("customer goal recommendation API", () => {
  it("returns one explained, customer-safe recommendation without creating a campaign", async () => {
    const client = fixture();
    const response = await customer(client.post("/customer/campaign-recommendations")).send(body());

    assert.equal(response.status, 201);
    assert.equal(response.body.recommendation.recommendation_id, RECOMMENDATION_ID);
    assert.equal(response.body.recommendation.goal, "Launch a September offer for local shops");
    assert.equal(response.body.recommendation.recommendation_kind, "launch");
    assert.equal(response.body.recommendation.next_action.code, "create_campaign");
    assert.equal(response.body.recommendation.create_campaign_payload.name, "Launch A September Offer For Campaign");
    assert.equal(response.body.recommendation.suggested_items.length, 3);
    for (const item of response.body.recommendation.suggested_items) {
      assert.match(item.reason, /because/i);
      assert.ok(["text", "image", "video"].includes(item.format));
    }
    for (const field of FORBIDDEN_RECOMMENDATION_FIELDS) {
      assert.equal(hasKeyDeep(response.body.recommendation, field), false, field);
    }

    const campaigns = await customer(
      client.get("/customer/campaigns").query({ tenant_id: "tenant_a", project_id: "project_a" })
    );
    assert.equal(campaigns.status, 200);
    assert.deepEqual(campaigns.body.campaigns, []);
  });

  it("replays identical recommendation keys and rejects changed intent", async () => {
    const client = fixture();
    const first = await customer(client.post("/customer/campaign-recommendations")).send(body());
    const replay = await customer(client.post("/customer/campaign-recommendations")).send(body());
    const changed = await customer(client.post("/customer/campaign-recommendations")).send(body({ goal: "Book more quotes" }));

    assert.equal(first.status, 201);
    assert.deepEqual(replay.body.recommendation, first.body.recommendation);
    assert.equal(changed.status, 409);
    assert.equal(changed.body.error.code, "IDEMPOTENCY_KEY_CONFLICT");
  });

  it("fails closed for missing auth, extra form fields, draft brands and cross-tenant access", async () => {
    const client = fixture();
    const missing = await client.post("/customer/campaign-recommendations").send(body());
    const extra = await customer(client.post("/customer/campaign-recommendations")).send({ ...body(), audience: "everyone" });
    const draftBrand = await customer(client.post("/customer/campaign-recommendations")).send(body({ brand_id: "brand_draft", idempotency_key: "draft_brand" }));
    const crossTenant = await customer(client.post("/customer/campaign-recommendations"), "token-b").send(body({ idempotency_key: "cross_tenant" }));

    assert.equal(missing.status, 401);
    assert.equal(extra.status, 400);
    assert.equal(draftBrand.status, 404);
    assert.equal(crossTenant.status, 404);
  });
});
