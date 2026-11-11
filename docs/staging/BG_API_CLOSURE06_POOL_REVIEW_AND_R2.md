# Closure06: independent pool-diagnostic review and R2 API contract

11 November 2026. Review only: no Job/revision/deployment, IAM, secret or traffic
change; no live SQL, customer writes or paid calls. Claude owns the proposal/proxy.

## Exact proposal retrieved; source review BLOCKED

Fetched read-only from `claude/bg-017c-07-pool-diagnostic-proposal`, commit
`55a066acf1ffdd6965ecff5f63d678f6a811e92c`:
`docs/staging/pool-diagnostic/pool-diagnostic.proposal.cjs`.
SHA256 independently matches README:
`b86db00b3a4edb05178a32b2d9e8292d0bc17ccf9a1fd34f4b1748b5bcc282be`.
The entire 27-line script and README were reviewed. No source was invented or changed.

| Severity | Exact source lines | Finding / minimum correction requested from Claude |
|---|---|---|
| HIGH | 6 | Missing `BRAND_BRAIN_DATABASE_URL` falls through to pg defaults. Validate required nonempty PostgreSQL URL and staging-only target/user binding before creating a Pool; reject production or ambiguous targets. Preserve the exact approved connection/CA mechanism; never print the URL. |
| HIGH | 1, 6 | Header incorrectly calls this deployed in-process pool proof; script constructs a NEW Pool. Label separate-process/configuration-equivalent evidence; never certify the existing00030 process from it. |
| MEDIUM | 9–22 | Read-only transaction is present, but no transaction-local statement/lock limits. Add reviewed bounds (5s statement /1s lock proposed), independent of the documented60s Job deadline. |
| MEDIUM | 23–27 | Preflight error is swallowed and exits normally; `{professional:false}` also has no failure status. Emit explicitly unavailable/not-accepted evidence and nonzero failure for preflight error/nonprofessional schema. README's claim that every error exits1 is currently false. |
| MEDIUM | 7, 25–26 | Connect failure precedes cleanup; query failure skips explicit rollback; release failure can skip pool.end. Put connection acquisition and nested rollback/release/end cleanup inside the protected boundary, preserving the initial failure. |
| MEDIUM | 3–4, 27 | Imports execute outside redacted error handling; arbitrary PREFLIGHT_PATH changes inspected code; raw e.code/class is not allowlisted. Pin the verified module layout/export, protect import failures and emit a fixed bounded failure code, never raw error/message/stack. |
| INCOMPLETE | 14–21 | RLS enabled/forced/policy count and owner boolean are collected, but not effective `row_security_active`, row_security setting or owner name. Add these to distinguish enabled RLS from effective bypass; do not infer row denial from grants alone. |

A deterministic VM run of the EXACT original source with stub pg/preflight/process
confirmed five concerns: missing URL still reaches queries; no local timeouts;
preflight failure leaves exit status successful; metadata failure skips rollback;
module failure escapes the error boundary. This is source-test evidence only, not
R1/R2 or any database/Cloud Run execution. No provider or credential access occurred.

### Configuration/equivalence gates still unverified

- Intended exact existing target: project `bizgenie-backend`, region `europe-west1`,
  service revision `bizgenie-api-staging-00030-pob`, tag/source `f1fc2f51` /
  `f1fc2f51502793d9fb03617f30fd72b5a61c1e2e`, currently0% (founder evidence).
- Exact immutable image digest and source/build attestation: UNKNOWN here and in
  proposal README. No invented digest. Source Dockerfile uses `/app`; that is NOT
  proof of the deployed image layout (buildpack path may differ).
- Proposed SA: `bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com`.
  README names `bizgenie-staging-database-url` version5: proposal configuration,
  NOT independently reverified binding. Pin the version actually verified for00030;
  no `latest`. Verify mounted CA, TLS, pooler/direct endpoint, username mechanism,
  network/VPC/egress, PG environment/options and role/session initialization parity.
  Do not retrieve or compare secret values outside approved runtime use.
- No Supabase Auth-admin, Stripe or provider secret needed by this diagnostic.
  DB URL metadata alone cannot prove its credential payload targets staging; an
  internal fail-closed target check is necessary, with only safe project identity output.
- `max:1` differs from app pool sizing; other app validation/timeouts and SSL behavior
  are not reused. Same image + secret reference alone is insufficient equivalence.
- A fresh Job process can prove its OWN actual connection, not an existing service
  pool. Founder must explicitly accept that alternative evidence standard before it
  can discharge213's current direct-pool gate. Ready/Listening logs prove limited
  connectivity/brand_brains SELECT, not onboarding INSERT/UPDATE or preflight.

### Separate future Job approval package (NOT execution instructions)

Provide corrected full script + SHA256, pinned launch command/job definition,
verified image digest/layout and config/CA/network parity, named operator and
numeric approved budget before asking for creation/execution/cleanup approval.
No new image or resource needed should be assumed. If exact image lacks the script,
review the precise nonsecret command delivery and its hash; do not silently build
another image and call it00030.

One task /parallelism1 /max-retries0 /bounded60s deadline /explicit CPU and memory /
no HTTP listener or service traffic /no command overrides at execution. Required
permissions to verify, not grant: run.jobs.create/get/run/delete, execution read
permissions and logging.logEntries.list; iam.serviceAccounts.actAs ONLY on the
chosen runtime SA. Existing service agent image-read and runtime DB/CA secret-version
access must be verified. No general Run Admin, Secret Admin or broad Token Creator
is proposed; no IAM change authorised.

Cleanup: preserve minimal reviewed output, confirm execution terminated, then delete
ONLY the separately approved one-off Job; logs remain under existing retention.
No service rollback, role/grant repair or data/schema rollback. If timeout occurs,
ensure the actual execution has ended before deletion; cancellation, rerun or any
other operational action must be covered by the exact approval. Creation, execution
and deletion are ALL unapproved now. Existing00029 stays100%, with historical-secret
access retained; it is availability fallback, not an isolated rollback.

## R1 accepted; actual runtime gate remains held

Founder-supplied Claude checkpoint6783204604 reports staging17.6 management
connection current_user=session_user postgres, non-superuser/BYPASSRLS, expected
ownership/grants/RLS, eighteen columns/twenty validated constraints, and unchanged
catalogue replay `{professional:true}`. Accept R1 as completed; do not repeat it.
No Cloud Run pool was observed. Replay is NOT actual application-pool proof.
R1/R2 approvals6782932888 remain valid; no repeated approval requested. New Job is separate.

## Exact R2 backend acceptance handoff for Claude

Use only the reviewed loopback proxy, hard-pinned existing tagged00030 URL and
founder-controlled identities. Proxy must restrict GET, disallow upstream/path overrides
and redirects, and forward missing customer Authorization for the unauthenticated
case while preserving private upstream IAM. A proxy-generated401 is NOT API evidence.
Do not emit IAM/customer tokens, customer records or secret values. No frontend/proxy
file has been edited here.

| Case | API contract / required evidence |
|---|---|
| Owner workspace | GET `/customer/workspace`; real identity verification, server membership lookup.200 with `status:ready` and one own workspace, `selection_required` for multiple, or `missing_workspace` if no membership. A missing fixture is not an owner-success result. |
| Same owner's onboarding | GET `/customer/workspace/onboarding` using existing verified selected tenant/project/brand token.200, `status:ready`, `onboarding.contract_version:workspace-onboarding.v1`, safe scope match and version/status evidence only. Existing persisted details must not be logged. |
| Explicit foreign scope | Onboarding GET has NO caller-selected tenant/project/brand parameter; query fields are ignored. A200 with own data is safe behavior, NOT a denial test. Use GET `/customer/calendar?tenant_id=<foreign>&project_id=<foreign>&from=<valid-ISO>&to=<valid-ISO>` with a nonzero window <=93days and the original scoped token. Expect404 `{error:{code:RESOURCE_NOT_AVAILABLE,...}}` before foreign repository read. Confirm route and tagged-revision provenance. |
| Real unauthenticated boundary | GET onboarding/workspace without a customer bearer reaches API and returns401 `{status:failed,error:{code:AUTHENTICATION_REQUIRED,...}}`. Proxy must not synthesize it. Record API-origin evidence safely; an absent real request is NOT RUN. |
| Revoked membership | Use ONLY an already-existing revoked fixture/token within read-only authority. Onboarding GET returns403 `{status:failed,error:{code:WORKSPACE_NOT_AUTHORIZED,...}}`; calendar returns404 unavailable. Workspace discovery may return200 missing_workspace; do not demand a fabricated403. No revoke/select/bootstrap write may be performed to prepare this test. If fixture unavailable, NOT RUN. |

`Cache-Control: private, no-store` /Vary Authorization are required for customer
success/errors. Do not compare or print whole response bodies. Existing unit/PG tests
prove these source boundaries, not hosted identity/provider acceptance. A new regression
proves caller query scope cannot redirect onboarding GET. Existing calendar tests
cover explicit scope and revocation; they were carried to230, not reimplemented.

## Legacy-schema source readiness

New tests boot the REAL production factory against only the existing20 migrations
and against the advanced source schema. All paid/media/premium flags explicitlyOFF,
no process credentials inherited. Startup adds no tables; disabled quote/social GETs
make ZERO pool reads and return authenticated503 /unauthenticated401. Identity verification
is a labelled local stub; this is NOT R2. Missing legacy onboarding table fails preflight
without provisioning; advanced exact preflight returns professional:true locally.
No early-activation defect found; no startup/schema/auth policy weakened.
