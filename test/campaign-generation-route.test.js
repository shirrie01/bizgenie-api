const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryAuthorizationRepository, createCustomerActorFromVerifiedIdentity } = require("../src/authorization");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { InMemoryGenerationJobRepository } = require("../src/generation-jobs");
const { AuthenticationRequiredError } = require("../src/authorization");

const USER = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN = "11111111-1111-4111-8111-111111111112";
const VARIANT = "11111111-1111-4111-8111-111111111113";

class TokenVerifier {
  async verifyAccessToken(token) {
    if (token !== "customer-token") throw new AuthenticationRequiredError();
    return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: USER });
  }
}

function campaign() {
  const revision = { revision_id: "11111111-1111-4111-8111-111111111114", content: { title: null, body: "Existing draft", caption: null, alt_text: null, asset_refs: [] } };
  return {
    campaign_id: CAMPAIGN, tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", name: "Launch Fonzo Into The Uk Campaign", goal: "Launch Fonzo in the UK", version: 3, status: "active", counts: {}, archived_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", next_action: { code: "finish_draft", label: "Finish draft" },
    items: new Map([["item_a", { content_item_id: "item_a", name: "Launch announcement", format: "text", status: "active", counts: {}, archived_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", variants: new Map([[VARIANT, { variant_id: VARIANT, platform: "instagram", placement: "feed", destination_label: "Instagram feed", workflow: "draft", current_revision_id: revision.revision_id, updated_at: "2026-01-01T00:00:00.000Z", revisions: new Map([[revision.revision_id, revision]]) }]]) }]]),
  };
}

describe("campaign generation composed authorization", () => {
  it("passes full approved brand generation authorization into the real GenerationJobService", async () => {
    const stored = campaign();
    const jobs = new InMemoryGenerationJobRepository();
    const brandBrain = new InMemoryBrandBrainRepository();
    brandBrain.upsert({ brand_id: "brand_a", project_id: "project_a", name: "Fonzo", metadata: { status: "approved" }, identity: { positioning: "simple launch" } });
    const app = createApp({
      customerTokenVerifier: new TokenVerifier(),
      generationJobRepository: jobs,
      brandBrainRepository: brandBrain,
      authorizationRepository: new InMemoryAuthorizationRepository({
        customerProfiles: [{ auth_user_id: USER }],
        tenants: [{ tenant_id: "tenant_a", created_by: USER }],
        memberships: [{ tenant_id: "tenant_a", auth_user_id: USER, role: "owner" }],
        projects: [{ project_id: "project_a", tenant_id: "tenant_a" }],
        brands: [{ brand_id: "brand_a", project_id: "project_a", status: "approved" }],
      }),
      campaignRepository: { async getCampaign() { return stored; }, async executeCommand(_context, command) { assert.equal(command.command_type, "save_revision"); return { campaign_id: CAMPAIGN, campaign_version: 4, created_ids: {} }; } },
      generationBillingOrchestrator: { async execute({ job, operation }) { assert.equal(job.action, undefined); return operation(); } },
      scriptGenerator: async () => ({ text: "Fonzo launch copy", metadata: {} }),
    });
    const response = await request(app).post(`/customer/campaigns/${CAMPAIGN}/variants/${VARIANT}/generate`).set("authorization", "Bearer customer-token").send({ tenant_id: "tenant_a", project_id: "project_a", expected_campaign_version: 3, idempotency_key: "campaign_generate_001" });
    assert.equal(response.status, 201);
    assert.equal(jobs.getById(response.body.generation_id).brand_id, "brand_a");
  });
});
