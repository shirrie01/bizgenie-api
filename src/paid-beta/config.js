const { activationFlag, requireActivationEnvironment } = require("../activation/config");
const { PaidBetaConfigurationError } = require("./errors");

const PAID_BETA_CONSENT_VERSION = "paid-beta-contact-v1";
const PAID_BETA_CONSENT_WORDING =
  "I agree that BizGenie may use these details to contact me about the paid beta.";

function boundedInteger(value, fallback, { name, minimum, maximum }) {
  const candidate = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new PaidBetaConfigurationError(`${name} is invalid`);
  }
  return candidate;
}

function secret(value, name) {
  if (typeof value !== "string" || value.length < 32) {
    throw new PaidBetaConfigurationError(`${name} must contain at least 32 characters`);
  }
  return value;
}

function loadPaidBetaCaptureConfig({ env = process.env } = {}) {
  const enabled = activationFlag(env, "PAID_BETA_CAPTURE_ENABLED");
  if (!enabled) return Object.freeze({ enabled: false });
  const environment = requireActivationEnvironment(env);
  const submissionHashSecret = secret(
    env.PAID_BETA_SUBMISSION_HASH_SECRET,
    "PAID_BETA_SUBMISSION_HASH_SECRET"
  );
  const clientHashSecret = secret(
    env.PAID_BETA_CLIENT_HASH_SECRET,
    "PAID_BETA_CLIENT_HASH_SECRET"
  );
  if (submissionHashSecret === clientHashSecret) {
    throw new PaidBetaConfigurationError("Paid-beta HMAC secrets must be distinct");
  }
  return Object.freeze({
    enabled: true,
    environment,
    submissionHashSecret,
    clientHashSecret,
    consentVersion: PAID_BETA_CONSENT_VERSION,
    consentWording: PAID_BETA_CONSENT_WORDING,
    rateLimitMaxAttempts: boundedInteger(env.PAID_BETA_RATE_LIMIT_MAX_ATTEMPTS, 5, {
      name: "PAID_BETA_RATE_LIMIT_MAX_ATTEMPTS",
      minimum: 1,
      maximum: 100,
    }),
    rateLimitWindowSeconds: boundedInteger(env.PAID_BETA_RATE_LIMIT_WINDOW_SECONDS, 900, {
      name: "PAID_BETA_RATE_LIMIT_WINDOW_SECONDS",
      minimum: 60,
      maximum: 86400,
    }),
  });
}

module.exports = {
  PAID_BETA_CONSENT_VERSION,
  PAID_BETA_CONSENT_WORDING,
  loadPaidBetaCaptureConfig,
};
