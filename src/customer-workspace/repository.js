const { randomUUID } = require("node:crypto");

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

function additionalWorkspaceIds() {
  const suffix = randomUUID().replaceAll("-", "");
  return {
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
    throw new Error("CustomerWorkspaceRepository.getWorkspaceForAuthUserId is not implemented");
  }
  listWorkspacesForAuthUserId(_authUserId) {
    throw new Error("CustomerWorkspaceRepository.listWorkspacesForAuthUserId is not implemented");
  }
  bootstrapWorkspace(_request) {
    throw new Error("CustomerWorkspaceRepository.bootstrapWorkspace is not implemented");
  }
  createAdditionalWorkspace(_request) {
    throw new Error("CustomerWorkspaceRepository.createAdditionalWorkspace is not implemented");
  }
  getAuthorizedWorkspaceSelection(_request) {
    throw new Error("CustomerWorkspaceRepository.getAuthorizedWorkspaceSelection is not implemented");
  }
}

class InMemoryCustomerWorkspaceRepository extends CustomerWorkspaceRepository {
  constructor({ workspaces = [] } = {}) {
    super();
    this.workspaces = new Map();
    for (const item of workspaces) {
      const list = this.workspaces.get(item.auth_user_id) || [];
      list.push(clone(item.workspace));
      this.workspaces.set(item.auth_user_id, list);
    }
  }

  getWorkspaceForAuthUserId(authUserId) {
    const rows = this.workspaces.get(authUserId) || [];
    return rows.length === 1 ? clone(rows[0]) : null;
  }

  listWorkspacesForAuthUserId(authUserId) {
    return structuredClone(this.workspaces.get(authUserId) || []);
  }

  bootstrapWorkspace({ auth_user_id, business_name }) {
    const existing = this.workspaces.get(auth_user_id) || [];
    if (existing.length) return clone(existing[0]);

    const ids = defaultWorkspaceIds(auth_user_id);
    const businessName = business_name || "BizGenie Workspace";
    const workspace = workspaceDto({
      ...ids,
      tenant_name: `${businessName} Workspace`,
      project_name: `${businessName} Campaign Workspace`,
      brand_name: businessName,
      role: "owner",
    });
    this.workspaces.set(auth_user_id, [workspace]);
    return clone(workspace);
  }

  createAdditionalWorkspace({ auth_user_id, tenant_id, business_name }) {
    const rows = this.workspaces.get(auth_user_id) || [];
    const parent = rows.find((workspace) => workspace.tenant_id === tenant_id && workspace.membership_role === "owner");
    if (!parent) return null;
    const ids = additionalWorkspaceIds();
    const businessName = business_name || "BizGenie Workspace";
    const workspace = workspaceDto({
      tenant_id,
      tenant_name: parent.tenant_name,
      ...ids,
      project_name: `${businessName} Campaign Workspace`,
      brand_name: businessName,
      role: parent.membership_role,
    });
    rows.push(workspace);
    this.workspaces.set(auth_user_id, rows);
    return clone(workspace);
  }

  getAuthorizedWorkspaceSelection({ auth_user_id, tenant_id, project_id, brand_id }) {
    const rows = this.workspaces.get(auth_user_id) || [];
    return clone(rows.find((workspace) =>
      workspace.tenant_id === tenant_id &&
      workspace.project_id === project_id &&
      workspace.brand_id === brand_id &&
      workspace.brand_status === "approved"
    ) || null);
  }
}

module.exports = {
  CustomerWorkspaceRepository,
  InMemoryCustomerWorkspaceRepository,
  additionalWorkspaceIds,
  defaultWorkspaceIds,
  workspaceDto,
};
