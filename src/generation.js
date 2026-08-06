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
  "^[ \\t]*(" +
    REQUIRED_SECTIONS.map(escapeRegExp).join("|") +
    ")(?:[ \\t]*\\([^\\r\\n]*\\))?[ \\t]*(?::[ \\t]*(.*))?$",
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

function findMissingSections(text) {
  if (!text) {
    return [...REQUIRED_SECTIONS];
  }

  const matches = [];
  SECTION_LABEL_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(SECTION_LABEL_PATTERN)) {
    const section = REQUIRED_SECTIONS.find(
      (required) => required.toLowerCase() === match[1].toLowerCase()
    );
    matches.push({
      section,
      index: match.index,
      end: match.index + match[0].length,
      inlineContent: match[2] || "",
    });
  }

  return REQUIRED_SECTIONS.filter((section) => {
    const matchIndex = matches.findIndex((match) => match.section === section);
    if (matchIndex === -1) {
      return true;
    }

    const match = matches[matchIndex];
    const nextMatch = matches.find((candidate) => candidate.index > match.index);
    const followingContent = text.slice(
      match.end,
      nextMatch ? nextMatch.index : text.length
    );

    return !(match.inlineContent + "\n" + followingContent).trim();
  });
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

function validateGenerationResponse(response, { model = DEFAULT_MODEL_NAME } = {}) {
  const candidate = response?.candidates?.[0];
  const text = assembleCandidateText(candidate);
  const missingSections = findMissingSections(text);
  const metadata = normalizeCompletionMetadata(response, candidate, model);
  const reason = incompleteReason({
    finishReason: metadata.finish_reason,
    text,
    missingSections,
  });

  metadata.incomplete_reason = reason;
  metadata.required_sections_complete = missingSections.length === 0;

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
    generationConfig: GENERATION_CONFIG,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: compiledPrompt }],
      },
    ],
  });

  return validateGenerationResponse(result.response, { model: modelName });
}

module.exports = {
  DEFAULT_LOCATION,
  DEFAULT_MODEL_NAME,
  GENERATION_CONFIG,
  GENERATION_INCOMPLETE_CODE,
  GENERATION_INCOMPLETE_MESSAGE,
  GenerationIncompleteError,
  REQUIRED_SECTIONS,
  assembleCandidateText,
  buildSystemInstruction,
  findMissingSections,
  generateScriptWithVertex,
  validateGenerationResponse,
};
