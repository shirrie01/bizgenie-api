const express = require("express");
const { activationFlag, requireActivationEnvironment } = require("../activation/config");
const { createCorsMiddleware } = require("../activation/cors");
const { hmac } = require("../paid-beta/service");
const { defaultClientIdentity } = require("../paid-beta/router");
const { Lead } = require("./contract");
const { EarlyAccessRepository } = require("./repository");

const PATH = "/public/early-access-interest";
const WINDOW_SECONDS = 900;

function earlyAccessConfig(env) {
  if (!activationFlag(env, "EARLY_ACCESS_CAPTURE_ENABLED")) return null;
  const environment = requireActivationEnvironment(env);
  const secret = (name) => {
    const value = env[name];
    if (typeof value !== "string" || value.trim().length < 32) {
      throw new Error(`${name} must contain at least 32 characters`);
    }
    return value;
  };
  const retentionDays = Number(env.EARLY_ACCESS_RETENTION_DAYS);
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("EARLY_ACCESS_RETENTION_DAYS must be an approved whole number of days");
  }
  const clientSecret = secret("EARLY_ACCESS_CLIENT_HASH_SECRET");
  const submissionSecret = secret("EARLY_ACCESS_SUBMISSION_HASH_SECRET");
  if (clientSecret === submissionSecret) throw new Error("Early-access HMAC keys must be distinct");
  const origin = env.EARLY_ACCESS_SITE_ORIGIN;
  let url;
  try { url = new URL(origin); } catch {}
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url?.hostname);
  const allowedProtocol = url?.protocol === "https:" || (local && url.protocol === "http:");
  if (!allowedProtocol || url.origin !== origin || (local && environment !== "staging")) {
    throw new Error("EARLY_ACCESS_SITE_ORIGIN must be the exact HTTPS website origin");
  }
  return { retentionDays, clientSecret, submissionSecret, origin };
}

function createEarlyAccessRouter({ repository, config, now = () => new Date(), maxAttempts = 5 }) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use("/", createCorsMiddleware({
    config: { enabled: true, allowedOrigins: [config.origin] },
  }));
  const fail = (res, status, code, details) => res.status(status).json({
    error: { code, message: "Registration could not be accepted", ...(details ? { details } : {}) },
  });

  router.post("/", async (req, res, next) => {
    try {
      const start = Math.floor(now().getTime() / (WINDOW_SECONDS * 1000)) * WINDOW_SECONDS * 1000;
      const expiry = new Date(start + WINDOW_SECONDS * 1000);
      const hash = hmac(config.clientSecret, defaultClientIdentity(req));
      if (!await repository.allowAttempt(hash, new Date(start), expiry, maxAttempts)) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((expiry - now()) / 1000))));
        return fail(res, 429, "RATE_LIMITED");
      }
      if (!req.is("application/json")) return fail(res, 415, "UNSUPPORTED_MEDIA_TYPE");
      next();
    } catch (error) {
      next(error);
    }
  }, express.json({ limit: "16kb", inflate: false }), async (req, res, next) => {
    try {
      const result = Lead.safeParse(req.body);
      if (!result.success) {
        return fail(res, 400, "VALIDATION_ERROR", result.error.issues.map(({ path, code }) =>
          ({ path: path.join("."), code })));
      }
      const { client, submission_id, ...canonical } = result.data;
      const time = now();
      const reference = await repository.capture({
        input: result.data,
        fingerprint: hmac(config.submissionSecret, JSON.stringify(canonical)),
        now: time,
        expiresAt: new Date(time.getTime() + config.retentionDays * 86400000),
      });
      if (!reference) return fail(res, 409, "IDEMPOTENCY_KEY_CONFLICT");
      return res.status(202).json({ status: "received", reference_id: reference });
    } catch (error) {
      next(error);
    }
  });

  router.all("/", (_req, res) => fail(res.set("Allow", "POST, OPTIONS"), 405, "METHOD_NOT_ALLOWED"));
  router.use((error, _req, res, _next) => {
    if (error.type === "entity.too.large") return fail(res, 413, "PAYLOAD_TOO_LARGE");
    if (error.type === "entity.parse.failed") return fail(res, 400, "VALIDATION_ERROR", [{ path: "", code: "invalid_json" }]);
    if (error.type === "encoding.unsupported" || error.type === "charset.unsupported") {
      return fail(res, 415, "UNSUPPORTED_MEDIA_TYPE");
    }
    return fail(res, 503, "EARLY_ACCESS_UNAVAILABLE");
  });
  return router;
}

async function createEarlyAccessComposition({ env, pool }) {
  const config = earlyAccessConfig(env);
  if (!config) return null;
  const repository = new EarlyAccessRepository(pool);
  await repository.initialize();
  return { repository, router: createEarlyAccessRouter({ repository, config }) };
}

module.exports = { PATH, earlyAccessConfig, createEarlyAccessRouter, createEarlyAccessComposition };
