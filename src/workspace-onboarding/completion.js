const { PLACEHOLDER_BRAND_NAMES } = require("./schema");
const { OnboardingIncompleteError } = require("./errors");
const normalizedName = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
function isPlaceholderName(value) {
  const name = normalizedName(value);
  return !name || PLACEHOLDER_BRAND_NAMES.some(p => normalizedName(p) === name);
}
function businessMissing(brain) {
  const missing = [];
  if (isPlaceholderName(brain?.name)) missing.push("business_name");
  const description = typeof brain?.identity?.description === "string" ? brain.identity.description.trim() : "";
  if (!description || description.toLowerCase().startsWith("customer-provided website or profile:") || /^(?:https?:\/\/|www\.)\S+$/i.test(description)) missing.push("description");
  return missing;
}
function assertBusinessCompletion(brain) {
  const missing = businessMissing(brain);
  if (missing.length) throw new OnboardingIncompleteError(missing);
}
module.exports = { businessMissing, isPlaceholderName, assertBusinessCompletion };
