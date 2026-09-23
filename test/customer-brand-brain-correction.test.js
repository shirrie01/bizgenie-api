const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const { createApp } = require("../index");
const { createCustomerActorFromVerifiedIdentity } = require("../src/authorization");
const {
  InMemoryCustomerWorkspaceRepository,
} = require("../src/customer-workspace");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");

const USER = "11111111-1111-4111-8111-111111111111";
const SCOPE_A = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
const SCOPE_B = { tenant_id: "tenant_a", project_id: "project_b", brand_id: "brand_b" };

function brain(scope, name) {
  return {
    project_id: scope.project_id,
    brand_id: scope.brand_id,
    name,
    identity: { positioning: `${name} positioning` },
    commercial: { approved_claims: [`${name} approved claim`] },
    metadata: {
      version: 3,
      status: "approved",
      created_at: "2026-09-15T10:00:00.000Z",
      updated_at: "2026-09-15T11:00:00.000Z",
    },
  };
}

function fixture(scope = SCOPE_A, includeScope = true) {
  const workspaceRepository = new InMemoryCustomerWorkspaceRepository({ workspaces: [
    { auth_user_id: USER, workspace: { ...scope, tenant_name: "Tenant", project_name: scope.project_id, brand_name: scope.brand_id, brand_status: "approved", membership_role: "owner" } },
  ] });
  const brandBrainRepository = new InMemoryBrandBrainRepository();
  brandBrainRepository.upsert(brain(SCOPE_A, "Fonzo"));
  brandBrainRepository.upsert(brain(SCOPE_B, "Lease Expert"));
  const verifier = {
    async verifyIdentityAccessToken() {
      return createCustomerActorFromVerifiedIdentity({
        verifiedAuthUserId: USER,
      });
    },
    async verifyAccessToken() {
      return createCustomerActorFromVerifiedIdentity({
        verifiedAuthUserId: USER,
        ...(includeScope ? { verifiedScope: scope } : {}),
      });
    },
  };
  const app = createApp({
    customerWorkspaceRepository: workspaceRepository,
    brandBrainRepository,
    customerTokenVerifier: verifier,
    logger: { warn() {}, error() {} },
  });
  return { client: request(app), brandBrainRepository };
}

function correction(name = "Fonzo") {
  return {
    name,
    identity: { positioning: "Founder-approved Fonzo truth" },
    commercial: { approved_claims: ["Fonzo approved claim"] },
  };
}

describe("customer Brand Brain correction boundary", () => {
  it("reads only the trusted selected Brand Brain", async () => {
    const { client } = fixture();
    const response = await client.get("/customer/workspace/brand-brain").set("authorization", "Bearer token");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.status, "ready");
    assert.equal(response.body.brand_brain.brand_id, SCOPE_A.brand_id);
    assert.equal(response.body.brand_brain.project_id, SCOPE_A.project_id);
    assert.equal(response.body.brand_brain.name, "Fonzo");

    const noScope = fixture(SCOPE_A, false);
    const denied = await noScope.client.get("/customer/workspace/brand-brain").set("authorization", "Bearer token");
    assert.equal(denied.status, 400);
  });

  it("updates only the trusted selected Brand Brain and preserves governance timestamps", async () => {
    const { client, brandBrainRepository } = fixture();
    const beforeB = await brandBrainRepository.getByProjectAndBrand(SCOPE_B.project_id, SCOPE_B.brand_id);
    const response = await client.put("/customer/workspace/brand-brain").set("authorization", "Bearer token").send(correction());
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.brand_brain.brand_id, SCOPE_A.brand_id);
    assert.equal(response.body.brand_brain.project_id, SCOPE_A.project_id);
    assert.equal(response.body.brand_brain.metadata.version, 4);
    assert.equal(response.body.brand_brain.metadata.created_at, "2026-09-15T10:00:00.000Z");
    assert.notEqual(response.body.brand_brain.metadata.updated_at, "2026-09-15T11:00:00.000Z");
    assert.deepEqual(await brandBrainRepository.getByProjectAndBrand(SCOPE_B.project_id, SCOPE_B.brand_id), beforeB);
  });

  it("cannot be redirected by body IDs and fails closed without trusted scope", async () => {
    const { client, brandBrainRepository } = fixture();
    const response = await client.put("/customer/workspace/brand-brain").set("authorization", "Bearer token").send({
      ...correction(), brand_id: SCOPE_B.brand_id, project_id: SCOPE_B.project_id,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.brand_brain.brand_id, SCOPE_A.brand_id);
    assert.equal((await brandBrainRepository.getByProjectAndBrand(SCOPE_B.project_id, SCOPE_B.brand_id)).name, "Lease Expert");

    const noScope = fixture(SCOPE_A, false);
    const denied = await noScope.client.put("/customer/workspace/brand-brain").set("authorization", "Bearer token").send(correction());
    assert.equal(denied.status, 400);
  });

  it("rejects invalid Brand Brain content before persistence", async () => {
    const { client, brandBrainRepository } = fixture();
    const before = await brandBrainRepository.getByProjectAndBrand(SCOPE_A.project_id, SCOPE_A.brand_id);
    const response = await client.put("/customer/workspace/brand-brain").set("authorization", "Bearer token").send({
      ...correction(), identity: { unsupported: true },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await brandBrainRepository.getByProjectAndBrand(SCOPE_A.project_id, SCOPE_A.brand_id), before);
  });
});
