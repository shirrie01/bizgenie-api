#!/usr/bin/env bash
# BG-STUDIO-016: LOCAL logical dump/restore rehearsal on a throwaway loopback PostgreSQL.
# This supports the ENGINEERING PROCEDURE only. It is NOT proof that a Supabase managed backup, PITR window or dashboard
# restore works, that its retention is adequate, or that its RTO/RPO are acceptable. Refuses non-loopback hosts.
set -uo pipefail
export PGOPTIONS="-c client_min_messages=warning"
PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-55432}"; PGUSER="${PGUSER:-postgres}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo "REFUSED: loopback only"; exit 2;; esac
REPO="${REPO:-$(git rev-parse --show-toplevel)}"; HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="${SRC:-bg016_rehearsal}"; DST="bg016_restored"; DUMP="$(mktemp -d)/src.dump"
Q() { psql -X -At -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
PASS=0; FAIL=0; FINDINGS=0; ok(){ echo "PASS  $1"; PASS=$((PASS+1)); }; bad(){ echo "FAIL  $1"; FAIL=$((FAIL+1)); }
now_ms(){ date +%s%3N; }

echo "== 0. source ($SRC) must already hold the migrated schema and fixtures (run bg016_migration_rehearsal.sh first)"
Q -d "$SRC" -c "select 1" >/dev/null || { echo "source database missing"; exit 3; }
Q -d "$SRC" -f "$HERE/30_fingerprint.sql" > /tmp/bg016_fp_src.txt; Q -d "$SRC" -f "$HERE/31_rowcounts.sql" > /tmp/bg016_rc_src.txt
echo "   source fingerprint parts: $(wc -l < /tmp/bg016_fp_src.txt); tables counted: $(wc -l < /tmp/bg016_rc_src.txt); onboarding rows: $(Q -d "$SRC" -c 'select count(*) from workspace_onboarding_profiles')"

echo "== 1. backup (custom format) and timing"
t0=$(now_ms); pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc -f "$DUMP" "$SRC" && ok "pg_dump -Fc completed ($(( $(now_ms)-t0 )) ms, $(stat -c %s "$DUMP") bytes)" || bad "pg_dump"

echo "== 2. restore into a SEPARATE, empty database (never over the source)"
Q -d postgres -c "drop database if exists $DST" >/dev/null; Q -d postgres -c "create database $DST" >/dev/null
# Cluster-wide roles already exist (they are not part of a per-database dump); the target database itself must be EMPTY.
t0=$(now_ms); pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DST" --exit-on-error "$DUMP" >/tmp/bg016_restore.log 2>&1 && ok "pg_restore completed ($(( $(now_ms)-t0 )) ms)" || { bad "pg_restore: $(grep -m1 -i error /tmp/bg016_restore.log | cut -c1-140)"; }

echo "== 3. integrity checks on the restored copy"
Q -d "$DST" -f "$HERE/31_rowcounts.sql" > /tmp/bg016_rc_dst.txt; diff -q /tmp/bg016_rc_src.txt /tmp/bg016_rc_dst.txt >/dev/null && ok "row counts identical for all $(wc -l < /tmp/bg016_rc_dst.txt) tables" || { bad "row counts differ"; diff /tmp/bg016_rc_src.txt /tmp/bg016_rc_dst.txt | head -5; }
Q -d "$DST" -f "$HERE/30_fingerprint.sql" > /tmp/bg016_fp_dst.txt; if diff -q /tmp/bg016_fp_src.txt /tmp/bg016_fp_dst.txt >/dev/null; then ok "structure, constraints, indexes, RLS policies, table ACLs, functions and triggers fingerprints identical"; else bad "fingerprint differs"; diff /tmp/bg016_fp_src.txt /tmp/bg016_fp_dst.txt; fi
a=$(Q -d "$SRC" -c "select string_agg(conname,',' order by conname) from pg_constraint where connamespace='public'::regnamespace and not convalidated"); b=$(Q -d "$DST" -c "select string_agg(conname,',' order by conname) from pg_constraint where connamespace='public'::regnamespace and not convalidated"); [ "$a" = "$b" ] && ok "the same constraints are NOT VALID before and after ($a): inherited from the migrations by design, not caused by the restore" || bad "validated-state differs: src=[$a] dst=[$b]"
v=$(Q -d "$DST" -c "select count(*) from pg_constraint where conrelid='public.workspace_onboarding_profiles'::regclass and not convalidated"); [ "$v" = 0 ] && ok "every onboarding-table constraint is validated after restore" || bad "$v unvalidated onboarding constraints"
v=$(Q -d "$DST" -c "select relrowsecurity::text from pg_class where oid='public.workspace_onboarding_profiles'::regclass"); [ "$v" = true ] && ok "RLS still enabled on the onboarding table" || bad "RLS lost: $v"
for r in anon authenticated service_role; do v=$(Q -d "$DST" -c "select has_table_privilege('$r','public.workspace_onboarding_profiles','select,insert,update,delete')::text"); [ "$v" = false ] && ok "restored: $r still has no privilege" || bad "restored: $r privilege $v"; done
echo "== 4. the BACKEND's own schema preflight against the restored copy (same code that fails closed in production)"
( cd "$REPO" && node -e '
const { Client } = require("pg"); const { preflight } = require("./src/workspace-onboarding/preflight");
(async () => { const c = new Client({ host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || "postgres", database: "'$DST'" });
  await c.connect(); try { await preflight(c); console.log("PREFLIGHT-OK"); } catch (e) { console.log("PREFLIGHT-FAILED " + e.name); } finally { await c.end(); } })();' ) > /tmp/bg016_pf.out 2>&1
if grep -q PREFLIGHT-OK /tmp/bg016_pf.out; then ok "backend onboarding preflight passes on the restored database"
else
  echo "FINDING  backend onboarding preflight REJECTS the logically restored database (onboarding would answer 503 until corrected)."
  echo "         Cause: pg_dump/pg_restore re-renders a nested-AND CHECK constraint with flattened parentheses; the preflight compares raw text."
  Q -d "$SRC" -c "select 'source  : '||regexp_replace(pg_get_constraintdef(oid),'\s+',' ','g') from pg_constraint where conname='workspace_onboarding_profiles_last_idempotency_key_check'"
  Q -d "$DST" -c "select 'restored: '||regexp_replace(pg_get_constraintdef(oid),'\s+',' ','g') from pg_constraint where conname='workspace_onboarding_profiles_last_idempotency_key_check'"
  FINDINGS=$((FINDINGS+1))
fi
if ! grep -q PREFLIGHT-OK /tmp/bg016_pf.out; then
  echo "== 4b. candidate repair on the RESTORED COPY ONLY: re-issue the constraint with its original migration text"
  Q -d "$DST" -c "begin; alter table public.workspace_onboarding_profiles drop constraint workspace_onboarding_profiles_last_idempotency_key_check; alter table public.workspace_onboarding_profiles add constraint workspace_onboarding_profiles_last_idempotency_key_check check (length(last_idempotency_key) between 1 and 128 and last_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*\$'); commit;" >/dev/null
  ( cd "$REPO" && node -e '
const { Client } = require("pg"); const { preflight } = require("./src/workspace-onboarding/preflight");
(async () => { const c = new Client({ host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || "postgres", database: "'$DST'" });
  await c.connect(); try { await preflight(c); console.log("PREFLIGHT-OK"); } catch (e) { console.log("PREFLIGHT-FAILED " + e.name); } finally { await c.end(); } })();' ) > /tmp/bg016_pf.out 2>&1
  grep -q PREFLIGHT-OK /tmp/bg016_pf.out && ok "after re-issuing the constraint with its migration text, the backend preflight passes on the restored copy" || bad "repair did not satisfy the preflight"
fi
echo "== 5. selective recovery pattern (forward recovery without touching the source)"
n0=$(Q -d "$SRC" -c "select count(*) from workspace_onboarding_profiles"); Q -d "$SRC" -c "delete from workspace_onboarding_profiles where tenant_id='tenant-rls'" >/dev/null
n1=$(Q -d "$SRC" -c "select count(*) from workspace_onboarding_profiles")
[ "$n1" -lt "$n0" ] && ok "simulated accidental loss on the source ($n0 -> $n1 rows)" || bad "no loss simulated"
Q -d "$DST" -c "copy (select * from workspace_onboarding_profiles where tenant_id='tenant-rls') to stdout" | Q -d "$SRC" -c "copy workspace_onboarding_profiles from stdin" && ok "lost row copied back from the restored copy" || bad "row recovery"
[ "$(Q -d "$SRC" -c "select count(*) from workspace_onboarding_profiles")" = "$n0" ] && ok "source row count recovered ($n0)" || bad "recovery count"
echo "== cleanup: dropping the restored copy and dump"; Q -d postgres -c "drop database if exists $DST" >/dev/null; rm -f "$DUMP"
echo "== summary: $PASS pass, $FAIL fail, $FINDINGS finding(s)"; [ $FAIL -eq 0 ]
