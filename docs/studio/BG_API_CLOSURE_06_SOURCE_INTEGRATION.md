# BG-API-CLOSURE-06 Track A — onboarding/security source tranche

13 November 2026. Authority: Issue #191 comment6839471927; source baseline main445cf24786f4d36abc7d2b4c6f49cdb15ad73daa (merged #233). Mission Control is canonical governance. No live/runtime acceptance implied.

## Changes and original PR mapping

Fresh branch bg-api-closure-06-onboarding contains #213 a6ba6c02cd42be5666a6c25cf2ea33630519de83, #214815217d130cbb3113bac5c56266fff0f37864ebe, #2158249e1f82964f2a4a89aab0882683a0dda340233 unique changes parent-first. Thirteen source commits replayed cleanly with source attribution. Repeated professional-schema compatibility patches815217d/8249e1f were empty after a6ba6c0 and skipped, not implemented twice. No stale media branches replayed. Original branches unchanged; all three originals remain open until independently reviewed incorporation on main.

#213 supplies workspace-onboarding.v1 persisted selections/draft/explicit completion, owner-only transaction-bound saves, CAS/idempotency, strict legacy/professional-schema preflight and existing two migration SOURCE files. #214 protects authoritative Brand Brain identity across member/admin/full-payload paths while preserving member non-identity edits. #215 prevents revoked bootstrap ownership resurrection, applies private/no-store response headers and permits existing campaign PATCH CORS preflight. No new feature or provider/paid flag activation.

Accepted media/preview/storage/generation source is retained. Campaign router changes are additive onboarding-context support; authenticated preview delivery/version/rights/generation/cancellation handlers unchanged. Preview registry, storage/previewDelivery, image/video services match current main. Source imports do not invoke provider calls. Existing migration files are only applied by explicitly disposable test fixtures, never auto-run in application startup or deployment. CI remains test/build only.

## Source versus operational readiness

Production composition constructs the PostgreSQL onboarding repository without applying SQL or initializing its schema on startup. Onboarding requests run strict schema preflight and return honest persistence503 on missing/incompatible tables. Inert source review is possible without claiming deployment readiness. No fallback silently writes onboarding state into Brand Brain or enables paid/publishing access. Existing deployment and shared-migration HOLD remains: independently prove actual application-pool role, SELECT/INSERT/UPDATE grants, RLS and exported preflight `{ professional: true }` against approved staging. Do not repeat already registered migrations. #231 diagnostic is an execution-unapproved proposal, not evidence this gate passed.

## Verification

Node22.23.3; existing disposable loopback PostgreSQL17.11 only. Full npm test937/937; focused onboarding/identity/reliability/privacy/CORS/media127/127; separate real PG billing24/24 and campaign25/25; no skips/cancellations/failures. Counts overlap. JS syntax/diff PASS. Local synthetic Chromium H.264 seek/play-to-end/authenticated range/revocation smoke PASS; no live deployment/Meta/provider claim. Historical reports remain dated evidence, not current hosted CI.

New draft and exact-head hosted CI/independent review are required. Do not merge or close originals on local results alone. Shared SQL, deployment, customer writes, IAM/secrets, Stripe/provider activation, social publishing and paid calls were not performed. Runtime rollback remains separate; source rollback is reviewed revert, preserving existing records and accepted media. Proposed migrations must not be reversed destructively.

## Next bounded tranche

After source acceptance, reconcile only #216's unique DEC-023/preference/product changes against this tranche and accepted main; do not import #217–#230 wholesale. Keep the independent provider-budget branch and #234 implementation separate. #213 runtime privileges/RLS/preflight and R2/metadata remain HOLD/NOT RUN; staging/launch NO-GO.

# Remaining API source graph — 13 November 2026

Public GitHub metadata plus native Git ancestry; not submitted reviews or merge protection acceptance.

| PR | Head | Base | Commits absent from main | Patch-equivalent commits | Source gate |
| --- | --- | --- | --- | --- | --- |
| #189 | `ae0f148f23f4e5cf2cf7823266e03bed08d992dd` | `main` | 6 | 0 | Separate hybrid UGC scope |
| #213 | `a6ba6c02cd42be5666a6c25cf2ea33630519de83` | `main` | 4 | 0 | Track A source only; shared runtime/schema HOLD |
| #214 | `815217d130cbb3113bac5c56266fff0f37864ebe` | `bg-studio-010-be-onboarding-persistence` | 8 | 0 | Track A source only; shared runtime/schema HOLD |
| #215 | `8249e1f82964f2a4a89aab0882683a0dda340233` | `bg-studio-014-identity-write-policy` | 13 | 0 | Track A source only; shared runtime/schema HOLD |
| #216 | `d81d9709ddca6d02cc61ac54da4bd5e6f56a7b1e` | `bg-studio-015-backend-reliability` | 25 | 0 | Next tranche: DEC-023/preferences and product parents |
| #217 | `23f49038f36acf8414a079e27a8d5ffc8d302f2b` | `bg-studio-019-backend-integration` | 48 | 10 | Next tranche: DEC-023/preferences and product parents |
| #218 | `9346055a4b0c2057f8ab13274396ecf502296ed6` | `bg-studio-020-backend-integration` | 57 | 10 | Next tranche: DEC-023/preferences and product parents |
| #219 | `653482f09d27df40e0cb79813ddcad79b7ebd134` | `bg-studio-021-backend-integration` | 61 | 10 | Next tranche: DEC-023/preferences and product parents |
| #220 | `996479e63981efc74ce5fe5ef6f7fce3cffbf4be` | `main` | 80 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #221 | `8864f003a4b8f23259ffbf2c817fe9beb3d91a62` | `bg-studio-025-social-contract` | 85 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #222 | `d2eecc3a57e93ae37697d73417718b6d5705961d` | `bg-cl-007-media-safety-regression-20261031` | 86 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #223 | `7ab2570bd417e192c9c911a52c74112ec0d90e82` | `bg-launch-001-production-composition` | 90 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #224 | `bafdbd2afc71870748928a5bf70ae54b14c38adf` | `bg-launch-001-production-composition` | 90 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #225 | `834a358f994aff94d4f5339b2cf6fc2aae516819` | `bg-launch-002-media-production` | 94 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #226 | `f493901aca59c464e737627b7e72d951531420be` | `bg-launch-003-provider-readiness` | 104 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #227 | `0d2271808cea109cc19e47ef4618bce2a81c22df` | `bg-social-001-tiktok` | 93 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #228 | `dc40b663d9ac33ae6a9fb3afda5bef2ea4230c86` | `bg-launch-005-integration` | 113 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #229 | `4f4637aaf991b2b0267bc472bcecdf33efd79d12` | `bg-launch-016-secure-studio` | 119 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #230 | `6e3639cd5ef39c408b06758f86ad9d8936c33510` | `bg-staging-p0-workspace-origin` | 132 | 10 | Stale product/social/runtime stack; separate reviewed integration required |
| #231 | `c343d2ffb24b94fb4f7e9bd457dd78bba4489621` | `main` | 4 | 0 | Diagnostic proposal; execution unapproved |
