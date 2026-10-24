#!/usr/bin/env bash
# BG-STUDIO-016: LOCAL DISPOSABLE migration rehearsal. Touches ONLY a throwaway PostgreSQL on loopback.
# It refuses to run against anything that is not 127.0.0.1/localhost, and it never reads or prints a secret.
# This is NOT evidence about Supabase-hosted PostgreSQL, its roles, its backups or its restore; see the plan, section 7 and 11.
set -uo pipefail
export PGOPTIONS="-c client_min_messages=warning"
PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-55432}"; PGUSER="${PGUSER:-postgres}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo "REFUSED: rehearsal only runs against loopback (got $PGHOST)"; exit 2;; esac
REPO="${REPO:-$(git rev-parse --show-toplevel)}"; MIG="$REPO/supabase/migrations"; HERE="$(cd "$(dirname "$0")" && pwd)"
P() { psql -X -q -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
Q() { psql -X -At -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
DB="bg016_rehearsal"; PASS=0; FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
expect_fail() { local name="$1"; shift; if "$@" >/tmp/bg016_expect_fail.out 2>&1; then bad "$name (expected an error, got success)"; else ok "$name (failed as designed: $(grep -m1 -E 'ERROR|exception' /tmp/bg016_expect_fail.out | cut -c1-110))"; fi; }
fresh() { Q -d postgres -c "drop database if exists $DB" >/dev/null; Q -d postgres -c "create database $DB" >/dev/null
  P -d $DB -f "$HERE/00_supabase_stub.sql" >/dev/null; }
apply() { P -d $DB -f "$MIG/$1" >/dev/null; }
PRE=$(ls "$MIG" | grep -v -E '^(20261023100000|20261024090000)_' | sort)
BASE=20261023100000_create_workspace_onboarding_profiles.sql; HARD=20261024090000_harden_workspace_onboarding_profiles.sql

echo "== server: $(Q -d postgres -c 'show server_version')  (hosted staging version is UNKNOWN; backend preflight fingerprint is pinned to PG17 per BG-STUDIO-011-BE)"

echo "== 1. ordering: all prerequisites then base then hardening"
fresh; n=0; for f in $PRE; do apply "$f" && n=$((n+1)) || { bad "prerequisite $f"; break; }; done; ok "$n prerequisite migrations applied in filename order"
apply $BASE && ok "base onboarding migration applied" || bad "base"
apply $HARD && ok "hardening migration applied" || bad "hardening"
echo "   migration prerequisites named in the onboarding files (repository-confirmed):"
Q -d $DB -c "select 'parent unique (project_id,brand_id) on brand_brains: '||count(*) from pg_constraint where conrelid='public.brand_brains'::regclass and contype in ('u','p') and pg_get_constraintdef(oid) ilike '%project_id, brand_id%'"
Q -d $DB -c "select 'parent unique (project_id,tenant_id) on projects: '||count(*) from pg_constraint where conrelid='public.projects'::regclass and contype in ('u','p') and pg_get_constraintdef(oid) ilike '%project_id, tenant_id%'"

echo "== 2. idempotency: re-apply both on the same database"
apply $BASE && ok "base is re-runnable (create if not exists; grants re-asserted)" || bad "base re-run"
apply $HARD && ok "hardening is re-runnable (constraints added only if absent)" || bad "hardening re-run"

echo "== 3. failure handling and transaction safety"
fresh; for f in $PRE; do apply "$f"; done
expect_fail "hardening before base is refused" apply $HARD
[ "$(Q -d $DB -c "select to_regclass('public.workspace_onboarding_profiles') is null")" = t ] && ok "refused hardening left no table behind" || bad "unexpected table"
apply $BASE
Q -d $DB -c "insert into auth.users values ('11111111-1111-4111-8111-111111111111'); insert into customer_profiles(auth_user_id) values ('11111111-1111-4111-8111-111111111111');" >/dev/null
P -d $DB -f "$HERE/10_seed_violation.sql" >/dev/null && ok "seeded a row whose project/tenant pair does not exist (a violation the hardening FK must reject)" || bad "seed"
expect_fail "hardening is refused on violating data (no guessing, no rewriting)" apply $HARD
n=$(Q -d $DB -c "select count(*) from pg_constraint where conrelid='public.workspace_onboarding_profiles'::regclass and conname in ('workspace_onboarding_profiles_project_tenant_fkey','workspace_onboarding_channels_values')"); [ "$n" = 0 ] && ok "failed hardening rolled back completely (0 of its constraints present); base state intact (forward recovery = fix data, re-run)" || bad "partial hardening ($n)"
Q -d $DB -c "delete from workspace_onboarding_profiles" >/dev/null; apply $HARD && ok "after the data is corrected the same file applies cleanly" || bad "re-apply after repair"

echo "== 4. catalog state the backend preflight compares against"
Q -d $DB -c "select 'rls_enabled='||relrowsecurity::text||' kind='||relkind::text||' policies='||(select count(*) from pg_policy where polrelid=c.oid) from pg_class c where oid='public.workspace_onboarding_profiles'::regclass"
Q -d $DB -c "select 'role '||rolname||' table_privs='||has_table_privilege(oid,'public.workspace_onboarding_profiles','select,insert,update,delete')::text from pg_roles where rolname in ('anon','authenticated','service_role') order by 1"
Q -d $DB -c "select 'constraints='||count(*)||' all_validated='||bool_and(convalidated)::text from pg_constraint where conrelid='public.workspace_onboarding_profiles'::regclass"

echo "== 5. RLS and role checks (RLS is enabled with NO policies: only the owner or a BYPASSRLS role can use the table)"
P -d $DB -f "$HERE/20_rls_roles.sql" >/dev/null && ok "role fixtures created" || bad "role fixtures"
R() { psql -X -At -h "$PGHOST" -p "$PGPORT" -U "$1" -d $DB -c "$2" 2>&1 | head -1; }
v=$(R bg_rt_nobypass "select count(*) from workspace_onboarding_profiles"); [ "$v" = 0 ] && ok "non-owner without BYPASSRLS granted SELECT sees 0 rows (silently empty, not an error)" || bad "nobypass saw: $v"
v=$(R bg_rt_nobypass "insert into workspace_onboarding_profiles(tenant_id,project_id,brand_id,profile_version,status,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash) values ('tenant-rls','p-rls','b-rls',2,'in_progress',now(),now(),'11111111-1111-4111-8111-111111111111','k3',repeat('c',64))"); case "$v" in *"row-level security"*) ok "non-owner without BYPASSRLS cannot insert: $v";; *) bad "nobypass insert: $v";; esac
v=$(R bg_rt_bypass "select count(*) from workspace_onboarding_profiles"); [ "$v" -ge 1 ] 2>/dev/null && ok "BYPASSRLS role sees the rows" || bad "bypass saw: $v"
v=$(R bg_rt_owner "select count(*) from workspace_onboarding_profiles"); [ "$v" -ge 1 ] 2>/dev/null && ok "table-owner role sees the rows (no FORCE RLS)" || bad "owner saw: $v"
for r in anon authenticated service_role; do v=$(Q -d $DB -c "select has_table_privilege('$r','public.workspace_onboarding_profiles','select,insert,update,delete')"); [ "$v" = f ] && ok "$r has no table privilege" || bad "$r has privilege: $v"; done
v=$(Q -d $DB -c "select count(*) from aclexplode((select relacl from pg_class where oid='public.workspace_onboarding_profiles'::regclass)) a where a.grantee=0"); [ "$v" = 0 ] && ok "no PUBLIC grant" || bad "public grant: $v"
echo "   => the deployed backend role must be the table owner or have BYPASSRLS; otherwise every onboarding read looks like 'no data' and writes fail."
echo "      Verify on the real target with: select rolname,rolsuper,rolbypassrls from pg_roles where rolname = <backend role>;  (NOT EXECUTED - REQUIRES APPROVAL)"

echo "== summary: $PASS pass, $FAIL fail (shell assertions); SQL assertions listed above"
[ $FAIL -eq 0 ]
