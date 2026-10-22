const {
  ActivationConfigurationError,
  activationFlag,
  requireActivationEnvironment,
} = require("./config");

const ALLOWED_METHODS = "GET,POST,PUT,OPTIONS";
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
    const mediaDelivery = /^\/customer\/campaigns\/[a-f0-9-]{36}\/variants\/[a-f0-9-]{36}\/revisions\/[a-f0-9-]{36}\/assets\/[a-f0-9-]{36}\/preview$/.test(req.path);
    const methods = mediaDelivery ? new Set(["GET", "HEAD", "OPTIONS"]) : allowedMethods;
    const headers = mediaDelivery ? new Set([...allowedHeaders, "range"]) : allowedHeaders;
    if (
      !methods.has(requestedMethod || req.method) ||
      requestedHeaders.some((header) => !headers.has(header))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", mediaDelivery ? "GET,HEAD,OPTIONS" : ALLOWED_METHODS);
    res.set("Access-Control-Allow-Headers", mediaDelivery ? ALLOWED_HEADERS + ",range" : ALLOWED_HEADERS);
    if (mediaDelivery) res.set("Access-Control-Expose-Headers", "Content-Length,Content-Range,Accept-Ranges");
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
