const {
  parseBootstrapWorkspaceRequest,
  parseCustomerActor,
} = require("./schema");
const { CustomerWorkspacePersistenceError } = require("./errors");

class CustomerWorkspaceService {
  constructor({ repository, scopeProvisioner } = {}) {
    if (!repository) {
      throw new TypeError("Customer workspace repository is required");
    }
    this.repository = repository;
    this.scopeProvisioner = scopeProvisioner;
  }

  async getWorkspace({ actor }) {
    const customer = parseCustomerActor(actor);
    const workspace = await this.repository.getWorkspaceForAuthUserId(
      customer.auth_user_id
    );

    if (!workspace) {
      return { status: "missing_workspace", workspace: null };
    }

    return { status: "ready", workspace };
  }

  async bootstrapWorkspace({ actor, request }) {
    const customer = parseCustomerActor(actor);
    const parsed = parseBootstrapWorkspaceRequest(request);
    const workspace = await this.repository.bootstrapWorkspace({
      auth_user_id: customer.auth_user_id,
      ...parsed,
    });

    if (!this.scopeProvisioner) {
      return { status: "ready", workspace };
    }

    try {
      const provisioning = await this.scopeProvisioner.provisionTrustedScope({
        auth_user_id: customer.auth_user_id,
        trusted_scope: {
          tenant_id: workspace.tenant_id,
          project_id: workspace.project_id,
          brand_id: workspace.brand_id,
        },
      });

      return {
        status: "ready",
        workspace,
        requires_session_refresh: provisioning.requires_session_refresh === true,
      };
    } catch {
      throw new CustomerWorkspacePersistenceError();
    }
  }
}

module.exports = {
  CustomerWorkspaceService,
};
