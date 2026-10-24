# BG-STUDIO-016 — Staging isolation, recovery and integration approval package

24 October 2026 (Europe/London). **Planning only. Staging remains RED / NO-GO.** This package proposes bounded future operations; it executes none. It is evidence for the existing Mission Control entries, not a new operational register. No functional code, tests, migrations, infrastructure, credentials, IAM, traffic or flags changed. No live SQL, sign-in/test writes, provider/Stripe calls, publishing or paid generation.

## Phase 1 — Freeze authority, artifacts and evidence

| Input | Current native GitHub ref / provenance |
|---|---|
| Backend main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| Backend #213 | `120a874dfa02313a8c28dad82ddb6582f0065469` |
| Backend #214 | `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` |
| Backend #215 | `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b` |
| Frontend #48 | `7fe2bcc15f489b32fc7e80ffd2e0fc9ab24b7645` |
| Frontend #49 | `6c8e7b6bb68aee83843f567b5ba4dea84f3a0a1b` |

Native refs fetched/read on this date. Frontend #49 contains the current #48; backend #215 contains #214/#213. Frontend heads advanced since BG-STUDIO-015: do not use its older frontend SHA as the deployment candidate. Confirmed checkpoint supplied by ChatGPT/founder: #215 exact-head [CI run40136091719](https://github.com/shirrie01/bizgenie-api/actions/runs/40136091719), both jobs successful. Accepted as independently verified; no CI reinvestigation performed. New frontend exact-head CI evidence, build/image digests and actual serving artifacts remain UNKNOWN to this reviewer.

GitHub API reads for #215 and Issue #191 returned GraphQL Forbidden. Live Google Sheets, cloud and database connectors are unavailable. Latest unavailable comments/register rows are not claimed read. Existing [#191](https://github.com/shirrie01/bizgenie-api/issues/191), [#197](https://github.com/shirrie01/bizgenie-api/issues/197), [#213](https://github.com/shirrie01/bizgenie-api/pull/213), [#214](https://github.com/shirrie01/bizgenie-api/pull/214), [#215](https://github.com/shirrie01/bizgenie-api/pull/215), [web #48](https://github.com/shirrie01/bizgenie-web/pull/48) and [web #49](https://github.com/shirrie01/bizgenie-web/pull/49) are the evidence/dependency targets. DEC-015 retains sole Mission Control authority; DEC-020/021/022 and LOCK-018/019/020 remain unchanged.

Read: current BG-STUDIO-015 handover and local evidence, Q1–Q8 contract, migration/retention plan, frontend current `BG_STUDIO_015_FE_REPORT.md` and F-08d/e acceptance definitions; BG-STUDIO-013 founder-evidence checkpoint at `284877c791273b30bd338e0c232c3d18bb03020b`. Prior local713 tests are historical evidence, not rerun or a staging guarantee in this planning task.

**Evidence classification:** founder-verified inputs identify separate staging/production services, runtime identities and Supabase projects; shared service-role binding and excessive production privileges remain reported risks, not newly queried state. Current frontend acceptance pack quotes #191 comment6386087653: staging Stripe/media/image/video flags were true. Backup timestamps were reported observed; actual backup IDs/timestamps, restore proof, complete IAM scopes and current resource mappings are UNKNOWN here. Operator must attach fresh sanitized metadata before execution; stale checkpoints are insufficient.

## Phase 2 — First proposed operational change: prepare a staging-only credential

**Approval request S1, not executed:** authorize a named operator to prepare ONE staging-specific Secret Manager resource (proposed name `bizgenie-staging-supabase-admin`, not an existing-resource claim), containing an independently sourced credential for staging Supabase project **`zrczojyxebwjgpymbmgu`**. Permit secret-level accessor only to the verified dedicated staging runtime identity. **No Cloud Run binding/revision/traffic change, production key/JWT rotation, shared-version disabling or provider/Stripe operation is included.** This step prepares containment; it does not make the currently shared binding safe or authorize E2E. If a suitable staging-specific resource already exists, verify/reuse it under the reviewed change record rather than creating a duplicate.

Before S1 execution the founder-approved change record must fill these exact fields; blanks block execution:

| Required field | Accepted proof / boundary |
|---|---|
| Operator, approver, window, rollback owner | Named accountable people and explicit Mission Control approval; not merely architecture approval |
| GCP project/resource and staging principal | Full project ID/number and exact staging service-account email; dedicated identity verified. Do not guess from service name. |
| Credential origin/type | Secure operator provenance to staging project; identify existing legacy service-role JWT versus supported server-secret key. No value, token decoding, credential digest or payload in chat/GitHub/logs. |
| Existing secret consumers | Current and historical revision/tag/trigger/binding metadata; original shared-version1 retained unchanged for now |
| Exact resource-level IAM diff | Only required accessor on the new secret; show inherited grants/impersonation paths. No project-wide Secret Accessor, Editor or IAM-admin grant. |
| Cost/expiry/abort | Current Secret Manager tariff and existing capacity; approved currency ceiling and cleanup owner. If a new staging credential must be issued, approve that distinct issuance explicitly. |

If no independently attributable staging credential exists, stop S1 and request a separate staging-project credential issuance decision. Do not copy the shared key into a second secret and call it isolated. Do not rotate the Supabase project JWT signing secret casually: legacy changes can invalidate sessions and other clients. Nothing in S1 authorizes viewing production credentials.

S1 evidence: new resource/version metadata (not value), operator provenance attestation, effective accessor policy and audit record of only the approved changes. No runtime read/test yet. If S1 aborts before binding, remove only the approved new grant/resource under its cleanup authorization; retain evidence, leave serving revisions and original shared secret untouched. Secret creation and IAM are future changes requiring this explicit approval; current task performs neither.

**Later credential verification S2, separately approved:** operator uses a staging-only harness/backend revision, no production endpoints, to verify the isolated binding. Use only an approved synthetic staging user and read-only auth-admin lookup after credential-use permission; never list/export real users or print headers. Prove the configured issuer/project and returned synthetic identity match staging. A wrong-project/invalid credential fails closed; do not test candidate keys against production to discover ownership. Workspace selection/app_metadata mutation belongs to later acceptance S7, not this read-only check. Record only status, synthetic fixture alias, request correlation and resource/version metadata. S2 requires an already-existing approved synthetic user; if none exists, approve its minimal creation explicitly as an earlier S7 fixture subset or hold verification. Never create a user inside a supposedly read-only credential check.

S2 must also remove staging access to the old shared secret **only after** every legitimate staging consumer is migrated/retired in an approved revision/config window. Check inherited IAM and old tagged/non-serving revisions; changing one environment variable is insufficient. Do not disable/delete shared version1 while production or unknown consumers still depend on it. Secret Manager revocation does **not** erase a credential already loaded into an old revision's environment/client. Retire/tag-disable/quiesce every old staging consumer under the approved revision/traffic window and obtain runtime lifecycle evidence, not just an IAM screenshot. If cached/retained credential use cannot be excluded, coordinate issuer-side revocation/rotation as a separate credential-owner decision; a production-affecting shared-key rotation is not included in S2. Stop rather than claiming isolation from access removal alone. A rollback must use an isolated binding, never silently restore the shared secret. Failure to find a safe isolated rollback means hold the staging rollout.

## Phase 3 — Production least privilege: separate approval, no implicit production action

The reported default Compute Engine production identity has Editor, Cloud Run Admin, Service Account User and Artifact Registry Writer plus Vertex AI User/Logging Log Writer. **P1 approval is independent of S1/S2:** inventory all workloads using that default identity and its effective direct/inherited/conditional grants; define a dedicated production runtime and separate build/deploy identities. Inventory includes ability to actAs/impersonate staging or deploy a revision with its identity. Broad deploy/actAs authority can defeat nominal secret separation.

Proposed reviewed diff: serving identity loses general project Editor/deployment/artifact-write/actAs authority; only proven runtime operations retain narrowly scoped permissions. Resource-level production secret access, logging and any genuinely needed storage/Vertex permissions must be justified individually. Artifact pulling is normally a platform/service-agent concern; confirm before assigning runtime Artifact Registry permissions. Do not infer that Vertex access is needed just because it is granted. No new APIs or provider activation.

Deliver before P1 approval: old/new principal map, affected workloads, exact grants removed/retained/added and why, deployer identities, token/impersonation paths, sanitized audit evidence, review window, canary/rollback plan and operator. Never remove shared default-account roles blindly. Credential rotation, production revision adoption and traffic changes each require explicit additional scope; this plan changes none.

**Isolation condition:** S1 can prepare a staging credential while production IAM is pending, but do not claim two-way isolation until effective production-to-staging impersonation/deployment paths are removed or a separately approved boundary is proven. If staging isolation cannot be established without P1, staging waits; S1 is not permission to perform P1. No unreviewed risk waiver is implied.

## Phase 4 — Database, schema, RLS and migration approval S3

Target must map to staging Supabase project `zrczojyxebwjgpymbmgu`, never production `uvgblmejpbswkvlqvqmz`. A dedicated DB secret and mounted CA are reported, not proof of its endpoint/role or TLS validation. Require a sanitized metadata mapping from approved DB endpoint/project to that binding and live read-only session identity; never expose connection URL/password. Collect server version, database/schema identity, migration ledger, current/session role and effective/inherited privileges, TLS certificate/hostname validation and pool mode/lock compatibility.

Two pending files, in this order:

| File | SHA256 / dependency |
|---|---|
| `20261023100000_create_workspace_onboarding_profiles.sql` | `f6d73ea72dd7f127bdb678400058ec8ffaf96099d35e8060602847a47f6aa5b2`; requires existing customer_profiles and brand_brains parent keys |
| `20261024090000_harden_workspace_onboarding_profiles.sql` | `feee6c2b4763d9e906133cd0d6f77f319fcba17b29d0067bdf368b467bc244f9`; requires base and projects(project_id,tenant_id) unique key |

Parent unique keys come from existing authorization/Brain/generation-jobs/commercial-credit foundations; these are prerequisites to verify, not permission to replay all historical migrations. Production composition also initializes video persistence, preview/campaign/recommendation/measurement registries even when paid-provider flags are off. **The two onboarding files alone do not bootstrap an empty application database.** Verify every startup prerequisite against the target ledger/catalog before approving deployment.

Read-only evidence must establish: profile PK tenant/project/brand; validated brand/project-tenant/customer attribution FKs; supported unique channels; ordinary table/RLS; no unexpected policies or PUBLIC/anon/authenticated/service_role table or column grants; exact18 columns and validated constraints per `src/workspace-onboarding/{preflight.js,schemaContract.json}`. Preflight was tested against PG17 definition output; a different target version requires a reviewed disposable compatibility rehearsal, not relaxed checks. Policy-free RLS needs the existing reviewed server role execution path; a random role with table grants is not automatically compatible. No FORCE-RLS or role-policy change is silently proposed.

S3 prerequisites: S4 restore proof, current schema/data violation counts without contents, intended-role rehearsal, fixed file hashes/order, lock/statement timeouts and maintenance window set from measured target size, abort criteria and operator. Both files are transactional individually: hardening failure can leave already-committed base; preserve ledger/error evidence and stop. No automatic data relabelling/deletion or grant repair. Existing rows stay if valid. No retention/deletion cascades; updated_by/account/project/brand restrictions remain. Apply nothing now.

Exit evidence after a separately approved future migration: ledger, catalog fingerprint, read-only hardened preflight as intended runtime role, absence of unexpected grants/policies and representative local/isolated tests. Do not treat successful DDL as functional acceptance. Missing/drifted schema remains honest503. Retain tables/data/RLS/constraints for non-destructive code rollback.

## Phase 5 — Recovery proof S4 and cost controls

Backup timestamps alone are not restore proof. Operator package: exact staging backup/snapshot/PITR reference and time, covered database/auth/storage components and exclusions, retention/encryption/access, measured/approved RPO/RTO, restore operator, provider plan/restore costs and destination. A DB backup may exclude GCS objects, auth configuration or Secret Manager; inventory these separately without secret exports.

Approve an isolated restore destination **before** provisioning/restoring. Never overwrite serving staging or production. Classify the backup first: if it may contain production/PII, stop until data-owner access/sanitization and protected destination are approved. Quarantine outbound integrations, auth redirects and webhook delivery; restore must not send mail, bill, call providers or publish. Any quarantine network/resource work is a separately listed approved action, not performed by this task.

Restore proof sequence: capture selected backup point → restore only into approved destination → inspect metadata/FKs/catalog/preflight using approved roles → verify synthetic marker records, Brain/onboarding versions, command/idempotency evidence and tenant separation → record achieved recovery time/data point → stop destination and clean up under approved retention/cost authority. Rehearse the two pending files only on a separately approved disposable copy, never an unapproved shared restore. Expected rows and marker hashes come from synthetic fixtures, not exported real customer text. Restore success is not production cutover approval.

**Cost worksheet:** numeric total is UNKNOWN until plan/region/tariffs/capacity are supplied. Calculate incremental secret versions/accesses; artifact builds/storage; Cloud Run CPU seconds and GiB seconds/requests plus any min-instance baseline; Supabase compute/storage/PITR/restore destination and auth quota; backup retention, logs and network egress. Separate sunk baseline from incremental test/restore cost. Proposed test envelope for approval: one restore rehearsal, one pinned backend/frontend candidate, <=60 minutes of acceptance, <=500 HTTP requests and two concurrent browser sessions, zero provider/generation/Stripe/publish calls. These are proposed workload limits, not a cost quote or existing quota.

Founder fills currency ceiling, named monitor and stop authority before any chargeable action. Use current tariffs and a documented contingency allowance, not an invented fixed GBP amount. Billing budgets/alerts are delayed warnings, not hard spending caps: enforce request/time/concurrency limits and an operator abort. New service/min instances, paid backup tiers, restoration capacity or broader resource limits need separate approval. Retention/account deletion/backup-expiry decisions remain data-owner decisions; no erasure claim.

## Phase 6 — Safe configuration manifest S5 (proposal, not applied)

Current effective values must be re-attested; historical values do not become approved defaults. Use a reviewed non-secret manifest plus binding resource/version metadata, never secret values. Required candidate intent:

| Setting | Proposed onboarding-only value / consequence |
|---|---|
| `BIZGENIE_ENVIRONMENT` | `staging`, not production |
| `PRODUCTION_ACTIVATION_ENABLED` | `false`/disabled; no production activation in this package |
| `STRIPE_BILLING_ENABLED` | `false`; no checkout/webhook route activity required |
| `BILLING_DURABLE_ENABLED` | `false` for this onboarding-only run; verify UI handles absent billing honestly. This disables customer billed generation, not every legacy admin path. |
| `MEDIA_STORAGE_ENABLED`, `IMAGE_GENERATION_ENABLED`, `VIDEO_GENERATION_ENABLED` | all `false`; no image/video/media requests in acceptance. Config rejects enabled provider with disabled durable storage. |
| `PAID_BETA_CAPTURE_ENABLED` | `false`; capture/lead collection is outside acceptance |
| `CORS_ENABLED` / `CORS_ALLOWED_ORIGINS` | enable only after approval, exact approved staging frontend origin(s), no wildcard; origin currently UNKNOWN. Preserve Authorization preflight, PATCH and Vary. |
| `VITE_PREMIUM_STUDIO_ENABLED` | build-time `true` only in the approved isolated frontend artifact, never silently on existing production build |
| Supabase project/auth settings | staging issuer/publishable config and isolated server binding; dedicated DB/CA metadata verified; no key in frontend bundle |

These are **proposed changes to reportedly enabled flags**, not a claim they are already safe or permission to turn them off now. Stripe test mode alone is insufficient: test checkout/webhooks still mutate external state. If a future Stripe-specific test is approved, require staging-only account/key/webhook provenance and mode=test; never discover key ownership by calling live production. That is outside this onboarding run.

There is no demonstrated universal text-generation kill switch: legacy admin `/generate-script` is not gated by the image/video flags or customer billing orchestrator. Withhold admin/service credentials from test clients; proposed candidate must omit unneeded admin binding or have separately reviewed effective access/egress prevention. Do not claim flags alone prevent all paid calls. Do not call even an empty generation endpoint during F-11; use existing CI for negative generation tests. Confirm no background dispatchers, tagged revisions, triggers or webhook traffic bypass the approved test surface. Any new egress/IAM control requires separate approval.

## Phase 7 — Deployment dependency and revision plan S6

Source review order: backend **#213 → #214 → #215**, frontend **#48 → #49**. Candidate **#215 `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b` already contains backend predecessors**; frontend **#49 `6c8e7b6bb68aee83843f567b5ba4dea84f3a0a1b` contains current #48**. Do not deploy each PR separately, duplicate cherry-picks, merge branches or inherit unrelated video-runtime branches. No merge is required/authorized to prepare an exact draft-head staging artifact.

Before S6: freeze reviews and exact-head CI, artifact digest/SBOM/dependency decisions, source-to-image/build config provenance, effective safe manifest, isolated identities/credentials, all startup schemas, restore proof and rollback artifact. #215 CI is GREEN at supplied checkpoint; current frontend checks and artifact digests remain evidence gates. BG-STUDIO-015 dependency advisories are not waived by this plan or a green CI run.

If separately approved, create a new isolated staging candidate revision first with no default traffic. A tagged revision can still be reachable: explicitly approve reachability/invoker policy and traffic/tag scope; “zero default traffic” is not access control. Do not route production traffic. Pin backend and frontend artifacts/environment origins. Auth-admin read-only credential verification S2 may use this isolated candidate only under that gate's credential-use authority; owner selection/bootstrap test writes wait for S7. Deploy/backend/frontend flags and any traffic shift require listed approvals, not an inferred continuation of S1.

Rollback baseline must be compatible with the hardened schema and isolated credentials. Current serving staging revision `00029-wtc` is only founder-reported historical inventory; its code compatibility and bindings are UNKNOWN. Do not designate it safe merely because it serves. If no safe baseline exists, abort by closing the candidate/test surface under approved rollback authority and preserve DB state; do not reactivate an insecure old revision.

## Phase 8 — Real authenticated acceptance S7, including F-08d/e

Required synthetic actors: owner O in two authorized workspaces W1/W2, same-tenant member M, foreign user X in another tenant; use an additional synthetic owner session for concurrency where approved. Prefer W1 and W2 in different test tenants to exercise tenant switching, while M belongs only to W1; record distinct tenant/project/brand IDs and marker names without real customer data. If same-tenant multiple-project coverage is separately required, add an explicit approved fixture; do not create it opportunistically. No entitlements, providers or billable credits granted by onboarding completion.

Approve account creation/memberships, bootstrap, Supabase app_metadata writes and controlled revoke/demote operations explicitly. Use private test credentials outside evidence; real JWTs never enter URLs, logs, screenshots or PRs. Do not reuse production accounts/tokens for “negative tests.” Wrong-issuer testing uses approved synthetic tokens/harnesses and never requires production credentials.

| Acceptance / owner | Procedure and exact expected evidence |
|---|---|
| Sign-in/discovery/selection — operator + founder | Real staging Supabase sign-in; O sees only authorized W1/W2; no silent selection. Select explicitly, honor requires_session_refresh, verify refreshed three scope claims before new data. Failed/wrong refresh leaves no new-scope data displayed. Capture redacted correlation and UI. |
| Independent state/resume — QA + founder | Distinct Brain, sector/channels/drafts for each workspace; save, exit, sign out, sign in and resume; switch repeatedly with late responses/unsaved answers. No wrong-scope display, cache reuse or false saved message. |
| Owner confirmation — QA + founder | Real name/descriptive customer text, selected sector/channels and explicit Confirm. Inferred provenance stays inferred. Missing seeded/URL-only facts produce422 ONBOARDING_INCOMPLETE with business_name/description paths; completion grants no billing/provider access. |
| F-08d identity authority — backend evidence + founder screens | Cite #214/#215 exact-head CI and named deterministic tests for admin-key denial, legitimate owner bootstrap, omissions, revoke/concurrency and cross-scope isolation. On staging, show member read-only identity UI and make only explicitly approved synthetic forced customer identity requests:403 BRAND_BRAIN_WRITE_FORBIDDEN, whole document/version/timestamps unchanged. Do not expose/use an admin secret in the browser or repeat admin tests on live staging. Owner customer correction200; unchanged member identity is allowed with unrelated edits. |
| F-08e member unrelated edits — QA + founder | M changes audience and customer action only, preserving stored name/description in replacement PUT.200 ready, correct row/version increments once, identity untouched; reload confirms. Screenshot is real staging, not the prior mocked image. |
| Revocation/demotion — operator + QA | Revoke or demote approved synthetic actor; subsequent writes denied. A pre-existing authorized locked transaction may finish before revocation; do not claim recall. Removed member discovery cannot bootstrap ownership back (#215). Stop repeated503 bootstrap retries and offer honest access/recovery guidance. Member onboarding writes403 WORKSPACE_NOT_AUTHORIZED; Brain write403 BRAND_BRAIN_WRITE_FORBIDDEN; Brain read unauthorized400 WORKSPACE_VALIDATION_ERROR/trusted_scope is distinct. |
| Concurrency/retry — backend QA | Onboarding two tabs same version: one save, one409 VERSION_CONFLICT; same key/body replay once, changed payload/key conflict409. Brain overlapping server snapshot may409 BRAND_BRAIN_VERSION_CONFLICT; sequential stale client-owner payload is **not** protected by client CAS. Current FE read-latest/edited-fields mitigates but does not close this gap: document it, never assert all stale writes conflict. |
| Failure honesty — backend QA + founder | Real unavailable read/save shows truthful503; uncertain commit retains text. Fault-induced lost-ack cases stay in approved disposable harness, not shared staging disruption. Onboarding same-key retry is safe under its contract; Brain/additional-workspace creation are not exactly-once and require reconciliation before retry. No unsafe fault injection against serving staging. |
| Isolation/devices/F-11 — QA + operator | Foreign fixture denied, prior state cleared, private/no-store/Vary Authorization checked, safe CORS; no provider/generation/Stripe/media/publish request or effect. HAR must be redacted at capture. Four agreed viewport checks (1440/768/390/320), keyboard/accessibility and real-device/nondeveloper review remain separate evidence. |

Pass evidence: pinned revisions, redacted request/status/code, DB operator's scoped synthetic row/version attestations, screenshots and before/after comparisons. **Automated API/local/mock checks, connected integration proof and founder-visible acceptance are separate columns in the existing acceptance pack.** Current F-08d/e remain unaccepted until this authorized run; historical “backend enforcement pending” text is superseded by #214/#215 code/CI, not proof the staging row passed. No new register is created.

## Phase 9 — Gate-by-gate approvals, abort and rollback

| Gate | Approval scope and exit artifact | Cannot authorize |
|---|---|---|
| Evidence freeze | Fresh metadata, canonical decisions, exact refs/CI and named operators | Any mutation; current API/cloud access remains blocked here |
| S1 | Staging-only credential preparation with exact secret/principal/provenance/cost fields | Binding, production rotation, shared-secret revocation or deployment |
| P1 (separate) | Reviewed production identity/role transition and its specific window/rollback | Blanket project-role removal or any production traffic change outside approved scope |
| S4 | Specific isolated restore destination, backup/data scope, spending/expiry and quarantine | Restore over live staging/production or export of unclassified PII |
| S3 | Exact two SQL files/target/order, role/data preflight, timeouts and recovery proof | Migration-all replay, dropping data, grant/RLS bypass or new recovery schemas |
| S5/S6/S2 | Exact safe manifest/artifacts, reachable candidate revisions, isolated binding/access retirement and credential-use read-only check | Paid-provider/Stripe activity, default traffic shift, fixture/app_metadata writes |
| S7 | Synthetic account/workspace/test writes and scoped revocation, explicit test duration/budget | Production accounts/data, provider calls, publishing, broad load/fault injection |
| Acceptance | Founder review of connected evidence and documented residuals | Merge, production rollout, pricing changes, launch certification |

A gate is not passed by a document existing. Current status: evidence/source/confirmed #215 CI VERIFIED; live identity/role/schema/restore and frontend artifact evidence UNKNOWN or BLOCKED; operational gates **not approved/executed**. Existing BG-STUDIO-013, BLK-STUDIO-06/07 and TD-STUDIO-SEC-001/002 receive appropriate evidence through ChatGPT's canonical reconciliation, without guessing their unseen row ownership or marking them resolved.

Abort immediately on production binding/data, shared credential ambiguity, impersonation path that defeats isolation, wrong issuer/scope, unexpected provider/Stripe request, missing backup/restore proof, schema/role drift, dependency/CI approval gap, false saved state, wrong-workspace data, uncontrolled costs or unavailable safe rollback. Named operator stops test activity and closes/restricts candidate routing only under approved rollback authority; this task grants none.

Preserve audit evidence and synthetic rows, tables, RLS, FKs and idempotency receipts. Roll frontend/candidate back only to reviewed compatible artifacts with isolated bindings; never restore shared-key access or old owner-write bypass. If DDL partially committed, record ledger state and stop for reviewed correction, not destructive down-migration. If data recovery is needed, restore to the approved isolated destination first; validated replacement/cutover is a separate founder decision. An unknown committed write must be reconciled, not treated as absent. Budget alerts do not replace the operator's hard request/time abort controls.

## Phase 10 — Secondary recovery contracts (design only; existing debt IDs)

### TD-STUDIO-BE-003 — Cross-instance provider duplicate execution

Current evidence from #215: distinct GenerationBillingOrchestrator instances can execute the same mock job twice despite one reservation/debit. `states`/executeOnce coalesces only inside one process. Financial idempotency is not a provider execution fence. No provider capability or exactly-once external guarantee is assumed.

Proposed contract:

- Identity is server-owned immutable job ID plus tenant/project/brand, execution class/provider and request fingerprint; actor/scopes are reauthorized. Attempts do not mint new reserve/debit keys; retain current financialIdempotencyKey(job) semantics.
- Durable claim records proposed owner, lease expiry from DB time, monotonically increasing fence epoch, request hash, state and minimal provider submission/result evidence. Claim and transitions use compare-and-set on owner/epoch; never a process Map as authority.
- States: ready → claimed → submitting → submitted → succeeded/failed; ambiguous call/ack → unknown/reconciliation_required. Record submission intent before external dispatch, outside a long-held DB transaction. Only current epoch may advance canonical job/campaign/settlement. Late old-worker output is retained as non-authoritative evidence for reconciliation, not silently overwritten or charged again.
- Expired lease **does not** authorize another paid call after submitting/unknown. Recover with provider-supported stable idempotency token or read-only operation lookup if genuinely supported and approved. If neither exists, stop automatic redispatch and require operator reconciliation; DB fencing cannot prevent a remote duplicate after a lost provider acknowledgement.
- Cancellation/timeout is not proof the provider failed. Keep unknown outcomes distinct; do not automatically release/refund/debit because a client disconnected. Settle only under the existing approved outcome/receipt policy; any reservation expiry/compensation/revenue change needs separate founder decision.
- Acceptance contract: two processes/containers race one job; stale lease worker cannot commit; crash before dispatch, after dispatch, after provider success and after campaign save; provider lacking idempotency; cancellation and late response; same-key/different-payload; one canonical receipt/financial effect. Failures must show no automatic unknown-state paid replay.

Implementation proposal must name the new schema/unique key/fencing transaction, migration/rollback, retention and reconciliation authority, lease parameters and provider-specific support matrix. All are **unimplemented/unapproved here**. Do not evict process state or add a timeout-based retry as a substitute for durable ownership. No paid generation used to design/test this contract.

### TD-STUDIO-BE-004 — Interrupted Stripe event claim

Current `beginStripeEvent` leaves a durable processing claim; fresh instances get503 STRIPE_EVENT_IN_PROGRESS without stale-claim recovery. complete/abandon currently identify the event, not a lease owner/epoch. Blind status reset could race a live handler or duplicate partially committed effects.

Proposed contract:

- Preserve verified raw-byte signature, configured Stripe account/mode/API version, immutable event ID/type/hash and existing event-ordering/financial-effect keys. Account identity is server configuration, not untrusted payload authority; no Stripe Connect scope is introduced.
- Add a proposed claim owner, DB-time lease, fence epoch and immutable attempt trail. Only matching owner/epoch can apply effects, complete **or abandon**. A stale handler's finally/catch cannot fail or overwrite a replacement worker's claim.
- Unexpired claim: existing in-progress response; processed event: same recorded result; same ID/different hash: conflict. On expired claim, transactionally acquire a new fence only after inspecting stored completion/effect evidence; reconcile before reapplying anything. No delete/recreate event row.
- Preferred boundary: external read-only subscription retrieval outside DB locks; then one fenced transaction for existing lifecycle/order checks, already-idempotent grant/effects and processed receipt. Current repository methods use separate transactions, so this needs explicit internal design/schema review, not a promise of an immediate drop-in patch.
- If effects committed before receipt/ack, reconstruct from immutable lifecycle/ledger evidence and finish once. Unknown external state → needs_reconciliation, keep retry honest; no automatic new charge, refund, grant or altered entitlement policy. Terminal cancellation and stale/out-of-order rejection remain enforced.
- Crash matrix: claim-before-effects, effects-before-complete, complete-before-HTTP-ack; two workers, lease expiration while first lives, old worker abandon after takeover, duplicate/different-hash/out-of-order events, unavailable Stripe read and unavailable DB. One financial effect/processed result, durable provenance; no takeover merely because a request took “too long.”

Founder review required for lease/recovery schema and retention, owner/fencing semantics, migration/provisioning and operator recovery permissions. Pricing, grace, entitlements and credit amounts remain unchanged. No migration, claim reset, live webhook replay or Stripe call is performed now. Attach this contract to existing TD-STUDIO-BE-004; do not create a duplicate issue/task.

## Delivery / first decision

This document is the deliverable on `bg-studio-016-staging-isolation-recovery`, based on exact #215. Source refs, ancestry and migration hashes were checked; no runtime suites or infrastructure commands were run because this is planning-only and the #215 GREEN checkpoint is already confirmed. Documentation validation requires clean diff, only this file changed and unchanged original PR refs.

**First decision proposed:** approve S1's staging-only secret preparation, conditional on the exact project/principal/operator/provenance/budget fields being filled and verified. It does not authorize S2, P1, migration, revision/traffic or feature changes. If these prerequisites cannot be supplied, the next action is the metadata evidence handoff, not a guessed resource operation. The sole Mission Control owner records the decision and links this package; nothing here self-approves an operational change.
