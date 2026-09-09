const { ActorSchema } = require("./schema");
const { roleAllows } = require("./policy");
const { AuthorizationDeniedError } = require("./errors");

function deny() {
  throw new AuthorizationDeniedError();
}

function scopeMismatch(actor, expected = {}) {
  const scope = actor.trusted_scope;
  if (!scope) return false;
  return Object.entries(expected).some(
    ([key, value]) => value !== undefined && scope[key] !== value
  );
}

class AuthorizationService {
  constructor({ repository }) {
    if (!repository) {
      throw new TypeError("An authorization repository is required");
    }
    this.repository = repository;
  }

  async authorizeTenant({ actor, tenantId, action }) {
    const parsedActor = ActorSchema.safeParse(actor);
    if (!parsedActor.success || parsedActor.data.kind !== "customer") {
      return deny();
    }

    if (scopeMismatch(parsedActor.data, { tenant_id: tenantId })) {
      return deny();
    }

    const authUserId = parsedActor.data.auth_user_id;
    const [profile, tenant, membership] = await Promise.all([
      this.repository.getCustomerProfileByAuthUserId(authUserId),
      this.repository.getTenantById(tenantId),
      this.repository.getTenantMembership(tenantId, authUserId),
    ]);

    if (!profile || !tenant || !membership || !roleAllows(membership.role, action)) {
      return deny();
    }

    return Object.freeze({
      actor: parsedActor.data,
      tenant_id: tenantId,
      membership_role: membership.role,
      action,
    });
  }

  async authorizeProject({ actor, tenantId, projectId, action }) {
    const tenantAuthorization = await this.authorizeTenant({
      actor,
      tenantId,
      action,
    });
    const project = await this.repository.getProjectById(projectId);

    if (
      !project ||
      project.tenant_id !== tenantId ||
      scopeMismatch(tenantAuthorization.actor, { project_id: projectId })
    ) {
      return deny();
    }

    return Object.freeze({
      ...tenantAuthorization,
      project_id: projectId,
    });
  }

  async authorizeProjectBrand({
    actor,
    tenantId,
    projectId,
    brandId,
    action,
    requireApprovedBrand = false,
  }) {
    const projectAuthorization = await this.authorizeProject({
      actor,
      tenantId,
      projectId,
      action,
    });
    const brand = await this.repository.getBrandByProjectAndBrand(
      projectId,
      brandId
    );

    const approvedBrandRequired =
      requireApprovedBrand || action === "generation:create";
    if (
      !brand ||
      (approvedBrandRequired && brand.status !== "approved") ||
      scopeMismatch(projectAuthorization.actor, { brand_id: brandId })
    ) {
      return deny();
    }

    return Object.freeze({
      ...projectAuthorization,
      brand_id: brandId,
      brand_status: brand.status,
    });
  }
}

module.exports = {
  AuthorizationService,
};
