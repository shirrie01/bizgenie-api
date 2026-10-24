const { OnboardingPersistenceError, OnboardingNotAuthorizedError, OnboardingError } = require("./errors");
const { assertBusinessCompletion } = require("./completion");
const { preflight } = require("./preflight");

const COLUMNS = `tenant_id, project_id, brand_id, profile_version, status, sector_key, sector_source,
  industry_text, channels, channels_source, current_step, draft, completed_at, updated_at, updated_by,
  last_idempotency_key, last_request_hash`;

function iso(value) {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

function rowToRecord(row) {
  return {
    tenant_id: row.tenant_id,
    project_id: row.project_id,
    brand_id: row.brand_id,
    profile_version: Number(row.profile_version),
    status: row.status,
    sector_key: row.sector_key,
    sector_source: row.sector_source,
    industry_text: row.industry_text,
    channels: Array.isArray(row.channels) ? row.channels : [],
    channels_source: row.channels_source,
    current_step: row.current_step === null ? null : Number(row.current_step),
    draft: row.draft && typeof row.draft === "object" ? row.draft : {},
    completed_at: iso(row.completed_at),
    updated_at: iso(row.updated_at),
    updated_by: row.updated_by,
    last_idempotency_key: row.last_idempotency_key,
    last_request_hash: row.last_request_hash,
  };
}

class PostgresWorkspaceOnboardingRepository {
  constructor({ pool }) {
    if (!pool) throw new TypeError("Postgres workspace onboarding repository requires a pool");
    this.pool = pool;
  }

  async preflight() { try { await preflight(this.pool); } catch { throw new OnboardingPersistenceError(); } }

  async get({ tenant_id, project_id, brand_id }) {
    await this.preflight();
    try {
      const result = await this.pool.query(
        `select ${COLUMNS} from public.workspace_onboarding_profiles
          where tenant_id = $1 and project_id = $2 and brand_id = $3`,
        [tenant_id, project_id, brand_id]
      );
      return result.rows[0] ? rowToRecord(result.rows[0]) : null;
    } catch {
      throw new OnboardingPersistenceError();
    }
  }

  async commit({ scope, expected_version, record, auth_user_id }) {
    let client;
    if (!auth_user_id || record.updated_by !== auth_user_id || record.profile_version !== expected_version + 1 ||
        ["tenant_id", "project_id", "brand_id"].some(k => record[k] !== scope[k])) throw new OnboardingNotAuthorizedError();
    const values = [
      scope.tenant_id, scope.project_id, scope.brand_id, record.profile_version, record.status,
      record.sector_key, record.sector_source, record.industry_text, JSON.stringify(record.channels),
      record.channels_source, record.current_step, JSON.stringify(record.draft), record.completed_at,
      record.updated_at, record.updated_by, record.last_idempotency_key, record.last_request_hash,
    ];
    try {
      client = await this.pool.connect();
      await client.query("begin");
      await preflight(client);
      const authority = await client.query(`select b.name,b.identity from public.tenant_memberships tm
        join public.projects p on p.tenant_id=tm.tenant_id
        join public.brand_brains b on b.project_id=p.project_id
        where tm.auth_user_id=$1 and tm.tenant_id=$2 and p.project_id=$3 and b.brand_id=$4
          and tm.role='owner' and b.status='approved' for share of tm,p,b`,
        [auth_user_id, scope.tenant_id, scope.project_id, scope.brand_id]);
      if (authority.rowCount !== 1) throw new OnboardingNotAuthorizedError();
      if (record.status === "completed") assertBusinessCompletion(authority.rows[0]);
      let result;
      if (expected_version === 0) {
        result = await client.query(
          `insert into public.workspace_onboarding_profiles (${COLUMNS}, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$14)
           on conflict (tenant_id, project_id, brand_id) do nothing
           returning ${COLUMNS}`,
          values
        );
      } else {
        result = await client.query(
          `update public.workspace_onboarding_profiles set
             profile_version = $4, status = $5, sector_key = $6, sector_source = $7, industry_text = $8,
             channels = $9::jsonb, channels_source = $10, current_step = $11, draft = $12::jsonb,
             completed_at = $13, updated_at = $14, updated_by = $15,
             last_idempotency_key = $16, last_request_hash = $17
           where tenant_id = $1 and project_id = $2 and brand_id = $3 and profile_version = $18
           returning ${COLUMNS}`,
          [...values, expected_version]
        );
      }
      const saved = Boolean(result.rows[0]);
      if (!saved) result = await client.query(`select ${COLUMNS} from public.workspace_onboarding_profiles
        where tenant_id=$1 and project_id=$2 and brand_id=$3`, [scope.tenant_id,scope.project_id,scope.brand_id]);
      const current = result.rows[0] ? rowToRecord(result.rows[0]) : null;
      await client.query("commit");
      return { saved, record: current, brain: authority.rows[0] };
    } catch (error) {
      try { await client?.query("rollback"); } catch {}
      if (error instanceof OnboardingError) throw error;
      throw new OnboardingPersistenceError();
    } finally { client?.release(); }
  }
}

module.exports = { PostgresWorkspaceOnboardingRepository };
