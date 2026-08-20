const { createClient } = require("@supabase/supabase-js");
const {
  AuthenticationRequiredError,
  createCustomerActorFromVerifiedIdentity,
} = require("../authorization");

const DEFAULT_AUDIENCE = "authenticated";

class CustomerAuthenticationConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CustomerAuthenticationConfigurationError";
    this.code = "CUSTOMER_AUTHENTICATION_CONFIGURATION_ERROR";
  }
}

class CustomerTokenVerifier {
  verifyAccessToken(_accessToken) {
    throw new Error("CustomerTokenVerifier.verifyAccessToken is not implemented");
  }
}

function authenticationRequired() {
  return new AuthenticationRequiredError();
}

function normalizedProjectUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CustomerAuthenticationConfigurationError(
      "SUPABASE_URL is required when customer authentication is configured"
    );
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new CustomerAuthenticationConfigurationError(
      "SUPABASE_URL must be a valid HTTPS URL"
    );
  }
}

function validAudience(value, expectedAudience) {
  if (Array.isArray(value)) {
    return value.includes(expectedAudience);
  }
  return value === expectedAudience;
}

class SupabaseCustomerTokenVerifier extends CustomerTokenVerifier {
  constructor({
    supabaseClient,
    projectUrl,
    audience = DEFAULT_AUDIENCE,
    now = () => new Date(),
  }) {
    super();
    if (!supabaseClient?.auth || typeof supabaseClient.auth.getClaims !== "function") {
      throw new TypeError("A Supabase Auth client with getClaims is required");
    }
    this.supabaseClient = supabaseClient;
    this.expectedIssuer = `${normalizedProjectUrl(projectUrl)}/auth/v1`;
    this.audience = audience;
    this.now = now;
  }

  async verifyAccessToken(accessToken) {
    if (typeof accessToken !== "string" || !accessToken.trim()) {
      throw authenticationRequired();
    }

    let result;
    try {
      result = await this.supabaseClient.auth.getClaims(accessToken);
    } catch {
      throw authenticationRequired();
    }

    const claims = result?.data?.claims;
    const expiresAt = claims?.exp;
    const nowSeconds = Math.floor(this.now().getTime() / 1000);

    if (
      result?.error ||
      !claims ||
      claims.iss !== this.expectedIssuer ||
      !validAudience(claims.aud, this.audience) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= nowSeconds
    ) {
      throw authenticationRequired();
    }

    return createCustomerActorFromVerifiedIdentity({
      verifiedAuthUserId: claims.sub,
    });
  }
}

class UnconfiguredCustomerTokenVerifier extends CustomerTokenVerifier {
  async verifyAccessToken() {
    throw authenticationRequired();
  }
}

function createSupabaseCustomerTokenVerifierFromEnv({
  env = process.env,
  createClientImpl = createClient,
  now,
} = {}) {
  const projectUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;

  if (!projectUrl && !publishableKey) {
    return new UnconfiguredCustomerTokenVerifier();
  }
  if (!projectUrl || !publishableKey) {
    throw new CustomerAuthenticationConfigurationError(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together"
    );
  }

  const normalizedUrl = normalizedProjectUrl(projectUrl);
  const client = createClientImpl(normalizedUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return new SupabaseCustomerTokenVerifier({
    supabaseClient: client,
    projectUrl: normalizedUrl,
    now,
  });
}

module.exports = {
  CustomerAuthenticationConfigurationError,
  CustomerTokenVerifier,
  DEFAULT_AUDIENCE,
  SupabaseCustomerTokenVerifier,
  UnconfiguredCustomerTokenVerifier,
  createSupabaseCustomerTokenVerifierFromEnv,
  normalizedProjectUrl,
};
