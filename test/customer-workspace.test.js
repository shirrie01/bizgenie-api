const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const { createApp } = require("../index");
const {
  AuthenticationRequiredError,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const {
  InMemoryCustomerWorkspaceRepository,
  defaultWorkspaceIds,
} = require("../src/customer-workspace");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

class FixtureTokenVerifier {
  async verifyAccessToken(token) {
    if (token === "token-a") return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_A });
    if (token === "token-b") return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER_B });
    throw new AuthenticationRequiredError();
  }
}

function fixture() {
  const repository = new InMemoryCustomerWorkspaceRepository();
  const app = createApp({
    customerWorkspaceRepository: repository,
    customerTokenVerifier: new FixtureTokenVerifier(),
    logger: { info() {}, warn() {}, error() {} },
  });
  return { client: request(app), repository };
}

function fixtureWithScopeProvisioning() {
  const repository = new InMemoryCustomerWorkspaceRepository();
  const provisioned = [];
  const app = createApp({
    customerWorkspaceRepository: repository,
    customerScopeProvisioner: {
      async provisionTrustedScope(request) {
        provisioned.push(structuredClone(request));
        return {
          auth_user_id: request.auth_user_id,
          trusted_scope: request.trusted_scope,
          requires_session_refresh: true,
        };
      },
    },
    customerTokenVerifier: new FixtureTokenVerifier(),
    logger: { info() {}, warn() {}, error() {} },
  });
  return { client: request(app), provisioned, repository };
}

function customer(call, token = "token-a") {
  return call.set("authorization", `Bearer ${token}`);
}

describe("customer workspace API", () => {
  it("requires a verified customer token", async () => {
    const { client } = fixture();
    const missing = await client.get("/customer/workspace");
    const invalid = await customer(client.post("/customer/workspace/bootstrap"), "bad-token")
      .send({ business_name: "Halal Motor Leasing Ltd" });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, "AUTHENTICATION_REQUIRED");
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error.code, "AUTHENTICATION_REQUIRED");
  });

  it("reports the signed-in-but-not-linked state before bootstrap", async () => {
    const { client } = fixture();
    const response = await customer(client.get("/customer/workspace"));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "missing_workspace", workspace: null });
  });

  it("bootstraps a tenant, project and approved brand for the verified auth user", async () => {
    const { client } = fixture();
    const response = await customer(client.post("/customer/workspace/bootstrap")).send({
      business_name: "Halal Motor Leasing Ltd",
      website_or_social_profile: "https://leaseexpert.co.uk",
      primary_marketing_challenge: "Get more Audi A3 leasing enquiries",
    });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      status: "ready",
      workspace: {
        ...defaultWorkspaceIds(USER_A),
        tenant_name: "Halal Motor Leasing Ltd Workspace",
        project_name: "Halal Motor Leasing Ltd Campaign Workspace",
        brand_name: "Halal Motor Leasing Ltd",
        brand_status: "approved",
        membership_role: "owner",
      },
    });
    const current = await customer(client.get("/customer/workspace"));
    assert.equal(current.status, 200);
    assert.deepEqual(current.body, response.body);
  });

  it("provisions trusted app metadata scope and asks the client to refresh the session", async () => {
    const { client, provisioned } = fixtureWithScopeProvisioning();
    const response = await customer(client.post("/customer/workspace/bootstrap")).send({
      business_name: "Halal Motor Leasing Ltd",
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.requires_session_refresh, true);
    assert.deepEqual(provisioned, [{
      auth_user_id: USER_A,
      trusted_scope: {
        tenant_id: response.body.workspace.tenant_id,
        project_id: response.body.workspace.project_id,
        brand_id: response.body.workspace.brand_id,
      },
    }]);
  });

  it("is idempotent for repeated bootstrap calls", async () => {
    const { client, repository } = fixture();
    const first = await customer(client.post("/customer/workspace/bootstrap")).send({
      business_name: "Halal Motor Leasing Ltd",
    });
    const second = await customer(client.post("/customer/workspace/bootstrap")).send({
      business_name: "Different Name",
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.deepEqual(second.body, first.body);
    assert.equal(repository.workspaces.size, 1);
  });

  it("supports two brands for one founder without silently selecting the first", async () => {
    const { client, provisioned } = fixtureWithScopeProvisioning();
    const lease = await customer(client.post("/customer/workspace/bootstrap")).send({
      business_name: "Lease Expert",
    });
    const fonzo = await customer(client.post("/customer/workspace/brands")).send({
      tenant_id: lease.body.workspace.tenant_id,
      business_name: "Fonzo",
      website_or_social_profile: "https://drinkfonzo.com",
      primary_marketing_challenge: "Launch Fonzo with high-quality social content",
    });
    assert.equal(fonzo.status, 201);
    assert.notEqual(fonzo.body.workspace.project_id, lease.body.workspace.project_id);
    assert.notEqual(fonzo.body.workspace.brand_id, lease.body.workspace.brand_id);
    assert.equal(fonzo.body.workspace.brand_name, "Fonzo");

    const current = await customer(client.get("/customer/workspace"));
    assert.equal(current.status, 200);
    assert.equal(current.body.status, "selection_required");
    assert.equal(current.body.workspace, null);
    assert.equal(current.body.workspaces.length, 2);

    const selected = await customer(client.post("/customer/workspace/select")).send({
      tenant_id: fonzo.body.workspace.tenant_id,
      project_id: fonzo.body.workspace.project_id,
      brand_id: fonzo.body.workspace.brand_id,
    });
    assert.equal(selected.status, 200);
    assert.equal(selected.body.workspace.brand_name, "Fonzo");
    assert.equal(selected.body.requires_session_refresh, true);
    assert.deepEqual(provisioned.at(-1).trusted_scope, {
      tenant_id: fonzo.body.workspace.tenant_id,
      project_id: fonzo.body.workspace.project_id,
      brand_id: fonzo.body.workspace.brand_id,
    });

    const selectedAgain = await customer(client.post("/customer/workspace/select")).send({
      tenant_id: fonzo.body.workspace.tenant_id,
      project_id: fonzo.body.workspace.project_id,
      brand_id: fonzo.body.workspace.brand_id,
    });
    assert.equal(selectedAgain.status, 200);
    assert.deepEqual(selectedAgain.body.workspace, selected.body.workspace);
  });

  it("fails closed when another customer requests an owned brand", async () => {
    const { client } = fixtureWithScopeProvisioning();
    const lease = await customer(client.post("/customer/workspace/bootstrap")).send({ business_name: "Lease Expert" });
    const fonzo = await customer(client.post("/customer/workspace/brands")).send({
      tenant_id: lease.body.workspace.tenant_id,
      business_name: "Fonzo",
    });
    const denied = await customer(client.post("/customer/workspace/select"), "token-b").send({
      tenant_id: fonzo.body.workspace.tenant_id,
      project_id: fonzo.body.workspace.project_id,
      brand_id: fonzo.body.workspace.brand_id,
    });
    assert.equal(denied.status, 400);
    assert.equal(denied.body.error.code, "WORKSPACE_VALIDATION_ERROR");
    assert.match(JSON.stringify(denied.body.error.details), /not authorized/);
  });

  it("does not allow the request body to supply identity or metadata claims", async () => {
    const { client } = fixture();
    const response = await customer(client.post("/customer/workspace/bootstrap")).send({
      business_name: "Halal Motor Leasing Ltd",
      auth_user_id: USER_B,
      user_metadata: { tenant_id: "tenant_b" },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "WORKSPACE_VALIDATION_ERROR");
    assert.match(JSON.stringify(response.body.error.details), /auth_user_id/);
    assert.match(JSON.stringify(response.body.error.details), /user_metadata/);
  });

  it("returns a workspace validation error for malformed JSON", async () => {
    const { client } = fixture();
    const response = await customer(client.post("/customer/workspace/bootstrap"))
      .set("content-type", "application/json")
      .send('{"business_name":');
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "WORKSPACE_VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Malformed JSON request body");
  });
});
