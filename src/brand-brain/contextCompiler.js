const DEFAULT_BRAND_CONTEXT_MAX_CHARS = 8000;

function hasText(value) {
  return typeof value === "string" && value.length > 0;
}

function line(label, value, { priority, order, required = false } = {}) {
  if (!hasText(value)) {
    return null;
  }
  return { text: `${label}:\n${value}`, priority, order, required };
}

function listLine(label, values, options) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  return line(label, values.map((value) => `- ${value}`).join("\n"), options);
}

function visualContextIsUseful(generationContext = {}) {
  const platform = String(generationContext.platform || "").toLowerCase();
  const scriptType = String(
    generationContext.scriptType || generationContext.script_type || ""
  ).toLowerCase();
  return ["instagram", "tiktok"].includes(platform) || scriptType === "ugc";
}

function candidateSections(record, generationContext) {
  const identity = record.identity || {};
  const voice = record.voice || {};
  const audience = record.audience || {};
  const commercial = record.commercial || {};
  const competitors = record.competitors || {};
  const visual = record.visual || {};

  const sections = [
    line("Brand", record.name, { priority: 1, order: 1, required: true }),
    line("Description", identity.description, { priority: 1, order: 2 }),
    line("Mission", identity.mission, { priority: 1, order: 3 }),
    line("Vision", identity.vision, { priority: 1, order: 4 }),
    listLine("Values", identity.values, { priority: 1, order: 5 }),
    line("Positioning", identity.positioning, { priority: 1, order: 6 }),
    line("Tone", voice.tone, { priority: 2, order: 7 }),
    line("Writing style", voice.writing_style, { priority: 2, order: 8 }),
    line("Personality", voice.personality, { priority: 2, order: 9 }),
    listLine("Preferred terms", voice.preferred_terms, {
      priority: 2,
      order: 10,
    }),
    listLine("Do not say", voice.prohibited_terms, {
      priority: 2,
      order: 11,
      required: true,
    }),
    line("Audience", audience.summary, { priority: 3, order: 12 }),
    listLine("Audience pain points", audience.pain_points, {
      priority: 3,
      order: 13,
    }),
    listLine("Audience goals", audience.goals, { priority: 3, order: 14 }),
    listLine("Audience objections", audience.objections, {
      priority: 3,
      order: 15,
    }),
    listLine("Buying triggers", audience.buying_triggers, {
      priority: 3,
      order: 16,
    }),
    listLine("Differentiators", commercial.differentiators, {
      priority: 4,
      order: 17,
    }),
    listLine("Approved claims", commercial.approved_claims, {
      priority: 5,
      order: 18,
    }),
    listLine("Prohibited claims", commercial.prohibited_claims, {
      priority: 5,
      order: 19,
      required: true,
    }),
    line("CTA preference", commercial.primary_cta, {
      priority: 6,
      order: 20,
    }),
    listLine("Competitors", competitors.names, { priority: 7, order: 21 }),
    line("Competitor notes", competitors.notes, { priority: 7, order: 22 }),
  ].filter(Boolean);

  if (visualContextIsUseful(generationContext)) {
    sections.push(
      ...[
        listLine("Brand colours", visual.colours, { priority: 8, order: 23 }),
        listLine("Brand fonts", visual.fonts, { priority: 8, order: 24 }),
        line("Photography style", visual.photography_style, {
          priority: 8,
          order: 25,
        }),
      ].filter(Boolean)
    );
  }

  return sections;
}

function outputLength(sections) {
  return ["[BRAND BRAIN]", ...sections.map(({ text }) => text)].join("\n\n")
    .length;
}

function compileBrandContext(
  record,
  {
    maxChars = DEFAULT_BRAND_CONTEXT_MAX_CHARS,
    generationContext = {},
  } = {}
) {
  if (!record) {
    return "";
  }

  const candidates = candidateSections(record, generationContext);
  const selected = candidates.filter(({ required }) => required);

  for (const candidate of [...candidates]
    .filter(({ required }) => !required)
    .sort((a, b) => a.priority - b.priority || a.order - b.order)) {
    if (outputLength([...selected, candidate]) <= maxChars) {
      selected.push(candidate);
    }
  }

  const ordered = selected.sort((a, b) => a.order - b.order);
  const output = ["[BRAND BRAIN]", ...ordered.map(({ text }) => text)].join(
    "\n\n"
  );

  if (output.length > maxChars) {
    throw new RangeError(
      "Brand Brain context budget is too small for required governance content"
    );
  }

  return output;
}

module.exports = {
  DEFAULT_BRAND_CONTEXT_MAX_CHARS,
  compileBrandContext,
  visualContextIsUseful,
};
