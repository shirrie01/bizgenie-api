const {
  parseBootstrapWorkspaceRequest,
  parseCreateAdditionalWorkspaceRequest,
  parseSelectWorkspaceRequest,
  parseCustomerActor,
} = require("./schema");
const {
  CustomerWorkspacePersistenceError,
  CustomerWorkspaceValidationError,
} = require("./errors");

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
    const workspaces = await this.repository.listWorkspacesForAuthUserId(
      customer.auth_user_id
    );

    if (!workspaces.length) {
      return { status: "missing_workspace", workspace: null };
    }
    if (workspaces.length === 1) {
      return { status: "ready", workspace: workspaces[0] };
    }
    return { status: "selection_required", workspace: null, workspaces };
  }

  async bootstrapWorkspace({ actor, request }) {
    const customer = parseCustomerActor(actor);
    const parsed = parseBootstrapWorkspaceRequest(request);
    const existing = await this.repository.listWorkspacesForAuthUserId(customer.auth_user_id);
    if (existing.length > 1) {
      return { status: "selection_required", workspace: null, workspaces: existing };
    }
    const workspace = existing[0] || await this.repository.bootstrapWorkspace({
      auth_user_id: customer.auth_user_id,
      ...parsed,
    });
    return this.#provision(customer.auth_user_id, workspace);
  }

  async createAdditionalWorkspace({ actor, request }) {
    const customer = parseCustomerActor(actor);
    const parsed = parseCreateAdditionalWorkspaceRequest(request);
    const workspace = await this.repository.createAdditionalWorkspace({
      auth_user_id: customer.auth_user_id,
      ...parsed,
    });
    if (!workspace) {
      throw new CustomerWorkspaceValidationError([
        { path: "tenant_id", code: "unauthorized", message: "Tenant is not owned by this customer" },
      ]);
    }
    return this.#provision(customer.auth_user_id, workspace);
  }

  async selectWorkspace({ actor, request }) {
    const customer = parseCustomerActor(actor);
    const parsed = parseSelectWorkspaceRequest(request);
    const workspace = await this.repository.getAuthorizedWorkspaceSelection({
      auth_user_id: customer.auth_user_id,
      ...parsed,
    });
    if (!workspace) {
      throw new CustomerWorkspaceValidationError([
        { path: "brand_id", code: "unauthorized", message: "Workspace selection is not authorized" },
      ]);
    }
    return this.#provision(customer.auth_user_id, workspace);
  }

  async #provision(authUserId, workspace) {
    if (!this.scopeProvisioner) {
      return { status: "ready", workspace };
    }
    try {
      const provisioning = await this.scopeProvisioner.provisionTrustedScope({
        auth_user_id: authUserId,
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
