const { randomUUID } = require("node:crypto");
const { resolveBrandBrainContext } = require("../brand-brain");
const { emptyContent } = require("./schema");

const CAMPAIGN_CREATIVE_BRIEF = [
  "Lead with a specific product truth or customer reason to care, not a stock launch cliché.",
  "Use supplied audience goals or tensions, brand/product truth, differentiators, approved claims, and CTA when present; never invent missing intelligence.",
  "Avoid generic filler such as ‘Big news’, ‘get ready’, or ‘perfect refreshment’ unless the supplied campaign objective and Brand Brain genuinely justify it.",
  "Make the creative direction native to the selected platform and placement; do not default to a generic product shot or routine product demonstration.",
  "Use audience and voice details only when they are present in the approved Brand Brain. Do not invent a script type, audience, or voice.",
  "Before drafting, privately compare at least three materially different strategic angles, not alternate phrasings of one hook; select the strongest defensible angle grounded in available brand truth, campaign objective, audience insight, differentiator, and channel behaviour.",
  "Reject stock hooks and category-default concepts when the supplied intelligence supports a more specific angle; keep a generic execution only when it is genuinely the strongest supported choice.",
  "Use the Concept section to name only the selected angle and its concise evidence anchor. Do not reveal or persist internal analysis or rejected angles.",
  "Treat approved claims as the complete allowlist for factual/product claims. Preserve approved wording verbatim; do not strengthen, qualify, quantify, broaden, or replace it with a synonym unless that alternative wording is separately approved. Omit a claim rather than paraphrase it when exact fidelity is not possible.",
  "Keep prohibited and unsupported claims out, including invented superlatives, guarantees, product properties, outcomes, health or performance claims, availability, pricing, awards, endorsements, and comparisons. Expressive creative language must not imply an unsupported fact.",
  "Produce a reviewable draft only. Do not imply approval, scheduling, or publication.",
].join(" ");

function findVariant(campaign, variantId) {
  for (const item of campaign.items.values()) {
    const variant = item.variants.get(variantId);
    if (variant) return { item, variant };
  }
  return null;
}

function compileCampaignPrompt({ campaign, item, variant, brandContext }) {
  return [
    "Create reviewable campaign copy for the following existing draft. The approved Brand Brain is supplied separately in the compiled brand-context section; use only that selected context.",
    `Campaign objective: ${campaign.goal}`,
    `Content item: ${item.name}`,
    `Platform: ${variant.platform}`,
    `Placement: ${variant.placement}`,
    "Use only facts supported by the campaign goal and Brand Brain. Do not invent product, health, commercial, availability, customer-result, or distribution claims.",
    CAMPAIGN_CREATIVE_BRIEF,
    brandContext ? "Use the separately supplied approved Brand Brain context; do not substitute context from another brand." : "Brand Brain contains no approved context; do not add unsupported brand facts.",
    "Return useful copy for this destination. Keep it as a draft for founder review; do not imply approval, scheduling, or publication.",
  ].join("\n\n");
}

class CampaignVariantGenerationService {
  constructor({ repository, brandBrainRepository, generationJobService, generationBillingOrchestrator, scriptGenerator, branding, now = () => new Date() }) {
    Object.assign(this, { repository, brandBrainRepository, generationJobService, generationBillingOrchestrator, scriptGenerator, branding, now });
    if (!repository || !brandBrainRepository || !generationJobService || !generationBillingOrchestrator || !scriptGenerator) throw new TypeError("Campaign generation dependencies are required");
  }

  async generate({ authorization, campaignId, variantId, expectedCampaignVersion, idempotencyKey }) {
    const campaignContext = {
      actor: authorization.actor,
      tenant_id: authorization.tenant_id,
      project_id: authorization.project_id,
      membership_role: authorization.membership_role,
      policy_version: "campaign-owner.v1",
    };
    const campaign = await this.repository.getCampaign(campaignContext, campaignId);
    if (campaign.version !== expectedCampaignVersion) {
      const { CampaignVersionError } = require("./errors");
      throw new CampaignVersionError();
    }
    const target = findVariant(campaign, variantId);
    if (!target || target.item.format !== "text") {
      const { CampaignResourceError } = require("./errors");
      throw new CampaignResourceError();
    }
    const brandContext = await resolveBrandBrainContext({
      repository: this.brandBrainRepository,
      projectId: authorization.project_id,
      brandId: authorization.brand_id,
      generationContext: { platform: target.variant.platform, mediaType: "text" },
    });
    const compiledPrompt = compileCampaignPrompt({ campaign, item: target.item, variant: target.variant, brandContext });
    const job = await this.generationJobService.authorizeAndCreateJob({
      authorization,
      executionClass: "text.standard",
      requestCorrelationId: idempotencyKey,
      idempotencyKey,
      allowedScopes: ["generation:execute"],
      executionInput: { compiled_prompt: compiledPrompt, platform: target.variant.platform, goal: campaign.goal, additional_context: brandContext },
    });
    const generation = await this.generationBillingOrchestrator.execute({
      job,
      expectedExecutionClass: "text.standard",
      operation: () => this.scriptGenerator(compiledPrompt, {
        branding: this.branding,
        promptOptions: {
          platform: target.variant.platform,
          brandContext,
          campaignObjective: campaign.goal,
          campaignInstructions: CAMPAIGN_CREATIVE_BRIEF,
        },
      }),
    });
    const content = { ...emptyContent(), body: generation.text };
    const result = await this.repository.executeCommand(campaignContext, {
      contract_version: "campaign-spine.v1",
      idempotency_key: idempotencyKey,
      expected_campaign_version: expectedCampaignVersion,
      command_type: "save_revision",
      tenant_id: authorization.tenant_id,
      project_id: authorization.project_id,
      campaign_id: campaignId,
      payload: { variant_id: variantId, content, change_reason: "Generated draft for founder review" },
    });
    const updated = await this.repository.getCampaign(campaignContext, campaignId);
    return { result, campaign: updated, generation_id: job.job_id };
  }
}

module.exports = { CAMPAIGN_CREATIVE_BRIEF, CampaignVariantGenerationService, compileCampaignPrompt, findVariant };
