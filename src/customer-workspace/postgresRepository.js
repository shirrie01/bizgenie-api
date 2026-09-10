const { CustomerWorkspacePersistenceError } = require("./errors");
const {
  CustomerWorkspaceRepository,
  defaultWorkspaceIds,
  workspaceDto,
} = require("./repository");

function mapWorkspaceRow(row) {
  if (!row) {
    return null;
  }

  if (!row.project_id || !row.brand_id) {
    return null;
  }

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
  if (!website_or_social_profile) {
    return null;
  }
  return {
    description: `Customer-provided website or profile: ${website_or_social_profile}`,
  };
}

function onboardingCommercial({ primary_marketing_challenge }) {
  if (!primary_marketing_challenge) {
    return null;
  }
  return {
    primary_cta: primary_marketing_challenge,
  };
}

class PostgresCustomerWorkspaceRepository extends CustomerWorkspaceRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") {
      throw new TypeError("A PostgreSQL connection pool is required");
    }
    this.pool = pool;
  }

  async getWorkspaceForAuthUserId(authUserId) {
    try {
      const result = await this.pool.query(
        `SELECT
           tm.tenant_id,
           tm.role AS membership_role,
           t.name AS tenant_name,
           p.project_id,
           p.name AS project_name,
           b.brand_id,
           b.name AS brand_name,
           b.status AS brand_status
         FROM public.customer_profiles cp
         JOIN public.tenant_memberships tm
           ON tm.auth_user_id = cp.auth_user_id
         JOIN public.tenants t
           ON t.tenant_id = tm.tenant_id
         LEFT JOIN public.projects p
           ON p.tenant_id = t.tenant_id
         LEFT JOIN public.brand_brains b
           ON b.project_id = p.project_id
          AND b.status IN ('approved', 'draft')
        WHERE cp.auth_user_id = $1
        ORDER BY
          CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END,
          p.created_at ASC NULLS LAST,
          CASE WHEN b.status = 'approved' THEN 0 ELSE 1 END,
          b.created_at ASC NULLS LAST
        LIMIT 1`,
        [authUserId]
      );
      return mapWorkspaceRow(result.rows[0]);
    } catch {
      throw new CustomerWorkspacePersistenceError();
    }
  }

  async bootstrapWorkspace({
    auth_user_id,
    business_name,
    website_or_social_profile,
    primary_marketing_challenge,
  }) {
    const client = await this.pool.connect();
    const ids = defaultWorkspaceIds(auth_user_id);
    const businessName = business_name || "BizGenie Workspace";
    const tenantName = `${businessName} Workspace`;
    const projectName = `${businessName} Campaign Workspace`;
    const now = new Date().toISOString();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `customer-workspace:${auth_user_id}`,
      ]);
      await client.query(
        `INSERT INTO public.customer_profiles (auth_user_id, created_at, updated_at)
         VALUES ($1, $2, $2)
         ON CONFLICT (auth_user_id) DO NOTHING`,
        [auth_user_id, now]
      );
      await client.query(
        `INSERT INTO public.tenants (tenant_id, name, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [ids.tenant_id, tenantName, auth_user_id, now]
      );
      await client.query(
        `INSERT INTO public.tenant_memberships
           (tenant_id, auth_user_id, role, created_at, updated_at)
         VALUES ($1, $2, 'owner', $3, $3)
         ON CONFLICT (tenant_id, auth_user_id) DO NOTHING`,
        [ids.tenant_id, auth_user_id, now]
      );
      await client.query(
        `INSERT INTO public.projects (project_id, tenant_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (project_id) DO NOTHING`,
        [ids.project_id, ids.tenant_id, projectName, now]
      );
      await client.query(
        `INSERT INTO public.brand_brains (
           brand_id, project_id, name, identity, commercial,
           version, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 1, 'approved', $6, $6)
         ON CONFLICT (brand_id) DO NOTHING`,
        [
          ids.brand_id,
          ids.project_id,
          businessName,
          onboardingIdentity({ website_or_social_profile }),
          onboardingCommercial({ primary_marketing_challenge }),
          now,
        ]
      );

      const result = await client.query(
        `SELECT
           tm.tenant_id,
           tm.role AS membership_role,
           t.name AS tenant_name,
           p.project_id,
           p.name AS project_name,
           b.brand_id,
           b.name AS brand_name,
           b.status AS brand_status
         FROM public.tenant_memberships tm
         JOIN public.tenants t
           ON t.tenant_id = tm.tenant_id
         JOIN public.projects p
           ON p.tenant_id = t.tenant_id
         JOIN public.brand_brains b
           ON b.project_id = p.project_id
        WHERE tm.auth_user_id = $1
          AND tm.tenant_id = $2
          AND p.project_id = $3
          AND b.brand_id = $4
        LIMIT 1`,
        [auth_user_id, ids.tenant_id, ids.project_id, ids.brand_id]
      );

      const workspace = mapWorkspaceRow(result.rows[0]);
      if (!workspace) {
        throw new CustomerWorkspacePersistenceError();
      }
      await client.query("COMMIT");
      return workspace;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep the original provisioning failure as the public error.
      }
      if (error instanceof CustomerWorkspacePersistenceError) {
        throw error;
      }
      throw new CustomerWorkspacePersistenceError();
    } finally {
      client.release();
    }
  }
}

module.exports = {
  PostgresCustomerWorkspaceRepository,
};
