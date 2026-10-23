const assert = require("node:assert/strict");
const { test } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryCustomerWorkspaceRepository } = require("../src/customer-workspace");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { AuthenticationRequiredError, createCustomerActorFromVerifiedIdentity } = require("../src/authorization");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const scope = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
function fixture({ member = false } = {}) {
  const repository = new InMemoryCustomerWorkspaceRepository({ workspaces: [{ auth_user_id: A, workspace: { ...scope,
    tenant_name: "A", project_name: "A", brand_name: "Real business", brand_status: "approved", membership_role: member ? "member" : "owner" } }] });
  const brains = new InMemoryBrandBrainRepository();
  brains.upsert({ brand_id: scope.brand_id, project_id: scope.project_id, name: "Real business", identity: { description: "Description", sector: "Consulting" },
    commercial: { approved_claims: ["Reviewed claim"], preferred_channels: ["email"] }, metadata: { version: 1, status: "approved", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" } });
  const verifier = { async verifyIdentityAccessToken(token) {
    if (!["a", "b"].includes(token)) throw new AuthenticationRequiredError();
    return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: token === "a" ? A : B });
  }, async verifyAccessToken(token) {
    const actor = await this.verifyIdentityAccessToken(token);
    return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: actor.auth_user_id, verifiedScope: scope });
  } };
  const app = () => createApp({ customerWorkspaceRepository: repository, brandBrainRepository: brains, customerTokenVerifier: verifier,
    customerScopeProvisioner: { async provisionTrustedScope() { throw new Error("Draft must not provision scope"); } }, logger: { info() {}, warn() {}, error() {} } });
  return { repository, brains, client: request(app()), restart: () => request(app()) };
}
const draft = (workspace = null) => ({ workspace, step: "channels", answers: { business_name: "My business", sector_choice: "Consulting",
  preferred_channels: ["instagram", "website"], goal: "Reach local customers", description: "Unfinished description" } });
const auth = (r, token = "a") => r.set("authorization", `Bearer ${token}`);
const save = (f, expected_version = 0, value = draft(), token = "a") => auth(f.client.put("/customer/workspace/onboarding"), token).send({ expected_version, draft: value });

test("draft save/resume uses verified identity before workspace setup and does not change Brand Brain", async () => {
  const f = fixture(); const before = structuredClone([...f.brains.records]);
  assert.deepEqual((await auth(f.client.get("/customer/workspace/onboarding"))).body, { status: "missing", version: 0, draft: null });
  const r = await save(f); assert.equal(r.status, 200); assert.equal(r.body.version, 1); assert.equal(r.body.status, "saved");
  assert.match(r.headers["cache-control"], /no-store/); assert.match(r.headers.vary, /Authorization/);
  const resumed = await auth(f.restart().get("/customer/workspace/onboarding"));
  assert.deepEqual(resumed.body.draft, draft()); assert.deepEqual([...f.brains.records], before);
  assert.equal((await auth(f.client.get("/customer/workspace/onboarding"), "b")).body.status, "missing");
  assert.equal((await save(f, 0, draft(), "b")).status, 200);
});

test("draft concurrency and stale saves return 409 rather than overwriting", async () => {
  const f = fixture(); const responses = await Promise.all([save(f), save(f)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await save(f, 0)).body.error.code, "ONBOARDING_VERSION_CONFLICT");
  const next = draft(); next.answers.goal = "Changed goal";
  assert.equal((await save(f, 1, next)).body.version, 2);
  assert.equal((await save(f, 1)).status, 409);
});

test("draft requests cannot choose another auth user or inject completion/entitlements", async () => {
  const f = fixture();
  for (const body of [{ expected_version: 0, draft: draft(), auth_user_id: B },
    { expected_version: 0, draft: { ...draft(), completed: true } },
    { expected_version: 0, draft: { ...draft(), answers: { ...draft().answers, entitlement: "paid" } } }]) {
    assert.equal((await auth(f.client.put("/customer/workspace/onboarding")).send(body)).status, 400);
  }
  assert.equal((await auth(f.client.get("/customer/workspace/onboarding?auth_user_id=" + B))).status, 400);
  assert.equal((await f.client.get("/customer/workspace/onboarding")).status, 401);
  assert.equal((await save(f, 0, draft(), "bad")).status, 401);
});

for (const answers of [{ preferred_channels: ["Instagram"] }, { preferred_channels: ["email", "email"] }, { sector_choice: "x".repeat(201) }, { description: "x".repeat(2001) }]) {
  test(`draft rejects invalid answers ${Object.keys(answers)[0]}`, async () => {
    const f = fixture(); assert.equal((await save(f, 0, { ...draft(), answers })).status, 400);
    assert.equal((await auth(f.client.get("/customer/workspace/onboarding"))).body.status, "missing");
  });
}

test("partial blank answers persist without being approved truth", async () => {
  const f = fixture(); const value = { workspace: null, step: "identity", answers: { business_name: "", goal: "" } };
  assert.equal((await save(f, 0, value)).status, 200);
  assert.deepEqual((await auth(f.client.get("/customer/workspace/onboarding"))).body.draft, value);
});

test("workspace-bound drafts reject foreign owners and revoked membership on resume", async () => {
  const f = fixture(); assert.equal((await save(f, 0, draft(scope), "b")).status, 400);
  assert.equal((await save(f, 0, draft({ ...scope, brand_id: "foreign" }))).status, 400);
  assert.equal((await save(f, 0, draft(scope))).status, 200);
  f.repository.workspaces.get(A)[0].membership_role = "member";
  assert.equal((await auth(f.client.get("/customer/workspace/onboarding"))).status, 400);
  assert.equal((await save(f, 1, draft(scope))).status, 400);
});

test("owner sector/channels round-trip through existing Brand Brain route and retain governance", async () => {
  const f = fixture();
  const { brand_id, project_id, metadata, ...body } = await f.brains.getByBrandId(scope.brand_id);
  body.identity.sector = "Vehicle leasing"; body.commercial.preferred_channels = ["website", "instagram"];
  const r = await auth(f.client.put("/customer/workspace/brand-brain")).send(body);
  assert.equal(r.status, 200); assert.equal(r.body.brand_brain.identity.sector, "Vehicle leasing");
  assert.deepEqual(r.body.brand_brain.commercial.approved_claims, ["Reviewed claim"]);
  assert.equal(r.body.brand_brain.metadata.status, "approved"); assert.equal(r.body.brand_brain.metadata.version, 2);
  const read = await auth(f.restart().get("/customer/workspace/brand-brain"));
  assert.deepEqual(read.body.brand_brain.commercial.preferred_channels, ["website", "instagram"]);
});

test("legacy correction does not erase new preferences; explicit null/empty clears", async () => {
  const f = fixture();
  const r = await auth(f.client.put("/customer/workspace/brand-brain")).send({ name: "Changed name" });
  assert.equal(r.body.brand_brain.identity.sector, "Consulting");
  assert.deepEqual(r.body.brand_brain.commercial.preferred_channels, ["email"]);
  const cleared = await auth(f.client.put("/customer/workspace/brand-brain")).send({ name: "Changed name", identity: { sector: null }, commercial: { preferred_channels: [] } });
  assert.equal(cleared.body.brand_brain.identity.sector, null); assert.deepEqual(cleared.body.brand_brain.commercial.preferred_channels, []);
});

test("members cannot change Brand Brain preferences", async () => {
  const f = fixture({ member: true });
  assert.equal((await auth(f.client.put("/customer/workspace/brand-brain")).send({ name: "Changed", identity: { sector: "Forged" } })).status, 400);
  assert.equal((await f.brains.getByBrandId(scope.brand_id)).identity.sector, "Consulting");
});

test("missing persistence fails closed without pretending a successful save", async () => {
  const f = fixture(); f.repository.saveOnboardingDraft = async () => { throw new (require("../src/customer-workspace").CustomerWorkspacePersistenceError)(); };
  assert.equal((await save(f)).status, 503);
});

test("canonical bootstrap defaults are generic and never infer a business name from goal text", () => {
  const repository = new InMemoryCustomerWorkspaceRepository();
  const first = repository.bootstrapWorkspace({ auth_user_id: A });
  assert.equal(first.brand_name, "BizGenie Workspace");
  const second = repository.bootstrapWorkspace({ auth_user_id: B, business_name: "Customer-chosen business" });
  assert.equal(second.brand_name, "Customer-chosen business");
});

test("invalid persisted sector/channel choices reject atomically", async () => {
  const f = fixture(); const before = await f.brains.getByBrandId(scope.brand_id);
  for (const fields of [{ identity: { sector: "" } }, { identity: { sector: "x".repeat(201) } },
    { commercial: { preferred_channels: ["Instagram"] } }, { commercial: { preferred_channels: ["email", "email"] } }]) {
    assert.equal((await auth(f.client.put("/customer/workspace/brand-brain")).send({ name: "Real business", ...fields })).status, 400);
    assert.deepEqual(await f.brains.getByBrandId(scope.brand_id), before);
  }
});
