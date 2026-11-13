# Workspace onboarding migration and retention plan — BG-STUDIO-011

**Prepared/tested only in disposable local PostgreSQL 17. No shared, staging or production application is authorized by this document.** DEC-020 / LOCK-018 selects A; DEC-015 keeps the Google Sheets Mission Control register canonical.

## Pending schema

1. Existing `20261023100000_create_workspace_onboarding_profiles.sql`: workspace-scoped profile, RLS, denied browser/service-role access and existing source/completion guards.
2. New `20261024090000_harden_workspace_onboarding_profiles.sql`: full `(project_id,tenant_id)` FK to the existing projects unique key; allowed, unique channel values. No Brain mutation, backfill, guessed tenant reassignment, grants, billing or provider columns.

The additional constraints validate existing rows. Bad tenant linkage/duplicate or unknown channels cause a transaction failure, not silent customer-data repair. ALTER/validation may take locks; an authorized operator must assess row count, lock window and deployment ordering. The base migration was not edited.

## Proposed sequence — only after separate founder approval

- Inventory the target's schema, grants, database role/version and existing data through authorized access. Do not assume CREATE IF NOT EXISTS establishes compatibility or rerun the base file to silently reset unexpected grants. No such target inventory was performed here.
- Review/back up through the existing approved database backup process and test restoration in an approved isolated environment. Owner must set retention, restore access and RPO/RTO; no new infrastructure or backup spending is created by this work.
- Validate both pending SQL files on a disposable representative fixture first. Stop on drift or inconsistent rows for explicit correction planning; do not delete or relabel records to make validation pass.
- Apply only in a separately authorized nonproduction change window, with the correct trusted backend DB role. No SQL in this task runs against a shared database.
- Run the repository's read-only `preflight()` after schema application and before enabling writes. It checks ordinary table/RLS, no policies/direct public or browser/service-role grants (including column grants), exact column types/nullability and normalized PostgreSQL 17 constraint definitions against `schemaContract.json`. Unexpected catalog shape fails closed with 503; preflight does not repair schema or privileges. A different PostgreSQL major/schema requires reviewed compatibility evidence rather than loosening guards.
- Prove owner/member behavior, fresh scope/session, lost-response same-key retry, revocation races, business completion and private response headers in an authorized staging E2E. CI/local fixtures are not that proof.

The hardened API does not depend on startup migration execution. Missing or old/unsafe onboarding schema returns `503 ONBOARDING_UNAVAILABLE` for that feature while unrelated routes stay available. Recommendation preference lookup remains tolerant. A schema preflight is a defense against accidental drift, not protection from a malicious privileged DBA who controls the database.

## Retention and account deletion

Profiles are workspace-owned business data, not personal cross-workspace scratchpads. Member removal prevents later writes and can end read access; it does not delete the workspace profile. Brand archival makes it unselectable without deleting history. No automatic retention/deletion duration is invented here.

`updated_by` already references customer_profiles with ON DELETE RESTRICT; workspace/brand FKs also restrict deletion. Account deletion/offboarding therefore needs an approved data-owner procedure: determine retained business records, lawful erasure/actor-attribution treatment and backup expiry first. Do not silently replace UUIDs, erase actor provenance or cascade-delete other businesses' data. No account-deletion bypass, anonymization job or service-role grant was added. Existing Brain/campaign history and hashes remain untouched.

Production backup existence, retention and restore readiness are not verified. Use encrypted, access-controlled approved backups and synthetic restore tests; do not export draft contents into logs, PRs or chat. Founder/data-owner decisions remain necessary for retention, attribution on deletion and operational recovery targets.

## Non-destructive rollback

Keep the private table, RLS, constraints and saved records. Do not drop onboarding data or disable security checks as a code rollback. Prefer rolling back the frontend while retaining a compatible hardened backend, or a separately reviewed backend fix. Returning to the pre-hardening member-writable endpoint is not a safe rollback.

Existing frontend APIs retain v1 payloads and error codes. On a failed/unavailable save the UI must keep text and report an unconfirmed outcome, retaining the same idempotency key. A 503 can follow a committed transaction whose acknowledgement was lost; the regression test proves safe retry. Do not invent a saved/unsaved certainty or clear user answers on that error.

## Executed evidence

Disposable PostgreSQL tests exercise all migrations, exact schema preflight, permission/constraint drift, FK/channel enforcement, owner-lock/revocation orderings, locked business fact checks, CAS/concurrency, cross-tenant isolation, lost COMMIT acknowledgement/replay and no Brain mutation. No shared schema, grant, backup, deployment or production traffic changed. Exact commands/counts and final SHA/CI are in `BG_STUDIO_011_BE_HARDENING.md`.
