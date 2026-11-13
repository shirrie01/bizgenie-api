# BG-LAUNCH-014 — Backend Integration Closure Report

4 November 2026. **Review candidate complete; hosted customer acceptance NOT RUN; staging RED / launch NO-GO.**

## 1. Integration branch and source

`bg-launch-014-integration-closure`, tested implementation commit **122342b265fc7e2eb09c4333bc7c27d4ddf057bd** (initial tools commit 678b3164efe8fefaaae66906db7cdbda97fb450f), based on BG-LAUNCH-012 **d44b29f185f20b1ac6b23df439c14cfaec8c906b**. Final documentation head is separately verified by remote Git. Source/test hashes and commands are in BG_LAUNCH_014_EVIDENCE.json.

Reviewed the 20-file #226 -> BG-LAUNCH-012 delta and four-commit ancestry. #226 f1fc2f51502793d9fb03617f30fd72b5a61c1e2e remains ancestor. #227 b400d27f7cdd516a772d45873adaa59a70f0c4b8 was incorporated by the documented cherry-picks in #012, not by duplicating another connector. LinkedIn vault/journal wiring, server-resolved connection, reviewed staging callbacks, media/tenant safeguards and gates are preserved. No new conflict required resolution in BG-LAUNCH-014. No server business-logic code in src changed in this task. #226/#227/#012 branches remain untouched.

Prepare ONE successor draft against bg-launch-005-integration (#226), including existing #012 plus these tools/tests. Do not also apply #227/#012 again to that candidate. Existing GitHub API auth is known invalid/Forbidden and was not repeatedly retried. No draft/CI/comment/register-write claim. Native Git publishing remains available; prepared PR metadata and exact comparison are supplied.

## 2. Defects corrected and actual engineering delivered

Executable real-router verification found two defects in the machine handoff, not a reason to change secure APIs:

- `workspaces (selection_required)` was incorrectly listed as a literal required response field; workspaces is now conditional and typed. A one-workspace response is correctly accepted without that property.
- Image/video execution brief was listed as simply optional. It is conditionally mandatory: missing image brief is tested as **422 CREATIVE_BRIEF_REQUIRED**, not worked around by weakening backend validation.

Contract remains bizgenie.customer-launch.v1, revision 2. Added response field types and executable conditional/envelope verification. No new endpoint, migration, pricing change or provider capability.

Delivered a standalone, no-dependency read-only operator runner; safety/CLI tests; real PostgreSQL customer journey/fixture; exact staging-origin CORS tests; package commands; and release/rollback/operator documentation. No broad authentication, billing or proxy redesign.

During test development, an undersized synthetic image was rejected by the existing validator: replaced by a local encoder-created 640x640 color fixture, retaining production validation. Full-suite fixture assumptions about other platforms' optional capabilities and existing held credits were corrected by selecting the two exact fixture connections and checking this job's ledger delta. Existing reservations were not erased/refunded to force a pass. These were new-fixture errors, not confirmed application failures. No assertions skipped or security policy relaxed.

## 3. Test results

Node 22.23.3; existing local PostgreSQL 17.11; original harness fresh quote_proof_<UUID> test DB only. No installations or shared/staging database operations.

| Check | Result |
|---|---|
| Final complete API suite | **1128/1128 PASS**, 138 suites, 0 fail/cancel/skip |
| Entire quote/customer/financial recovery PG suite | **62/62 PASS** |
| Staging runner + CORS safety/CLI tests | **9/9 PASS** |
| Standalone customer-contract command | PASS (one broad integrated journey; also included in full suite) |
| Source/test/index/worker/runner syntax | PASS |
| Whitespace/contract JSON | PASS |
| Hosted exact-head CI | UNKNOWN — API access unavailable; not inferred from local PASS |
| Live runner/Cloud Run/customer browser | **NOT RUN** — no cloud/credential recovery attempted |

Counts overlap and are test-framework counts, not independent customers or live proofs. Initial fixture failure logs remain outside Git for provenance; final full/source state passed. Prior #012's verified 1117/144/4 evidence is retained, not downgraded or claimed newly repeated here.

## 4. Customer API executable verification and dataset

Command with existing disposable local TEST_DATABASE_URL:

```bash
npm run test:customer-contracts
```

Uses the real createApp/customer routers, PostgreSQL authorization/Brand Brain/onboarding/campaign/preview/quote/ledger repositories, fenced worker, asset store and job attachment. Synthetic customer/token verifier, mock provider/connector HTTPS and private in-memory storage are labeled stand-ins. This is NOT a Supabase login or deployed storage test.

Verified: explicit workspace, genuine fictional owner Brand Brain correction, customer-confirmed sector/channels, campaign/content creation, strict request refusal, quote, idempotent confirm, one simulated output, job status, attach, real review/render/same-actor acknowledgment/current approval/schedule, authenticated bytes, calendar and subscription balance. Missing/invalid session 401, resumed valid session, valid unrelated-tenant workspace followed by known campaign/media 404, member identity 403 and member attach 404. One job debit, net zero held reservation for that job, unchanged other holds, correct available-credit delta.

Reusable helper `test/helpers/launch-customer.js` refuses non-loopback/non-quote-proof databases. Returned bizgenie.synthetic-customer.v1 descriptor includes fresh IDs, review/approval/receipt, calendar timestamp, revoked/expired connections, balance and scoped ledger history. One fictional primary business/owner; member/foreign identities are security controls only. No accepted Northgate asset touched or regenerated. See BG_LAUNCH_014_SYNTHETIC_CUSTOMER.md.

## 5. Authenticated staging runner

In an already-authorized environment only:

```bash
node scripts/staging/acceptance.js /secure/operator/approved-staging-acceptance.json > staging-acceptance.json
```

Requires existing gcloud authorization, existing Cloud Run invoker ID token and approved owner/foreign staging sessions supplied through environment-variable NAMES in a non-secret configuration. Does not create/mint/print credentials. Requires Cloud Build resolved source SHA -> deployed image digest, exact staging project/service/revision/principal/tag, zero/100 traffic split, staging Supabase metadata, existing reviewed database/service-role secret reference versions and isolation evidence, and existing fixtures/version/image hash/balance. Secret values are never read; matching reference metadata does not independently prove payload provenance. Missing build provenance or secret-referenced URL is NOT RUN, never guessed.

Finite GET-only root/auth/positive+foreign workspace/campaign/metadata/image/credit matrix; no root-404 health PASS; bounded streams/JSON, no redirects/retries, no generation/legacy video GET/financial settlement/social OAuth/publishing/attach/cancel. Byte checks are NOT RUN without reviewed absence of DB-writing preview hooks. Bounded ERROR log count, no raw logs. Simulation reports never count as live PASS; promotionAuthorized is always false. Exact prerequisites/limitations: BG_LAUNCH_014_STAGING_RUNNER.md.

## 6. Social, media and billing integrity

Full suite preserves #012's actual durable LinkedIn composition regression and mixed TikTok/LinkedIn factory/key gates. OAuth state/internal PKCE, encrypted tenant-bound credentials, expired/revoked references, reconnect/disconnect, missing scopes and duplicate-effect fences remain tested. New customer fixture demonstrates revoked and reconnect-required LinkedIn connections without live OAuth. LinkedIn text/media/company/analytics publishing remain disabled without current verified permissions/author/version/read contract. TikTok uploaded/creator action is never published; Direct Post stays off.

Full existing tests retain private media ownership/revision/rights, generation-pinned reads, ranges/bounds/cancellation and fail-closed inspection. Synthetic image is locally encoded, never paid generation. Existing immutable preview/profile/ack/approval rules preserved. Snapshot in-flight revocation cannot recall delivered bytes; no aggregate production egress proof is claimed.

Full quote/worker and Stripe/PostgreSQL suites cover duplicate events/entitlements, insufficient funds, reservation/settlement/release, pre-call cancellation, provider failure and interrupted recovery/rollback/idempotency. No live Stripe action. Ambiguous provider outcomes keep holds until safe reconciliation; this task never refunds unknown work or invents prices.

## 7. CORS and current hosted Studio compatibility

Existing CORS configuration supports https://staging-app.getbizgenie.com with bearer/content-type and scoped media Range/exposed length headers. New actual-app OPTIONS/401 tests pass and reject hostile origins/admin/serverless browser headers. No CORS code widening or live config update.

Web #66 was rechecked at newer **ae2933d98f90adf74332918065d9654b2992774d**. Runtime social/session/job/quote/workspace clients have no diff from #012's checked 8367d677 source; new work adds Pages/CSP/release/test documents and deterministic queued-job fixture. No Claude branch/file changed. #012 historical Web #65 patch is not to be applied.

Its Cloudflare Pages manifest is a static Studio with VITE_BIZGENIE_API_URL=https://staging-api.getbizgenie.com. That cannot by itself invoke a private Cloud Run tag: preflight has no invoker identity, and Supabase Authorization is not Cloud Run IAM. **P0 external hosting gate:** existing approved server-side identity bridge/BFF, or an explicit founder architecture/IAM decision if none exists. Smallest within the Pages choice is a reviewed same-origin server function using an already approved server-only identity exchange, forwarding the customer JWT while supplying invoker authentication. Not implemented/provisioned here. Never embed IAM tokens or make the API public merely to pass CORS.

## 8. Release/rollback package

BG_LAUNCH_014_RELEASE_PACKAGE.md contains source/schema/config/preflight/smoke/stop/rollback requirements. New migrations NONE. Existing onboarding/quote/media/social schema requirements named explicitly; applied-live status must be reconciled from existing completion evidence, not assumed or rerun. Candidate deployment requires separate approval. Keep old revision/image/config/secret-version references and backups; no down-migration, asset deletion, credit reset or secret rotation as rollback. This task changes no live state, so no live rollback is performed.

## 9. Remaining blockers and exact next approval

| Priority | Status / next action |
|---|---|
| P0 | Private API versus static hosted Studio invoker path unresolved; founder must approve the existing-identity server-side arrangement before any hosting/IAM action. Coordinate with Claude's BG-LAUNCH-013; no public-API shortcut. |
| P0 | Current target tag/principal/traffic/image/SHA, schema/role/isolation, backup/restore and owner/foreign fixture evidence inaccessible here. Runner is ready but **live NOT RUN**. Do not recreate fixtures or rerun migrations live. |
| P0 | GitHub API draft/CI and 18-tab Mission Control inaccessible; exact branch/PR body/issue text/proposed rows supplied, no write success claimed. |
| P0 | LinkedIn current Posts contract/author/access/read permission gate unchanged; no publishing activation. |
| P1 | Existing production key-management/credential isolation, in-flight media limits and aggregate egress operational gates retained, not redesigned. |

Next safe action without a release: authorized reviewer creates ONE Draft successor against #226 and obtains exact-head CI. Next founder-controlled operational approval: choose/approve private hosted-browser invocation path and later isolated deployment/testing scope only after identity/schema/recovery prerequisites. No deployment, promotion, OAuth or paid call is authorized by this report.

## 10. Canonical handoff

Issue #191 update, PR metadata and exact proposed Mission Control updates are prepared in /workspace/recovery/bg-launch-014/. No attempts to recover known-invalid credentials, no duplicate tasks/registers, no silent register changes. Reconcile existing TASK_REGISTER, EVIDENCE_REGISTER, CHECKPOINT_INDEX, SESSION_LOG, CURRENT_STATUS, LAUNCH_BLOCKERS, PHASE_PLAN, AUDIT_LOG/EOD_REPORT and existing backup/debt references using current real row IDs/headers. Source/decision/lock/pricing authority unchanged. Final published SHA and raw-log/source hashes are provided separately. No founder acceptance or launch-ready claim.
