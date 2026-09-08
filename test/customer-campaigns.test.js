const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");

const { createApp } = require("../index");
const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const { InMemoryCampaignRepository } = require("../src/campaigns");

const ADMIN_KEY = "customer-campaign-admin-key";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const IDS = Array.from(
  { length: 120 },
  (_, index) => `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`
);

class FixtureTokenVerifier {
  async verifyAccessToken(token) {
    if (token === "token-a") {
      return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A });
    }
    if (token === "token-b") {
      return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_B });
    }
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

function campaignRepository() {
  let id = 0;
  return new InMemoryCampaignRepository({
    now: () => new Date("2026-09-08T12:00:00.000Z"),
    idFactory: () => IDS[id++],
    authorize: async () => true,
    captureBrandSnapshot: async (context, brandId) => {
      if (
        context.tenant_id !== "tenant_a" ||
        context.project_id !== "project_a" ||
        brandId !== "brand_a"
      ) {
        return null;
      }
      return {
        brand_snapshot_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tenant_id: "tenant_a",
        project_id: "project_a",
        brand_id: "brand_a",
        source_version: 1,
        source_updated_at: "2026-09-08T10:00:00.000Z",
        source_schema_version: "brand-brain.v1",
        snapshot: { name: "Brand A", private_positioning: "do-not-expose" },
        snapshot_hash: "a".repeat(64),
        captured_at: "2026-09-08T12:00:00.000Z",
      };
    },
  });
}

function fixture() {
  const app = createApp({
    authorizationRepository: authorizationRepository(),
    campaignRepository: campaignRepository(),
    customerTokenVerifier: new FixtureTokenVerifier(),
    logger: { info() {}, warn() {}, error() {} },
  });
  return request(app);
}

function customer(client, token = "token-a") {
  return client.set("authorization", `Bearer ${token}`);
}

function createBody(overrides = {}) {
  return {
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    idempotency_key: "create_campaign_1",
    name: "September launch",
    goal: "Launch the campaign clearly",
    display_timezone: "Europe/London",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("customer campaign API", () => {
  it("creates, lists, reads and resumes a campaign through customer-safe DTOs", async () => {
    const client = fixture();
    const created = await customer(client.post("/customer/campaigns")).send(createBody());

    assert.equal(created.status, 201);
    assert.equal(created.body.campaign.name, "September launch");
    assert.equal(created.body.campaign.status, "draft");
    assert.deepEqual(created.body.campaign.next_action, {
      code: "create_content_item",
      label: "Create content item",
    });
    assert.equal(created.body.campaign.items.length, 0);
    assert.doesNotMatch(JSON.stringify(created.body), /brand_snapshots|events|command_id|auth_user_id|private_positioning/);

    const listed = await customer(
      client.get("/customer/campaigns").query({ tenant_id: "tenant_a", project_id: "project_a" })
    );
    assert.equal(listed.status, 200);
    assert.equal(listed.body.campaigns.length, 1);
    assert.equal(listed.body.campaigns[0].campaign_id, created.body.campaign.campaign_id);

    const read = await customer(
      client.get(`/customer/campaigns/${created.body.campaign.campaign_id}`).query({
        tenant_id: "tenant_a",
        project_id: "project_a",
      })
    );
    assert.equal(read.status, 200);
    assert.deepEqual(read.body.campaign, created.body.campaign);
  });

  it("adds a content item and derives campaign progress without storing a writable stage", async () => {
    const client = fixture();
    const created = await customer(client.post("/customer/campaigns")).send(createBody());
    const item = await customer(
      client.post(`/customer/campaigns/${created.body.campaign.campaign_id}/content-items`)
    ).send({
      tenant_id: "tenant_a",
      project_id: "project_a",
      idempotency_key: "item_1",
      expected_campaign_version: 1,
      name: "Instagram post",
      format: "text",
      platform: "instagram",
      placement: "feed",
      destination_label: "Instagram",
      initial_content: {
        title: null,
        body: "A simple launch update.",
        caption: null,
        alt_text: null,
        asset_refs: [],
      },
    });

    assert.equal(item.status, 201);
    assert.equal(item.body.campaign.version, 2);
    assert.equal(item.body.campaign.status, "draft");
    assert.equal(item.body.campaign.items[0].variants[0].workflow, "draft");
    assert.equal(item.body.campaign.items[0].variants[0].current_content.body, "A simple launch update.");
    assert.equal(item.body.campaign.items[0].variants[0].destination_label, "Instagram");
    assert.equal(item.body.campaign.items[0].variants[0].destination_key, undefined);
  });

  it("updates only customer-editable campaign details with idempotency and version protection", async () => {
    const client = fixture();
    const created = await customer(client.post("/customer/campaigns")).send(createBody());
    const update = {
      tenant_id: "tenant_a",
      project_id: "project_a",
      idempotency_key: "update_1",
      expected_campaign_version: 1,
      name: "Updated launch",
      display_timezone: "UTC",
    };

    const first = await customer(
      client.patch(`/customer/campaigns/${created.body.campaign.campaign_id}`)
    ).send(update);
    const replay = await customer(
      client.patch(`/customer/campaigns/${created.body.campaign.campaign_id}`)
    ).send(update);
    const stale = await customer(
      client.patch(`/customer/campaigns/${created.body.campaign.campaign_id}`)
    ).send({ ...update, idempotency_key: "update_2" });

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body.result, first.body.result);
    assert.equal(first.body.campaign.name, "Updated launch");
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "VERSION_CONFLICT");
  });

  it("fails closed for missing auth, body identity spoofing, draft brands and cross-tenant reads", async () => {
    const client = fixture();
    const missing = await client.post("/customer/campaigns").send(createBody());
    assert.equal(missing.status, 401);

    const spoof = await customer(client.post("/customer/campaigns")).send({
      ...createBody(),
      user_id: USER_B,
    });
    assert.equal(spoof.status, 400);

    const draftBrand = await customer(client.post("/customer/campaigns")).send({
      ...createBody({ brand_id: "brand_draft", idempotency_key: "draft_brand" }),
    });
    assert.equal(draftBrand.status, 404);

    const created = await customer(client.post("/customer/campaigns")).send(createBody());
    const foreignRead = await customer(
      client.get(`/customer/campaigns/${created.body.campaign.campaign_id}`).query({
        tenant_id: "tenant_b",
        project_id: "project_b",
      }),
      "token-b"
    );
    assert.equal(foreignRead.status, 404);
  });

  it("archives and restores without exposing an alternative lifecycle state", async () => {
    const client = fixture();
    const created = await customer(client.post("/customer/campaigns")).send(createBody());
    const archive = await customer(
      client.post(`/customer/campaigns/${created.body.campaign.campaign_id}/archive`)
    ).send({
      tenant_id: "tenant_a",
      project_id: "project_a",
      idempotency_key: "archive_1",
      expected_campaign_version: 1,
      reason: "No longer needed",
    });
    const listed = await customer(
      client.get("/customer/campaigns").query({ tenant_id: "tenant_a", project_id: "project_a" })
    );
    const restore = await customer(
      client.post(`/customer/campaigns/${created.body.campaign.campaign_id}/restore`)
    ).send({
      tenant_id: "tenant_a",
      project_id: "project_a",
      idempotency_key: "restore_1",
      expected_campaign_version: 2,
      reason: "Needed again",
    });

    assert.equal(archive.status, 200);
    assert.equal(archive.body.campaign.status, "draft");
    assert.ok(archive.body.campaign.archived_at);
    assert.equal(listed.body.campaigns.length, 0);
    assert.equal(restore.status, 200);
    assert.equal(restore.body.campaign.archived_at, null);
    assert.equal(restore.body.campaign.status, "draft");
  });

  it("returns a bounded malformed-json error", async () => {
    const response = await customer(
      fixture()
        .post("/customer/campaigns")
        .set("content-type", "application/json")
        .send('{"tenant_id":')
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Malformed JSON request body",
      },
    });
  });
});
