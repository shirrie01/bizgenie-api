function clone(value) {
  return value ? structuredClone(value) : null;
}

function suffixForAuthUserId(authUserId) {
  return authUserId.replaceAll("-", "");
}

function defaultWorkspaceIds(authUserId) {
  const suffix = suffixForAuthUserId(authUserId);
  return {
    tenant_id: `tenant_${suffix}`,
    project_id: `project_${suffix}`,
    brand_id: `brand_${suffix}`,
  };
}

function workspaceDto({
  tenant_id,
  tenant_name,
  project_id,
  project_name,
  brand_id,
  brand_name,
  brand_status = "approved",
  role = "owner",
}) {
  return {
    tenant_id,
    tenant_name,
    project_id,
    project_name,
    brand_id,
    brand_name,
    brand_status,
    membership_role: role,
  };
}

class CustomerWorkspaceRepository {
  getWorkspaceForAuthUserId(_authUserId) {
    throw new Error(
      "CustomerWorkspaceRepository.getWorkspaceForAuthUserId is not implemented"
    );
  }

  bootstrapWorkspace(_request) {
    throw new Error(
      "CustomerWorkspaceRepository.bootstrapWorkspace is not implemented"
    );
  }
}

class InMemoryCustomerWorkspaceRepository extends CustomerWorkspaceRepository {
  constructor({ workspaces = [] } = {}) {
    super();
    this.workspaces = new Map(
      workspaces.map((workspace) => [workspace.auth_user_id, clone(workspace)])
    );
  }

  getWorkspaceForAuthUserId(authUserId) {
    return clone(this.workspaces.get(authUserId)?.workspace || null);
  }

  bootstrapWorkspace({ auth_user_id, business_name }) {
    const existing = this.workspaces.get(auth_user_id);
    if (existing) {
      return clone(existing.workspace);
    }

    const ids = defaultWorkspaceIds(auth_user_id);
    const businessName = business_name || "BizGenie Workspace";
    const workspace = workspaceDto({
      ...ids,
      tenant_name: `${businessName} Workspace`,
      project_name: `${businessName} Campaign Workspace`,
      brand_name: businessName,
      role: "owner",
    });

    this.workspaces.set(auth_user_id, {
      auth_user_id,
      workspace,
    });

    return clone(workspace);
  }
}

module.exports = {
  CustomerWorkspaceRepository,
  InMemoryCustomerWorkspaceRepository,
  defaultWorkspaceIds,
  workspaceDto,
};
