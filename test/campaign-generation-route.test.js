const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryAuthorizationRepository, createCustomerActorFromVerifiedIdentity } = require("../src/authorization");
const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
const { InMemoryGenerationJobRepository } = require("../src/generation-jobs");
const { AuthenticationRequiredError } = require("../src/authorization");
const { GenerationIncompleteError } = require("../src/generation");

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
      scriptGenerator: async () => ({ text: "Fonzo launch copy", metadata: { selected_strategy: { angle: "Audience-led launch", evidence_anchors: ["EA001"], specificity: "Uses the campaign goal", platform_execution: "Native post" }, strategy_candidates: [{ angle: "Audience-led launch", evidence_anchors: ["EA001"], specificity: "Uses the campaign goal", platform_execution: "Native post" }, { angle: "UK launch availability story", evidence_anchors: ["EA001"], specificity: "Uses UK launch context", platform_execution: "Native carousel" }, { angle: "Founder launch context", evidence_anchors: ["EA001"], specificity: "Uses campaign objective", platform_execution: "Native story" }], selection_evidence: { selected_candidate_index: 0, criteria: ["brand_truth", "platform_fit"], rationale: "Selected for the strongest supported campaign and platform fit." } } }),
    });
    const response = await request(app).post(`/customer/campaigns/${CAMPAIGN}/variants/${VARIANT}/generate`).set("authorization", "Bearer customer-token").send({ tenant_id: "tenant_a", project_id: "project_a", expected_campaign_version: 3, idempotency_key: "campaign_generate_001" });
    assert.equal(response.status, 201);
    assert.equal(jobs.getById(response.body.generation_id).brand_id, "brand_a");
  });


  it("returns a truthful incomplete-generation rejection and logs safe completion diagnostics", async () => {
    const stored = campaign();
    const warnings = [];
    const app = createApp({
      logger: { warn(message, detail) { warnings.push({ message, detail }); }, error() {}, info() {}, log() {} },
      customerTokenVerifier: new TokenVerifier(),
      generationJobRepository: new InMemoryGenerationJobRepository(),
      brandBrainRepository: new InMemoryBrandBrainRepository(),
      authorizationRepository: new InMemoryAuthorizationRepository({
        customerProfiles: [{ auth_user_id: USER }],
        tenants: [{ tenant_id: "tenant_a", created_by: USER }],
        memberships: [{ tenant_id: "tenant_a", auth_user_id: USER, role: "owner" }],
        projects: [{ project_id: "project_a", tenant_id: "tenant_a" }],
        brands: [{ brand_id: "brand_a", project_id: "project_a", status: "approved" }],
      }),
      campaignRepository: { async getCampaign() { return stored; }, async executeCommand() { assert.fail("incomplete generation must not save a revision"); } },
      generationBillingOrchestrator: { async execute({ operation }) { return operation(); } },
      scriptGenerator: async () => {
        throw new GenerationIncompleteError({
          finishReason: "MAX_TOKENS",
          missingSections: ["Hashtags", "Filming instructions"],
          retryable: true,
          metadata: {
            incomplete_reason: "TOKEN_EXHAUSTION",
            prompt_token_count: 1200,
            output_token_count: 4096,
            total_token_count: 5296,
          },
        });
      },
    });
    const response = await request(app).post(`/customer/campaigns/${CAMPAIGN}/variants/${VARIANT}/generate`).set("authorization", "Bearer customer-token").send({ tenant_id: "tenant_a", project_id: "project_a", expected_campaign_version: 3, idempotency_key: "campaign_generate_incomplete_001" });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, "GENERATION_INCOMPLETE");
    assert.equal(response.body.error.message, "Generated campaign content was incomplete and was not saved");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "campaign generation incomplete");
    assert.deepEqual(warnings[0].detail.missing_sections, ["Hashtags", "Filming instructions"]);
    assert.equal(warnings[0].detail.finish_reason, "MAX_TOKENS");
    assert.equal(warnings[0].detail.retryable, true);
    assert.equal(warnings[0].detail.incomplete_reason, "TOKEN_EXHAUSTION");
    assert.equal(warnings[0].detail.output_token_count, 4096);
  });

  it("returns a truthful quality rejection and logs safe validation reasons", async () => {
    const stored = campaign();
    const warnings = [];
    const app = createApp({
      logger: { warn(message, detail) { warnings.push({ message, detail }); }, error() {}, info() {}, log() {} },
      customerTokenVerifier: new TokenVerifier(),
      generationJobRepository: new InMemoryGenerationJobRepository(),
      brandBrainRepository: new InMemoryBrandBrainRepository(),
      authorizationRepository: new InMemoryAuthorizationRepository({
        customerProfiles: [{ auth_user_id: USER }],
        tenants: [{ tenant_id: "tenant_a", created_by: USER }],
        memberships: [{ tenant_id: "tenant_a", auth_user_id: USER, role: "owner" }],
        projects: [{ project_id: "project_a", tenant_id: "tenant_a" }],
        brands: [{ brand_id: "brand_a", project_id: "project_a", status: "approved" }],
      }),
      campaignRepository: { async getCampaign() { return stored; }, async executeCommand() { assert.fail("rejected strategy must not save a revision"); } },
      generationBillingOrchestrator: { async execute({ operation }) { return operation(); } },
      scriptGenerator: async () => ({ text: "Rejected draft", metadata: { selected_strategy: { angle: "Generic product shot", evidence_anchors: ["EA001"], specificity: "Generic", platform_execution: "Pack shot and sip" }, strategy_candidates: [] } }),
    });
    const response = await request(app).post(`/customer/campaigns/${CAMPAIGN}/variants/${VARIANT}/generate`).set("authorization", "Bearer customer-token").send({ tenant_id: "tenant_a", project_id: "project_a", expected_campaign_version: 3, idempotency_key: "campaign_generate_rejected_001" });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, "CAMPAIGN_STRATEGY_REJECTED");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "campaign strategy validation rejected generation");
    assert.ok(warnings[0].detail.reasons.includes("three to five strategy candidates are required"));
  });
});
