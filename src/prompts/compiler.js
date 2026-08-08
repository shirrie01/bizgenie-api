const instagram = require("./platforms/instagram");
const linkedin = require("./platforms/linkedin");
const tiktok = require("./platforms/tiktok");
const problemSolution = require("./scriptTypes/problemSolution");
const comparison = require("./scriptTypes/comparison");
const ugc = require("./scriptTypes/ugc");
const b2b = require("./audiences/b2b");
const consumer = require("./audiences/consumer");
const professional = require("./voices/professional");
const bold = require("./voices/bold");
const friendly = require("./voices/friendly");
const cold = require("./intent/cold");
const awareness = require("./intent/awareness");
const customer = require("./intent/customer");
const loyalty = require("./intent/loyalty");
const qualityRules = require("./quality/qualityRules");
const outputContract = require("./quality/outputContract");

const PLATFORM_RULES = Object.freeze({ instagram, linkedin, tiktok });
const SCRIPT_TYPE_RULES = Object.freeze({
  problemsolution: problemSolution,
  comparison,
  ugc,
});
const AUDIENCE_RULES = Object.freeze({ b2b, consumer });
const VOICE_RULES = Object.freeze({ professional, bold, friendly });
const INTENT_RULES = Object.freeze({ cold, awareness, customer, loyalty });

const BRAND_CONTEXT_PLACEHOLDER = Object.freeze([
  "Brand context is not available in this version.",
  "This section is the documented injection point for future Brand Brain context.",
]);

function normaliseOption(value) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim().toLowerCase().replace(/[\s_-]+/g, "") || null;
}

function selectRules(options, value) {
  const key = normaliseOption(value);
  return key ? options[key] : undefined;
}

function section(label, content) {
  return ["[" + label + "]", ...content].join("\n");
}

function buildSystemRole(appName = "BizGenie") {
  return "You are " + appName + " Phase 1 script generation engine.";
}

function selectedSection(label, options, value) {
  const rules = selectRules(options, value);
  return rules ? section(label, rules) : null;
}

function compilePrompt({
  appName = "BizGenie",
  platform,
  scriptType,
  audience,
  intent,
  voice,
  brandContext = "",
  userContext = "",
} = {}) {
  const sections = [
    section("SYSTEM ROLE", [
      buildSystemRole(appName),
    ]),
    selectedSection("PLATFORM RULES", PLATFORM_RULES, platform),
    selectedSection("SCRIPT TYPE RULES", SCRIPT_TYPE_RULES, scriptType),
    selectedSection("AUDIENCE RULES", AUDIENCE_RULES, audience),
    selectedSection("INTENT RULES", INTENT_RULES, intent),
    selectedSection("VOICE RULES", VOICE_RULES, voice),
    typeof brandContext === "string" && brandContext
      ? brandContext
      : section("BRAND CONTEXT", BRAND_CONTEXT_PLACEHOLDER),
    section("USER CONTEXT", [
      typeof userContext === "string" ? userContext : "",
    ]),
    section("QUALITY RULES", qualityRules),
    section("OUTPUT CONTRACT", outputContract),
  ];

  return sections.filter(Boolean).join("\n\n");
}

module.exports = {
  BRAND_CONTEXT_PLACEHOLDER,
  buildSystemRole,
  compilePrompt,
};
