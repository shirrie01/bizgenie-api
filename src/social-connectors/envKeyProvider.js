// Encryption-key provider for the social token vault, from ONE environment variable (BG-LAUNCH-005). This is for disposable isolated staging only: a key in the process environment
// is not a key-management design, so production refuses it and requires an injected provider backed by the founder-approved KMS (not yet designed). The key is never logged,
// never returned by describe(), and the provider only knows the ONE configured key id: there is no rotation or old-key retention here, which is exactly why it is not for production.
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

function createEnvKeyProvider({ env = process.env } = {}) {
  const keyId = env.SOCIAL_TOKEN_KEY_ID;
  if (!ID.test(keyId || "")) throw new TypeError("SOCIAL_TOKEN_KEY_ID must be 3-64 letters, digits, dot, dash or underscore");
  if (env.BIZGENIE_ENVIRONMENT !== "staging") throw new TypeError("The environment key provider is only allowed in disposable isolated staging; production needs an approved key-management provider");
  const raw = env.SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64;
  if (typeof raw !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new TypeError("SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64 must be a base64-encoded 32-byte key");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.every((b) => b === key[0])) throw new TypeError("SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64 is not a usable 32-byte key");
  return Object.freeze({
    keyId,
    async getKey(id) { if (id !== keyId) throw new Error("unknown key id"); return Buffer.from(key); },
    toJSON() { return { keyId, provider: "environment-staging-only" }; },
  });
}

module.exports = { createEnvKeyProvider };
