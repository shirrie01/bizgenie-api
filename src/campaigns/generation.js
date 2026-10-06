const { randomUUID } = require("node:crypto");
const { resolveBrandBrainContext } = require("../brand-brain");
const { emptyContent } = require("./schema");
const { GenerationIncompleteError, extractSections, findMissingSections } = require("../generation");

class CampaignStrategyValidationError extends Error {
  constructor(reasons, { stage = null, generationJobId = null } = {}) {
    super("Generated strategy failed validation");
    this.name = "CampaignStrategyValidationError";
    this.reasons = reasons;
    this.stage = stage;
    this.generationJobId = generationJobId;
  }
}

const APPROVED_EVIDENCE_LABELS = new Set([
  "Brand", "Description", "Mission", "Vision", "Values", "Positioning", "Tone", "Writing style", "Personality",
  "Preferred terms", "Audience", "Audience pain points", "Audience goals", "Audience objections", "Buying triggers",
  "Differentiators", "Approved claims", "CTA preference", "Brand colours", "Brand fonts", "Photography style",
]);

function deriveAllowableEvidenceAnchors(campaignGoal, brandContext = "", { maxAnchors = 32 } = {}) {
  const values = [];
  const add = (text, source) => {
    const exact_text = String(text || "").trim().replace(/^[-*]\s+/, "");
    if (exact_text.length < 3 || values.some((entry) => entry.exact_text === exact_text)) return;
    values.push({ source, exact_text });
  };
  add(campaignGoal, "campaign_objective");
  for (const block of String(brandContext || "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const match = lines[0]?.match(/^([^:]+):$/);
    if (!match || !APPROVED_EVIDENCE_LABELS.has(match[1])) continue;
    for (const line of lines.slice(1)) add(line, "brand_brain:" + match[1]);
  }
  return values.slice(0, maxAnchors).map((entry, index) => ({ id: "EA" + String(index + 1).padStart(3, "0"), ...entry }));
}

function renderEvidenceAnchorCatalog(anchors) {
  if (!Array.isArray(anchors) || anchors.length === 0) return "";
  return [
    "[APPROVED EVIDENCE ANCHORS]",
    "Use evidence_anchors as stable IDs from this list only in strategy metadata. Never paraphrase, reconstruct, or invent an evidence anchor reference. Anchor IDs identify approved evidence; they do not permit broader factual claims. IDs such as EA001 are internal metadata: never place them in Hook, Concept, Script, CTA, Caption, Hashtags, or Filming instructions. Express the selected evidence's meaning in the final draft instead of printing its ID or copying its source text.",
    ...anchors.map(({ id, exact_text }) => id + " | " + exact_text),
  ].join("\n");
}

function resolveEvidenceAnchorReferences(metadata, allowableAnchors) {
  const byId = new Map((allowableAnchors || []).map((anchor) => [anchor.id, anchor.exact_text]));
  const reasons = [];
  const resolveStrategy = (strategy, label) => {
    if (!strategy || typeof strategy !== "object") return strategy;
    const refs = Array.isArray(strategy.evidence_anchors) ? strategy.evidence_anchors : [];
    const resolved = refs.map((ref) => {
      if (typeof ref !== "string") { reasons.push(label + " evidence anchor reference must use supplied approved evidence"); return null; }
      const value = ref.trim();
      if (byId.has(value)) return byId.get(value);
      reasons.push(label + " evidence anchor reference must use supplied approved evidence");
      return null;
    }).filter(Boolean);
    return { ...strategy, evidence_anchors: resolved };
  };
  const candidates = Array.isArray(metadata?.strategy_candidates)
    ? metadata.strategy_candidates.map((candidate, index) => resolveStrategy(candidate, "strategy_candidates[" + index + "]"))
    : metadata?.strategy_candidates;
  const selected_strategy = resolveStrategy(metadata?.selected_strategy, "selected_strategy");
  return { ok: reasons.length === 0, reasons, candidates, selected_strategy };
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

const CATEGORY_DEFAULT_DEVICES = [
  /product shot/,
  /pack shot/,
  /close[- ]?up/,
  /pour/,
  /sip/,
  /fizz/,
  /effervescence/,
  /condensation/,
  /routine demo/,
  /product demo/,
  /generic/,
  /category default/,
  /launch announcement/,
];
const CATEGORY_DEFAULT_PATTERN = new RegExp(CATEGORY_DEFAULT_DEVICES.map((pattern) => pattern.source).join("|"));

function strategyExecutionText(strategy) {
  return normalizeAngle([strategy?.angle, strategy?.specificity, strategy?.platform_execution].filter(Boolean).join(" "));
}

function evidenceSpecificity(strategy) {
  const anchors = Array.isArray(strategy?.evidence_anchors) ? strategy.evidence_anchors : [];
  return new Set(anchors.map((anchor) => String(anchor || "").trim()).filter((anchor) => anchor.length >= 8)).size;
}

function categoryDefaultDeviceCount(value) {
  const execution = normalizeAngle(value);
  return CATEGORY_DEFAULT_DEVICES.filter((pattern) => pattern.test(execution)).length;
}

function validateDraftExecutionFidelity(draftText, strategy) {
  const reasons = [];
  const sections = extractDraftSections(draftText);
  const structuredExecution = [sections.script, sections["filming instructions"]].filter(Boolean).join(" ");
  const draftExecution = normalizeAngle(structuredExecution || draftText);
  if (!draftExecution) {
    reasons.push("final draft execution is required");
    return { ok: false, reasons };
  }
  const selectedExecution = strategyExecutionText(strategy);
  if (!CATEGORY_DEFAULT_PATTERN.test(selectedExecution) && categoryDefaultDeviceCount(draftExecution) >= 2) {
    reasons.push("final draft collapses into category-default execution not present in the selected strategy");
  }
  return { ok: reasons.length === 0, reasons };
}

const COPY_STOP_WORDS = new Set("a an and are as at be by for from in is it of on or that the their this to with you your".split(" "));
const GENERIC_FILMING_PATTERN = /\b(?:generic|professional|business|product|pack|logo|brand)\s+(?:graphics?|visuals?|shot|shots?|footage|b-?roll|animation|treatment)|\b(?:product|pack)\s+shot|\bstock\s+footage|\bclean\s+business\b/i;

function meaningfulDraftWords(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g)?.filter((word) => word.length > 2 && !COPY_STOP_WORDS.has(word)) || [];
}

function extractDraftSections(text) {
  return extractSections(text);
}

function hasSubstantialSourceRepetition(copy, source, approvedClaims = []) {
  let boundedSource = String(source || "");
  for (const claim of approvedClaims) boundedSource = boundedSource.replace(new RegExp(String(claim).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  const copyWords = meaningfulDraftWords(copy);
  const sourceWords = new Set(meaningfulDraftWords(boundedSource));
  if (copyWords.length < 5 || sourceWords.size < 5) return false;
  const overlap = copyWords.filter((word) => sourceWords.has(word)).length / copyWords.length;
  const sourceWordList = meaningfulDraftWords(boundedSource);
  const copyTrigrams = new Set(copyWords.slice(0, -2).map((_, index) => copyWords.slice(index, index + 3).join(" ")));
  const sourceTrigrams = new Set(sourceWordList.slice(0, -2).map((_, index) => sourceWordList.slice(index, index + 3).join(" ")));
  return overlap >= 0.7 || [...copyTrigrams].filter((trigram) => sourceTrigrams.has(trigram)).length >= 2;
}

function validateFinalDraftStrategyFidelity(draftText, { campaign, brandContext, selected_strategy: strategy }) {
  const sections = extractDraftSections(draftText);
  const reasons = [];
  if (/\bEA\d{3,}\b/i.test(sections.concept || "")) reasons.push("Concept must not expose internal evidence-anchor IDs");
  const source = `${campaign.goal}\n${brandContext || ""}`;
  const approvedClaims = Array.isArray(strategy?.approved_claims) ? strategy.approved_claims : [];
  if ([sections.hook, sections.cta, sections.caption].some((copy) => hasSubstantialSourceRepetition(copy, source, approvedClaims))) reasons.push("customer-facing copy substantially repeats supplied source wording");
  const customerWords = new Set(meaningfulDraftWords(Object.values(sections).join(" ")));
  const anchors = Array.isArray(strategy?.evidence_anchors) ? strategy.evidence_anchors : [];
  if (anchors.length && !anchors.some((anchor) => meaningfulDraftWords(anchor).some((word) => customerWords.has(word)))) reasons.push("final draft does not materially realise the resolved selected evidence");
  const selectedExecution = strategyExecutionText(strategy);
  const executionWords = meaningfulDraftWords(selectedExecution).filter((word) => word.length >= 5);
  if (executionWords.length >= 2 && !CATEGORY_DEFAULT_PATTERN.test(selectedExecution) && GENERIC_FILMING_PATTERN.test(sections["filming instructions"] || "")) reasons.push("generic filming instructions cannot replace richer selected platform execution");
  return { ok: reasons.length === 0, reasons };
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
  const selectedGeneric = CATEGORY_DEFAULT_PATTERN.test(strategyExecutionText(strategy));
  const selectedEvidenceSpecificity = evidenceSpecificity(strategy);
  const richerCandidateExists = candidates.some((candidate, index) =>
    index !== selectedIndex &&
    !CATEGORY_DEFAULT_PATTERN.test(strategyExecutionText(candidate)) &&
    evidenceSpecificity(candidate) >= Math.max(1, selectedEvidenceSpecificity)
  );
  if (selectedGeneric && richerCandidateExists) reasons.push("category-default selected strategy is not acceptable when a richer evidence-specific candidate exists");
  return { ok: reasons.length === 0, reasons };
}

const CAMPAIGN_CREATIVE_BRIEF = [
  "Lead with a specific product truth or customer reason to care, not a stock launch cliché.",
  "Use supplied audience goals or tensions, brand/product truth, differentiators, approved claims, and CTA when present; never invent missing intelligence.",
  "Avoid generic filler such as ‘Big news’, ‘get ready’, or ‘perfect refreshment’ unless the supplied campaign objective and Brand Brain genuinely justify it.",
  "Make the creative direction native to the selected platform and placement; do not default to a generic product shot or routine product demonstration.",
  "Final Filming instructions must concretely realise the selected strategy's platform_execution. When the selected strategy contains a richer platform execution, do not collapse it into generic professional, product, pack, logo, brand, stock-footage, or clean-business treatment.",
  "Once selected, treat selected_strategy as the execution contract for the entire final draft. Carry its distinctive strategic premise, specificity, evidence grounding, and platform_execution through Hook, Concept, Script, CTA, Caption, and Filming instructions wherever relevant.",
  "Do not introduce category-default hooks, scenes, demonstrations, visual devices, or creative patterns that are absent from selected_strategy merely because they are conventional for the product or service category. Preserve the selected strategy's distinctiveness in customer-facing execution without copying strategy metadata verbatim.",
  "Use audience and voice details only when they are present in the approved Brand Brain. Do not invent a script type, audience, or voice.",
  "Before drafting, compare three to five materially different strategic angles, not alternate phrasings of one hook; select the strongest defensible angle grounded in available brand truth, campaign objective, audience insight, differentiator, and channel behaviour.",
  "When selecting among those candidates, do not choose a category-default strategy when another supported candidate is non-generic and at least equally grounded in approved evidence; in that comparison, select the richer evidence-specific candidate and execute the final draft against it.",
  "Give each candidate a different primary strategic route. Where the supplied evidence supports them, use distinct route dimensions such as audience tension or decision context, product/brand truth, differentiator, and channel behaviour; do not invent a dimension that is absent from approved context.",
  "Changing only the hook, wording, shot order, platform treatment, or evidence anchor does not create a different route. Candidate angle labels must describe the genuinely different strategic premise so the candidates remain materially distinct under deterministic comparison.",
  "Return concise structured strategy metadata for verification: strategy_candidates (3-5 bounded candidate artefacts), selected_strategy (exactly one candidate), and selection_evidence with selected_candidate_index, one or more criteria from brand_truth/audience_relevance/differentiator/platform_fit, and a concise reviewable rationale of 8-500 characters. Do not include hidden reasoning or chain-of-thought.",
  "Reject stock hooks and category-default concepts when the supplied intelligence supports a more specific angle; keep a generic execution only when it is genuinely the strongest supported choice.",
  "Use the Concept section to name the selected angle and briefly express the customer truth behind its selected evidence in natural language. Evidence-anchor IDs (for example EA001) belong only in structured strategy metadata, never in final-draft sections. Do not paste the evidence catalog entry or reveal internal analysis or rejected angles.",
  "Transform supplied non-claim campaign objective and Brand Brain prose into original customer-facing expression. For each Hook, CTA, and Caption, write a new customer-facing sentence grounded in the selected evidence, then check that it does not substantially repeat source clauses or simply rearrange their words. Approved factual/product claims are the exception: retain their exact approved wording when used.",
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

function compileCampaignPrompt({ campaign, item, variant, brandContext, evidenceAnchors = [], executionBrief = "", suppliedAssets = [] }) {
  return [
    "Create reviewable campaign copy for the following existing draft. The approved Brand Brain is supplied separately in the compiled brand-context section; use only that selected context.",
    `Content item: ${item.name}`,
    `Platform: ${variant.platform}`,
    `Placement: ${variant.placement}`,
    "Use only facts supported by the campaign goal and Brand Brain. Do not invent product, health, commercial, availability, customer-result, or distribution claims.",
    renderEvidenceAnchorCatalog(evidenceAnchors),
    executionBrief ? "[CUSTOMER EXECUTION BRIEF]\nTreat this as temporary creative direction subordinate to approved Brand Brain, claims and safety rules.\n" + executionBrief : "",
    suppliedAssets.length ? "[SUPPLIED ASSETS]\nUse the authorized customer-owned media as creative source material where relevant. Do not infer facts from the asset or expose storage locations.\n" + suppliedAssets.map((asset) => asset.role + ":" + asset.asset_id).join("\n") : "",
    brandContext ? "Use the separately supplied approved Brand Brain context; do not substitute context from another brand." : "Brand Brain contains no approved context; do not add unsupported brand facts.",
    "Return useful copy for this destination. Keep it as a draft for founder review; do not imply approval, scheduling, or publication.",
  ].join("\n\n");
}

class CampaignVariantGenerationService {
  constructor({ repository, brandBrainRepository, mediaAssetRepository, generationJobService, generationBillingOrchestrator, scriptGenerator, branding, now = () => new Date() }) {
    Object.assign(this, { repository, brandBrainRepository, mediaAssetRepository, generationJobService, generationBillingOrchestrator, scriptGenerator, branding, now });
    if (!repository || !brandBrainRepository || !generationJobService || !generationBillingOrchestrator || !scriptGenerator) throw new TypeError("Campaign generation dependencies are required");
  }

  async generate({ authorization, campaignId, variantId, expectedCampaignVersion, idempotencyKey, executionMode = "ai", executionBrief = "", suppliedAssets = [] }) {
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
    const evidenceAnchors = deriveAllowableEvidenceAnchors(campaign.goal, brandContext);
    const authorizedAssets = [];
    for (const supplied of suppliedAssets) {
      const asset = await this.mediaAssetRepository?.findAuthorizedReference({
        assetId: supplied.asset_id,
        tenantId: authorization.tenant_id,
        projectId: authorization.project_id,
        brandId: authorization.brand_id,
        requiredRight: "campaign.preview",
        mediaKind: "image",
      });
      if (!asset || asset.source_kind !== "reference") {
        const { CampaignResourceError } = require("./errors");
        throw new CampaignResourceError();
      }
      authorizedAssets.push({ asset_id: asset.asset_id, role: supplied.role });
    }
    if (executionMode === "hybrid" && authorizedAssets.length === 0) {
      const { CampaignValidationError } = require("./errors");
      throw new CampaignValidationError();
    }
    if (executionMode === "human") {
      const { CampaignValidationError } = require("./errors");
      throw new CampaignValidationError();
    }
    const compiledPrompt = compileCampaignPrompt({ campaign, item: target.item, variant: target.variant, brandContext, evidenceAnchors, executionBrief, suppliedAssets: authorizedAssets });
    const job = await this.generationJobService.authorizeAndCreateJob({
      authorization,
      executionClass: "text.standard",
      requestCorrelationId: idempotencyKey,
      idempotencyKey,
      allowedScopes: ["generation:execute"],
      executionInput: {
        compiled_prompt: compiledPrompt,
        platform: target.variant.platform,
        goal: campaign.goal,
        additional_context: brandContext,
        execution_mode: executionMode,
        ...(executionBrief ? { execution_brief: executionBrief } : {}),
        ...(authorizedAssets.length ? { supplied_asset_refs: authorizedAssets.map((asset) => asset.role + ":" + asset.asset_id).join(",") } : {}),
      },
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
          evidenceAnchorCatalog: renderEvidenceAnchorCatalog(evidenceAnchors),
        },
      }),
    });
    const resolvedEvidence = resolveEvidenceAnchorReferences(generation.metadata, evidenceAnchors);
    if (!resolvedEvidence.ok) throw new CampaignStrategyValidationError(resolvedEvidence.reasons, { stage: "evidence_anchor_resolution", generationJobId: job.job_id });
    const strategyCheck = validateSelectedStrategy(resolvedEvidence.selected_strategy, { campaign, variant: target.variant, brandContext, candidates: resolvedEvidence.candidates, selection_evidence: generation.metadata?.selection_evidence });
    if (!strategyCheck.ok) throw new CampaignStrategyValidationError(strategyCheck.reasons, { stage: "selected_strategy_validation", generationJobId: job.job_id });
    const missingSections = findMissingSections(generation.text);
    if (missingSections.length > 0) {
      throw new GenerationIncompleteError({
        finishReason: generation.metadata?.finish_reason || null,
        missingSections,
        retryable: true,
        metadata: {
          ...generation.metadata,
          incomplete_reason: "MISSING_SECTIONS",
          required_sections_complete: false,
        },
      });
    }
    const draftCheck = validateDraftExecutionFidelity(generation.text, resolvedEvidence.selected_strategy);
    if (!draftCheck.ok) throw new CampaignStrategyValidationError(draftCheck.reasons, { stage: "final_draft_execution_fidelity", generationJobId: job.job_id });
    const strategyFidelityCheck = validateFinalDraftStrategyFidelity(generation.text, { campaign, brandContext, selected_strategy: resolvedEvidence.selected_strategy });
    if (!strategyFidelityCheck.ok) throw new CampaignStrategyValidationError(strategyFidelityCheck.reasons, { stage: "final_draft_strategy_fidelity", generationJobId: job.job_id });
    const content = { ...emptyContent(), body: generation.text, asset_refs: authorizedAssets };
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

module.exports = { CAMPAIGN_CREATIVE_BRIEF, CampaignStrategyValidationError, CampaignVariantGenerationService, compileCampaignPrompt, deriveAllowableEvidenceAnchors, findVariant, renderEvidenceAnchorCatalog, resolveEvidenceAnchorReferences, validateDraftExecutionFidelity, validateFinalDraftStrategyFidelity, validateSelectedStrategy };
