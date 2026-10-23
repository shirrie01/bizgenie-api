const { CustomerWorkspacePersistenceError, CustomerWorkspaceValidationError, CustomerOnboardingConflictError } = require("./errors");
const { OnboardingDraftSchema } = require("./schema");
const {
  CustomerWorkspaceRepository,
  additionalWorkspaceIds,
  defaultWorkspaceIds,
  workspaceDto,
} = require("./repository");

function mapWorkspaceRow(row) {
  if (!row || !row.project_id || !row.brand_id) return null;
  return workspaceDto({
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    project_id: row.project_id,
    project_name: row.project_name,
    brand_id: row.brand_id,
    brand_name: row.brand_name,
    brand_status: row.brand_status,
    role: row.membership_role,
  });
}

function onboardingIdentity({ website_or_social_profile }) {
  if (!website_or_social_profile) return null;
  return { description: `Customer-provided website or profile: ${website_or_social_profile}` };
}

function onboardingCommercial({ primary_marketing_challenge }) {
  if (!primary_marketing_challenge) return null;
  return { primary_cta: primary_marketing_challenge };
}

const WORKSPACE_SELECT = `SELECT
  tm.tenant_id,
  tm.role AS membership_role,
  t.name AS tenant_name,
  p.project_id,
  p.name AS project_name,
  b.brand_id,
  b.name AS brand_name,
  b.status AS brand_status
FROM public.tenant_memberships tm
JOIN public.tenants t ON t.tenant_id = tm.tenant_id
JOIN public.projects p ON p.tenant_id = t.tenant_id
JOIN public.brand_brains b ON b.project_id = p.project_id`;

class PostgresCustomerWorkspaceRepository extends CustomerWorkspaceRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") {
      throw new TypeError("A PostgreSQL connection pool is required");
    }
    this.pool = pool;
  }

  #draftRow(row) {
    if (!row) return null;
    if (!Number.isInteger(row.version) || row.version < 1 || row.version > 2147483647) throw new CustomerWorkspacePersistenceError();
    return { version: row.version, draft: OnboardingDraftSchema.parse(row.draft), updated_at: new Date(row.updated_at).toISOString() };
  }

  async getOnboardingDraft(authUserId) {
    try {
      const result = await this.pool.query("select version, draft, updated_at from public.customer_onboarding_drafts where auth_user_id=$1", [authUserId]);
      return this.#draftRow(result.rows[0]);
    } catch { throw new CustomerWorkspacePersistenceError(); }
  }

  async saveOnboardingDraft({ auth_user_id, expected_version, draft }) {
    let client;
    try {
      draft = OnboardingDraftSchema.parse(draft);
      client = await this.pool.connect(); await client.query("begin");
      if (draft.workspace) {
        const w = draft.workspace;
        const owned = await client.query(`${WORKSPACE_SELECT}
          WHERE tm.auth_user_id=$1 AND tm.tenant_id=$2 AND p.project_id=$3 AND b.brand_id=$4
            AND tm.role='owner' AND b.status='approved' FOR SHARE OF tm,p,b`, [auth_user_id, w.tenant_id, w.project_id, w.brand_id]);
        if (!owned.rowCount) throw new CustomerWorkspaceValidationError();
      }
      const timestamp = new Date().toISOString();
      const result = expected_version === 0
        ? await client.query(`insert into public.customer_onboarding_drafts(auth_user_id,version,draft,created_at,updated_at)
            values($1,1,$2,$3,$3) on conflict(auth_user_id) do nothing returning version,draft,updated_at`, [auth_user_id, draft, timestamp])
        : await client.query(`update public.customer_onboarding_drafts set version=version+1,draft=$3,updated_at=$4
            where auth_user_id=$1 and version=$2 returning version,draft,updated_at`, [auth_user_id, expected_version, draft, timestamp]);
      if (!result.rowCount) throw new CustomerOnboardingConflictError();
      const row = this.#draftRow(result.rows[0]); await client.query("commit"); return row;
    } catch (error) {
      try { await client?.query("rollback"); } catch {}
      if (error instanceof CustomerOnboardingConflictError || error instanceof CustomerWorkspaceValidationError) throw error;
      throw new CustomerWorkspacePersistenceError();
    } finally { client?.release(); }
  }

  async listWorkspacesForAuthUserId(authUserId) {
    try {
      const result = await this.pool.query(
        `${WORKSPACE_SELECT}
         WHERE tm.auth_user_id = $1
           AND b.status IN ('approved', 'draft')
         ORDER BY CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END,
                  p.created_at ASC,
                  CASE WHEN b.status = 'approved' THEN 0 ELSE 1 END,
                  b.created_at ASC`,
        [authUserId]
      );
      return result.rows.map(mapWorkspaceRow).filter(Boolean);
    } catch {
      throw new CustomerWorkspacePersistenceError();
    }
  }

  async getWorkspaceForAuthUserId(authUserId) {
    const rows = await this.listWorkspacesForAuthUserId(authUserId);
    return rows.length === 1 ? rows[0] : null;
  }

  async getAuthorizedWorkspaceSelection({ auth_user_id, tenant_id, project_id, brand_id }) {
    try {
      const result = await this.pool.query(
        `${WORKSPACE_SELECT}
         WHERE tm.auth_user_id = $1
           AND tm.tenant_id = $2
           AND p.project_id = $3
           AND b.brand_id = $4
           AND b.status = 'approved'
         LIMIT 1`,
        [auth_user_id, tenant_id, project_id, brand_id]
      );
      return mapWorkspaceRow(result.rows[0]);
    } catch {
      throw new CustomerWorkspacePersistenceError();
    }
  }

  async bootstrapWorkspace({ auth_user_id, business_name, website_or_social_profile, primary_marketing_challenge }) {
    const client = await this.pool.connect();
    const ids = defaultWorkspaceIds(auth_user_id);
    const businessName = business_name || "BizGenie Workspace";
    const tenantName = `${businessName} Workspace`;
    const projectName = `${businessName} Campaign Workspace`;
    const now = new Date().toISOString();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`customer-workspace:${auth_user_id}`]);
      await client.query(`INSERT INTO public.customer_profiles (auth_user_id, created_at, updated_at)
         VALUES ($1, $2, $2) ON CONFLICT (auth_user_id) DO NOTHING`, [auth_user_id, now]);
      await client.query(`INSERT INTO public.tenants (tenant_id, name, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4) ON CONFLICT (tenant_id) DO NOTHING`, [ids.tenant_id, tenantName, auth_user_id, now]);
      await client.query(`INSERT INTO public.tenant_memberships (tenant_id, auth_user_id, role, created_at, updated_at)
         VALUES ($1, $2, 'owner', $3, $3) ON CONFLICT (tenant_id, auth_user_id) DO NOTHING`, [ids.tenant_id, auth_user_id, now]);
      await client.query(`INSERT INTO public.projects (project_id, tenant_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4) ON CONFLICT (project_id) DO NOTHING`, [ids.project_id, ids.tenant_id, projectName, now]);
      await client.query(`INSERT INTO public.brand_brains (
           brand_id, project_id, name, identity, commercial, version, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 1, 'approved', $6, $6)
         ON CONFLICT (brand_id) DO NOTHING`, [
        ids.brand_id,
        ids.project_id,
        businessName,
        onboardingIdentity({ website_or_social_profile }),
        onboardingCommercial({ primary_marketing_challenge }),
        now,
      ]);
      const result = await client.query(`${WORKSPACE_SELECT}
        WHERE tm.auth_user_id = $1 AND tm.tenant_id = $2 AND p.project_id = $3 AND b.brand_id = $4 LIMIT 1`,
        [auth_user_id, ids.tenant_id, ids.project_id, ids.brand_id]);
      const workspace = mapWorkspaceRow(result.rows[0]);
      if (!workspace) throw new CustomerWorkspacePersistenceError();
      await client.query("COMMIT");
      return workspace;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (error instanceof CustomerWorkspacePersistenceError) throw error;
      throw new CustomerWorkspacePersistenceError();
    } finally {
      client.release();
    }
  }

  async createAdditionalWorkspace({ auth_user_id, tenant_id, business_name, website_or_social_profile, primary_marketing_challenge }) {
    const client = await this.pool.connect();
    const ids = additionalWorkspaceIds();
    const businessName = business_name || "BizGenie Workspace";
    const projectName = `${businessName} Campaign Workspace`;
    const now = new Date().toISOString();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`customer-workspace:${auth_user_id}`]);
      const membership = await client.query(
        `SELECT role FROM public.tenant_memberships WHERE tenant_id = $1 AND auth_user_id = $2 LIMIT 1`,
        [tenant_id, auth_user_id]
      );
      if (membership.rows[0]?.role !== "owner") {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(`INSERT INTO public.projects (project_id, tenant_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)`, [ids.project_id, tenant_id, projectName, now]);
      await client.query(`INSERT INTO public.brand_brains (
           brand_id, project_id, name, identity, commercial, version, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 1, 'approved', $6, $6)`, [
        ids.brand_id,
        ids.project_id,
        businessName,
        onboardingIdentity({ website_or_social_profile }),
        onboardingCommercial({ primary_marketing_challenge }),
        now,
      ]);
      const result = await client.query(`${WORKSPACE_SELECT}
        WHERE tm.auth_user_id = $1 AND tm.tenant_id = $2 AND p.project_id = $3 AND b.brand_id = $4 LIMIT 1`,
        [auth_user_id, tenant_id, ids.project_id, ids.brand_id]);
      const workspace = mapWorkspaceRow(result.rows[0]);
      if (!workspace) throw new CustomerWorkspacePersistenceError();
      await client.query("COMMIT");
      return workspace;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (error instanceof CustomerWorkspacePersistenceError) throw error;
      throw new CustomerWorkspacePersistenceError();
    } finally {
      client.release();
    }
  }
}

module.exports = {
  PostgresCustomerWorkspaceRepository,
};
