# Migration plan: `20261023100000_create_workspace_onboarding_profiles.sql` (BG-STUDIO-010-BE)

**Status: prepared and tested in a disposable local PostgreSQL only. It has not been executed against any shared, staging or production database and must not be without founder approval.**

## What it does
Creates one new table, `public.workspace_onboarding_profiles` (PK `tenant_id, project_id, brand_id`; FK `(project_id, brand_id)` → `brand_brains`; FK `updated_by` → `customer_profiles`). RLS enabled, all privileges revoked from `public`, `anon`, `authenticated`, `service_role`; no policies. Access is only through `bizgenie-api`'s database role, as with `campaign_goal_recommendations`.

It does **not** alter, backfill, rewrite or lock any existing table, and does not touch `brand_brains`. It is idempotent (`create table if not exists`; rerun verified with data present).

## Why a new table and not `brand_brains`
Campaign snapshots capture the Brand Brain `version`, `updated_at` and hash, and `PUT /customer/workspace/brand-brain` has no concurrency control. Writing preferences there would change snapshot provenance and race with customer edits. A separate table keeps the "do not overwrite Brand Brain content" rule structural. Test: the Brand Brain row is byte-identical before and after saves (in-memory and PostgreSQL).

## Order of operations (for the founder / Codex, when approved)
1. Review the SQL. 2. Apply to **staging** first. 3. Deploy the API build containing this branch (the onboarding routes return `503 ONBOARDING_UNAVAILABLE` until the table exists; every other route is unaffected, since the table is only read by the onboarding routes and, tolerantly, by recommendations). 4. Smoke: `GET/PUT /customer/workspace/onboarding` with a staging account. 5. Only then production.

Apply the migration **before** enabling the frontend flag that reads these fields.

## Rollback
Application: deploy the previous build; the frontend degrades to session-only (its current behaviour). Data: `drop table public.workspace_onboarding_profiles;` removes only onboarding preferences. Nothing else depends on it (recommendations catch lookup errors and fall back to unchanged behaviour). Do not drop it once customers have saved answers unless losing them is accepted.

## Disposable-environment evidence
`test/workspace-onboarding.integration.test.js` creates a throwaway database, applies **all** migrations in order, then proves: save/resume across a fresh service instance, retry after restart, concurrent first writes (exactly one wins), tenant isolation, Brand Brain row unchanged, DB-level constraints (enum, source pairing, size bounds, completed-requires-answers, FK), `anon/authenticated/service_role` denied, and migration rerun without data loss. Gated by `TEST_DATABASE_URL`; it runs in CI under `npm test` against the job's PostgreSQL 17 service.
