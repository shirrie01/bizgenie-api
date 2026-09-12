const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  CampaignResourceError,
  InMemoryCampaignRepository,
} = require("../src/campaigns");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SCOPE = Object.freeze({
  tenant_id: "tenant_a",
  project_id: "project_a",
  brand_id: "brand_a",
});

function context(overrides = {}) {
  return {
    actor: {
      kind: "customer",
      auth_user_id: USER_ID,
      trusted_scope: SCOPE,
    },
    tenant_id: SCOPE.tenant_id,
    project_id: SCOPE.project_id,
    membership_role: "owner",
    policy_version: "campaign-owner.v1",
    ...overrides,
  };
}

function command() {
  return {
    contract_version: "campaign-spine.v1",
    idempotency_key: "trusted_scope_campaign_create",
    expected_campaign_version: 0,
    command_type: "create_campaign",
    tenant_id: SCOPE.tenant_id,
    project_id: SCOPE.project_id,
    payload: {
      brand_id: SCOPE.brand_id,
      name: "Trusted scope campaign",
      goal: "Prove trusted scoped owners can create campaigns",
      display_timezone: "Europe/London",
    },
  };
}

function repository() {
  let nextId = 1;
  return new InMemoryCampaignRepository({
    idFactory: () => `${String(nextId++).padStart(8, "0")}-0000-4000-8000-000000000000`,
    now: () => new Date("2026-09-12T22:00:00.000Z"),
    authorize: async () => true,
    captureBrandSnapshot: async (_context, brandId) => ({
      brand_snapshot_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenant_id: SCOPE.tenant_id,
      project_id: SCOPE.project_id,
      brand_id: brandId,
      source_version: 1,
      source_updated_at: "2026-09-12T21:00:00.000Z",
      source_schema_version: "brand-brain.v1",
      snapshot: { name: "Brand A" },
      snapshot_hash: "a".repeat(64),
      captured_at: "2026-09-12T22:00:00.000Z",
    }),
  });
}

describe("campaign trusted-scope actor compatibility", () => {
  it("allows an owner customer actor carrying canonical trusted scope", async () => {
    const result = await repository().executeCommand(context(), command());
    assert.equal(result.campaign_version, 1);
    assert.ok(result.campaign_id);
  });

  it("keeps campaign writes owner-only", async () => {
    await assert.rejects(
      repository().executeCommand(context({ membership_role: "member" }), command()),
      CampaignResourceError
    );
  });

  it("fails closed when trusted scope is malformed", async () => {
    const malformed = context();
    malformed.actor = {
      ...malformed.actor,
      trusted_scope: { tenant_id: SCOPE.tenant_id, project_id: SCOPE.project_id },
    };
    await assert.rejects(repository().executeCommand(malformed, command()), CampaignResourceError);
  });
});
