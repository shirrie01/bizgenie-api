// MIGRATION REHEARSAL (BG-LAUNCH-005). Applies every repository migration, in order, to a brand-new database inside a DISPOSABLE local PostgreSQL 17, then checks ordering, additive-only
// behaviour and the privilege model of the newest tables. It can never be pointed at a shared or hosted database: the connection must be loopback, must not look like Supabase,
// and the server must be PostgreSQL 17. Both existing Supabase projects hold data and are not touched by anything here.
//   TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:5432/postgres node scripts/rehearse-migrations.js [--allow-older]   (--allow-older runs the checks on PG<17 but labels the result NOT a PG17 rehearsal)
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");

const dir = path.join(__dirname, "../supabase/migrations");
const url = process.env.TEST_DATABASE_URL;
const allowOlder = process.argv.includes("--allow-older");
const fail = (code, message) => { console.error(JSON.stringify({ ok: false, refused: message })); process.exit(code); };

if (!url) fail(2, "TEST_DATABASE_URL is required");
const target = new URL(url);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname)) fail(2, "refusing: the rehearsal database must be on loopback (a disposable local PostgreSQL), not " + target.hostname);
if (/supabase|pooler|amazonaws|azure|googleapis|neon\.tech/i.test(url) || /supabase/i.test(process.env.SUPABASE_URL || "") && target.hostname === new URL(process.env.SUPABASE_URL).hostname) fail(2, "refusing: this looks like a hosted database");

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const NEW = files.filter((f) => f >= "20261031000000");               // this branch's additive migrations
const DESTRUCTIVE = /\b(drop\s+table|truncate|delete\s+from|drop\s+column|drop\s+schema)\b/i;

(async () => {
  const admin = new Pool({ connectionString: url, max: 1 });
  const version = Number((await admin.query("show server_version_num")).rows[0].server_version_num);
  if (version < 170000 && !allowOlder) { await admin.end(); fail(3, `refusing: PostgreSQL 17 is required for a rehearsal (server_version_num ${version}); use --allow-older only for a local dry run`); }
  const db = "rehearsal_" + randomUUID().replaceAll("-", ""); await admin.query(`create database ${db}`);
  target.pathname = "/" + db; const pool = new Pool({ connectionString: target.toString(), max: 2 });
  const report = { ok: false, postgres_version_num: version, pg17_rehearsal: version >= 170000, migrations: files.length, new_migrations: NEW, checks: {} };
  try {
    await pool.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$");
    await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
    const counts = async () => Object.fromEntries((await pool.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1")).rows.map((r) => [r.relname, null]));
    const countRows = async (tables) => { const out = {}; for (const t of tables) out[t] = Number((await pool.query(`select count(*) n from public.${t}`)).rows[0].n); return out; };
    for (const f of files.filter((x) => !NEW.includes(x))) await pool.query(fs.readFileSync(path.join(dir, f), "utf8"));
    const before = await countRows(Object.keys(await counts()));
    for (const f of NEW) { const sql = fs.readFileSync(path.join(dir, f), "utf8"); await pool.query(sql); }
    const after = await countRows(Object.keys(before));
    // 1. additive only: no statement in the new migrations can remove data, and no pre-existing table lost a row or disappeared
    report.checks.no_destructive_statements = NEW.every((f) => !DESTRUCTIVE.test(fs.readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, "")));
    report.checks.existing_rows_preserved = Object.entries(before).every(([t, n]) => after[t] >= n);
    report.checks.rows_added = Object.fromEntries(Object.entries(after).filter(([t, n]) => n !== before[t]).map(([t, n]) => [t, n - before[t]]));
    // 2. order: Codex's draft lifecycle runs after the social base and before its private runtime; the preview-profile insert is idempotent
    const idx = (p) => files.findIndex((f) => f.includes(p));
    report.checks.order = idx("create_social_connections_and_dispatch") < idx("add_social_draft_upload_lifecycle") && idx("add_social_draft_upload_lifecycle") < idx("create_private_social_connector_runtime");
    const profiles = (await pool.query("select count(*)::int n from campaign_preview_profiles where status='active'")).rows[0].n;
    for (const f of NEW.filter((x) => /preview_profiles/.test(x))) await pool.query(fs.readFileSync(path.join(dir, f), "utf8"));
    report.checks.profile_insert_idempotent = (await pool.query("select count(*)::int n from campaign_preview_profiles where status='active'")).rows[0].n === profiles && profiles === new (require("../src/campaigns").InMemoryPreviewRegistry)().profiles.size;
    report.checks.instagram_video_not_provisioned = (await pool.query("select 1 from campaign_preview_profiles where profile_id='instagram.feed.video'")).rowCount === 0;
    // 3. privilege model of the credential tables: row security on, and no access for any browser-facing or service role
    const secret = ["social_token_secrets", "social_provider_operations", "social_provider_rate_windows", "social_connector_audit"];
    const rls = (await pool.query("select relname, relrowsecurity from pg_class where relname = any($1) and relkind='r'", [secret])).rows;
    report.checks.credential_tables_rls = rls.length === secret.length && rls.every((r) => r.relrowsecurity);
    const grants = (await pool.query("select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name = any($1) and grantee in ('anon','authenticated','service_role','PUBLIC')", [secret])).rows;
    report.checks.credential_tables_no_role_grants = grants.length === 0;
    report.checks.credential_grant_violations = grants.map((g) => `${g.grantee}:${g.table_name}`);
    // 4. the draft state cannot be a publication, enforced by the database
    const c = (await pool.query("select pg_get_constraintdef(oid) d from pg_constraint where conname='social_draft_not_publication'")).rows[0];
    report.checks.draft_not_publication_constraint = Boolean(c && /operation_kind/.test(c.d));
    report.ok = report.checks.no_destructive_statements && report.checks.existing_rows_preserved && report.checks.order && report.checks.profile_insert_idempotent && report.checks.credential_tables_rls && report.checks.credential_tables_no_role_grants && report.checks.draft_not_publication_constraint;
  } catch (error) { report.error = String(error.message).slice(0, 300); }
  finally { await pool.end(); await admin.query(`drop database ${db}`).catch(() => {}); await admin.end(); }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok && report.pg17_rehearsal ? 0 : report.ok ? 4 : 1);
})();
