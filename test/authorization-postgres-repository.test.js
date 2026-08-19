const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  PostgresAuthorizationRepository,
} = require("../src/authorization");

class RecordingPool {
  constructor(rows) {
    this.rows = [...rows];
    this.calls = [];
  }

  async query(text, values) {
    this.calls.push({ text, values });
    return { rows: [this.rows.shift()].filter(Boolean) };
  }
}

describe("PostgresAuthorizationRepository", () => {
  it("resolves every ownership link with parameterized scoped queries", async () => {
    const authUserId = "11111111-1111-4111-8111-111111111111";
    const pool = new RecordingPool([
      { auth_user_id: authUserId },
      { tenant_id: "tenant_a" },
      { tenant_id: "tenant_a", auth_user_id: authUserId, role: "owner" },
      { project_id: "project_a", tenant_id: "tenant_a" },
      { brand_id: "brand_a", project_id: "project_a" },
    ]);
    const repository = new PostgresAuthorizationRepository({ pool });

    assert.equal(
      (await repository.getCustomerProfileByAuthUserId(authUserId)).auth_user_id,
      authUserId
    );
    assert.equal((await repository.getTenantById("tenant_a")).tenant_id, "tenant_a");
    assert.equal(
      (await repository.getTenantMembership("tenant_a", authUserId)).role,
      "owner"
    );
    assert.equal(
      (await repository.getProjectById("project_a")).tenant_id,
      "tenant_a"
    );
    assert.equal(
      (
        await repository.getBrandByProjectAndBrand("project_a", "brand_a")
      ).brand_id,
      "brand_a"
    );

    assert.deepEqual(pool.calls.map((call) => call.values), [
      [authUserId],
      ["tenant_a"],
      ["tenant_a", authUserId],
      ["project_a"],
      ["project_a", "brand_a"],
    ]);
    assert.match(pool.calls[4].text, /where project_id = \$1\s+and brand_id = \$2/i);
  });

  it("returns null without leaking a missing row", async () => {
    const repository = new PostgresAuthorizationRepository({
      pool: new RecordingPool([]),
    });
    assert.equal(await repository.getProjectById("unknown"), null);
  });
});
