const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { compileBrandContext } = require("../src/brand-brain");
const { compilePrompt } = require("../src/prompts/compiler");
const {
  CAMPAIGN_CREATIVE_BRIEF,
  CampaignVariantGenerationService,
  compileCampaignPrompt,
  deriveAllowableEvidenceAnchors,
  renderEvidenceAnchorCatalog,
  resolveEvidenceAnchorReferences,
  validateSelectedStrategy,
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
      approved_claims: ["Lightly sparkling botanical drink", "sugar-free"],
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
  const calls = { jobs: 0, saves: 0, billed: 0, generations: 0, brandLookups: [] };
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
    scriptGenerator: scriptGenerator || (async () => ({ text: "Reviewable campaign draft", metadata: strategyMetadata() })),
    branding: { appName: "BizGenie" },
  });
  return { service, calls };
}


function strategyMetadata(selected = 0, anchors = [objective, "Botanical flavour with a crisp finish", "refreshing option for weekday lunches"]) {
  const strategy_candidates = [
    { angle: "Audience-led low-sugar weekday choice", evidence_anchors: [anchors[0]], specificity: "Uses supplied evidence", platform_execution: "Native short-form comparison" },
    { angle: "Evidence-specific sensory contrast", evidence_anchors: [anchors[1] || anchors[0]], specificity: "Uses supplied evidence", platform_execution: "Reels sensory sequence" },
    { angle: "Customer-context decision story", evidence_anchors: [anchors[2] || anchors[0]], specificity: "Uses supplied evidence", platform_execution: "Contextual Reels story" },
  ];
  return { selected_strategy: strategy_candidates[selected], strategy_candidates, selection_evidence: { selected_candidate_index: selected, criteria: ["audience_relevance", "differentiator", "platform_fit"], rationale: "Selected for the strongest supported audience and platform connection." } };
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
  it("derives a bounded stable approved-evidence catalog and excludes governance-only prohibited claims", () => {
    const context = compileBrandContext(approvedBrain(), { generationContext: { platform: "instagram", mediaType: "text" } });
    const anchors = deriveAllowableEvidenceAnchors(objective, context);
    assert.equal(anchors[0].id, "EA001");
    assert.equal(anchors[0].exact_text, objective);
    assert.ok(anchors.some((anchor) => anchor.exact_text === "Botanical flavour with a crisp finish"));
    assert.ok(anchors.some((anchor) => anchor.exact_text === "sugar-free"));
    assert.ok(!anchors.some((anchor) => anchor.exact_text === "Clinically proven to improve health"));
    const catalog = renderEvidenceAnchorCatalog(anchors);
    assert.match(catalog, /EA001 \| Introduce the new seasonal drink/);
    assert.match(catalog, /stable IDs from this list only/);
  });

  it("resolves supplied anchor IDs to exact approved wording and fails unknown or paraphrased references closed", () => {
    const context = compileBrandContext(approvedBrain(), { generationContext: { platform: "instagram", mediaType: "text" } });
    const anchors = deriveAllowableEvidenceAnchors(objective, context);
    const differentiator = anchors.find((anchor) => anchor.exact_text === "Botanical flavour with a crisp finish");
    const metadata = {
      strategy_candidates: [
        { angle: "Audience weekday choice", evidence_anchors: ["EA001"], specificity: "Specific", platform_execution: "Reels story" },
        { angle: "Botanical sensory contrast", evidence_anchors: [differentiator.id], specificity: "Specific", platform_execution: "Reels sequence" },
        { angle: "Decision context story", evidence_anchors: ["EA001"], specificity: "Specific", platform_execution: "Native comparison" },
      ],
      selected_strategy: { angle: "Botanical sensory contrast", evidence_anchors: [differentiator.id], specificity: "Specific", platform_execution: "Reels sequence" },
    };
    const resolved = resolveEvidenceAnchorReferences(metadata, anchors);
    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.selected_strategy.evidence_anchors, ["Botanical flavour with a crisp finish"]);
    assert.equal(resolveEvidenceAnchorReferences({ ...metadata, selected_strategy: { ...metadata.selected_strategy, evidence_anchors: ["EA999"] } }, anchors).ok, false);
    assert.equal(resolveEvidenceAnchorReferences({ ...metadata, selected_strategy: { ...metadata.selected_strategy, evidence_anchors: ["crisp botanical flavour"] } }, anchors).ok, false);
  });

  it("accepts only a bounded evidence-backed selected-strategy artefact", () => {
    const context = compileBrandContext(approvedBrain(), { generationContext: { platform: "instagram", mediaType: "text" } });
    const base = { campaign: { goal: objective }, variant: { platform: "instagram" }, brandContext: context };
    const metadata = strategyMetadata();
    assert.equal(validateSelectedStrategy(metadata.selected_strategy, { ...base, candidates: metadata.strategy_candidates, selection_evidence: metadata.selection_evidence }).ok, true);
    assert.equal(validateSelectedStrategy({ angle: "Product shot and pour", evidence_anchors: ["invented audience fact"], specificity: "Distinctive", platform_execution: "Reels" }, { ...base, candidates: metadata.strategy_candidates, selection_evidence: metadata.selection_evidence }).ok, false);
  });

  it("rejects paraphrased candidate sets and generic selections when richer evidence exists", () => {
    const context = compileBrandContext(approvedBrain(), { generationContext: { platform: "instagram", mediaType: "text" } });
    const base = { campaign: { goal: objective }, variant: { platform: "instagram" }, brandContext: context };
    const paraphrases = [
      { angle:"Low sugar weekday choice", evidence_anchors:["low-sugar option"], specificity:"A", platform_execution:"Reels" },
      { angle:"Weekday low sugar choice", evidence_anchors:["low-sugar option"], specificity:"B", platform_execution:"Reels" },
      { angle:"Low sugar choice for weekdays", evidence_anchors:["low-sugar option"], specificity:"C", platform_execution:"Reels" },
    ];
    assert.equal(validateSelectedStrategy(paraphrases[0], { ...base, candidates:paraphrases, selection_evidence:{selected_candidate_index:0,criteria:["audience_relevance"],rationale:"Uses the supported audience need."} }).ok,false);
    const rich = strategyMetadata();
    const generic = { angle:"Product shot and pour", evidence_anchors:["low-sugar option"], specificity:"Product demo", platform_execution:"Reels" };
    const candidates=[generic, rich.strategy_candidates[1], rich.strategy_candidates[2]];
    const result=validateSelectedStrategy(generic,{...base,candidates,selection_evidence:{selected_candidate_index:0,criteria:["platform_fit"],rationale:"Simple native product execution."}});
    assert.equal(result.ok,false);
    assert.match(result.reasons.join(" "),/category-default selected strategy/);
  });

  it("rejects selection outside the candidate set and unsupported candidate evidence", () => {
    const context = compileBrandContext(approvedBrain(), { generationContext: { platform: "instagram", mediaType: "text" } });
    const base = { campaign: { goal: objective }, variant: { platform: "instagram" }, brandContext: context };
    const metadata=strategyMetadata();
    const outside={...metadata.selected_strategy,angle:"Different selected angle"};
    assert.equal(validateSelectedStrategy(outside,{...base,candidates:metadata.strategy_candidates,selection_evidence:metadata.selection_evidence}).ok,false);
    const unsupported=structuredClone(metadata.strategy_candidates); unsupported[2].evidence_anchors=["invented evidence"];
    assert.equal(validateSelectedStrategy(metadata.selected_strategy,{...base,candidates:unsupported,selection_evidence:metadata.selection_evidence}).ok,false);
  });

  it("passes objective and approved Brand Brain intelligence into the compiled Instagram prompt", async () => {
    let finalPrompt;
    const { service, calls } = makeService({
      assertions: {
        onJob(args) {
          assert.match(args.executionInput.compiled_prompt, /Campaign objective:/);
          assert.match(args.executionInput.compiled_prompt, /native to the selected platform/);
          assert.match(args.executionInput.compiled_prompt, /three to five materially different strategic angles/);
          assert.match(args.executionInput.compiled_prompt, /Preserve approved wording verbatim/);
          assert.match(args.executionInput.additional_context, /Brand:\nNorthstar Beverage/);
        },
      },
      scriptGenerator: async (userContext, { promptOptions }) => {
        calls.generations++;
        finalPrompt = compilePrompt({ ...promptOptions, userContext });
        return { text: "Reviewable campaign draft", metadata: strategyMetadata() };
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
    assert.match(finalPrompt, /Approved claims:[\s\S]*sugar-free/);
    assert.match(finalPrompt, /Prohibited claims:[\s\S]*Clinically proven to improve health/);
    assert.match(finalPrompt, /CTA preference:[\s\S]*Find a stockist nearby/);
    assert.match(finalPrompt, /three to five materially different strategic angles/);
    assert.match(finalPrompt, /Reject stock hooks and category-default concepts/);
    assert.match(finalPrompt, /grounded in available brand truth, campaign objective, audience insight, differentiator, and channel behaviour/);
    assert.match(finalPrompt, /complete allowlist for factual\/product claims/);
    assert.match(finalPrompt, /Preserve approved wording verbatim/);
    assert.match(finalPrompt, /do not strengthen, qualify, quantify, broaden, or replace it with a synonym/);
    assert.match(finalPrompt, /Keep prohibited and unsupported claims out/);
    assert.doesNotMatch(finalPrompt, /completely sugar-free|zero sugar/);
    assert.match(finalPrompt, /Do not reveal or persist internal analysis or rejected angles/);
    assert.doesNotMatch(finalPrompt, /\[INTENT RULES\]/);
    assert.equal(result.result.campaign_version, 4);
    assert.equal(result.campaign.version, 3);
    assert.equal(result.generation_id, "generation_job_1");
    assert.deepEqual(calls.brandLookups, [["project_fonzo", "brand_fonzo"]]);
    assert.equal(calls.jobs, 1);
    assert.equal(calls.billed, 1);
    assert.equal(calls.generations, 1);
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
        return { text: "Draft", metadata: strategyMetadata(0, ["Fonzo-only differentiator", "Fonzo-only differentiator", "Fonzo-only differentiator"]) };
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
    const sparseBrain = approvedBrain({
      audience: undefined,
      voice: undefined,
      commercial: { ...approvedBrain().commercial, differentiators: undefined },
    });
    const { service } = makeService({
      brandBrain: sparseBrain,
      scriptGenerator: async (userContext, { promptOptions }) => {
        const prompt = compilePrompt({ ...promptOptions, userContext });
        assert.doesNotMatch(prompt, /\[AUDIENCE RULES\]|\[VOICE RULES\]|\[SCRIPT TYPE RULES\]|\[INTENT RULES\]/);
        assert.match(prompt, /\[CAMPAIGN OBJECTIVE\]/);
        assert.match(prompt, /Use audience and voice details only when they are present/);
        assert.match(prompt, /never invent missing intelligence/);
        assert.doesNotMatch(prompt, /\nAudience:\n|\nAudience goals:\n|\nDifferentiators:\n/);
        return { text: "Draft", metadata: strategyMetadata(0, [objective, objective, objective]) };
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

  it("applies the same distinctiveness and claim-fidelity contract to a non-drinks category", () => {
    const objective = "Help scent-curious shoppers compare fragrance families at home";
    const brain = approvedBrain({
      name: "Morrow Atelier",
      identity: {
        description: "A fragrance discovery set with four ceramic scent strips.",
        positioning: "A considered way to compare scent families at home.",
      },
      audience: {
        summary: "Shoppers who want to compare fragrances before choosing one.",
        goals: ["Understand which scent family suits their routine"],
      },
      commercial: {
        differentiators: ["Four reusable ceramic scent strips"],
        primary_cta: "Explore the discovery set.",
        approved_claims: ["Includes four ceramic scent strips"],
        prohibited_claims: ["Guaranteed all-day wear"],
      },
    });
    const brandContext = compileBrandContext(brain, {
      generationContext: { platform: "tiktok", mediaType: "text" },
    });
    const prompt = compilePrompt({
      platform: "tiktok",
      campaignObjective: objective,
      campaignInstructions: CAMPAIGN_CREATIVE_BRIEF,
      brandContext,
      userContext: compileCampaignPrompt({
        campaign: { goal: objective },
        item: { name: "Discovery set introduction" },
        variant: { platform: "tiktok", placement: "video" },
        brandContext,
      }),
    });

    assert.match(prompt, /fragrance discovery set with four ceramic scent strips/);
    assert.match(prompt, /compare fragrances before choosing one/);
    assert.match(prompt, /Four reusable ceramic scent strips/);
    assert.match(prompt, /Includes four ceramic scent strips/);
    assert.match(prompt, /never invent missing intelligence/);
    assert.match(prompt, /Preserve approved wording verbatim/);
    assert.match(prompt, /TikTok/);
    assert.match(prompt, /category-default concepts when the supplied intelligence supports a more specific angle/);
    assert.doesNotMatch(CAMPAIGN_CREATIVE_BRIEF, /Morrow Atelier|fragrance|drinks|Fonzo/);
  });
});
