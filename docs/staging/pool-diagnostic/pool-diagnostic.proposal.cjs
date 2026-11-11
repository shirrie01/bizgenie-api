"use strict";
// BG-017C-07 — read-only SEPARATE-PROCESS pool diagnostic. PROPOSAL ONLY: not approved, not deployed, not run against any real database.
//
// EVIDENCE CLASS: this process builds its OWN NEW pg Pool (max 1). It is NOT an observation of the already-running Cloud Run application's pool and
// it does not close the #213 existing-process gate by itself. Its findings describe the new connection this process makes, and are comparable to the
// application only if image digest, DB-URL secret version, connection mechanism (host kind, user, TLS) and target database are shown equivalent.
//
// Read-only: `begin read only`, transaction-local statement/lock/idle timeouts, catalog statements and the unmodified preflight() only; no application
// row is selected; one JSON line is printed; the URL, password, raw errors and stack traces are never printed; errors are reduced to allowlisted codes.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const VERSION = "pool-diagnostic.v2";
const EVIDENCE_CLASS = "SEPARATE_PROCESS_NEW_POOL_NOT_EXISTING_APP_POOL";
const STAGING_REF = "zrczojyxebwjgpymbmgu";
const PRODUCTION_REF = "uvgblmejpbswkvlqvqmz";
const APP_ROOTS = Object.freeze(["/app", "/workspace"]); // allowlisted image layouts; no environment override
const MODULE_DIR = "src/workspace-onboarding";
// sha256 of the reviewed files at f1fc2f51502793d9fb03617f30fd72b5a61c1e2e (identical in #213/#214/#215/#220/#230). A different image fails closed.
const REVIEWED = Object.freeze({
  "preflight.js": "a086a38821d10d7c2f781c85e003440f792165f4a7853c5dafcde4bc5ccea8a1",
  "errors.js": "efb462f43a912f307246d36c72e948f2ebf58807ba67f117d7b28f85faad96f0",
  "schemaContract.json": "e613f97985d70c74ae6a5ca4d470e386ff84f73f8ad593b072de4951a3ca4a33",
  "schemaContractProfessional.json": "2c888b06dd5c7e5f19bef235404df7634589272fab45dba9f509b69613cf939d",
});
const TABLES = Object.freeze(["workspace_onboarding_profiles", "tenant_memberships", "projects", "brand_brains"]);
const EXIT = Object.freeze({
  accepted: 0, config_invalid: 10, target_not_allowed: 11, module_unavailable: 12, module_mismatch: 13, connect_failed: 14, query_failed: 15,
  timeout: 16, preflight_failed: 17, schema_not_accepted: 18, privilege_not_accepted: 19, rls_not_accepted: 20, cleanup_failed: 21, internal_error: 22,
});
class DiagnosticError extends Error { constructor(code) { super(code); this.code = EXIT[code] === undefined ? "internal_error" : code; } }
const fail = (code) => { throw new DiagnosticError(code); };
const FORBIDDEN_URL_PARAMS = ["host", "hostaddr", "user", "dbname", "options", "service", "passfile", "port", "password"];

// A1: the URL is required, must be PostgreSQL, must carry its own host/user/database (no client-default fallback), and must bind to the reviewed STAGING project.
// A host-name match is necessary, NOT sufficient proof of database identity: the report says so (target.identity = "url-binding-only").
function parseTarget(env) {
  if (Object.keys(env).some((k) => k.startsWith("PG"))) fail("config_invalid"); // PG* variables would silently supply client defaults
  const raw = env.BRAND_BRAIN_DATABASE_URL;
  if (typeof raw !== "string" || !raw.trim()) fail("config_invalid");
  let u; try { u = new URL(raw.trim()); } catch { fail("config_invalid"); }
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.hostname || !u.username || !u.password || u.pathname.length < 2) fail("config_invalid");
  for (const p of FORBIDDEN_URL_PARAMS) if (u.searchParams.has(p)) fail("config_invalid");
  const host = u.hostname.toLowerCase();
  if (raw.includes(PRODUCTION_REF) || host.includes(PRODUCTION_REF)) fail("target_not_allowed");
  const direct = host === `db.${STAGING_REF}.supabase.co` && u.username === "postgres";
  const pooler = host.endsWith(".pooler.supabase.com") && u.username === `postgres.${STAGING_REF}`;
  if (!direct && !pooler) fail("target_not_allowed");
  return Object.freeze({ connectionString: raw.trim(), host_kind: direct ? "direct" : "pooler", port: u.port || "5432", sslmode_param: u.searchParams.get("sslmode") || null, identity: "url-binding-only" });
}

// A6: fixed allowlisted layouts only; every file the preflight needs must match the reviewed digest before it is loaded; import failures are bounded.
function loadReviewedModule({ fsImpl = fs, requireImpl = require, roots = APP_ROOTS, reviewed = REVIEWED } = {}) { // roots/reviewed are code-level injection for tests only; there is NO environment override
  for (const root of roots) {
    const dir = path.join(root, MODULE_DIR);
    let present = false;
    try { present = fsImpl.existsSync(path.join(dir, "preflight.js")); } catch { fail("module_unavailable"); }
    if (!present) continue;
    const digests = {};
    for (const [name, expected] of Object.entries(reviewed)) {
      let buf; try { buf = fsImpl.readFileSync(path.join(dir, name)); } catch { fail("module_unavailable"); }
      digests[name] = crypto.createHash("sha256").update(buf).digest("hex");
      if (digests[name] !== expected) fail("module_mismatch");
    }
    let mod; try { mod = requireImpl(path.join(dir, "preflight.js")); } catch { fail("module_unavailable"); }
    if (!mod || typeof mod.preflight !== "function") fail("module_unavailable");
    return Object.freeze({ preflight: mod.preflight, layout_root: root, verified: true });
  }
  return fail("module_unavailable");
}

const Q_WHO = "select current_user as current_user_name, session_user as session_user_name, current_database() as database_name, current_setting('server_version') as server_version, current_setting('row_security') as row_security_setting";
const Q_ROLE = "select rolsuper, rolbypassrls, rolinherit from pg_roles where rolname = current_user";
const Q_SSL = "select coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as ssl_in_use";
// Catalog/ACL/policy only. row_security_active() is the EFFECTIVE setting for current_user (ownership, BYPASSRLS, FORCE and the row_security GUC all folded in).
const Q_TABLES = `select t as table_name,
  has_table_privilege(current_user, 'public.'||t, 'select') as can_select,
  has_table_privilege(current_user, 'public.'||t, 'insert') as can_insert,
  has_table_privilege(current_user, 'public.'||t, 'update') as can_update,
  c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced, row_security_active(c.oid) as rls_effective_for_role,
  pg_get_userbyid(c.relowner) as owner_name, (c.relowner = (select oid from pg_roles where rolname = current_user)) as is_owner,
  (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
  (select count(*) from pg_policy p where p.polrelid = c.oid and (0 = any(p.polroles) or exists (select 1 from unnest(p.polroles) r where r <> 0 and pg_has_role(current_user, r, 'member'))))::int as policies_applicable_to_role
  from unnest($1::text[]) as t join pg_class c on c.oid = ('public.' || t)::regclass order by t`;

function classify(grants, preflight) {
  const onboarding = grants.find((g) => g.table_name === "workspace_onboarding_profiles");
  const privilegeOk = Boolean(onboarding && onboarding.can_select && onboarding.can_insert && onboarding.can_update) &&
    grants.filter((g) => g.table_name !== "workspace_onboarding_profiles").every((g) => g.can_select);
  const rls = grants.map((g) => {
    let effect = "not_applied_to_this_role";
    if (g.rls_effective_for_role) effect = g.policies_applicable_to_role > 0 ? "applied_with_policy" : "applied_no_policy_denies_all";
    return { table_name: g.table_name, effect };
  });
  const rlsOk = !rls.some((r) => r.effect === "applied_no_policy_denies_all");
  if (!preflight || preflight.professional !== true) return { status: "schema_not_accepted", privilegeOk, rls, rlsOk };
  if (!privilegeOk) return { status: "privilege_not_accepted", privilegeOk, rls, rlsOk };
  if (!rlsOk) return { status: "rls_not_accepted", privilegeOk, rls, rlsOk };
  return { status: "accepted", privilegeOk, rls, rlsOk };
}

// A5: acquisition, rollback, release and pool shutdown are all inside the protected boundary; the first failure is preserved over any cleanup failure.
async function run({ env = process.env, pgModule, loader = loadReviewedModule, overallMs = 45000 } = {}) {
  let pool = null, client = null, status = "internal_error", report = {}, primary = null, cleanupFailed = false;
  const work = (async () => {
    const target = parseTarget(env);
    const mod = loader();
    const { Pool } = pgModule || require("pg");
    pool = new Pool({ connectionString: target.connectionString, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 8000, idle_in_transaction_session_timeout: 10000, application_name: "bg017c07-pool-diagnostic" });
    try { client = await pool.connect(); } catch { fail("connect_failed"); }
    const q = async (sql, params) => { try { return await client.query(sql, params); } catch { throw new DiagnosticError("query_failed"); } };
    await q("begin read only");
    await q("set local statement_timeout = '5s'");
    await q("set local lock_timeout = '1s'");
    await q("set local idle_in_transaction_session_timeout = '10s'");
    const who = (await q(Q_WHO)).rows[0];
    const role = (await q(Q_ROLE)).rows[0];
    const ssl = (await q(Q_SSL)).rows[0];
    const grants = (await q(Q_TABLES, [TABLES])).rows;
    if (!who || !role || !ssl || grants.length !== TABLES.length) fail("query_failed");
    let preflight;
    try { preflight = await mod.preflight(client); } catch { fail("preflight_failed"); }
    const verdict = classify(grants, preflight);
    status = verdict.status;
    report = {
      target: { host_kind: target.host_kind, port: target.port, sslmode_param: target.sslmode_param, identity: target.identity, database_name: who.database_name, secret_reference: "UNVERIFIED by this script (check the Job definition)" },
      connection: { current_user_name: who.current_user_name, session_user_name: who.session_user_name, server_version: who.server_version, ssl_in_use: ssl.ssl_in_use, row_security_setting: who.row_security_setting },
      role: { rolsuper: role.rolsuper, rolbypassrls: role.rolbypassrls, rolinherit: role.rolinherit },
      grants, rls_effect: verdict.rls, preflight, module: { layout_root: mod.layout_root, digests_verified: mod.verified },
    };
  })();
  let timer;
  try {
    await Promise.race([work, new Promise((_, rej) => { timer = setTimeout(() => rej(new DiagnosticError("timeout")), overallMs); })]);
  } catch (e) { primary = e instanceof DiagnosticError ? e.code : "internal_error"; status = primary; report = {}; }
  clearTimeout(timer);
  if (client) { try { await client.query("rollback"); } catch { cleanupFailed = true; } try { client.release(); } catch { cleanupFailed = true; } }
  if (pool) { try { await pool.end(); } catch { cleanupFailed = true; } }
  if (cleanupFailed && status === "accepted") status = "cleanup_failed"; // never overwrites an earlier failure
  const out = { diagnostic_version: VERSION, evidence_class: EVIDENCE_CLASS, existing_app_pool_observed: false, status, accepted: status === "accepted",
    tenant_isolation_asserted: false, cleanup_ok: !cleanupFailed, ...report };
  return { status, exit: EXIT[status], output: out };
}

module.exports = { run, parseTarget, loadReviewedModule, classify, REVIEWED, EXIT, VERSION, EVIDENCE_CLASS, TABLES };
// Runs as a file (`node file`) or, for a Job whose image does not contain the file, as `node -e "<exact reviewed text>"` with POOL_DIAGNOSTIC_AUTORUN=1.
if (require.main === module || process.env.POOL_DIAGNOSTIC_AUTORUN === "1") {
  run().then((r) => { process.stdout.write(JSON.stringify(r.output) + "\n"); process.exitCode = r.exit; }, () => { process.stdout.write(JSON.stringify({ diagnostic_version: VERSION, status: "internal_error", accepted: false }) + "\n"); process.exitCode = EXIT.internal_error; });
}
