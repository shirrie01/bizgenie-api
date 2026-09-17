const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { compileBrandContext } = require("../src/brand-brain");
const { compilePrompt } = require("../src/prompts/compiler");
const {
  CAMPAIGN_CREATIVE_BRIEF,
  CampaignVariantGenerationService,
  compileCampaignPrompt,
} = require("../src/campaigns/generation");

const objective = "Introduce the new seasonal drink to people choosing a low-sugar option";

function approvedBrain(overrides = {}) {
  return {
    brand_id: "brand_fonzo",
    project_id: "project_fonzo",
    name: "Northstar Beverage",
    identity: {
      description: "A sparkling botanical drink in recyclable cans.",
      positioning: "A crisp, lightly sparkling botanical drink.",
    },
    voice: {
      tone: "Direct, optimistic, and grounded.",
      writing_style: "Use short sensory language without hype.",
    },
    audience: {
      summary: "Adults choosing non-alcoholic drinks with less sugar.",
      goals: ["Find a refreshing option for weekday lunches"],
    },
    commercial: {
      differentiators: ["Botanical flavour with a crisp finish"],
      primary_cta: "Find a stockist nearby.",
      approved_claims: ["Lightly sparkling botanical drink"],
      prohibited_claims: ["Clinically proven to improve health"],
    },
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-09-01T09:00:00.000Z",
      updated_at: "2026-09-01T09:00:00.000Z",
    },
    ...overrides,
  };
}

function campaignFixture() {
  return {
    campaign_id: "campaign_1",
    tenant_id: "tenant_fonzo",
    project_id: "project_fonzo",
    brand_id: "brand_fonzo",
    goal: objective,
    version: 3,
    items: new Map([
      ["item_1", {
        content_item_id: "item_1",
        name: "Seasonal drink introduction",
        format: "text",
        variants: new Map([
          ["variant_1", { variant_id: "variant_1", platform: "instagram", placement: "reels" }],
        ]),
      }],
    ]),
  };
}

function makeService({ brandBrain, scriptGenerator, assertions = {} } = {}) {
  const campaign = campaignFixture();
  const calls = { jobs: 0, saves: 0, billed: 0, brandLookups: [] };
  const service = new CampaignVariantGenerationService({
    repository: {
      async getCampaign() { return structuredClone(campaign); },
      async executeCommand(_context, command) {
        calls.saves++;
        assert.equal(command.expected_campaign_version, campaign.version);
        assert.equal(command.idempotency_key, "campaign-generation-1");
        assert.equal(command.command_type, "save_revision");
        assert.equal(command.payload.content.asset_refs.length, 0);
        return { campaign_id: campaign.campaign_id, campaign_version: 4, created_ids: { revision_ids: ["revision_1"] } };
      },
    },
    brandBrainRepository: {
      async getByProjectAndBrand(projectId, brandId) {
        calls.brandLookups.push([projectId, brandId]);
        if (projectId !== "project_fonzo" || brandId !== "brand_fonzo") return null;
        return brandBrain || approvedBrain();
      },
    },
    generationJobService: {
      async authorizeAndCreateJob(args) {
        calls.jobs++;
        assert.equal(args.executionClass, "text.standard");
        assert.equal(args.idempotencyKey, "campaign-generation-1");
        assert.equal(args.executionInput.provider, undefined);
        assert.equal(args.executionInput.platform, "instagram");
        assert.equal(args.executionInput.goal, objective);
        assertions.onJob?.(args);
        return { job_id: "generation_job_1", execution_class: "text.standard" };
      },
    },
    generationBillingOrchestrator: {
      async execute({ job, expectedExecutionClass, operation }) {
        calls.billed++;
        assert.equal(job.execution_class, "text.standard");
        assert.equal(expectedExecutionClass, "text.standard");
        return operation();
      },
    },
    scriptGenerator: scriptGenerator || (async () => ({ text: "Reviewable campaign draft", metadata: {} })),
    branding: { appName: "BizGenie" },
  });
  return { service, calls };
}

const authorization = {
  actor: { kind: "customer", auth_user_id: "founder_1" },
  tenant_id: "tenant_fonzo",
  project_id: "project_fonzo",
  brand_id: "brand_fonzo",
  membership_role: "owner",
  action: "generation:create",
};

describe("campaign generation prompt contract", () => {
  it("passes objective and approved Brand Brain intelligence into the compiled Instagram prompt", async () => {
    let finalPrompt;
    const { service, calls } = makeService({
      assertions: {
        onJob(args) {
          assert.match(args.executionInput.compiled_prompt, /Campaign objective:/);
          assert.match(args.executionInput.compiled_prompt, /native to the selected platform/);
          assert.match(args.executionInput.additional_context, /Brand:\nNorthstar Beverage/);
        },
      },
      scriptGenerator: async (userContext, { promptOptions }) => {
        finalPrompt = compilePrompt({ ...promptOptions, userContext });
        return { text: "Reviewable campaign draft", metadata: {} };
      },
    });

    const result = await service.generate({
      authorization,
      campaignId: "campaign_1",
      variantId: "variant_1",
      expectedCampaignVersion: 3,
      idempotencyKey: "campaign-generation-1",
    });

    assert.match(finalPrompt, /\[PLATFORM RULES\][\s\S]*Instagram Reels/);
    assert.match(finalPrompt, /\[CAMPAIGN OBJECTIVE\]\nIntroduce the new seasonal drink/);
    assert.match(finalPrompt, /\[CAMPAIGN CREATIVE BRIEF\]/);
    assert.match(finalPrompt, /specific product truth or customer reason to care/);
    assert.match(finalPrompt, /platform and placement/);
    assert.match(finalPrompt, /\[BRAND BRAIN\][\s\S]*Brand:\nNorthstar Beverage/);
    assert.match(finalPrompt, /Adults choosing non-alcoholic drinks with less sugar/);
    assert.match(finalPrompt, /Direct, optimistic, and grounded/);
    assert.match(finalPrompt, /Botanical flavour with a crisp finish/);
    assert.match(finalPrompt, /Approved claims:[\s\S]*Lightly sparkling botanical drink/);
    assert.match(finalPrompt, /Prohibited claims:[\s\S]*Clinically proven to improve health/);
    assert.match(finalPrompt, /CTA preference:[\s\S]*Find a stockist nearby/);
    assert.doesNotMatch(finalPrompt, /\[INTENT RULES\]/);
    assert.equal(result.result.campaign_version, 4);
    assert.equal(result.campaign.version, 3);
    assert.equal(result.generation_id, "generation_job_1");
    assert.deepEqual(calls.brandLookups, [["project_fonzo", "brand_fonzo"]]);
    assert.equal(calls.jobs, 1);
    assert.equal(calls.billed, 1);
    assert.equal(calls.saves, 1);
  });

  it("keeps campaign drafting bounded and does not introduce cross-brand context", async () => {
    const { service, calls } = makeService({
      brandBrain: approvedBrain({
        name: "Fonzo",
        commercial: {
          differentiators: ["Fonzo-only differentiator"],
          prohibited_claims: ["Fonzo-only prohibited claim"],
        },
      }),
      scriptGenerator: async (userContext, { promptOptions }) => {
        const prompt = compilePrompt({ ...promptOptions, userContext });
        assert.match(prompt, /Fonzo-only differentiator/);
        assert.doesNotMatch(prompt, /Lease Expert|Audi A3|Leasexpert|another brand secret/);
        return { text: "Draft", metadata: {} };
      },
    });

    await service.generate({
      authorization,
      campaignId: "campaign_1",
      variantId: "variant_1",
      expectedCampaignVersion: 3,
      idempotencyKey: "campaign-generation-1",
    });

    assert.deepEqual(calls.brandLookups, [["project_fonzo", "brand_fonzo"]]);
  });

  it("does not invent audience, voice, script type, or finite intent selectors", async () => {
    const sparseBrain = approvedBrain({ audience: undefined, voice: undefined });
    const { service } = makeService({
      brandBrain: sparseBrain,
      scriptGenerator: async (userContext, { promptOptions }) => {
        const prompt = compilePrompt({ ...promptOptions, userContext });
        assert.doesNotMatch(prompt, /\[AUDIENCE RULES\]|\[VOICE RULES\]|\[SCRIPT TYPE RULES\]|\[INTENT RULES\]/);
        assert.match(prompt, /\[CAMPAIGN OBJECTIVE\]/);
        assert.match(prompt, /Use audience and voice details only when they are present/);
        return { text: "Draft", metadata: {} };
      },
    });

    await service.generate({
      authorization,
      campaignId: "campaign_1",
      variantId: "variant_1",
      expectedCampaignVersion: 3,
      idempotencyKey: "campaign-generation-1",
    });
  });

  it("preserves the reviewable draft campaign brief contract without brand-specific shared copy", () => {
    const prompt = compileCampaignPrompt({
      campaign: { goal: objective },
      item: { name: "Seasonal drink introduction" },
      variant: { platform: "instagram", placement: "reels" },
      brandContext: "[BRAND BRAIN]\nBrand: Northstar Beverage",
    });

    assert.match(prompt, /Campaign objective:.*low-sugar option/);
    assert.match(prompt, /approved Brand Brain context/);
    assert.match(prompt, /Lead with a specific product truth or customer reason/);
    assert.match(prompt, /reviewable draft only/);
    assert.doesNotMatch(CAMPAIGN_CREATIVE_BRIEF, /Fonzo|Northstar Beverage/);
  });
});
