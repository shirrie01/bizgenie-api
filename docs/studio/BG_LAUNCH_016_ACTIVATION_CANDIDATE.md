# BG-LAUNCH-016 — Integrated Backend Activation Candidate

Checkpoint: 4 November 2026. Code complete locally; hosted acceptance NOT RUN. Staging RED; launch NO-GO. No operational change was executed.

## 1. Candidate and provenance

Branch `bg-launch-016-secure-studio`, based on BG014 `50a2ef5a88f2996a4c121250cd49ef5fc420abb5`, including BG012 `d44b29f185f20b1ac6b23df439c14cfaec8c906b`. Obtain final immutable candidate SHA from this report's publishing manifest/Git branch; do not deploy a moving branch.

Native Git verified API #226 `f1fc2f51502793d9fb03617f30fd72b5a61c1e2e`, #227 `b400d27f7cdd516a772d45873adaa59a70f0c4b8`, #213 `120a874dfa02313a8c28dad82ddb6582f0065469`; Web #68 `433c898d9f087e44e00f272db3ad0565d84479f7`. These existing branches and the original checkout are preserved. BG012/BG014 contract, social-vault composition and synthetic journey are reused, not rebuilt.

## 2. Draft and CI

Prepare one successor integration draft targeting `bg-launch-005-integration` (#226), including BG012/014/016; do not create a second onboarding or LinkedIn implementation. GitHub API authentication was already unavailable; not retried. Native Git publication is separate from draft creation and hosted CI. Hosted CI UNKNOWN until independently read at the exact candidate SHA. Web68's 17/17 hosted result is founder-reported, not independently inspected here.

## 3. Demonstrated defects corrected

Staging CORS omitted upload DELETE. Only staging's configured origin and exact existing asset resource now receive DELETE preflight support; production methods remain unchanged. The acceptance runner now permits an explicitly approved new immutable staging revision rather than requiring impossible in-place updates to revision 00030. It adds CORS evidence and distinguishes mock, hosted and unexecuted checks.

## 4. Private Cloud Run connection

Implemented Option A: optional trusted Node 22 staging bridge (`src/studio-bridge/service.js`, `scripts/staging/studio-bridge.js`). It validates the existing Supabase customer identity, preserves its Authorization header, and adds server-only X-Serverless-Authorization using the existing Google SDK. The API repeats membership/object authorisation. Only staging Supabase `zrczojyxebwjgpymbmgu` and invoker `bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com` are accepted. No production or default-compute invoker fallback.

Target tag, service audience, revision, source SHA and approval reference are server configuration, never client input. Target and audience must have an exact tag/service relationship. Config does not query Cloud Run metadata per request: operator preflight must establish that the pinned tag actually points to the reviewed revision/SHA.

Explicit route allowlist, hostile-origin/header rejection, auth/scope checks before IAM, request deadlines, cancellation, safe response types, byte caps, per-user rate limits and concurrent limits apply. Browser cookies and forged IAM/admin headers are not forwarded. No Google credentials, ID tokens, Supabase service-role keys or unrestricted proxy targets reach browsers.

Claude's Web68 operator proxy is a loopback rehearsal with operator ID_TOKEN, bearer-presence checking and response buffering; it is not customer hosting. This bridge adds actual customer verification and bounded forwarding without modifying that proxy. Option B (public private-API ingress) is not approved. Option C (existing gateway) is unverified, not assumed absent.

## 5. CORS and upload deletion

Existing `DELETE /customer/assets/:assetId` requires tenant/project/brand scope and owner authority transactionally. It is a logical deletion with physical removal pending retention policy. Actual router/PG tests cover unauthenticated, foreign, member, owner and duplicate requests; one audit event, unrelated generated asset unchanged. No intake/delete feature flag was enabled. Browser-origin test covers staging success, production rejection, wrong resource and hostile origin.

## 6. Existing onboarding

Reused `POST /customer/workspace/bootstrap`, not a new provisioning API. Contract revision 3 documents the existing optional business_name, website_or_social_profile and primary_marketing_challenge request fields, workspace response and required session refresh. Real router/PG tests cover fresh identity, idempotent bootstrap, old unscoped token rejection, refreshed scope, campaign access and membership revocation. Bootstrap does not grant entitlements. Mock scope provisioning explicitly stands in for Supabase admin claim propagation.

## 7. Test evidence

Node 22.23.3, PostgreSQL 17.11 in existing local container; only disposable UUID test databases. Full `npm test`: **1,142/1,142 PASS**, zero failures/cancelled/skipped. Focused `npm run test:studio-connectivity`: **22/22 PASS**. Quote/customer PostgreSQL suite: **63/63 PASS**. Final full suite includes the added bridge/customer test and final target-suffix hardening. Syntax checks and `git diff --check` pass.

Classification: LOCAL REAL = Express routers, HTTP forwarding, PostgreSQL transactions/CAS/ownership, logical deletion; MOCKED = Supabase verifier/admin update, Google invocation token, provider and local media fixtures. HOSTED REAL = none. Real IAM, browser hosting, JWT refresh propagation and cloud media were NOT RUN. Logs and file hashes are in the external recovery evidence directory.

The inherited synthetic journey covers Brand Brain, campaign, quotes, simulated confirmation, reservation, job, preview/review/approval, calendar, capabilities and credit/billing reads. New bridge testing adds bootstrap/session recovery, campaign and media forwarding, revoked membership and owner-only upload deletion. No paid execution or shared data was used.

## 8. Social/video boundaries

Existing #227 token-vault composition retained; unsupported LinkedIn publishing remains disabled. TikTok remains draft/inbox handoff, not public publication. Existing deterministic lifecycle/duplicate/recovery/video-credit tests pass in the full suite. This does not prove live OAuth, provider approval or public posting. Bridge social writes and generation confirmation are separately default OFF. No Claude media files were edited.

## 9. Read-only runner

`node scripts/staging/acceptance.js /secure/operator/approved-staging-acceptance.json`

Metadata must pin service, identity, immutable revision, digest/source SHA, retained 00029 at 100%, candidate at 0%, authorised fixtures and safe GET routes. A newer candidate requires explicit targetApprovalRef. One OPTIONS preflight checks CORS but is not proof of browser IAM access. Missing credentials or production target fails closed. GO means only the configured read-only acceptance passed; promotionAuthorized is always false. Mock execution cannot produce hosted GO. No live execution occurred.

## 10. Approval-gated activation procedure

1. Review this exact commit, create draft, obtain exact-head hosted CI. Reconfirm #226 dependency and existing migrations/credential-isolation/backup evidence; do not rerun completed shared migrations. No new migration is introduced here.
2. Obtain metadata-only evidence for current staging revision/tag/source/digest, runtime, resource-level invoker, credential isolation and backup/restore readiness. Recorded 00030-pob at 0% and 00029-wtc at 100% are historical, not live-verified today.
3. With founder approval only, build exact reviewed source, record immutable image digest/build provenance and deploy a NEW private zero-traffic staging candidate. Never claim this code is already in immutable 00030-pob. Keep retained staging at 100%; production untouched.
4. Host the alternate `npm run start:studio-bridge` entrypoint in an approved existing Node runtime. If unavailable, proposed single service name `bizgenie-studio-bridge-staging` requires explicit resource/cost approval; existence is UNKNOWN. No new platform/dependency is needed. Cloudflare Pages static hosting cannot run this Node HTTP server.
5. Use `scripts/staging/studio-bridge.env.example` as reference, replacing placeholders from verified metadata. Supply only staging public Supabase URL/publishable key; use attached reviewed staging identity, never static IAM tokens or private keys. Resource-only Cloud Run invoker eligibility must be verified, not assumed or silently granted. BIZGENIE_ENVIRONMENT=staging; exact tagged target and untagged audience; new revision, exact SHA and actual approval ref. Default bind127.0.0.1; only approved server hosting uses 0.0.0.0 and assigned PORT.
6. Keep all three bridge write flags false initially. Configure Claude's VITE_BIZGENIE_API_URL to the approved customer-reachable bridge origin and align PAGES_EXPECT_API_ORIGIN/CSP. No callback, DNS or production changes are included. Browser-to-bridge uses Supabase bearer; bridge-to-private-API uses both distinct identities.
7. Run guarded metadata/read-only runner, then actual browser sign-in, expired-session refresh, authorised/foreign workspace, campaign, preview/ranges and credit reads. Treat unsupported route404 as failure/unavailable, never success. Collect sanitised responses and corresponding revision logs without tokens/personal data.
8. Separately approved synthetic staging writes are required for bootstrap/onboarding/upload-removal acceptance; these are not read-only tests. Align VITE_CUSTOMER_MEDIA_INTAKE_API/VITE_CUSTOMER_MEDIA_DELETE_API only after hosted proof. VITE_SOCIAL_ACCOUNTS_API and VITE_GENERATION_QUOTE_API must match independent bridge gates. Do not enable real confirmation, OAuth, Stripe or publishing. Existing Stripe checkout/legacy generation/provider callbacks are intentionally not allowlisted; broader commercial acceptance remains an explicit unresolved gate, not removed launch scope.

Bounds: 60 verified-user requests/minute/instance, 8 concurrent requests, 30s deadline; JSON100KiB (quotes16KiB), upload32MiB, JSON response1MiB, image32MiB, video8MiB/transfer. Video clients must use bounded ranges. Limits are per instance, not aggregate distributed egress. Eight simultaneous buffered uploads can consume approximately256MiB plus runtime overhead; recommend one staging instance and a reviewed memory/egress budget before activation. Actual cost is UNKNOWN without approved runtime configuration; no cost or instance setting was applied.

Abort on wrong project/identity/source, missing backup/isolation proof, unreviewed IAM, failing CI, auth/scope leak, unexpected provider/billing activity, unbounded delivery or production reference. Do not retry production or broaden permissions. Roll back only under operational approval: stop bridge access or restore prior reviewed Studio API base, retain old staging100%, remove candidate traffic if any was separately approved. No down migrations, financial resets or asset cleanup. Preserve logs, data and exact digests.

## 11. External dependencies and governance

GitHub draft/comment/CI reads unavailable; Mission Control live registers unavailable. No issue/register write is claimed. Proposed synchronisation records are supplied for existing TASK_REGISTER, EVIDENCE_REGISTER, CHECKPOINT_INDEX, LAUNCH_BLOCKERS, SESSION_LOG and relevant debt/source records; reconcile existing IDs, preserve history, create no duplicate register. Mission Control remains canonical; code evidence does not grant operational authority. DEC-014/020/025 and later specific locks are not superseded by this engineering report.

## 12. Single next founder decision

Approve or reject one bounded staging activation package: exact-head green draft; metadata-confirmed NEW private zero-traffic API candidate; approved customer-authenticated bridge hosting/identity/resource-only invocation; staging-only Pages base/CSP alignment; read-only hosted acceptance first, followed only by explicitly approved synthetic write fixtures. Set an explicit cost/instance ceiling before any resource action. Excludes production, traffic promotion, merges, migrations, paid generation, live Stripe, OAuth and publishing. This report does not approve activation or certify launch readiness.
