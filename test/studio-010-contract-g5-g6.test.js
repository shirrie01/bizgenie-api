const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const { createApp } = require("../index");
const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const { InMemoryCampaignRepository, InMemoryPreviewRegistry } = require("../src/campaigns");
const { InMemoryCustomerWorkspaceRepository } = require("../src/customer-workspace");

const USER = "11111111-1111-4111-8111-111111111111";
const IDS = Array.from({ length: 60 }, (_, i) => `${String(i + 1).padStart(8, "0")}-0000-4000-8000-000000000000`);
const LOGGER = { info() {}, warn() {}, error() {} };

describe("G5: multiple workspaces are never silently chosen", () => {
  const verifier = { async verifyIdentityAccessToken() { return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER }); } };
  const client = () => request(createApp({ customerWorkspaceRepository: new InMemoryCustomerWorkspaceRepository(), customerTokenVerifier: verifier, logger: LOGGER }));
  const auth = (call) => call.set("authorization", "Bearer t");

  it("returns selection_required with the chooser data and selects only an owned workspace", async () => {
    const api = client();
    await auth(api.post("/customer/workspace/bootstrap")).send({ business_name: "First Co" });
    const second = await auth(api.post("/customer/workspace/brands")).send({ tenant_id: (await auth(api.get("/customer/workspace"))).body.workspace.tenant_id, business_name: "Second Co" });
    assert.equal(second.status, 201);
    const listed = await auth(api.get("/customer/workspace"));
    assert.equal(listed.body.status, "selection_required");
    assert.equal(listed.body.workspace, null);
    assert.equal(listed.body.workspaces.length, 2);
    for (const workspace of listed.body.workspaces) {
      assert.deepEqual(Object.keys(workspace).sort(), ["brand_id", "brand_name", "brand_status", "membership_role", "project_id", "project_name", "tenant_id", "tenant_name"]);
    }
    const chosen = listed.body.workspaces[1];
    const selected = await auth(api.post("/customer/workspace/select")).send({ tenant_id: chosen.tenant_id, project_id: chosen.project_id, brand_id: chosen.brand_id });
    assert.equal(selected.status, 200);
    assert.equal(selected.body.workspace.brand_id, chosen.brand_id);
    const foreign = await auth(api.post("/customer/workspace/select")).send({ tenant_id: chosen.tenant_id, project_id: chosen.project_id, brand_id: "someone_elses_brand" });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.error.code, "WORKSPACE_VALIDATION_ERROR");
  });
});

describe("G6: campaign list fields and ordering are a stable contract", () => {
  it("lists newest-updated first with a stable field set, excluding archived campaigns", async () => {
    const registry = new InMemoryPreviewRegistry({ now: () => new Date("2026-09-08T12:00:00.000Z"), idFactory: () => "99999999-0000-4000-8000-000000000000" });
    let clock = Date.parse("2026-09-08T12:00:00.000Z");
    let id = 0;
    const repository = new InMemoryCampaignRepository({
      now: () => new Date((clock += 60_000)),
      idFactory: () => IDS[id++],
      authorize: async () => true,
      resolvePreviewReceipt: (...a) => registry.resolvePreviewReceipt(...a),
      validatePreview: (...a) => registry.validatePreview(...a),
      captureBrandSnapshot: async () => ({
        brand_snapshot_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a",
        source_version: 1, source_updated_at: "2026-09-08T10:00:00.000Z", source_schema_version: "brand-brain.v1",
        snapshot: { name: "Brand A" }, snapshot_hash: "a".repeat(64), captured_at: "2026-09-08T12:00:00.000Z",
      }),
    });
    const auth = new InMemoryAuthorizationRepository({
      customerProfiles: [{ auth_user_id: USER, display_name: "A" }],
      tenants: [{ tenant_id: "tenant_a", name: "A", created_by: USER }],
      memberships: [{ tenant_id: "tenant_a", auth_user_id: USER, role: "owner" }],
      projects: [{ project_id: "project_a", tenant_id: "tenant_a", name: "PA" }],
      brands: [{ brand_id: "brand_a", project_id: "project_a", name: "A", status: "approved" }],
    });
    const api = request(createApp({
      authorizationRepository: auth, campaignRepository: repository, previewRegistry: registry,
      customerTokenVerifier: { async verifyAccessToken(t) { if (t !== "t") throw new AuthenticationRequiredError(); return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER }); } },
      logger: LOGGER,
    }));
    const scope = { tenant_id: "tenant_a", project_id: "project_a" };
    const create = (name, key) => api.post("/customer/campaigns").set("authorization", "Bearer t")
      .send({ ...scope, brand_id: "brand_a", idempotency_key: key, name, goal: "A goal", display_timezone: "Europe/London" });
    const one = await create("One", "c1");
    const two = await create("Two", "c2");
    const three = await create("Three", "c3");
    for (const r of [one, two, three]) assert.equal(r.status, 201);
    const rename = await api.patch(`/customer/campaigns/${one.body.campaign.campaign_id}`).set("authorization", "Bearer t")
      .send({ ...scope, idempotency_key: "r1", expected_campaign_version: one.body.campaign.version, name: "One renamed", display_timezone: "Europe/London" });
    assert.equal(rename.status, 200, JSON.stringify(rename.body));
    const listed = await api.get("/customer/campaigns").query(scope).set("authorization", "Bearer t");
    assert.equal(listed.status, 200);
    const names = listed.body.campaigns.map((c) => c.name);
    assert.equal(new Set(names).size, 3);
    const times = listed.body.campaigns.map((c) => Date.parse(c.updated_at));
    assert.deepEqual([...times].sort((a, b) => b - a), times, "ordered by updated_at descending");
    assert.equal(names[0], "One renamed");
    for (const campaign of listed.body.campaigns) {
      for (const field of ["campaign_id", "name", "status", "archived_at", "updated_at"]) assert.ok(Object.hasOwn(campaign, field), field);
      assert.equal(campaign.archived_at, null);
      assert.equal(Object.hasOwn(campaign, "items"), false, "list rows carry no item detail");
    }
  });
});
