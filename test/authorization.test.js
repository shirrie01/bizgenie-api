const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  AuthorizationService,
  InMemoryAuthorizationRepository,
  createCustomerActorFromVerifiedIdentity,
} = require("../src/authorization");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function fixture() {
  const repository = new InMemoryAuthorizationRepository({
    customerProfiles: [
      { auth_user_id: USER_A, display_name: "Customer A" },
      { auth_user_id: USER_B, display_name: "Customer B" },
    ],
    tenants: [
      { tenant_id: "tenant_a", name: "Tenant A", created_by: USER_A },
      { tenant_id: "tenant_b", name: "Tenant B", created_by: USER_B },
    ],
    memberships: [
      { tenant_id: "tenant_a", auth_user_id: USER_A, role: "owner" },
      { tenant_id: "tenant_b", auth_user_id: USER_B, role: "owner" },
    ],
    projects: [
      { project_id: "project_a", tenant_id: "tenant_a", name: "Project A" },
      { project_id: "project_b", tenant_id: "tenant_b", name: "Project B" },
    ],
    brands: [
      { brand_id: "brand_a", project_id: "project_a", name: "Brand A" },
      { brand_id: "brand_b", project_id: "project_b", name: "Brand B" },
    ],
  });

  return {
    repository,
    service: new AuthorizationService({ repository }),
    actorA: createCustomerActorFromVerifiedIdentity({
      verifiedAuthUserId: USER_A,
    }),
    actorB: createCustomerActorFromVerifiedIdentity({
      verifiedAuthUserId: USER_B,
    }),
  };
}

describe("customer identity contract", () => {
  it("anchors a customer actor to a verified Supabase Auth UUID", () => {
    const actor = createCustomerActorFromVerifiedIdentity({
      verifiedAuthUserId: USER_A,
    });
    assert.deepEqual(actor, { kind: "customer", auth_user_id: USER_A });
    assert.equal(Object.isFrozen(actor), true);
  });

  it("does not allow a client-supplied user_id to establish identity", () => {
    assert.throws(
      () =>
        createCustomerActorFromVerifiedIdentity({
          requestBody: { user_id: USER_A },
        }),
      AuthenticationRequiredError
    );
  });
});

describe("tenant, project, and brand authorization", () => {
  it("authorizes a member of the owning tenant for its project", async () => {
    const { service, actorA } = fixture();
    const result = await service.authorizeProject({
      actor: actorA,
      tenantId: "tenant_a",
      projectId: "project_a",
      action: "project:read",
    });

    assert.deepEqual(result, {
      actor: actorA,
      tenant_id: "tenant_a",
      membership_role: "owner",
      action: "project:read",
      project_id: "project_a",
    });
  });

  it("resolves the complete authenticated tenant/project/brand chain", async () => {
    const { service, actorA } = fixture();
    const result = await service.authorizeProjectBrand({
      actor: actorA,
      tenantId: "tenant_a",
      projectId: "project_a",
      brandId: "brand_a",
      action: "brand:read",
    });

    assert.equal(result.actor.auth_user_id, USER_A);
    assert.equal(result.tenant_id, "tenant_a");
    assert.equal(result.project_id, "project_a");
    assert.equal(result.brand_id, "brand_a");
  });

  it("does not authorize Tenant A for Tenant B's project", async () => {
    const { service, actorA } = fixture();
    await assert.rejects(
      service.authorizeProject({
        actor: actorA,
        tenantId: "tenant_a",
        projectId: "project_b",
        action: "project:read",
      }),
      (error) =>
        error instanceof AuthorizationDeniedError &&
        error.code === "RESOURCE_NOT_AVAILABLE"
    );
  });

  it("uses the same fail-closed denial for non-membership and unknown resources", async () => {
    const { service, actorA } = fixture();
    for (const request of [
      {
        actor: actorA,
        tenantId: "tenant_b",
        projectId: "project_b",
        action: "project:read",
      },
      {
        actor: actorA,
        tenantId: "tenant_missing",
        projectId: "project_missing",
        action: "project:read",
      },
    ]) {
      await assert.rejects(
        service.authorizeProject(request),
        (error) =>
          error.status === 404 && error.code === "RESOURCE_NOT_AVAILABLE"
      );
    }
  });

  it("does not accept an administrator or service principal as customer membership", async () => {
    const { service } = fixture();
    for (const actor of [
      { kind: "administrator" },
      { kind: "service", service_id: "make", scopes: ["generation:execute"] },
    ]) {
      await assert.rejects(
        service.authorizeProject({
          actor,
          tenantId: "tenant_a",
          projectId: "project_a",
          action: "project:read",
        }),
        AuthorizationDeniedError
      );
    }
  });
});
