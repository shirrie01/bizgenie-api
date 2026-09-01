const {
  PaidBetaIdempotencyConflictError,
  PaidBetaRateLimitError,
} = require("./errors");

function copy(value) {
  return value ? structuredClone(value) : value;
}

class PaidBetaRepository {
  async initialize() {}
  async consumeRateLimit(_input) {
    throw new Error("PaidBetaRepository.consumeRateLimit is not implemented");
  }
  async captureInterest(_input) {
    throw new Error("PaidBetaRepository.captureInterest is not implemented");
  }
}

class InMemoryPaidBetaRepository extends PaidBetaRepository {
  constructor() {
    super();
    this.interestsByEmail = new Map();
    this.receiptsBySubmissionIdentity = new Map();
    this.rateLimits = new Map();
  }

  async consumeRateLimit({ client_hash, window_started_at, expires_at, maximum_attempts }) {
    const key = `${client_hash}\u0000${window_started_at}`;
    const current = this.rateLimits.get(key);
    if (current && current.attempt_count >= maximum_attempts) {
      throw new PaidBetaRateLimitError();
    }
    this.rateLimits.set(key, {
      client_hash,
      window_started_at,
      expires_at,
      attempt_count: (current?.attempt_count || 0) + 1,
    });
  }

  async captureInterest(input) {
    const existingReceipt = this.receiptsBySubmissionIdentity.get(input.submission_identity);
    if (existingReceipt) {
      if (existingReceipt.request_fingerprint !== input.request_fingerprint) {
        throw new PaidBetaIdempotencyConflictError();
      }
      return copy({ reference_id: existingReceipt.reference_id, replay: true });
    }

    let interest = this.interestsByEmail.get(input.interest.work_email);
    if (!interest) {
      interest = copy(input.interest);
      this.interestsByEmail.set(interest.work_email, interest);
    }
    const receipt = copy({
      ...input.receipt,
      interest_id: interest.interest_id,
      submission_identity: input.submission_identity,
      request_fingerprint: input.request_fingerprint,
    });
    this.receiptsBySubmissionIdentity.set(input.submission_identity, receipt);
    return copy({ reference_id: receipt.reference_id, replay: false });
  }
}

module.exports = {
  InMemoryPaidBetaRepository,
  PaidBetaRepository,
};
