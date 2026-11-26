const { randomUUID, randomBytes } = require("node:crypto");

class EarlyAccessRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async initialize() {
    const { rows: [row] } = await this.pool.query(`
      SELECT count(*)::int AS protected
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('early_access_leads', 'early_access_receipts', 'early_access_rate_buckets')
        AND c.relrowsecurity AND NOT EXISTS (
          SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
          WHERE acl.grantee = 0 OR acl.grantee IN (
            SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
          )
        )`);
    if (row.protected !== 3) throw new Error("Early access requires the private lead schema");
  }

  async capture({ input, fingerprint, now, expiresAt }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize the submission identity before touching a lead. Conflicting
      // or retried submissions must never mutate the canonical record.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        "early-access:" + input.submission_id,
      ]);
      const { rows: [prior] } = await client.query(`
        SELECT reference_id, fingerprint FROM public.early_access_receipts WHERE submission_id = $1
      `, [input.submission_id]);
      if (prior) {
        await client.query("COMMIT");
        return prior.fingerprint === fingerprint ? prior.reference_id : null;
      }

      const { rows: [lead] } = await client.query(`
        INSERT INTO public.early_access_leads
          (id, work_email, profile, intention, received_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (work_email) DO UPDATE SET intention =
          CASE WHEN EXCLUDED.intention = 'founding_customer' THEN EXCLUDED.intention
               ELSE early_access_leads.intention END
        RETURNING id
      `, [randomUUID(), input.work_email, {
        name: input.name, business_name: input.business_name, industry: input.industry,
        marketing_priorities: input.marketing_priorities, notes: input.notes,
      }, input.intention, now, expiresAt]);
      const reference = `ea_${randomBytes(18).toString("base64url")}`;
      await client.query(`
        INSERT INTO public.early_access_receipts
          (submission_id, reference_id, lead_id, fingerprint, intention, marketing_consent, consent, attribution, received_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [input.submission_id, reference, lead.id, fingerprint, input.intention, input.marketing_consent,
        { ...input.consent, privacy_contact_consent: true }, input.source, now]);
      await client.query("COMMIT");
      return reference;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async allowAttempt(clientHash, start, expiry, maximum) {
    const result = await this.pool.query(`
      INSERT INTO public.early_access_rate_buckets (client_hash, window_start, expires_at, attempts)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (client_hash, window_start) DO UPDATE
      SET attempts = early_access_rate_buckets.attempts + 1
      WHERE early_access_rate_buckets.attempts < $4
      RETURNING attempts
    `, [clientHash, start, expiry, maximum]);
    return result.rowCount === 1;
  }

  async preparePreview(reference, createDraft, now = new Date()) {
    const { rows: [lead] } = await this.pool.query(`
      SELECT l.id, l.profile FROM public.early_access_receipts r
      JOIN public.early_access_leads l ON l.id = r.lead_id
      WHERE r.reference_id = $1 AND l.expires_at > $2
    `, [reference, now]);
    if (!lead) return null;
    const draft = createDraft(lead.profile);
    const { rows: [saved] } = await this.pool.query(`
      UPDATE public.early_access_leads SET preview_draft = $2
      WHERE id = $1 AND expires_at > $3 RETURNING preview_draft
    `, [lead.id, draft, now]);
    return saved?.preview_draft ?? null;
  }

  async deleteLead(id) {
    const result = await this.pool.query("DELETE FROM public.early_access_leads WHERE id = $1", [id]);
    return result.rowCount === 1;
  }

  async purgeExpired(now = new Date()) {
    const leads = await this.pool.query(`
      DELETE FROM public.early_access_leads WHERE id IN (
        SELECT id FROM public.early_access_leads WHERE expires_at <= $1 ORDER BY expires_at LIMIT 500
      )
    `, [now]);
    const buckets = await this.pool.query(`
      DELETE FROM public.early_access_rate_buckets WHERE (client_hash, window_start) IN (
        SELECT client_hash, window_start FROM public.early_access_rate_buckets
        WHERE expires_at <= $1 ORDER BY expires_at LIMIT 500
      )
    `, [now]);
    return { leads: leads.rowCount, buckets: buckets.rowCount };
  }
}

module.exports = { EarlyAccessRepository };
