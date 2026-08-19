const { AuthorizationRepository } = require("./repository");

class PostgresAuthorizationRepository extends AuthorizationRepository {
  constructor({ pool }) {
    super();
    if (!pool || typeof pool.query !== "function") {
      throw new TypeError("A PostgreSQL connection pool is required");
    }
    this.pool = pool;
  }

  async getCustomerProfileByAuthUserId(authUserId) {
    const result = await this.pool.query(
      `SELECT auth_user_id, display_name, created_at, updated_at
         FROM public.customer_profiles
        WHERE auth_user_id = $1`,
      [authUserId]
    );
    return result.rows[0] || null;
  }

  async getTenantById(tenantId) {
    const result = await this.pool.query(
      `SELECT tenant_id, name, created_by, created_at, updated_at
         FROM public.tenants
        WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0] || null;
  }

  async getTenantMembership(tenantId, authUserId) {
    const result = await this.pool.query(
      `SELECT tenant_id, auth_user_id, role, created_at, updated_at
         FROM public.tenant_memberships
        WHERE tenant_id = $1
          AND auth_user_id = $2`,
      [tenantId, authUserId]
    );
    return result.rows[0] || null;
  }

  async getProjectById(projectId) {
    const result = await this.pool.query(
      `SELECT project_id, tenant_id, name, created_at, updated_at
         FROM public.projects
        WHERE project_id = $1`,
      [projectId]
    );
    return result.rows[0] || null;
  }

  async getBrandByProjectAndBrand(projectId, brandId) {
    const result = await this.pool.query(
      `SELECT brand_id, project_id, name, status
         FROM public.brand_brains
        WHERE project_id = $1
          AND brand_id = $2`,
      [projectId, brandId]
    );
    return result.rows[0] || null;
  }
}

module.exports = {
  PostgresAuthorizationRepository,
};
