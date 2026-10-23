const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");

const { createApp } = require("../index");
const {
  AuthenticationRequiredError,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");
const { InMemoryCustomerWorkspaceRepository, workspaceDto } = require("../src/customer-workspace");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { InMemoryGoalRecommendationRegistry, InMemoryCampaignMeasurementRegistry } = require("../src/campaigns");
const { InMemoryWorkspaceOnboardingRepository } = require("../src/workspace-onboarding");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SCOPE_A = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
const SCOPE_A2 = { tenant_id: "tenant_a", project_id: "project_a2", brand_id: "brand_a2" };
const SCOPE_B = { tenant_id: "tenant_b", project_id: "project_b", brand_id: "brand_b" };

const ws = (scope, name) => workspaceDto({ ...scope, tenant_name: `${scope.tenant_id} name`, project_name: `${scope.project_id} name`, brand_name: name });

// Tokens carry a trusted scope exactly as the real verifier would; tests can change what a token carries.
class Verifier {
  constructor() {
    this.tokens = {
      "token-a": { user: USER_A, scope: SCOPE_A },
      "token-a2": { user: USER_A, scope: SCOPE_A2 },
      "token-b": { user: USER_B, scope: SCOPE_B },
      "token-b-forged": { user: USER_B, scope: SCOPE_A },
      "token-a-noscope": { user: USER_A, scope: null },
    };
  }
  async verifyAccessToken(token) {
    const entry = this.tokens[token];
    if (!entry) throw new AuthenticationRequiredError();
    return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: entry.user, ...(entry.scope ? { verifiedScope: entry.scope } : {}) });
  }
}

function authorizationRepository() {
  return new InMemoryAuthorizationRepository({
    customerProfiles: [{ auth_user_id: USER_A, display_name: "A" }, { auth_user_id: USER_B, display_name: "B" }],
    tenants: [{ tenant_id: "tenant_a", name: "A", created_by: USER_A }, { tenant_id: "tenant_b", name: "B", created_by: USER_B }],
    memberships: [{ tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" }, { tenant_id: "tenant_b", auth_user_id: USER_B, role: "owner" }],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a", name: "PA" },
      { project_id: "project_a2", tenant_id: "tenant_a", name: "PA2" },
      { project_id: "project_b", tenant_id: "tenant_b", name: "PB" },
    ],
    brands: [
      { brand_id: "brand_a", project_id: "project_a", name: "A", status: "approved" },
      { brand_id: "brand_a2", project_id: "project_a2", name: "A2", status: "approved" },
      { brand_id: "brand_b", project_id: "project_b", name: "B", status: "approved" },
    ],
  });
}

function fixture({ brandName = "Acme Ltd", brandBrainRepository = new InMemoryBrandBrainRepository() } = {}) {
  const workspaceRepository = new InMemoryCustomerWorkspaceRepository({
    workspaces: [
      { auth_user_id: USER_A, workspace: ws(SCOPE_A, brandName) },
      { auth_user_id: USER_A, workspace: ws(SCOPE_A2, "Second Brand") },
      { auth_user_id: USER_B, workspace: ws(SCOPE_B, "Other Business") },
    ],
  });
  const onboardingRepository = new InMemoryWorkspaceOnboardingRepository();
  const verifier = new Verifier();
  let n = 0;
  const app = createApp({
    authorizationRepository: authorizationRepository(),
    customerWorkspaceRepository: workspaceRepository,
    brandBrainRepository,
    workspaceOnboardingRepository: onboardingRepository,
    campaignMeasurementRegistry: new InMemoryCampaignMeasurementRegistry(),
    goalRecommendationRegistry: new InMemoryGoalRecommendationRegistry({
      now: () => new Date("2026-10-23T10:00:00.000Z"),
      idFactory: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    }),
    customerTokenVerifier: verifier,
    logger: { info() {}, warn() {}, error() {} },
  });
  return { client: request(app), workspaceRepository, onboardingRepository, verifier };
}

const as = (call, token = "token-a") => call.set("authorization", `Bearer ${token}`);
const URL = "/customer/workspace/onboarding";
const save = (client, body, token) => as(client.put(URL), token).send(body);
let counter = 0;
const key = () => `save-${++counter}`;
const base = (extra = {}) => ({ idempotency_key: key(), expected_version: 0, ...extra });

describe("workspace onboarding persistence (BG-STUDIO-010-BE)", () => {
  it("requires authentication and a trusted workspace scope", async () => {
    const { client } = fixture();
    assert.equal((await client.get(URL)).status, 401);
    assert.equal((await as(client.get(URL), "nope")).status, 401);
    const noScope = await as(client.get(URL), "token-a-noscope");
    assert.equal(noScope.status, 403);
    assert.equal(noScope.body.error.code, "WORKSPACE_NOT_AUTHORIZED");
    assert.equal((await save(client, base(), "token-a-noscope")).status, 403);
  });

  it("returns a safe not-started default without creating a row", async () => {
    const { client, onboardingRepository } = fixture();
    const res = await as(client.get(URL));
    assert.equal(res.status, 200);
    assert.equal(res.body.onboarding.status, "not_started");
    assert.equal(res.body.onboarding.version, 0);
    assert.deepEqual(res.body.onboarding.sector, { key: null, source: null });
    assert.deepEqual(res.body.onboarding.channels, { values: [], source: null });
    assert.equal(res.body.onboarding.completeness.ready_to_complete, false);
    assert.equal(onboardingRepository.records.size, 0);
  });

  it("saves partial progress and resumes it after a fresh read", async () => {
    const { client } = fixture();
    const saved = await save(client, base({ sector_key: "perfume", current_step: 2, draft: { business_name: "Acme", goal: "More sales" } }));
    assert.equal(saved.status, 200);
    assert.equal(saved.body.status, "saved");
    assert.equal(saved.body.replayed, false);
    assert.equal(saved.body.onboarding.version, 1);
    assert.equal(saved.body.onboarding.status, "in_progress");
    const resumed = await as(client.get(URL));
    assert.deepEqual(resumed.body.onboarding, saved.body.onboarding);
    assert.equal(resumed.body.onboarding.sector.source, "customer");
    assert.equal(resumed.body.onboarding.current_step, 2);
    assert.deepEqual(resumed.body.onboarding.draft, { business_name: "Acme", goal: "More sales" });
    assert.deepEqual(resumed.body.onboarding.channels.values, []);
  });

  it("merges later saves, clears draft keys with null and does not expose internals", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "perfume", draft: { business_name: "Acme", goal: "g" } }));
    const second = await save(client, { idempotency_key: key(), expected_version: 1, channels: ["instagram", "email"], draft: { goal: null } });
    assert.equal(second.body.onboarding.version, 2);
    assert.equal(second.body.onboarding.sector.key, "perfume");
    assert.deepEqual(second.body.onboarding.channels.values, ["instagram", "email"]);
    assert.deepEqual(second.body.onboarding.draft, { business_name: "Acme" });
    const text = JSON.stringify(second.body);
    for (const leak of ["updated_by", "last_request_hash", "last_idempotency_key", USER_A]) assert.equal(text.includes(leak), false, leak);
  });

  it("rejects stale versions with the current version and loses nothing", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "perfume" }));
    const stale = await save(client, base({ expected_version: 0, channels: ["email"] }));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "VERSION_CONFLICT");
    assert.equal(stale.body.error.details.current_version, 1);
    const current = await as(client.get(URL));
    assert.equal(current.body.onboarding.sector.key, "perfume");
    assert.deepEqual(current.body.onboarding.channels.values, []);
  });

  it("lets exactly one of several concurrent edits win", async () => {
    const { client } = fixture();
    const results = await Promise.all(["email", "website", "tiktok", "instagram"].map((channel) =>
      save(client, base({ channels: [channel] }))));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 3);
    assert.equal((await as(client.get(URL))).body.onboarding.version, 1);
  });

  it("treats a duplicate submission as a replay and a reused key with new content as a conflict", async () => {
    const { client } = fixture();
    const body = base({ sector_key: "beverage", channels: ["facebook"] });
    const first = await save(client, body);
    const retry = await save(client, body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.replayed, true);
    assert.deepEqual(retry.body.onboarding, first.body.onboarding);
    assert.equal(retry.body.onboarding.version, 1);
    const reused = await save(client, { ...body, channels: ["email"] });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error.code, "IDEMPOTENCY_KEY_CONFLICT");
  });

  it("recognises identical concurrent submissions as one write", async () => {
    const { client } = fixture();
    const body = base({ sector_key: "leasing" });
    const results = await Promise.all([save(client, body), save(client, body), save(client, body)]);
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
    assert.equal(results.filter((r) => r.body.replayed === false).length, 1);
    assert.equal((await as(client.get(URL))).body.onboarding.version, 1);
  });

  it("validates strictly: unknown fields, enums, sizes, duplicates and missing fields", async () => {
    const { client, onboardingRepository } = fixture();
    const bad = [
      base({ surprise: true }),
      base({ sector_key: "crypto" }),
      base({ channels: ["myspace"] }),
      base({ channels: ["email", "email"] }),
      base({ channels: Array(7).fill("email") }),
      base({ industry_text: "x".repeat(201) }),
      base({ draft: { goal: "x".repeat(2001) } }),
      base({ draft: { password: "x" } }),
      base({ current_step: 99 }),
      base({ current_step: 1.5 }),
      { idempotency_key: key() },
      { expected_version: 0 },
      base({ idempotency_key: "has space" }),
      base({ expected_version: -1 }),
      base({ complete: "yes" }),
      base({ tenant_id: "tenant_b" }),
    ];
    for (const body of bad) {
      const res = await save(client, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, "ONBOARDING_VALIDATION_ERROR");
    }
    assert.equal(onboardingRepository.records.size, 0);
  });

  it("never lets an inferred value replace a value the customer chose", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "perfume", sector_source: "customer", channels: ["email"], channels_source: "customer" }));
    const sector = await save(client, { idempotency_key: key(), expected_version: 1, sector_key: "beverage", sector_source: "inferred" });
    assert.equal(sector.status, 400);
    const channels = await save(client, { idempotency_key: key(), expected_version: 1, channels: ["tiktok"], channels_source: "inferred" });
    assert.equal(channels.status, 400);
    const relabel = await save(client, { idempotency_key: key(), expected_version: 1, sector_source: "inferred" });
    assert.equal(relabel.status, 400);
    assert.equal((await as(client.get(URL))).body.onboarding.sector.key, "perfume");
  });

  it("stores inferred values as inferred and lets the customer confirm them", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "leasing", sector_source: "inferred" }));
    assert.equal((await as(client.get(URL))).body.onboarding.sector.source, "inferred");
    const confirmed = await save(client, { idempotency_key: key(), expected_version: 1, sector_key: "leasing", sector_source: "customer" });
    assert.equal(confirmed.body.onboarding.sector.source, "customer");
  });

  it("completes only with a sector and a channel, and a completed profile cannot be emptied", async () => {
    const { client } = fixture();
    const early = await save(client, base({ sector_key: "charity", complete: true }));
    assert.equal(early.status, 422);
    assert.equal(early.body.error.code, "ONBOARDING_INCOMPLETE");
    assert.equal((await as(client.get(URL))).body.onboarding.version, 0);
    const done = await save(client, base({ sector_key: "charity", channels: ["email"], complete: true }));
    assert.equal(done.body.onboarding.status, "completed");
    assert.ok(done.body.onboarding.completed_at);
    const emptied = await save(client, { idempotency_key: key(), expected_version: 1, channels: [] });
    assert.equal(emptied.status, 422);
    const reopened = await save(client, { idempotency_key: key(), expected_version: 1, complete: false, channels: [] });
    assert.equal(reopened.body.onboarding.status, "in_progress");
    assert.equal(reopened.body.onboarding.completed_at, null);
  });

  it("does not treat a failed or rejected request as saved", async () => {
    const { client, onboardingRepository } = fixture();
    await save(client, base({ channels: ["nope"] }));
    await save(client, base({ complete: true }));
    assert.equal(onboardingRepository.records.size, 0);
    assert.equal((await as(client.get(URL))).body.onboarding.status, "not_started");
  });

  it("returns 503 without claiming success when storage fails", async () => {
    const { client, onboardingRepository } = fixture();
    onboardingRepository.commit = async () => { const { OnboardingPersistenceError } = require("../src/workspace-onboarding"); throw new OnboardingPersistenceError(); };
    const res = await save(client, base({ sector_key: "perfume" }));
    assert.equal(res.status, 503);
    assert.equal(res.body.status, "failed");
    assert.equal(res.body.error.code, "ONBOARDING_UNAVAILABLE");
  });

  it("isolates tenants: another customer sees and changes only their own profile", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "perfume", channels: ["email"], draft: { business_name: "Secret Co" } }));
    const other = await as(client.get(URL), "token-b");
    assert.equal(other.body.onboarding.version, 0);
    assert.equal(JSON.stringify(other.body).includes("Secret Co"), false);
    await save(client, base({ sector_key: "takeaway" }), "token-b");
    assert.equal((await as(client.get(URL))).body.onboarding.sector.key, "perfume");
    assert.equal((await as(client.get(URL), "token-b")).body.onboarding.sector.key, "takeaway");
  });

  it("refuses a token whose scope the customer is not a member of", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "perfume" }));
    const read = await as(client.get(URL), "token-b-forged");
    assert.equal(read.status, 403);
    const write = await save(client, base({ sector_key: "beverage" }), "token-b-forged");
    assert.equal(write.status, 403);
    assert.equal((await as(client.get(URL))).body.onboarding.sector.key, "perfume");
  });

  it("isolates workspaces of one account and follows account switching", async () => {
    const { client } = fixture();
    await save(client, base({ sector_key: "perfume", channels: ["instagram"] }));
    const second = await as(client.get(URL), "token-a2");
    assert.equal(second.body.onboarding.version, 0);
    await save(client, base({ sector_key: "aesthetics" }), "token-a2");
    assert.equal((await as(client.get(URL))).body.onboarding.sector.key, "perfume");
    assert.equal((await as(client.get(URL), "token-a2")).body.onboarding.sector.key, "aesthetics");
    assert.equal((await as(client.get(URL), "token-b")).body.onboarding.version, 0);
  });

  it("stops working immediately when membership is revoked", async () => {
    const { client, workspaceRepository } = fixture();
    await save(client, base({ sector_key: "perfume" }));
    workspaceRepository.workspaces.set(USER_A, []);
    assert.equal((await as(client.get(URL))).status, 403);
    assert.equal((await save(client, base({ sector_key: "beverage" }))).status, 403);
  });

  it("flags placeholder brand names (G4) without changing them", async () => {
    for (const [name, expected] of [["BizGenie Workspace", true], ["Customer Campaign Workspace", true], ["Acme Ltd", false]]) {
      const { client } = fixture({ brandName: name });
      const res = await as(client.get(URL));
      assert.equal(res.body.brand_name_placeholder, expected, name);
    }
  });

  it("does not touch Brand Brain content, version or timestamps", async () => {
    const brandBrainRepository = new InMemoryBrandBrainRepository();
    const brain = {
      brand_id: SCOPE_A.brand_id, project_id: SCOPE_A.project_id, name: "Acme Ltd",
      identity: { description: "Original description", positioning: "Pos" },
      audience: { summary: "Aud" }, commercial: { primary_cta: "Call us", approved_claims: ["Claim"] },
      metadata: { version: 7, status: "approved", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-02-02T00:00:00.000Z" },
    };
    brandBrainRepository.upsert(brain);
    const { client } = fixture({ brandBrainRepository });
    const before = await as(client.get("/customer/workspace/brand-brain"));
    assert.equal(before.status, 200);
    await save(client, base({ sector_key: "perfume", channels: ["email"], draft: { description: "Different draft text" }, complete: true }));
    const after = await as(client.get("/customer/workspace/brand-brain"));
    assert.deepEqual(after.body, before.body);
    assert.equal(after.body.brand_brain.metadata.version, 7);
    assert.equal(after.body.brand_brain.metadata.updated_at, "2026-02-02T00:00:00.000Z");
    assert.equal(after.body.brand_brain.identity.description, "Original description");
  });

  it("keeps working after the customer edits the Brand Brain, and the edit keeps the saved preferences", async () => {
    const brandBrainRepository = new InMemoryBrandBrainRepository();
    brandBrainRepository.upsert({
      brand_id: SCOPE_A.brand_id, project_id: SCOPE_A.project_id, name: "Customer Campaign Workspace",
      metadata: { version: 1, status: "approved", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { client } = fixture({ brandBrainRepository });
    await save(client, base({ sector_key: "perfume", channels: ["email"] }));
    assert.equal((await as(client.get(URL))).body.brand_name_placeholder, true);
    const put = await as(client.put("/customer/workspace/brand-brain")).send({
      name: "Real Name Ltd", identity: { description: "We sell scent" },
    });
    assert.equal(put.status, 200);
    const res = await as(client.get(URL));
    assert.equal(res.body.brand_name_placeholder, false);
    assert.equal(res.body.onboarding.sector.key, "perfume");
    assert.deepEqual(res.body.onboarding.channels.values, ["email"]);
  });
});

describe("saved preferences and recommendations (BG-STUDIO-010-BE)", () => {
  const rec = (client, extra = {}, token = "token-a", scope = SCOPE_A) => as(client.post("/customer/campaign-recommendations"), token).send({
    ...scope, goal: "Brand awareness for our shop", display_timezone: "Europe/London", idempotency_key: key(), ...extra,
  });
  const platforms = (res) => res.body.recommendation.suggested_items.map((item) => item.platform);

  it("is unchanged until onboarding is completed", async () => {
    const { client } = fixture();
    const baseline = platforms(await rec(client));
    await save(client, base({ sector_key: "perfume", channels: ["email"] }));
    assert.deepEqual(platforms(await rec(client)), baseline);
  });

  it("puts completed channel preferences first and fabricates nothing", async () => {
    const { client } = fixture();
    const baseline = platforms(await rec(client));
    await save(client, base({ sector_key: "perfume", channels: ["email", "tiktok"], complete: true }));
    const res = await rec(client);
    assert.equal(res.status, 201);
    const after = platforms(res);
    assert.equal(after[0], "email");
    assert.deepEqual([...after].sort(), [...baseline].sort());
    assert.equal(res.body.recommendation.suggested_items.length, baseline.length);
  });

  it("does not leak one workspace's preferences into another", async () => {
    const { client } = fixture();
    const otherBaseline = platforms(await rec(client, {}, "token-b", SCOPE_B));
    await save(client, base({ sector_key: "perfume", channels: ["email"], complete: true }));
    assert.deepEqual(platforms(await rec(client, {}, "token-b", SCOPE_B)), otherBaseline);
    const sibling = platforms(await rec(client, {}, "token-a2", SCOPE_A2));
    assert.deepEqual(sibling, otherBaseline);
  });
});
