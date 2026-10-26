const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { after, before, test } = require("node:test");
const { Pool } = require("pg");
const {
  PostgresBrandBrainRepository,
} = require("../src/brand-brain");

const connectionString = process.env.BRAND_BRAIN_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "BRAND_BRAIN_TEST_DATABASE_URL is required for the optional integration test"
  );
}

const pool = new Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000,
});
const repository = new PostgresBrandBrainRepository({ pool });
const suffix = randomUUID().replaceAll("-", "");
const userId=randomUUID();
const tenantId=`integration_tenant_${suffix}`;
const brandId = `integration_brand_${suffix}`;
const projectId = `integration_project_${suffix}`;

// Current relational schema requires genuine synthetic parent scope, even for this low-level persistence test.
before(async()=>{
 await pool.query('insert into auth.users(id)values($1)',[userId]);
 await pool.query('insert into customer_profiles(auth_user_id)values($1)',[userId]);
 await pool.query('insert into tenants(tenant_id,name,created_by)values($1,$2,$3)',[tenantId,'Synthetic integration fixture',userId]);
 await pool.query('insert into projects(project_id,tenant_id,name)values($1,$2,$3)',[projectId,tenantId,'Synthetic integration fixture']);
});
after(async () => {
  await pool.query("DELETE FROM public.brand_brains WHERE brand_id = $1", [
    brandId,
  ]);
  await pool.query('delete from projects where project_id=$1',[projectId]);
  await pool.query('delete from tenants where tenant_id=$1',[tenantId]);
  await pool.query('delete from customer_profiles where auth_user_id=$1',[userId]);
  await pool.query('delete from auth.users where id=$1',[userId]);
  await pool.end();
});

test("persists across real Postgres repository instances", async () => {
  const value = {
    brand_id: brandId,
    project_id: projectId,
    name: "Brand Brain integration test",
    metadata: {
      version: 1,
      status: "approved",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  await repository.initialize();
  await repository.upsert(value);

  const recreated = new PostgresBrandBrainRepository({ pool });
  assert.deepEqual(await recreated.getByProjectAndBrand(projectId, brandId), value);
  assert.equal(
    await recreated.getByProjectAndBrand(`other_${projectId}`, brandId),
    null
  );
});
