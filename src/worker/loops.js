// Background loops for the premium composition (BG-LAUNCH-001). They CALL the existing services and add no business rule: credits, idempotency, fences, tenancy
// (the owner's membership is re-checked inside claim), rights and authority all stay in FencedGenerationWorker and DurableSocialPublishing. A loop only decides WHICH
// durable record to hand to which service method, in a bounded batch, and treats the services' own "not now" answers as normal.
const EXPECTED = new Set(["EXECUTION_RECONCILIATION_REQUIRED", "EXECUTION_BUSY", "EXECUTION_FENCE_STALE", "RESOURCE_NOT_AVAILABLE", "WORKFLOW_CANCELLED", "SCHEDULE_NOT_DUE", "PUBLICATION_RECONCILIATION_REQUIRED", "DISPATCH_FENCE_STALE", "CONNECTION_UNAVAILABLE", "PUBLICATION_AUTHORITY_STALE"]);
const codeOf = (error) => String(error?.code || error?.name || "UNKNOWN");

class GenerationLoop {
  // staleClaimMs: a job still "claimed" (the provider boundary was never crossed) for this long belonged to a worker that died; it is re-claimed with a NEW fence, so the dead
  // worker can never complete it. reconcile polling backs off per job (minBackoffMs .. maxBackoffMs); a job in recovery longer than stuckAfterMs is reported, never auto-failed.
  constructor({ quoteService, worker, limit = 5, staleClaimMs = 120000, minBackoffMs = 5000, maxBackoffMs = 60000, stuckAfterMs = 6 * 3600000, now = () => new Date(), logger = console }) {
    Object.assign(this, { quotes: quoteService, worker, limit, staleClaimMs, minBackoffMs, maxBackoffMs, stuckAfterMs, now, logger });
    this.backoff = new Map(); this.name = "generation";
  }
  async rows(sql, params) { return (await this.quotes.billing.pool.query(sql, params)).rows; }
  note(result, error) { const c = codeOf(error); if (EXPECTED.has(c)) result.skipped += 1; else { result.errors.push(c); this.logger.warn?.("generation worker error", c); } }
  async execute(jobId, result, { resume = false } = {}) {
    try {
      const claim = await this.worker.claim(jobId, { recoverBeforeCall: resume });
      const outcome = await this.worker.run(claim);
      if (outcome?.status === "succeeded") result.succeeded += 1; else if (outcome?.status === "failed") result.failed += 1; else if (outcome?.status === "recovery_required") result.pending += 1;
      if (resume) result.resumed += 1;
    } catch (error) { this.note(result, error); }
  }
  async tick() {
    const result = { loop: this.name, succeeded: 0, failed: 0, pending: 0, resumed: 0, reconciled: 0, stillPending: 0, stuck: 0, skipped: 0, errors: [] };
    const t = this.now().getTime();
    for (const r of await this.rows("select job_id from public.generation_execution_claims where state='queued' order by updated_at, job_id limit $1", [this.limit])) await this.execute(r.job_id, result);
    for (const r of await this.rows("select job_id from public.generation_execution_claims where state='claimed' and updated_at < $1 order by updated_at, job_id limit $2", [new Date(t - this.staleClaimMs), this.limit])) await this.execute(r.job_id, result, { resume: true });
    const waiting = await this.rows("select job_id, updated_at from public.generation_execution_claims where state in ('calling','recovery_required') order by updated_at, job_id limit $1", [this.limit * 4]);
    const live = new Set(waiting.map((r) => r.job_id)); for (const id of this.backoff.keys()) if (!live.has(id)) this.backoff.delete(id);
    let polled = 0;
    for (const r of waiting) {
      if (t - new Date(r.updated_at).getTime() > this.stuckAfterMs) result.stuck += 1;
      const state = this.backoff.get(r.job_id) || { next: 0, wait: this.minBackoffMs };
      if (polled >= this.limit || state.next > t) continue; polled += 1;
      try {
        const claim = await this.worker.reconciliationClaim(r.job_id); const outcome = await this.worker.reconcile(claim);
        result.reconciled += 1; this.backoff.delete(r.job_id); void outcome;
      } catch (error) {
        if (codeOf(error) === "EXECUTION_RECONCILIATION_REQUIRED") { result.stillPending += 1; this.backoff.set(r.job_id, { next: t + state.wait, wait: Math.min(this.maxBackoffMs, Math.round(state.wait * 1.6)) }); } else this.note(result, error);
      }
    }
    if (result.stuck) this.logger.warn?.("generation jobs in recovery beyond the alert age", result.stuck);
    return result;
  }
}

class SocialLoop {
  constructor({ socialService, limit = 5, reconcileAfterMs = 30000, now = () => new Date(), logger = console }) { Object.assign(this, { social: socialService, limit, reconcileAfterMs, now, logger }); this.name = "social"; }
  async tick() {
    const result = { loop: this.name, published: 0, failed: 0, uncertain: 0, resumed: 0, reconciled: 0, skipped: 0, errors: [] };
    const tally = (list, key) => { for (const r of list || []) { if (r.error) { const c = r.error; if (EXPECTED.has(c)) result.skipped += 1; else result.errors.push(c); } else if (r.state === "published") result.published += 1; else if (r.state === "failed") result.failed += 1; else if (r.state === "reconciliation_required") result.uncertain += 1; if (key && !r.error) result[key] += 1; } };
    try { tally((await this.social.runDue({ limit: this.limit })).results); } catch (e) { result.errors.push(codeOf(e)); }
    try { const r = (await this.social.resumeUnsent({ limit: this.limit })).results; tally(r, "resumed"); } catch (e) { result.errors.push(codeOf(e)); }
    const due = (await this.social.billing.pool.query("select dispatch_id from public.social_dispatches where state in ('sending','reconciliation_required') and updated_at < $1 order by updated_at, dispatch_id limit $2", [new Date(this.now().getTime() - this.reconcileAfterMs), this.limit])).rows;
    for (const d of due) {
      try { const r = await this.social.reconcile(d.dispatch_id); result.reconciled += 1; if (r.state === "published") result.published += 1; else if (r.state === "failed") result.failed += 1; }
      catch (error) { const c = codeOf(error); if (EXPECTED.has(c)) result.skipped += 1; else { result.errors.push(c); this.logger.warn?.("social reconcile error", c); } }
    }
    return result;
  }
}

module.exports = { EXPECTED, GenerationLoop, SocialLoop, codeOf };
