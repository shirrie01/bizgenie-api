const {
  ActivationConfigurationError,
  activationFlag,
  requireActivationEnvironment,
} = require("./config");

const ALLOWED_METHODS = "GET,POST,OPTIONS";
const ALLOWED_HEADERS = "authorization,content-type";
const allowedMethods = new Set(ALLOWED_METHODS.split(","));
const allowedHeaders = new Set(ALLOWED_HEADERS.split(","));

function parseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ActivationConfigurationError("CORS origin is invalid");
  }
  if (
    !new Set(["http:", "https:"]).has(url.protocol) ||
    url.origin !== value ||
    value === "*"
  ) {
    throw new ActivationConfigurationError("CORS origin is invalid");
  }
  return url.origin;
}

function loadCorsConfig({ env = process.env } = {}) {
  const enabled = activationFlag(env, "CORS_ENABLED");
  if (!enabled) return Object.freeze({ enabled: false, allowedOrigins: [] });
  requireActivationEnvironment(env);
  if (typeof env.CORS_ALLOWED_ORIGINS !== "string") {
    throw new ActivationConfigurationError("CORS_ALLOWED_ORIGINS is required");
  }
  const values = env.CORS_ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  if (!values.length || values.some((value) => !value)) {
    throw new ActivationConfigurationError("CORS_ALLOWED_ORIGINS is invalid");
  }
  const allowedOrigins = [...new Set(values.map(parseOrigin))];
  return Object.freeze({ enabled: true, allowedOrigins: Object.freeze(allowedOrigins) });
}

function createCorsMiddleware({ config }) {
  const allowed = new Set(config.allowedOrigins);
  return function strictCors(req, res, next) {
    const origin = req.header("origin");
    if (!origin) return next();
    res.vary("Origin");
    if (!config.enabled || !allowed.has(origin)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const requestedMethod = req.header("access-control-request-method");
    const requestedHeaders = (req.header("access-control-request-headers") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      !allowedMethods.has(requestedMethod || req.method) ||
      requestedHeaders.some((header) => !allowedHeaders.has(header))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.set("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.status(204).end();
    return next();
  };
}

module.exports = {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  createCorsMiddleware,
  loadCorsConfig,
};
