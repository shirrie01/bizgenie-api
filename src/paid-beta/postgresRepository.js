const {
  PaidBetaConfigurationError,
  PaidBetaIdempotencyConflictError,
  PaidBetaPersistenceError,
  PaidBetaRateLimitError,
} = require("./errors");
const { PaidBetaRepository } = require("./repository");

class PostgresPaidBetaRepository extends PaidBetaRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") {
      throw new PaidBetaConfigurationError("A PostgreSQL pool is required");
    }
    this.pool = pool;
    this.lastCleanupAt = 0;
  }

  async initialize() {
    try {
      const result = await this.pool.query(`
        SELECT
          to_regclass('public.paid_beta_interests') AS interests,
          to_regclass('public.paid_beta_interest_receipts') AS receipts,
          to_regclass('public.paid_beta_rate_limit_buckets') AS rate_limits,
          (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.paid_beta_interests'::regclass) AS interests_rls,
          (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.paid_beta_interest_receipts'::regclass) AS receipts_rls,
          EXISTS (
            SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.paid_beta_interests'::regclass
               AND tgname = 'protect_paid_beta_interests'
               AND NOT tgisinternal
          ) AS interests_immutable,
          EXISTS (
            SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.paid_beta_interest_receipts'::regclass
               AND tgname = 'protect_paid_beta_interest_receipts'
               AND NOT tgisinternal
          ) AS receipts_immutable`);
      const row = result.rows[0];
      if (
        !row?.interests || !row.receipts || !row.rate_limits ||
        row.interests_rls !== true || row.receipts_rls !== true ||
        row.interests_immutable !== true || row.receipts_immutable !== true
      ) {
        throw new PaidBetaConfigurationError();
      }
      const unsafe = await this.pool.query(`
        SELECT grantee, table_name
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND table_name IN (
             'paid_beta_interests',
             'paid_beta_interest_receipts',
             'paid_beta_rate_limit_buckets'
           )
           AND grantee IN ('anon', 'authenticated', 'service_role')`);
      if (unsafe.rowCount > 0) throw new PaidBetaConfigurationError();
    } catch (error) {
      if (error instanceof PaidBetaConfigurationError) throw error;
      throw new PaidBetaConfigurationError();
    }
  }

  async cleanupExpiredRateLimits(now) {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs) || nowMs - this.lastCleanupAt < 3600000) return;
    this.lastCleanupAt = nowMs;
    await this.pool.query(`
      WITH expired AS (
        SELECT client_hash, window_started_at
          FROM public.paid_beta_rate_limit_buckets
         WHERE expires_at < $1
         ORDER BY expires_at
         LIMIT 500
      )
      DELETE FROM public.paid_beta_rate_limit_buckets AS bucket
       USING expired
       WHERE bucket.client_hash = expired.client_hash
         AND bucket.window_started_at = expired.window_started_at`, [now]);
  }

  async consumeRateLimit({
    client_hash,
    window_started_at,
    expires_at,
    maximum_attempts,
    now,
  }) {
    try {
      await this.cleanupExpiredRateLimits(now);
      const result = await this.pool.query(`
        INSERT INTO public.paid_beta_rate_limit_buckets
          (client_hash, window_started_at, attempt_count, expires_at, created_at, updated_at)
        VALUES ($1, $2, 1, $3, $4, $4)
        ON CONFLICT (client_hash, window_started_at) DO UPDATE
          SET attempt_count = public.paid_beta_rate_limit_buckets.attempt_count + 1,
              updated_at = EXCLUDED.updated_at
        WHERE public.paid_beta_rate_limit_buckets.attempt_count < $5
        RETURNING attempt_count`,
      [client_hash, window_started_at, expires_at, now, maximum_attempts]);
      if (result.rowCount === 0) throw new PaidBetaRateLimitError();
    } catch (error) {
      if (error instanceof PaidBetaRateLimitError) throw error;
      throw new PaidBetaPersistenceError();
    }
  }

  async captureInterest(input) {
    let client;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const existing = await client.query(`
        SELECT reference_id, request_fingerprint
          FROM public.paid_beta_interest_receipts
         WHERE submission_identity = $1`, [input.submission_identity]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== input.request_fingerprint) {
          throw new PaidBetaIdempotencyConflictError();
        }
        await client.query("COMMIT");
        return { reference_id: existing.rows[0].reference_id, replay: true };
      }

      let interest = await client.query(`
        INSERT INTO public.paid_beta_interests
          (interest_id, name, work_email, business_name, website_or_social_profile,
           business_stage, primary_marketing_challenge, source, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
        ON CONFLICT (work_email) DO NOTHING
        RETURNING interest_id`, [
        input.interest.interest_id,
        input.interest.name,
        input.interest.work_email,
        input.interest.business_name,
        input.interest.website_or_social_profile,
        input.interest.business_stage,
        input.interest.primary_marketing_challenge,
        input.interest.source,
        input.interest.created_at,
      ]);
      if (interest.rowCount === 0) {
        interest = await client.query(
          "SELECT interest_id FROM public.paid_beta_interests WHERE work_email = $1",
          [input.interest.work_email]
        );
      }
      if (!interest.rows[0]) throw new PaidBetaPersistenceError();

      const receipt = await client.query(`
        INSERT INTO public.paid_beta_interest_receipts
          (receipt_id, reference_id, interest_id, submission_identity,
           request_fingerprint, consent_version, consent_wording, consented_at,
           source, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (submission_identity) DO NOTHING
        RETURNING reference_id, request_fingerprint`, [
        input.receipt.receipt_id,
        input.receipt.reference_id,
        interest.rows[0].interest_id,
        input.submission_identity,
        input.request_fingerprint,
        input.receipt.consent_version,
        input.receipt.consent_wording,
        input.receipt.consented_at,
        input.receipt.source,
        input.receipt.created_at,
      ]);
      let resolved = receipt.rows[0];
      if (!resolved) {
        resolved = (await client.query(`
          SELECT reference_id, request_fingerprint
            FROM public.paid_beta_interest_receipts
           WHERE submission_identity = $1`, [input.submission_identity])).rows[0];
      }
      if (!resolved) throw new PaidBetaPersistenceError();
      if (resolved.request_fingerprint !== input.request_fingerprint) {
        throw new PaidBetaIdempotencyConflictError();
      }
      await client.query("COMMIT");
      return { reference_id: resolved.reference_id, replay: receipt.rowCount === 0 };
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch {}
      if (error instanceof PaidBetaIdempotencyConflictError) throw error;
      if (error instanceof PaidBetaPersistenceError) throw error;
      throw new PaidBetaPersistenceError();
    } finally {
      client?.release();
    }
  }
}

module.exports = { PostgresPaidBetaRepository };
