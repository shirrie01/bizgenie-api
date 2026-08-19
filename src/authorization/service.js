const { ActorSchema } = require("./schema");
const { roleAllows } = require("./policy");
const { AuthorizationDeniedError } = require("./errors");

function deny() {
  throw new AuthorizationDeniedError();
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

    if (!project || project.tenant_id !== tenantId) {
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

    if (!brand) {
      return deny();
    }

    return Object.freeze({
      ...projectAuthorization,
      brand_id: brandId,
    });
  }
}

module.exports = {
  AuthorizationService,
};
