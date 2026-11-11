// PROPOSAL ONLY (not deployed, not run against any real database). Read-only, in-process proof of the deployed app pool.
// Prints role NAMES, booleans and the unmodified preflight() result. Never prints the connection string or any row of application data.
const { Pool } = require("pg");
const { preflight } = require(process.env.PREFLIGHT_PATH || "/app/src/workspace-onboarding/preflight.js");
(async () => {
  const pool = new Pool({ connectionString: process.env.BRAND_BRAIN_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  const c = await pool.connect();
  try {
    await c.query("begin read only");
    const who = (await c.query("select current_user as current_user_name, session_user as session_user_name")).rows[0];
    const role = (await c.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user")).rows[0];
    const tables = ["workspace_onboarding_profiles", "tenant_memberships", "projects", "brand_brains"];
    const grants = (await c.query(
      `select t as table_name,
         has_table_privilege(current_user, 'public.'||t, 'select') as can_select,
         has_table_privilege(current_user, 'public.'||t, 'insert') as can_insert,
         has_table_privilege(current_user, 'public.'||t, 'update') as can_update,
         (select relrowsecurity from pg_class where oid = ('public.'||t)::regclass) as rls_enabled,
         (select relforcerowsecurity from pg_class where oid = ('public.'||t)::regclass) as rls_forced,
         (select count(*) from pg_policy where polrelid = ('public.'||t)::regclass)::int as policies,
         (select pg_get_userbyid(relowner) = current_user from pg_class where oid = ('public.'||t)::regclass) as is_owner
       from unnest($1::text[]) as t`, [tables])).rows;
    let pf; try { pf = await preflight(c); } catch (e) { pf = { error: e.constructor.name }; }
    console.log(JSON.stringify({ who, role, grants, preflight: pf }));
    await c.query("rollback");
  } finally { c.release(); await pool.end(); }
})().catch((e) => { console.log(JSON.stringify({ error: e.code || e.constructor.name })); process.exit(1); });
