const { randomUUID } = require("node:crypto");
const { resolveBrandBrainContext } = require("../brand-brain");
const { emptyContent } = require("./schema");

class CampaignStrategyValidationError extends Error {
  constructor(reasons) { super("Generated strategy failed validation"); this.name = "CampaignStrategyValidationError"; this.reasons = reasons; }
}

function normalizeAngle(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function angleTokens(value) {
  return new Set(normalizeAngle(value).split(" ").filter((token) => token.length >= 4));
}

function materiallyDifferent(a, b) {
  const left = angleTokens(a);
  const right = angleTokens(b);
  if (!left.size || !right.size) return false;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / Math.min(left.size, right.size) < 0.7;
}

function validateStrategyCandidate(strategy, source, label) {
  const reasons = [];
  if (!strategy || typeof strategy !== "object") return [`${label} is required`];
  for (const field of ["angle", "evidence_anchors", "specificity", "platform_execution"]) {
    if (!strategy[field] || (Array.isArray(strategy[field]) && strategy[field].length === 0)) reasons.push(`${label}.${field} is required`);
  }
  const anchors = Array.isArray(strategy.evidence_anchors) ? strategy.evidence_anchors : [];
  if (anchors.some((anchor) => typeof anchor !== "string" || !anchor.trim() || !source.includes(anchor.toLowerCase().trim()))) reasons.push(`${label} evidence anchors must match supplied approved context`);
  if (!anchors.some((anchor) => typeof anchor === "string" && anchor.trim().length >= 8)) reasons.push(`${label} must be specific to supplied evidence`);
  if (strategy.platform_execution && typeof strategy.platform_execution !== "string") reasons.push(`${label}.platform_execution must be reviewable text`);
  if (strategy.approved_claims && (!Array.isArray(strategy.approved_claims) || strategy.approved_claims.some((claim) => !source.includes(String(claim).toLowerCase())))) reasons.push(`${label} approved claims must remain bounded to supplied wording`);
  return reasons;
}

function validateSelectedStrategy(strategy, { campaign, variant, brandContext, candidates, selection_evidence: selectionEvidence }) {
  const source = `${campaign.goal}\n${brandContext || ""}`.toLowerCase();
  const reasons = validateStrategyCandidate(strategy, source, "selected_strategy");
  if (!Array.isArray(candidates) || candidates.length < 3 || candidates.length > 5) {
    reasons.push("three to five strategy candidates are required");
    return { ok: false, reasons };
  }
  candidates.forEach((candidate, index) => reasons.push(...validateStrategyCandidate(candidate, source, `strategy_candidates[${index}]`)));
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (!materiallyDifferent(candidates[i]?.angle, candidates[j]?.angle)) reasons.push("strategy candidates must be materially different, not paraphrases");
    }
  }
  const selectedAngle = normalizeAngle(strategy?.angle);
  const selectedIndex = candidates.findIndex((candidate) => normalizeAngle(candidate?.angle) === selectedAngle);
  if (selectedIndex < 0) reasons.push("selected strategy must be one of the supplied candidates");
  const evidence = selectionEvidence && typeof selectionEvidence === "object" ? selectionEvidence : {};
  const criteria = Array.isArray(evidence.criteria) ? evidence.criteria : [];
  const supportedCriteria = new Set(["brand_truth", "audience_relevance", "differentiator", "platform_fit"]);
  if (evidence.selected_candidate_index !== selectedIndex || !criteria.some((criterion) => supportedCriteria.has(criterion))) {
    reasons.push("selection evidence must identify the selected candidate and a supported preference criterion");
  }
  if (typeof evidence.rationale !== "string" || evidence.rationale.trim().length < 8 || evidence.rationale.length > 500) reasons.push("selection rationale must be concise reviewable text");
  const generic = /product shot|pack shot|pour|sip|routine demo|generic|category default|launch announcement/.test(selectedAngle);
  const richerCandidateExists = candidates.some((candidate, index) => index !== selectedIndex && Array.isArray(candidate?.evidence_anchors) && candidate.evidence_anchors.some((anchor) => typeof anchor === "string" && anchor.trim().length >= 8) && !/product shot|pack shot|pour|sip|routine demo|generic|category default|launch announcement/.test(normalizeAngle(candidate.angle)));
  if (generic && richerCandidateExists) reasons.push("category-default selected strategy is not acceptable when a richer evidence-specific candidate exists");
  return { ok: reasons.length === 0, reasons };
}

const CAMPAIGN_CREATIVE_BRIEF = [
  "Lead with a specific product truth or customer reason to care, not a stock launch cliché.",
  "Use supplied audience goals or tensions, brand/product truth, differentiators, approved claims, and CTA when present; never invent missing intelligence.",
  "Avoid generic filler such as ‘Big news’, ‘get ready’, or ‘perfect refreshment’ unless the supplied campaign objective and Brand Brain genuinely justify it.",
  "Make the creative direction native to the selected platform and placement; do not default to a generic product shot or routine product demonstration.",
  "Use audience and voice details only when they are present in the approved Brand Brain. Do not invent a script type, audience, or voice.",
  "Before drafting, compare three to five materially different strategic angles, not alternate phrasings of one hook; select the strongest defensible angle grounded in available brand truth, campaign objective, audience insight, differentiator, and channel behaviour.",
  "Return concise structured strategy metadata for verification: strategy_candidates (3-5 bounded candidate artefacts), selected_strategy (exactly one candidate), and selection_evidence with selected_candidate_index, one or more criteria from brand_truth/audience_relevance/differentiator/platform_fit, and a short reviewable rationale. Do not include hidden reasoning or chain-of-thought.",
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
      operation: async () => this.scriptGenerator(compiledPrompt, {
        branding: this.branding,
        promptOptions: {
          platform: target.variant.platform,
          brandContext,
          campaignObjective: campaign.goal,
          campaignInstructions: CAMPAIGN_CREATIVE_BRIEF,
        },
      }),
    });
    const strategyCheck = validateSelectedStrategy(generation.metadata?.selected_strategy, { campaign, variant: target.variant, brandContext, candidates: generation.metadata?.strategy_candidates, selection_evidence: generation.metadata?.selection_evidence });
    if (!strategyCheck.ok) throw new CampaignStrategyValidationError(strategyCheck.reasons);
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

module.exports = { CAMPAIGN_CREATIVE_BRIEF, CampaignStrategyValidationError, CampaignVariantGenerationService, compileCampaignPrompt, findVariant, validateSelectedStrategy };
