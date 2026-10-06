const { VertexAI } = require("@google-cloud/vertexai");
const { buildSystemRole, compilePrompt } = require("./prompts/compiler");

const PROVIDER = "vertex-ai";
const DEFAULT_LOCATION = "europe-west1";
const DEFAULT_MODEL_NAME = "gemini-2.5-flash";
const GENERATION_INCOMPLETE_CODE = "GENERATION_INCOMPLETE";
const GENERATION_INCOMPLETE_MESSAGE =
  "The model response ended before all required sections were completed";

const GENERATION_CONFIG = Object.freeze({
  maxOutputTokens: 4096,
  temperature: 0.7,
  topP: 0.9,
  candidateCount: 1,
});

const STRUCTURED_CAMPAIGN_MAX_OUTPUT_TOKENS = 8192;

const STRATEGY_RESPONSE_SCHEMA = Object.freeze({
  type: "OBJECT",
  properties: {
    strategy_candidates: {
      type: "ARRAY",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "OBJECT",
        properties: {
          angle: { type: "STRING" },
          evidence_anchors: { type: "ARRAY", items: { type: "STRING" } },
          specificity: { type: "STRING" },
          platform_execution: { type: "STRING" },
          approved_claims: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["angle", "evidence_anchors", "specificity", "platform_execution"],
      },
    },
    selected_strategy: {
      type: "OBJECT",
      properties: {
        angle: { type: "STRING" },
        evidence_anchors: { type: "ARRAY", items: { type: "STRING" } },
        specificity: { type: "STRING" },
        platform_execution: { type: "STRING" },
        approved_claims: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["angle", "evidence_anchors", "specificity", "platform_execution"],
    },
    selection_evidence: {
      type: "OBJECT",
      properties: {
        selected_candidate_index: { type: "INTEGER" },
        criteria: {
          type: "ARRAY",
          items: { type: "STRING", enum: ["brand_truth", "audience_relevance", "differentiator", "platform_fit"] },
        },
        rationale: { type: "STRING" },
      },
      required: ["selected_candidate_index", "criteria", "rationale"],
    },
  },
  required: ["strategy_candidates", "selected_strategy", "selection_evidence"],
});

const DRAFT_RESPONSE_SCHEMA = Object.freeze({
  type: "OBJECT",
  properties: {
    draft_text: { type: "STRING" },
  },
  required: ["draft_text"],
});

const REQUIRED_SECTIONS = Object.freeze([
  "Hook",
  "Concept",
  "Script",
  "CTA",
  "Caption",
  "Hashtags",
  "Filming instructions",
]);

const NON_RETRYABLE_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^()|[\]\\{}$]/g, "\\$&");
}

const SECTION_LABEL_PATTERN = new RegExp(
  "^[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\*\\*|__)?(" +
    REQUIRED_SECTIONS.map(escapeRegExp).join("|") +
    ")(?:[ \\t]*\\([^\\r\\n]*\\))?[ \\t]*(?::)?(?:\\*\\*|__)?[ \\t]*(?::[ \\t]*(.*))?$",
  "gim"
);

class GenerationIncompleteError extends Error {
  constructor({ finishReason = null, missingSections = [], retryable, metadata }) {
    super(GENERATION_INCOMPLETE_MESSAGE);
    this.name = "GenerationIncompleteError";
    this.code = GENERATION_INCOMPLETE_CODE;
    this.details = {
      finish_reason: finishReason,
      missing_sections: [...missingSections],
      retryable,
    };
    this.metadata = metadata;
  }
}

function buildSystemInstruction(branding) {
  return buildSystemRole(branding.appName);
}

function assembleCandidateText(candidate) {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function extractSections(text) {
  const originalSource = String(text || "");
  const inlineBoundaryPattern = new RegExp(
    "([ \\t]+)(?=(?:\\*\\*|__)?(?:" +
      REQUIRED_SECTIONS.map(escapeRegExp).join("|") +
      ")(?:[ \\t]*\\([^\\r\\n]*\\))?[ \\t]*:(?:\\*\\*|__)?[ \\t]*)",
    "gi"
  );
  const source = originalSource.replace(inlineBoundaryPattern, "\n");
  const matches = [];
  SECTION_LABEL_PATTERN.lastIndex = 0;

  for (const match of source.matchAll(SECTION_LABEL_PATTERN)) {
    const section = REQUIRED_SECTIONS.find(
      (required) => required.toLowerCase() === match[1].toLowerCase()
    );
    if (!section) continue;

    matches.push({
      section,
      index: match.index,
      end: match.index + match[0].length,
      inlineContent: match[2] || "",
    });
  }

  const sections = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = match.section.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(sections, key)) continue;

    const nextMatch = matches[index + 1];
    const followingContent = source.slice(
      match.end,
      nextMatch ? nextMatch.index : source.length
    );

    sections[key] = (match.inlineContent + "\n" + followingContent).trim();
  }

  return sections;
}

function findMissingSections(text) {
  if (!text) {
    return [...REQUIRED_SECTIONS];
  }

  const sections = extractSections(text);
  return REQUIRED_SECTIONS.filter(
    (section) => !String(sections[section.toLowerCase()] || "").trim()
  );
}

function safeTokenCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeCompletionMetadata(response, candidate, model) {
  const usage = response?.usageMetadata || {};

  return {
    provider: PROVIDER,
    model,
    finish_reason:
      typeof candidate?.finishReason === "string"
        ? candidate.finishReason
        : null,
    prompt_block_reason:
      typeof response?.promptFeedback?.blockReason === "string"
        ? response.promptFeedback.blockReason
        : null,
    prompt_token_count: safeTokenCount(usage.promptTokenCount),
    output_token_count: safeTokenCount(usage.candidatesTokenCount),
    total_token_count: safeTokenCount(usage.totalTokenCount),
    required_sections_complete: false,
    incomplete_reason: null,
  };
}

function incompleteReason({ finishReason, text, missingSections }) {
  if (finishReason === "MAX_TOKENS") {
    return "TOKEN_EXHAUSTION";
  }
  if (!text) {
    return "EMPTY_OUTPUT";
  }
  if (finishReason && finishReason !== "STOP") {
    return "PROVIDER_STOP";
  }
  if (missingSections.length > 0) {
    return "MISSING_SECTIONS";
  }
  return null;
}

function isRetryable({ finishReason, promptBlockReason }) {
  return !(
    NON_RETRYABLE_REASONS.has(finishReason) ||
    NON_RETRYABLE_REASONS.has(promptBlockReason)
  );
}

function parseStructuredEnvelope(rawText, mode) {
  let envelope;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!envelope || typeof envelope !== "object") return null;

  if (mode === "strategy") {
    if (!Array.isArray(envelope.strategy_candidates) || !envelope.selected_strategy || !envelope.selection_evidence) return null;
    return envelope;
  }

  if (mode === "draft") {
    if (typeof envelope.draft_text !== "string") return null;
    return envelope;
  }

  return null;
}

function validateGenerationResponse(response, { model = DEFAULT_MODEL_NAME, structuredMode = null } = {}) {
  const candidate = response?.candidates?.[0];
  const rawText = assembleCandidateText(candidate);
  const envelope = structuredMode ? parseStructuredEnvelope(rawText, structuredMode) : null;
  const text = structuredMode === "draft" ? (envelope?.draft_text || "") : structuredMode === "strategy" ? rawText : rawText;
  const missingSections = structuredMode === "strategy" ? [] : findMissingSections(text);
  const metadata = normalizeCompletionMetadata(response, candidate, model);
  const reason = incompleteReason({
    finishReason: metadata.finish_reason,
    text,
    missingSections,
  });

  metadata.incomplete_reason = reason;
  metadata.required_sections_complete = structuredMode === "strategy" ? true : missingSections.length === 0;

  if (structuredMode === "strategy" && envelope) {
    metadata.strategy_candidates = envelope.strategy_candidates;
    metadata.selected_strategy = envelope.selected_strategy;
    metadata.selection_evidence = envelope.selection_evidence;
  }

  if (reason) {
    throw new GenerationIncompleteError({
      finishReason: metadata.finish_reason,
      missingSections,
      retryable: isRetryable({
        finishReason: metadata.finish_reason,
        promptBlockReason: metadata.prompt_block_reason,
      }),
      metadata,
    });
  }

  return { text, metadata };
}

async function generateScriptWithVertex(
  userContext,
  {
    branding,
    promptOptions = {},
    projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.GCP_PROJECT,
    location = process.env.VERTEX_LOCATION || DEFAULT_LOCATION,
    modelName = process.env.VERTEX_MODEL || DEFAULT_MODEL_NAME,
    VertexAIClient = VertexAI,
  } = {}
) {
  if (!projectId) {
    throw new Error("Missing GOOGLE_CLOUD_PROJECT environment variable");
  }

  const vertexAI = new VertexAIClient({ project: projectId, location });
  const structuredMode = promptOptions.structuredMode || (
    typeof promptOptions.campaignInstructions === "string" && Boolean(promptOptions.campaignInstructions.trim())
      ? "strategy"
      : null
  );
  if (structuredMode && !["strategy", "draft"].includes(structuredMode)) {
    throw new TypeError("Unsupported structured generation mode");
  }
  const compiledPrompt = compilePrompt({
    ...promptOptions,
    appName: branding.appName,
    userContext,
  });
  const model = vertexAI.getGenerativeModel({
    model: modelName,
    systemInstruction: {
      role: "system",
      parts: [{ text: buildSystemInstruction(branding) }],
    },
    generationConfig: structuredMode
      ? {
          ...GENERATION_CONFIG,
          maxOutputTokens: STRUCTURED_CAMPAIGN_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          responseSchema: structuredMode === "strategy" ? STRATEGY_RESPONSE_SCHEMA : DRAFT_RESPONSE_SCHEMA,
        }
      : GENERATION_CONFIG,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: compiledPrompt }],
      },
    ],
  });

  return validateGenerationResponse(result.response, { model: modelName, structuredMode });
}

module.exports = {
  DEFAULT_LOCATION,
  DEFAULT_MODEL_NAME,
  GENERATION_CONFIG,
  GENERATION_INCOMPLETE_CODE,
  GENERATION_INCOMPLETE_MESSAGE,
  GenerationIncompleteError,
  REQUIRED_SECTIONS,
  STRATEGY_RESPONSE_SCHEMA,
  STRUCTURED_CAMPAIGN_MAX_OUTPUT_TOKENS,
  assembleCandidateText,
  buildSystemInstruction,
  extractSections,
  findMissingSections,
  generateScriptWithVertex,
  validateGenerationResponse,
};
