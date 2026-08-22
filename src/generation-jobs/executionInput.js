// The narrow, explicit allow-list of generation content fields a job may
// carry downstream. Everything else supplied by a customer request is
// dropped here, before it ever reaches a job record or the service
// execution boundary. In particular this list deliberately excludes any
// field that could carry provider, model, price, cost, secret, callback, or
// asset-location authority, and it excludes tenant/project/brand/user
// identity, all of which stay server-side and are never forwarded.
const EXECUTION_INPUT_ALLOWED_KEYS = Object.freeze([
  "compiled_prompt",
  "platform",
  "script_type",
  "audience",
  "intent_stage",
  "voice_style",
  "topic",
  "goal",
  "image_purpose",
  "aspect_ratio",
  "additional_context",
  "product_service_context",
]);

const MAX_VALUE_LENGTH = 8_000;

function sanitizedScalar(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  // Objects, arrays, functions, and anything else are rejected outright:
  // this keeps the payload flat and prevents nested structures (for
  // example a reference asset carrying a storage location, or a callback
  // object) from riding along inside an otherwise-innocent-looking field.
  return undefined;
}

function sanitizeExecutionInput(rawInput) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const sanitized = {};

  for (const key of EXECUTION_INPUT_ALLOWED_KEYS) {
    const value = sanitizedScalar(input[key]);
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

module.exports = {
  EXECUTION_INPUT_ALLOWED_KEYS,
  sanitizeExecutionInput,
};
