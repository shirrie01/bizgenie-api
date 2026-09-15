const {
  parseBootstrapWorkspaceRequest,
  parseCreateAdditionalWorkspaceRequest,
  parseSelectWorkspaceRequest,
  parseCustomerActor,
  parseCustomerBrandBrainCorrectionRequest,
} = require("./schema");
const { BrandBrainSchema, UpsertBrandBrainSchema } = require("../brand-brain/schema");
const { BrandBrainPersistenceError, BrandBrainValidationError } = require("../brand-brain/errors");
const {
  CustomerWorkspacePersistenceError,
  CustomerWorkspaceValidationError,
} = require("./errors");

class CustomerWorkspaceService {
  constructor({ repository, brandBrainRepository, scopeProvisioner, now = () => new Date() } = {}) {
    if (!repository) {
      throw new TypeError("Customer workspace repository is required");
    }
    this.repository = repository;
    if (!brandBrainRepository) {
      throw new TypeError("Customer workspace Brand Brain repository is required");
    }
    this.brandBrainRepository = brandBrainRepository;
    this.scopeProvisioner = scopeProvisioner;
    this.now = now;
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

  async correctSelectedBrandBrain({ actor, request }) {
    const customer = parseCustomerActor(actor);
    const scope = customer.trusted_scope;
    if (!scope) {
      throw new CustomerWorkspaceValidationError([
        { path: "trusted_scope", code: "unauthorized", message: "A trusted selected workspace is required" },
      ]);
    }

    const selected = await this.repository.getAuthorizedWorkspaceSelection({
      auth_user_id: customer.auth_user_id,
      ...scope,
    });
    if (!selected) {
      throw new CustomerWorkspaceValidationError([
        { path: "trusted_scope", code: "unauthorized", message: "Workspace selection is not authorized" },
      ]);
    }

    const existing = await this.brandBrainRepository.getByProjectAndBrand(
      scope.project_id,
      scope.brand_id
    );
    if (!existing) {
      throw new CustomerWorkspaceValidationError([
        { path: "trusted_scope", code: "unauthorized", message: "Selected Brand Brain is not owned by this customer" },
      ]);
    }

    const input = parseCustomerBrandBrainCorrectionRequest(request);
    const timestamp = this.now().toISOString();
    const candidate = {
      ...input,
      brand_id: scope.brand_id,
      project_id: scope.project_id,
      metadata: {
        version: existing.metadata.version + 1,
        status: existing.metadata.status,
        created_at: existing.metadata.created_at,
        updated_at: timestamp,
      },
    };
    let record;
    try {
      record = UpsertBrandBrainSchema.parse(candidate);
      record = BrandBrainSchema.parse(record);
      return { status: "ready", brand_brain: await this.brandBrainRepository.upsert(record) };
    } catch (error) {
      if (error instanceof BrandBrainValidationError) throw error;
      if (error?.issues) {
        throw new CustomerWorkspaceValidationError(error.issues.map((issue) => ({
          path: issue.path.join("."), code: issue.code, message: issue.message,
        })));
      }
      if (error instanceof BrandBrainPersistenceError) throw error;
      throw error;
    }
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
