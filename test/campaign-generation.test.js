const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { CampaignVariantGenerationService, compileCampaignPrompt } = require("../src/campaigns/generation");

describe("CampaignVariantGenerationService", () => {
  it("compiles goal and approved Brand Brain context without accepting provider authority", () => {
    const prompt = compileCampaignPrompt({ campaign: { goal: "Launch Fonzo in the UK" }, item: { name: "Launch announcement" }, variant: { platform: "instagram", placement: "feed" }, brandContext: "[BRAND BRAIN]\nBrand: Fonzo\nDo not say:\n- cures" });
    assert.match(prompt, /Launch Fonzo in the UK/);
    assert.match(prompt, /Fonzo/);
    assert.doesNotMatch(prompt, /provider|model|cost|token/i);
  });

  it("creates one idempotent job, bills through the existing boundary, and saves a draft revision", async () => {
    const calls = { jobs: 0, saves: 0, billed: 0 };
    const campaign = { campaign_id: "c", tenant_id: "t", project_id: "p", brand_id: "b", goal: "Launch Fonzo in the UK", version: 3, items: new Map([["i", { content_item_id: "i", name: "Launch announcement", format: "text", variants: new Map([["v", { variant_id: "v", platform: "instagram", placement: "feed" }]]) }]]) };
    const repository = { async getCampaign() { return structuredClone(campaign); }, async executeCommand(_ctx, command) { calls.saves++; assert.equal(command.expected_campaign_version, 3); assert.equal(command.payload.content.asset_refs.length, 0); return { campaign_id: "c", campaign_version: 4, created_ids: { revision_ids: ["r"] } }; } };
    const service = new CampaignVariantGenerationService({ repository, brandBrainRepository: { async getByProjectAndBrand() { return { name: "Fonzo", metadata: { status: "approved" }, identity: { positioning: "simple launch" } }; } }, generationJobService: { async authorizeAndCreateJob(args) { calls.jobs++; assert.equal(args.executionInput.provider, undefined); return { job_id: "j", execution_class: "text.standard" }; } }, generationBillingOrchestrator: { async execute({ operation }) { calls.billed++; return operation(); } }, scriptGenerator: async () => ({ text: "Caption for Fonzo", metadata: {} }), branding: { appName: "BizGenie" } });
    const result = await service.generate({ authorization: { actor: { kind: "customer", auth_user_id: "u" }, tenant_id: "t", project_id: "p", brand_id: "b", membership_role: "owner", action: "generation:create" }, campaignId: "c", variantId: "v", expectedCampaignVersion: 3, idempotencyKey: "gen_1" });
    assert.equal(result.result.campaign_version, 4); assert.equal(calls.jobs, 1); assert.equal(calls.billed, 1); assert.equal(calls.saves, 1);
  });
});
