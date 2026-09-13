const { randomUUID } = require("node:crypto");
const { resolveBrandBrainContext } = require("../brand-brain");
const { emptyContent } = require("./schema");

function findVariant(campaign, variantId) {
  for (const item of campaign.items.values()) {
    const variant = item.variants.get(variantId);
    if (variant) return { item, variant };
  }
  return null;
}

function compileCampaignPrompt({ campaign, item, variant, brandContext }) {
  return [
    "Create reviewable campaign copy for the following existing draft.",
    `Campaign goal: ${campaign.goal}`,
    `Content item: ${item.name}`,
    `Platform: ${variant.platform}`,
    `Placement: ${variant.placement}`,
    "Use only facts supported by the campaign goal and Brand Brain. Do not invent product, health, commercial, availability, customer-result, or distribution claims.",
    brandContext || "Brand Brain contains no approved context; do not add unsupported brand facts.",
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
        promptOptions: { platform: target.variant.platform, brandContext, intent: campaign.goal },
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

module.exports = { CampaignVariantGenerationService, compileCampaignPrompt, findVariant };
