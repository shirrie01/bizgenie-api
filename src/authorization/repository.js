class AuthorizationRepository {
  getCustomerProfileByAuthUserId(_authUserId) {
    throw new Error(
      "AuthorizationRepository.getCustomerProfileByAuthUserId is not implemented"
    );
  }

  getTenantById(_tenantId) {
    throw new Error("AuthorizationRepository.getTenantById is not implemented");
  }

  getTenantMembership(_tenantId, _authUserId) {
    throw new Error(
      "AuthorizationRepository.getTenantMembership is not implemented"
    );
  }

  getProjectById(_projectId) {
    throw new Error("AuthorizationRepository.getProjectById is not implemented");
  }

  getBrandByProjectAndBrand(_projectId, _brandId) {
    throw new Error(
      "AuthorizationRepository.getBrandByProjectAndBrand is not implemented"
    );
  }
}

function clone(value) {
  return value ? structuredClone(value) : null;
}

class InMemoryAuthorizationRepository extends AuthorizationRepository {
  constructor({
    customerProfiles = [],
    tenants = [],
    memberships = [],
    projects = [],
    brands = [],
  } = {}) {
    super();
    this.customerProfiles = new Map(
      customerProfiles.map((profile) => [profile.auth_user_id, clone(profile)])
    );
    this.tenants = new Map(
      tenants.map((tenant) => [tenant.tenant_id, clone(tenant)])
    );
    this.memberships = new Map(
      memberships.map((membership) => [
        `${membership.tenant_id}\u0000${membership.auth_user_id}`,
        clone(membership),
      ])
    );
    this.projects = new Map(
      projects.map((project) => [project.project_id, clone(project)])
    );
    this.brands = new Map(
      brands.map((brand) => [
        `${brand.project_id}\u0000${brand.brand_id}`,
        clone(brand),
      ])
    );
  }

  getCustomerProfileByAuthUserId(authUserId) {
    return clone(this.customerProfiles.get(authUserId));
  }

  getTenantById(tenantId) {
    return clone(this.tenants.get(tenantId));
  }

  getTenantMembership(tenantId, authUserId) {
    return clone(this.memberships.get(`${tenantId}\u0000${authUserId}`));
  }

  getProjectById(projectId) {
    return clone(this.projects.get(projectId));
  }

  getBrandByProjectAndBrand(projectId, brandId) {
    return clone(this.brands.get(`${projectId}\u0000${brandId}`));
  }
}

module.exports = {
  AuthorizationRepository,
  InMemoryAuthorizationRepository,
};
