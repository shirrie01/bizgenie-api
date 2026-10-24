# BG-STUDIO-012-BE — Integrated staging readiness and migration safety

Evidence date: 2026-10-24. **RED: do not execute staging yet.** This is a documentation-only preparation checkpoint, not staging acceptance or permission to migrate/deploy/activate. No SQL, tests, infrastructure discovery with credentials, deployments or feature activations were executed for this audit.

Operational authority remains Google Sheets BizGenie Mission Control Register v1.0 under DEC-015. DEC-020 / LOCK-018 approves Architecture A according to the supplied founder instruction; B is superseded. The live register was inaccessible through available tools, so its current contents and any later decisions are UNKNOWN. This report neither updates the register nor substitutes for its approvals.

## 1. Immutable inputs and verification limits

| Input | Verified git head | Evidence / interpretation |
|---|---|---|
| Backend main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` | Native fetch and subsequent `git ls-remote origin` |
| Backend #213 / `bg-studio-010-be-onboarding-persistence` | `120a874dfa02313a8c28dad82ddb6582f0065469` | Pull ref and branch ref match; original branch preserved |
| Frontend #48 | `bf56a2d0790a3c3f3613af7251de6a9ca1f3d50f` | Native fetch of web pull ref |
| Frontend #49 | `417122815ad6e476a2bd1dd26bc668c207fa4c32` | Native fetch of web pull ref; #48 is its ancestor |
| Architecture reconciliation | `499bcc00cb54f38c796ab20282da63978d176cf0` | Read report from that object without modifying superseded branch |
| Hardening report | #213 head above | `docs/studio/BG_STUDIO_011_BE_HARDENING.md` |

Links: [backend #213](https://github.com/shirrie01/bizgenie-api/pull/213), [backend checks](https://github.com/shirrie01/bizgenie-api/pull/213/checks), [frontend #48](https://github.com/shirrie01/bizgenie-web/pull/48), [frontend #49](https://github.com/shirrie01/bizgenie-web/pull/49), [reconciliation](https://github.com/shirrie01/bizgenie-api/blob/499bcc00cb54f38c796ab20282da63978d176cf0/docs/studio/BG_STUDIO_010_ARCHITECTURE_RECONCILIATION.md).

GitHub GraphQL PR metadata/check lookup returned **Forbidden**. Native git verifies objects, not draft status, base configuration, reviews or check conclusions. Current PR metadata and exact-head CI are therefore **UNVERIFIED**; draft status is supplied authority, not independently reconfirmed. No broader credentials were requested. Reports embedded in frontend #49 contain earlier backend heads and must not override the verified backend head above.

This documentation branch is `bg-studio-012-staging-readiness`, based exactly on #213. Only this report changes. No competing implementation or PR is created. Fetching frontend objects did not change frontend branches.

## 2. Contract and integration order

Architecture A owns sector/channel preferences and saved drafts in `workspace_onboarding_profiles`, keyed by tenant/project/brand. It does not write preferences into Brand Brain or grant entitlements, generation, publishing or provider access. Save and exit requires an existing selected workspace; pre-workspace persistence is deferred.

- `GET /customer/workspace`: authenticated identity discovery, including `selection_required` for multiple workspaces.
- `POST /customer/workspace/select`: explicitly chosen tenant/project/brand; current membership and approved brand required. When `requires_session_refresh` is true, refresh the real Supabase session and verify its three scope claims before requesting scoped data.
- `GET/PUT /customer/workspace/onboarding`: `workspace-onboarding.v1`; trusted bearer scope, never body/query tenant overrides. Preserve the existing envelope, `expected_version`, idempotency key and provenance fields. Authorized members read; owners alone write, including retries.
- Backend transactions lock current membership/project/brand authority through commit. Revocation committed before the lock denies saving; revocation arriving after that lock waits for the authorized transaction. This ordering cannot recall an already-authorized response.
- Completion requires explicit customer confirmation, genuine saved business name, descriptive saved customer text, sector and channels. Inferred source tags are not silently promoted. Existing Brain correction behaviour is not newly hardened by this work.
- Responses retain `Cache-Control: private, no-store` and `Vary: Authorization`. Expected errors include 401, 403 `WORKSPACE_NOT_AUTHORIZED`, 409 version/idempotency conflict, 422 `ONBOARDING_INCOMPLETE`, 400 malformed input, and 503 `ONBOARDING_UNAVAILABLE`.

**Verified frontend gap — release blocker:** at #49, `src/premium/onboardingClient.js:43-44` still maps a 503 write to `outcome: not_saved` and “NOT saved.” The backend's lost-COMMIT-acknowledgement test proves a write may have committed before a 503. Coordinate a frontend correction: say save is unconfirmed, retain answers and the identical body/key for retry, reconcile current state, and never manufacture success. Verify 422 business_name/description guidance against hardened completeness fields. This report makes no functional correction.

Frontend #49 contains #48; integrate its dependency chain once rather than duplicating changes. Its workspace-selection/session/browser evidence is mocked. Its own report explicitly says no connected staging proof. Actual read-only-member UX against owner-only saves remains an acceptance requirement, regardless of mocked browser success.

Recommended dependency order, subject to separate approvals: verify #213 and frontend exact-head CI; resolve frontend error/retry wording; prove target isolation/backups/role/schema; authorize and apply only the reviewed pending SQL in order; run hardened preflight as the intended backend role; deploy the pinned backend and then compatible frontend to isolated staging; separately enable only the approved staging Studio flag; perform authenticated acceptance. No merges or any of these operations are executed or authorized by this document. Video runtime/media/provider branches are not prerequisites for onboarding and must not be inherited or activated incidentally.

## 3. Migration readiness audit

### Pending files and parent dependencies

| Order | File | Effect / prerequisite |
|---|---|---|
| 1 | `supabase/migrations/20261023100000_create_workspace_onboarding_profiles.sql` | Transactional create-if-absent; server-owned profile table, PK, checks, customer attribution and brand FK, RLS and direct-role revocations |
| 2 | `supabase/migrations/20261024090000_harden_workspace_onboarding_profiles.sql` | Transactional validated project/tenant FK and supported/unique channel check; fails if base absent |

Existing foundation is required, not newly authorized for blanket replay: `customer_profiles(auth_user_id)` and `projects` from the customer authorization foundation (`20260818010000...`); Brain table from `20260808170000_create_brand_brains.sql`; unique `(project_id,brand_id)` from `20260821000000_create_generation_jobs.sql:90-95`; unique `(project_id,tenant_id)` from `20260819231206_create_commercial_credit_ledger_foundation.sql:9-14`. Confirm actual parent types, unique constraints, migration ledger and existing rows in the approved target before execution. Repository history does not prove any target has them applied.

The profile PK is `(tenant_id,project_id,brand_id)`. Its brand FK and hardened project/tenant FK jointly bind workspace relations. `updated_by` references customer identity; all three FKs use DELETE RESTRICT. Membership authorization is enforced transactionally by the backend, not by granting browser access to this table.

### PostgreSQL, permissions and fail-closed behaviour

`src/workspace-onboarding/preflight.js` and `schemaContract.json` require an ordinary table with RLS, exact 18 columns/types/nullability and exact validated constraint definitions. They reject unexpected policies and PUBLIC/anon/authenticated/service_role table or column access. Definition normalization is pinned to tested PostgreSQL 17 output. A different target major/version needs disposable compatibility evidence; do not weaken preflight to make it pass.

RLS is enabled but not FORCE RLS. There are no browser policies. The intended server connection must actually have the reviewed table/parent/locking privileges and a lawful RLS execution path (for example existing table-owner backend architecture). Ordinary grants alone do not grant access through policy-free RLS. Do not use Supabase service_role browser/API access as a substitute; these migrations explicitly revoke it. Actual connection identity, inherited privileges, role ownership, BYPASSRLS status and least-privilege suitability are UNKNOWN. This preflight is not a complete role audit or a defense against a malicious database owner. Prove behaviour as the exact intended backend role without creating IAM or broadening grants during this audit.

`CREATE TABLE IF NOT EXISTS` is not a schema validator. The hardening migration skips an already-named constraint; it does not repair a weakened definition or unexpected grants. Preflight detects those differences and returns honest 503. It runs on onboarding access and inside writes, not as a global startup migration. Recommendations retain their existing fallback when onboarding lookup fails; that fallback is not proof persistence works.

Each file has BEGIN/COMMIT. A failed hardening file rolls back its own transaction; an earlier committed base file may remain. Track actual migration-tool transaction/ledger behaviour before execution. Do not silently mark failed files applied, replay unrelated historical SQL, delete conflicting data or disable RLS/checks. Missing schema, drift and permission failures stop readiness. Capture sanitized error and migration ledger evidence for an approved repair.

### Records, locks, retention and recovery

Neither file rewrites/backfills/deletes existing customer records. Valid records can be retained; mismatched project/tenant rows or invalid/duplicate channels block new validated constraints. Perform separately authorized read-only data checks and quantify violations; any correction requires a reviewed plan. Constraint validation scans and DDL locks can wait or block. Choose explicit lock/statement timeouts, window, abort criteria and operator before approval; do not invent safe timings without target measurements.

Account deletion/offboarding can encounter `updated_by` DELETE RESTRICT, and project/brand deletion is also restricted. An auth-account removal does not automatically erase this business record. Decide lawful retention, deletion ownership, attribution handling and backup expiry. Do not substitute fake users, add cascades or promise automatic deletion. Drafts contain potentially personal business text: minimize fixture content, restrict access/logs, redact tokens and descriptions, and document retention for live data, audit exports and backups.

Required backup evidence before DDL: target-specific encrypted backup/snapshot identifier and timestamp, authorized restore operator, protected access and retention, approved RPO/RTO, and a successful restore rehearsal into a separate disposable destination. Snapshot availability without restore proof is insufficient. All are currently UNKNOWN.

## 4. Actual staging inventory versus repository requirements

No authorized cloud/Supabase/Sheets connector is available; `gcloud` and `supabase` CLIs are absent. No secrets were opened and no cloud resources, credentials or personal records were enumerated. These are access limitations, not evidence that staging resources do not exist.

| Item | Actual state | Required evidence before execution |
|---|---|---|
| Backend service/revision/image | UNKNOWN | Read-only inventory identifying isolated service, pinned artifact/SHA, region, revision and no production traffic binding |
| Historical service reference | Historical only | `docs/activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md` mentions `bizgenie-api-staging` / `bizgenie-api-staging-00021-5fd`; not proof of current revision or configuration |
| Database/schema and migration ledger | UNKNOWN | Explicit nonproduction DB/project identity, schema isolation, PG version, reviewed ledger, parent keys and no production dataset/connection |
| Backend database role | UNKNOWN | Effective privileges, ownership/RLS execution path and transaction lock capability, verified without exposing connection string |
| Supabase auth | UNKNOWN | Nonproduction issuer/audience/project, approved redirect origins, synthetic accounts, real token refresh and existing scoped app_metadata provisioner availability |
| Test tenant / workspaces | UNKNOWN, not provisioned | Synthetic owner O, read-only member M, foreign user X; tenant T with W1 and W2; separate foreign tenant F; approved brands and deliberately distinct Brain/profile data |
| Frontend artifact / flag | UNKNOWN | Exact reviewed #49-descendant artifact, API origin, `VITE_PREMIUM_STUDIO_ENABLED` build-time setting and explicit approval before activation |
| Network / CORS / TLS | UNKNOWN | Exact staging browser origin allowlist, Authorization preflight, TLS, backend-to-DB/auth reachability, no wildcard credential exposure or production routing |
| Secrets dependencies | UNKNOWN | Authorized operator attestation of existing staging-only bindings for DB/auth/provisioner; no values in this report and no new secret/IAM action |
| Billing/provider flags | UNKNOWN | Read-only effective configuration proves generation/publishing/providers remain disabled; no generation or charge endpoints in test; review `src/activation/productionComposition.js` media/image/video flags and existing billing controls |
| Logs, backups, rollback operator | UNKNOWN | Redaction/access/retention, request correlation without tokens/body contents, restore proof, retained compatible revisions and named operator |
| Data exposure and costs | UNKNOWN | Prove no production tenant/data/auth/storage bindings; owner approves bounded test duration/resource cost ceiling before execution; no provider or paid-generation calls |

Source configuration and historical evidence cannot establish live values. Existing Cloud Run/database/auth/network usage may incur runtime costs even without AI calls; no price or zero-cost claim is made. Onboarding needs no media storage, video inspection activation or provider provisioning.

## 5. Deterministic acceptance plan (future, not executed)

Fixtures are symbolic requirements, not existing accounts. Use synthetic descriptions and distinct marker values W1-A/W2-B; no real customer content. Owner O belongs to both workspaces; M has read access but not ownership; X belongs only to F. Record pinned revisions, redacted actor/scope, request ID, expected/current profile version and operation key per case. Store tokens only in approved ephemeral test tooling, never evidence files.

| Case | Automated/API or browser assertion | Founder-visible acceptance |
|---|---|---|
| 1 Real sign-in | Valid real token accepted; absent/expired/wrong issuer denied 401; no fake session fixture | Sign in through staging auth and see own account |
| 2 Two workspaces | Discovery lists only W1/W2 for O; foreign F absent | Recognizable synthetic workspace names |
| 3 Explicit selection | No scoped data request before explicit choice; select response and refreshed claims match all three IDs | Choose W1, then deliberately choose W2 |
| 4 Refresh/scope | Real refresh after selection; delayed/failed/wrong-scope refresh blocks load; old token and late responses cannot populate new scope | Clear switching state; honest retry/sign-in guidance |
| 5 Independent data | Distinct Brain and onboarding markers remain separate; denied forged body/query scopes; no W1 responses applied to W2 | Switch back and see correct independent answers |
| 6 Save/exit/resume | Save vN→vN+1; sign out/in and reload from DB; unsaved switch requires discard consent | Saved progress resumes; unsaved answers not claimed saved |
| 7 Concurrency/retries | Two writers same expected version: one succeeds, other409; identical key/body replay returns same version; different body/key misuse conflicts; lost response and lost COMMIT ack recover without duplicate | Conflict asks reload; unconfirmed save retains answers and safe retry |
| 8 Owner/member | M can GET but all PUT/complete/replay attempts403, unchanged version; O succeeds | Read-only experience never implies write authority |
| 9 Revocation | Controlled DB test: revoke before authority lock→403/no write; revoker after lock waits until commit; subsequent access denied | Revoked workspace clears protected content on denied refresh; no promise to recall delivered data |
| 10 Completion | Seeded/placeholder name or URL-only/empty description, absent sector/channels→422; explicit valid confirmation succeeds; inferred tags preserved; no entitlement changes | Customer confirms real details; no generated inference presented as their answer |
| 11 Error honesty | 403 forbidden;409 stale/key conflict;422 missing details;503 missing/drifted schema and uncertain commit. Use disposable fault harness, never corrupt shared staging to induce drift | Specific actionable messages; no false success or “NOT saved” after uncertain commit |
| 12 Isolation/privacy | X and cross-project/brand requests denied; cache headers on success/errors; switch/signout cancels or ignores old requests; no protected text/token in shared logs | No prior account/workspace answers flash after switching/signout |

Run fault injection and lock/barrier tests in approved disposable integration infrastructure; do not disrupt shared staging. Real staging should use non-destructive supported actions with synthetic fixtures. Retain sanitized evidence and distinguish API automation, mocked UI coverage, real browser/auth proof and founder acceptance. A browser check is not a founder sign-off.

Historical backend evidence at #213: hardening report records Node 22.23.3 / disposable PostgreSQL17 full suite **689 passed, zero failed/skipped**, focused **43**, onboarding PG **19**, billing **24**, campaign **22**, plus syntax checks. These are prior local results, not rerun here or proof of live schema. Frontend #49 report records **363 tests**, build and mocked multi-viewport/browser checks; cites run `40100866374` at code SHA `4348e43b60af2426125c5419bea7c850e6accdc0`, not its final documentation head. None was independently reconfirmed via GitHub during this audit. Before execution, verify exact proposed artifact checks and rerun relevant integration coverage after any frontend correction.

## 6. Go/no-go and risk register

| Status | Finding | Gate / mitigation |
|---|---|---|
| GREEN (source verified) | Immutable heads, #49 includes #48; A preserves v1 and separate Brain ownership | Pin deployment inputs, preserve originals |
| GREEN (source + historical local evidence) | CAS/idempotency, owner-only transaction guard, fail-closed schema preflight, no destructive SQL | Re-prove as target role and actual environment; not deployed assurance |
| RED / high | Frontend 503 falsely says not saved after possible commit | Frontend correction + lost-ack retry regression before acceptance |
| RED / high | Live isolation, DB role/schema, backups/restore and auth refresh UNKNOWN | Obtain authorized read-only evidence; target preflight + restore proof before migration/deploy |
| RED / high | Current exact-head CI/PR metadata and live Mission Control unavailable | Founder/operator supplies verifiable links/results and latest decisions; no credential expansion |
| AMBER / medium | PG17 catalog fingerprint portability, validation locks and historical data validity | Target-version disposable rehearsal, data review and abort/timeout plan |
| AMBER / medium | Retention/account deletion and backup expiry unresolved | Document responsible owner, lawful periods and approved deletion/recovery procedure |
| AMBER / medium | Member UX, current 422 copy and real multi-workspace session behaviour not proven | Run pinned integration and founder walkthrough; retain honest limitations |
| AMBER / medium | Revocation has transaction ordering and cannot recall delivered content | Explain semantics; subsequent requests reauthorize; no artificial immediate-recall claim |

Overall **RED / NO-GO for execution now**, with an actionable preparation plan. No claim of founder acceptance, staging readiness or launch readiness.

## 7. Required approvals and proposed sequence

1. Obtain canonical Mission Control confirmation of DEC-020 / LOCK-018 and any superseding locks; register evidence and this checkpoint through an authorized operator. Current task does not grant permission for the steps below.
2. Independently verify PR status/dependency chain and CI for exact backend/frontend artifacts; resolve frontend 503/422/member-contract findings in their existing authorized workstreams.
3. Obtain read-only inventory and demonstrate nonproduction isolation, correct runtime role/auth/CORS, provider-disablement and no production data/traffic binding.
4. Approve **specific isolated target and synthetic fixture/test-write plan**, including auth accounts, memberships, app_metadata selection/refresh, controlled revocation, duration, cleanup/retention and a bounded runtime cost ceiling. No paid generation/provider activation.
5. Approve **exact two SQL files, order, target, operator, backup/restore proof, lock window/timeouts and abort/recovery plan** separately before applying any migration. Rehearse on an approved disposable copy first; do not execute generic migration-all blindly.
6. After approved DDL, verify hardened read-only schema preflight and intended-role integration tests; stop on drift/permissions rather than changing safeguards.
7. Obtain separate **backend/frontend staging deployment and traffic authorization**, pin immutable artifacts, retain compatible rollback revisions, and verify logs/redaction. Obtain separate **staging-only Studio flag activation** approval. Architecture approval alone covers none of these actions.
8. Execute the approved authenticated acceptance plan, collect sanitized evidence, then seek founder-visible acceptance. Any failure returns to NO-GO. Do not merge, promote to production, enable providers or publish.

### Non-destructive rollback / recovery

- Before execution retain approved backup/restore evidence, schema inventory/ledger and compatible backend/frontend artifact IDs; define operator and abort triggers.
- On failure stop test writes and, only with the separately approved rollback authority, disable the staging UI flag or route back to a reviewed compatible frontend revision. Keep server authorization protections in place.
- Preserve profile table, rows, RLS and constraints. Do not drop schema, reverse to member-writable backend code, disable preflight or apply destructive down-migrations. A schema mismatch may deliberately remain 503 while investigated.
- If base SQL committed but hardening failed, record that partial migration state; inspect the sanitized error/ledger and obtain review before correction/retry. Do not erase existing records to force success.
- For uncertain commits, reconcile by GET and identical body/key retry under current owner authorization. Do not replace the key until outcome is known.
- If data damage is suspected, freeze affected writes, retain audit evidence and restore into a separately approved isolated destination first; validate tenant scope, versions and constraints. Any replacement/cutover is a new explicit decision. Preserve the original for investigation under approved retention.
- Record actual outcomes and remaining blockers in Mission Control through its authorized owner. No rollback or register mutation occurred in this audit.
