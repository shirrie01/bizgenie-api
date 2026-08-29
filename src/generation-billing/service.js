const { createHash } = require("node:crypto");
const { InsufficientCreditsError } = require("../billing/errors");
const { freezeGenerationJob } = require("../generation-jobs");
const {
  GenerationBillingAuthorityError,
  GenerationBillingUnavailableError,
  GenerationCreditsUnavailableError,
} = require("./errors");

function financialIdempotencyKey(operation, jobId) {
  const digest = createHash("sha256")
    .update(`${operation}\u0000${jobId}`)
    .digest("hex");
  return `generation:${operation}:${digest}`;
}

function jobFingerprint(job) {
  return JSON.stringify(job);
}

function reservationError(error) {
  if (error instanceof InsufficientCreditsError) {
    return new GenerationCreditsUnavailableError();
  }
  if (error instanceof GenerationBillingAuthorityError) return error;
  return new GenerationBillingUnavailableError();
}

class GenerationBillingOrchestrator {
  constructor({
    billingService,
    qualifiesForRefund = () => false,
    logger = console,
  }) {
    if (!billingService) {
      throw new TypeError("A billing service is required");
    }
    if (typeof qualifiesForRefund !== "function") {
      throw new TypeError(
        "A server-owned refund qualification policy is required"
      );
    }
    this.billingService = billingService;
    this.qualifiesForRefund = qualifiesForRefund;
    this.logger = logger;
    this.states = new Map();
  }

  stateFor(value) {
    let job;
    try {
      job = freezeGenerationJob(value);
    } catch (_error) {
      throw new GenerationBillingAuthorityError();
    }

    const fingerprint = jobFingerprint(job);
    const existing = this.states.get(job.job_id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new GenerationBillingAuthorityError();
      }
      return existing;
    }

    const state = {
      job,
      fingerprint,
      reconstructionPromise: null,
      reservationPromise: null,
      executionPromise: null,
      debitPromise: null,
      releasePromise: null,
      refundPromise: null,
      debit: null,
    };
    this.states.set(job.job_id, state);
    return state;
  }

  requireExecutionClass(state, expectedExecutionClass) {
    if (
      typeof expectedExecutionClass !== "string" ||
      state.job.execution_class !== expectedExecutionClass
    ) {
      throw new GenerationBillingAuthorityError();
    }
  }

  reserve(state) {
    if (!state.reservationPromise) {
      const job = state.job;
      state.reservationPromise = this.billingService
        .createReservation({
          tenantId: job.tenant_id,
          projectId: job.project_id,
          generationId: job.job_id,
          executionId: job.request_correlation_id,
          transactionCorrelationId: job.request_correlation_id,
          executionClass: job.execution_class,
          idempotencyKey: financialIdempotencyKey("reserve", job.job_id),
        })
        .catch((error) => {
          state.reservationPromise = null;
          throw reservationError(error);
        });
    }
    return state.reservationPromise;
  }

  reconstruct(state) {
    if (!state.reconstructionPromise) {
      const job = state.job;
      state.reconstructionPromise = Promise.resolve()
        .then(() =>
          this.billingService.findGenerationBillingState({
            tenantId: job.tenant_id,
            projectId: job.project_id,
            generationId: job.job_id,
            executionId: job.request_correlation_id,
            transactionCorrelationId: job.request_correlation_id,
            executionClass: job.execution_class,
            reservationIdempotencyKey: financialIdempotencyKey(
              "reserve",
              job.job_id
            ),
            debitIdempotencyKey: financialIdempotencyKey("debit", job.job_id),
            releaseIdempotencyKey: financialIdempotencyKey(
              "release",
              job.job_id
            ),
          })
        )
        .then((durable) => {
          if (!durable?.reservation) {
            throw new GenerationBillingAuthorityError();
          }
          if (!state.reservationPromise) {
            state.reservationPromise = Promise.resolve(durable.reservation);
          }
          if (durable.settlement?.entry_type === "debit") {
            state.debit = durable.settlement;
            state.debitPromise = Promise.resolve(durable.settlement);
          } else if (
            durable.settlement?.entry_type === "reservation_release"
          ) {
            state.releasePromise = Promise.resolve(durable.settlement);
          }
          return durable;
        })
        .catch((error) => {
          state.reconstructionPromise = null;
          if (error instanceof GenerationBillingAuthorityError) throw error;
          throw new GenerationBillingUnavailableError();
        });
    }
    return state.reconstructionPromise;
  }

  executeOnce(state, operation) {
    if (!state.executionPromise) {
      state.executionPromise = Promise.resolve()
        .then(operation)
        .then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        );
    }
    return state.executionPromise;
  }

  debitOnce(state, reservation) {
    if (!state.debitPromise) {
      state.debitPromise = this.billingService
        .finalizeDebit({
          tenantId: state.job.tenant_id,
          reservationEntryId: reservation.ledger_entry_id,
          idempotencyKey: financialIdempotencyKey("debit", state.job.job_id),
        })
        .then((debit) => {
          state.debit = debit;
          return debit;
        })
        .catch((_error) => {
          state.debitPromise = null;
          throw new GenerationBillingUnavailableError();
        });
    }
    return state.debitPromise;
  }

  releaseOnce(state, reservation) {
    if (!state.releasePromise) {
      state.releasePromise = this.billingService
        .releaseReservation({
          tenantId: state.job.tenant_id,
          reservationEntryId: reservation.ledger_entry_id,
          idempotencyKey: financialIdempotencyKey("release", state.job.job_id),
        })
        .catch((error) => {
          state.releasePromise = null;
          this.logger.error?.("generation credit release failed", {
            job_id: state.job.job_id,
            code: error?.code || error?.name || "BILLING_RELEASE_ERROR",
          });
          throw new GenerationBillingUnavailableError();
        });
    }
    return state.releasePromise;
  }

  async beginExecution({ job, expectedExecutionClass, operation }) {
    if (typeof operation !== "function") {
      throw new TypeError("A generation execution operation is required");
    }
    const state = this.stateFor(job);
    this.requireExecutionClass(state, expectedExecutionClass);
    const reservation = await this.reserve(state);
    const outcome = await this.executeOnce(state, operation);

    if (!outcome.ok) {
      try {
        await this.releaseOnce(state, reservation);
      } catch (_releaseError) {
        // The original generation error remains the public contract. A retry
        // reuses the same failed outcome and attempts the idempotent release
        // again without invoking the provider.
      }
      throw outcome.error;
    }

    return outcome.value;
  }

  async settleSuccessfulExecution({ job }) {
    const state = this.stateFor(job);
    if (!state.reservationPromise || !state.executionPromise) {
      await this.reconstruct(state);
    }
    if (state.releasePromise) {
      throw new GenerationBillingAuthorityError();
    }
    const reservation = await state.reservationPromise;
    let outcome;
    if (state.executionPromise) {
      outcome = await state.executionPromise;
      if (!outcome.ok) throw new GenerationBillingAuthorityError();
    }

    await this.debitOnce(state, reservation);
    return outcome?.value;
  }

  async releaseFailedExecution({ job }) {
    const state = this.stateFor(job);
    if (!state.reservationPromise) {
      await this.reconstruct(state);
    }
    if (state.debit) {
      throw new GenerationBillingAuthorityError();
    }
    const reservation = await state.reservationPromise;
    return this.releaseOnce(state, reservation);
  }

  async execute(input) {
    await this.beginExecution(input);
    return this.settleSuccessfulExecution({ job: input.job });
  }

  async refundDebit({ job, debitEntryId, reason }) {
    const state = this.stateFor(job);
    if (
      !state.debit ||
      state.debit.ledger_entry_id !== debitEntryId ||
      state.debit.generation_id !== state.job.job_id
    ) {
      throw new GenerationBillingAuthorityError();
    }

    let qualifying;
    try {
      qualifying = await this.qualifiesForRefund({
        job: state.job,
        debit: state.debit,
        reason,
      });
    } catch (_error) {
      throw new GenerationBillingUnavailableError();
    }
    if (qualifying !== true) return null;

    if (!state.refundPromise) {
      state.refundPromise = this.billingService
        .refund({
          tenantId: state.job.tenant_id,
          debitEntryId: state.debit.ledger_entry_id,
          idempotencyKey: financialIdempotencyKey("refund", state.job.job_id),
        })
        .catch((_error) => {
          state.refundPromise = null;
          throw new GenerationBillingUnavailableError();
        });
    }
    return state.refundPromise;
  }
}

class UnconfiguredGenerationBillingOrchestrator {
  async beginExecution() {
    throw new GenerationBillingUnavailableError();
  }

  async settleSuccessfulExecution() {
    throw new GenerationBillingUnavailableError();
  }

  async releaseFailedExecution() {
    throw new GenerationBillingUnavailableError();
  }

  async execute() {
    throw new GenerationBillingUnavailableError();
  }

  async refundDebit() {
    throw new GenerationBillingUnavailableError();
  }
}

module.exports = {
  GenerationBillingOrchestrator,
  UnconfiguredGenerationBillingOrchestrator,
  financialIdempotencyKey,
};
