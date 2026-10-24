# BG-STUDIO-011-BE — canonical onboarding security and contract hardening

**24 October 2026.** Founder DEC-020 / LOCK-018 approves Architecture A and supersedes B. This work implements that direction on the **existing #213 branch** `bg-studio-010-be-onboarding-persistence`; no new PR or alternative persistence model. [Google Sheets Mission Control Register v1.0](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains sole operational authority under DEC-015. No operational status or release acceptance was changed there.

## Verified starting authority

Before editing, fetched canonical main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` and verified #213 plus its remote branch at **`d0e1142c91c0c12b907227f2881e14f3bb2a44e2`**. Read the reconciliation at commit **`499bcc00cb54f38c796ab20282da63978d176cf0`** without changing B's branch. Frontend #48 advanced to **`bf56a2d0790a3c3f3613af7251de6a9ca1f3d50f`**; its actual client/model and completion predicate were read at that head.

GitHub PR/issue API requests returned `Forbidden`; no Mission Control connector is available. The current founder work order supplies DEC-020 / LOCK-018 authority; full latest register/PR metadata cannot be independently reread here. No broader credentials, privilege escalation or network workaround was requested. Existing branch/head was verified through authorized Git transport before code changes.

## Changes made

### Owner-only writes and transaction-bound authorization

- Service checks current owner role for every PUT, including lost-response replay. Authorized member GET remains available. Verified token scope, strict request fields and unchanged workspace-selection checks remain authoritative; no scope/body overrides added.
- PostgreSQL starts a transaction, checks schema safety, and joins the current membership, project and approved brand for the server-derived actor. `FOR SHARE OF tm,p,b` holds their authority/business facts through CAS and COMMIT. Actor, record scope and next version are checked before writing.
- Revocation committed before that lock denies the save. A revocation attempted after the lock waits until the already-authorized transaction ends. This is a defined serialization order, not an assertion that already-authorized responses can be recalled.
- CAS remains atomic; competing first writes/updates, stale versions, same-key replay and key-content conflicts retain their v1 behavior. A loser reads current state on its existing transaction client, avoiding a second pool checkout while holding locks.
- The memory adapter rechecks authorization at its commit boundary; production correctness is proved separately with real PostgreSQL locks, not inferred from JavaScript scheduling.

### Customer-confirmed completion

The existing explicit `complete:true` owner action is required to enter completed state. Saving enough answers without that action remains in progress. Completion requires sector, at least one channel, a saved nonempty/non-placeholder business name and a saved description that is neither missing, bootstrap-seeded nor only a website URL. Draft text cannot stand in for saved Brain knowledge.

Business predicates live in one shared helper; PostgreSQL checks the **locked** Brain row, so a race that replaces the name/description with a placeholder before lock acquisition rejects with existing `422 ONBOARDING_INCOMPLETE`. Current `completeness` includes `business_name` / `description` when missing; the response envelope/field types are unchanged. Changing a completed profile without reopening also revalidates the saved business facts.

Completion does not write preferences or draft text into Brand Brain, change its version/status/timestamps, promote inferred sources, create campaigns, grant entitlements, publish or activate providers. An inferred classification remains labelled inferred after explicit workflow confirmation; an explicit selection/source change is still required to relabel it customer-selected.

The existing Brain schema has no field-level authorship ledger. “Customer-written” follows the current frontend business rule plus explicit owner attestation: saved descriptive text, not the known bootstrap prefix or a bare URL. It is not a forensic human-authorship/model detector or external verification of a legal business name. No provenance was fabricated. `completed_at` retains the original completion time; `updated_by` is the current editor, not a newly invented immutable consent history. Later Brain changes do not rewrite historical completion, but current completeness and later writes recheck the facts.

### Privacy, relational integrity and drift

GET/PUT and all onboarding error paths now set **`Cache-Control: private, no-store`** and **`Vary: Authorization`**, preserving existing Origin variance. No raw DB exception, business content or actor ID was added to error responses/logs.

The new **pending** migration `20261024090000_harden_workspace_onboarding_profiles.sql` adds:

- `(project_id,tenant_id)` FK against the existing projects unique key, in addition to the original brand/project FK;
- SQL enforcement that channels are from the six allowed IDs and unique, without a new function/role grant;
- transactional, validating constraints: no guessed backfill, deleted records or automatic privilege repair.

The original base migration is unchanged. A read-only internal `preflight()` runs before PostgreSQL onboarding access and again in the write transaction. It validates table kind/RLS, no unexpected policies, no PUBLIC/anon/authenticated/service_role table **or column** grants, exact column types/nullability, validated constraints and normalized PostgreSQL 17 constraint definitions against checked-in `schemaContract.json`. It detects a weakened check even if its name is unchanged. Missing/old/drifted schema returns existing `503 ONBOARDING_UNAVAILABLE`; no startup migration or self-healing DDL occurs.

Catalog checks defend against accidental drift under the existing trusted backend DB-role boundary; they are not protection from a malicious superuser who controls both schema and code. No shared schema, role, privilege, IAM or DB connection secret was modified.

## v1 / frontend #48 compatibility

No URL, request field, contract_version, response envelope or error code changed. Member writes now return the existing 403; incomplete business facts use existing 422 with additional details paths `business_name` and `description`. Placeholder matching is whitespace/case normalized. Frontend should present members with read-only setup using the existing workspace membership_role, mirror bare-URL rejection and add friendly labels for the additional paths; these are validation/copy updates, not a new API version.

A local, no-network smoke dynamically loaded the **actual #48 client module** at `bf56a2d` and confirmed it parses the new v1 envelope and handles 422/403/409/503 through its existing error categories. No frontend source was modified.

**Important honest-503 finding:** lost COMMIT acknowledgement can produce 503 after the save committed. The new PostgreSQL test executes COMMIT, synthetically loses its acknowledgement, then proves same-key retry returns the single committed receipt/version. Successful write responses use the locked business facts, avoiding a new fallible Brain lookup after COMMIT, but distributed acknowledgement uncertainty cannot be eliminated.

Frontend #48 currently maps 503 to `outcome:not_saved` and says “NOT saved.” That copy must become **“save not confirmed; it may already have saved”**, keeping the exact same key/body for retry and not clearing answers. Backend code/error shape is compatible; no schema-breaking workaround, fake success or swallowed error was introduced. GET current state remains a recovery aid. Existing Brain correction CAS/write policy is unchanged and not claimed fixed by this onboarding gate.

## Executed evidence

Node **22.23.3**, disposable local PostgreSQL **17**. Provider transports are mocked; no live/paid generation or publishing.

| Command | Result |
| --- | --- |
| `node --test test/workspace-onboarding.test.js test/workspace-onboarding-migration.test.js test/studio-010-contract-g5-g6.test.js` | **43 passed**, 0 failed/skipped |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **689 passed**, 0 failed/cancelled/skipped |
| Same local URL, `npm run test:billing:postgres` | **24 passed**, 0 failed/skipped |
| Same local URL, `npm run test:campaign:postgres` | **22 passed**, 0 failed/skipped |
| Same local URL, `npm run test:onboarding:postgres` | **19 passed**, 0 failed/skipped |
| `node --check index.js` and all src/test/scripts JS; `git diff --check` | Passed |
| Exact-head GitHub CI | Publication result below; not inferred green from local tests |

Adversarial proof includes: members read but cannot write/replay; current-owner commit guard; cross-tenant/forged scope retained tests; stale/concurrent writes and lost responses; placeholder/empty/seeded/URL-only descriptions; draft/canonical separation; source preservation; cache headers on success and 401/403/409/422/503; real revocation-before-lock denial and lock-before-revocation ordering; Brain change during commit; mismatched tenant FK; duplicate/unknown channel DB rejection; disabled RLS, table/column/public grants, policies, extra columns and weakened named constraints; lost COMMIT acknowledgement replay. Positive fixture businesses now contain genuinely descriptive saved text rather than bypassing the new checks. No tests were skipped or assertions weakened.

Schema DDL/catalog development and tests ran **only in new disposable local databases**, which were removed by their harnesses. No staging/shared/application migration was applied. These results are not deployed E2E or a verified GitHub CI result. Logs: `/workspace/.onboarding/bg-studio-011-{focused,full,billing,campaign,onboarding-pg,frontend-contract}.log`.

## Migration readiness and outstanding owner decisions

**Locally validated, not authorized/applied to shared environments.** Both pending migration files and read-only preflight must pass in a separately approved target before onboarding writes. Migration validation may lock tables; review target schema/data, maintenance window, DB role, backups and rollback first. Bad rows/drift stop the process rather than being relabelled or deleted. The API intentionally fails closed with 503 until the hardening schema is present.

[Updated migration/retention plan](BG_STUDIO_010_MIGRATION_PLAN.md) now requires non-destructive rollback: keep private records/RLS/constraints, retain a hardened backend, roll back frontend separately or use a reviewed compatible fix. Do not return to the old member-writable API or drop the table to roll back code.

Founder/data-owner decisions still needed before a shared change: migration/deployment approval, retention periods, actor-attribution treatment for account deletion (`updated_by` already has a restrictive FK), backup expiry and restore/RPO/RTO policy. No automatic erasure, UUID substitution, new backup spending or infrastructure is added. The canonical architecture, owner-only write policy and explicit confirmation direction are already decided; this report does not reopen them.

Next integration: review this exact #213 diff and CI; coordinate the #48 503/422 copy and validation updates; only then request a separately authorized nonproduction schema preflight and E2E. No competing PR, B migration, video runtime activation or provider provisioning is involved.

## Publication / CI checkpoint

Validated implementation SHA **`c878661ef2981f6bfb846c4cbb58f77875136507`**, parent **`d0e1142c91c0c12b907227f2881e14f3bb2a44e2`**, remains on existing #213 branch `bg-studio-010-be-onboarding-persistence`. The following evidence-only commit leaves tested code, SQL, fixtures and protocol unchanged. No competing PR was created; original reconciliation/B branch is untouched.

GitHub API reads returned Forbidden during this execution. **Exact-head GitHub CI is UNVERIFIED**, not GREEN from local results; verify the final published head at [#213 checks](https://github.com/shirrie01/bizgenie-api/pull/213/checks). The existing PR is updated through branch code/documents. Prepared PR checkpoint text is retained at `/workspace/.onboarding/bg-studio-011-pr-checkpoint.md` if comment access is blocked. Canonical Mission Control remains external and was not modified.
