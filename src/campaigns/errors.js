class CampaignError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
  }
}

class CampaignValidationError extends CampaignError {
  constructor() { super("VALIDATION_ERROR", "Request validation failed"); }
}
class CampaignResourceError extends CampaignError {
  constructor() { super("RESOURCE_NOT_AVAILABLE", "The requested resource is not available"); }
}
class CampaignVersionError extends CampaignError {
  constructor() { super("VERSION_CONFLICT", "The campaign changed; reload before continuing"); }
}
class CampaignIdempotencyError extends CampaignError {
  constructor() { super("IDEMPOTENCY_KEY_CONFLICT", "This request key was already used for different intent"); }
}
class CampaignTransitionError extends CampaignError {
  constructor(code = "INVALID_TRANSITION") {
    const messages = {
      INVALID_TRANSITION: "This action is not available in the current state",
      CAMPAIGN_ARCHIVED: "Restore this campaign or content item before continuing",
      VARIANT_ALREADY_EXISTS: "This content item already has that destination variant",
      MANUAL_ATTEMPT_PENDING: "Resolve the existing manual publication attempt first",
      APPROVAL_REQUIRED: "Approve the current revision before continuing",
      PREVIEW_REQUIRED: "Review the current platform preview before approving",
      CONTENT_INCOMPLETE: "Complete the content before submitting for review",
      SCHEDULE_INVALID: "Choose a valid future schedule with an explicit timezone",
      PUBLICATION_EVIDENCE_INVALID: "Confirm the actual publication details before continuing",
      CAMPAIGN_LIMIT_REACHED: "This campaign has reached its content limit",
    };
    super(code, messages[code] || messages.INVALID_TRANSITION);
  }
}
class CampaignPersistenceError extends CampaignError {
  constructor() { super("CAMPAIGN_TEMPORARILY_UNAVAILABLE", "Campaign state is temporarily unavailable", true); }
}

module.exports = {
  CampaignError,
  CampaignValidationError,
  CampaignResourceError,
  CampaignVersionError,
  CampaignIdempotencyError,
  CampaignTransitionError,
  CampaignPersistenceError,
};
