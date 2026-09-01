const { createHmac, randomBytes, randomUUID } = require("node:crypto");
const { parsePaidBetaSubmission } = require("./schema");

function hmac(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function canonicalSubmission(input, consentVersion) {
  return JSON.stringify({
    name: input.name,
    work_email: input.work_email,
    business_name: input.business_name,
    website_or_social_profile: input.website_or_social_profile,
    business_stage: input.business_stage,
    primary_marketing_challenge: input.primary_marketing_challenge,
    privacy_contact_consent: input.privacy_contact_consent,
    source: input.source,
    consent_version: consentVersion,
  });
}

class PaidBetaCaptureService {
  constructor({
    repository,
    config,
    now = () => new Date(),
    idFactory = randomUUID,
    referenceFactory = () => `pbi_${randomBytes(18).toString("base64url")}`,
  }) {
    if (!repository || !config?.enabled) {
      throw new TypeError("Paid-beta repository and enabled configuration are required");
    }
    this.repository = repository;
    this.config = config;
    this.now = now;
    this.idFactory = idFactory;
    this.referenceFactory = referenceFactory;
  }

  async consumeAttempt({ clientIdentity }) {
    const identity = typeof clientIdentity === "string" && clientIdentity
      ? clientIdentity
      : "unresolved-client";
    const now = this.now();
    const windowMs = this.config.rateLimitWindowSeconds * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    await this.repository.consumeRateLimit({
      client_hash: hmac(this.config.clientHashSecret, identity),
      window_started_at: windowStart.toISOString(),
      expires_at: new Date(windowStart.getTime() + windowMs).toISOString(),
      maximum_attempts: this.config.rateLimitMaxAttempts,
      now: now.toISOString(),
    });
  }

  async capture(value) {
    const input = parsePaidBetaSubmission(value);
    const timestamp = this.now().toISOString();
    const requestFingerprint = hmac(
      this.config.submissionHashSecret,
      canonicalSubmission(input, this.config.consentVersion)
    );
    const result = await this.repository.captureInterest({
      submission_identity: input.submission_id,
      request_fingerprint: requestFingerprint,
      interest: {
        interest_id: this.idFactory(),
        name: input.name,
        work_email: input.work_email,
        business_name: input.business_name,
        website_or_social_profile: input.website_or_social_profile,
        business_stage: input.business_stage,
        primary_marketing_challenge: input.primary_marketing_challenge,
        source: input.source,
        created_at: timestamp,
      },
      receipt: {
        receipt_id: this.idFactory(),
        reference_id: this.referenceFactory(),
        consent_version: this.config.consentVersion,
        consent_wording: this.config.consentWording,
        consented_at: timestamp,
        source: input.source,
        created_at: timestamp,
      },
    });
    return Object.freeze({ status: "received", reference_id: result.reference_id });
  }
}

module.exports = {
  PaidBetaCaptureService,
  canonicalSubmission,
  hmac,
};
