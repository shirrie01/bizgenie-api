# BG-FOUNDER-E2E-FINAL-01 — founder journey audit, Fonzo launch-week acceptance and readiness

24 November 2026. Branch `bg-founder-e2e-final-01` (API base `20951d14`, WEB base `50666b81`). Source/test only: no deployment, migration, IAM, secret,
staging-configuration or traffic change; no paid provider, Stripe, OAuth or publishing call; no real account connected. Public launch remains NO-GO.

**How to read the classifications.** `IMPLEMENTED AND VERIFIED` means real code with automated tests that exercise it (real PostgreSQL where noted, provider
boundaries replaced by deterministic doubles). It is **not** proof of a hosted customer journey: the *Hosted* column says what, if anything, was genuinely
observed on staging (founder-supplied evidence in #191). Mocks, fixtures and unit tests are never counted as hosted proof. Database tenant isolation is NOT
established by any mocked test: the runtime role has `rolbypassrls=true` (#191 diagnostic).

## A. End-to-end capability matrix (30 capabilities)

| # | Capability | Class | Evidence in code / tests | Hosted |
|---|---|---|---|---|
| 1 | Authentication | IMPLEMENTED AND VERIFIED | `src/authentication/*` (Supabase `getClaims`, `app_metadata` scope); WEB `AuthPanel.jsx`, `authClient.js`; `customer-authentication.test.js`, WEB `authClient.test.js` | Founder session accepted through R1/R2/Step 7 |
| 2 | Workspace discovery and selection | IMPLEMENTED AND VERIFIED | `src/customer-workspace/router.js` (`GET /`, `bootstrap`, `brands`, `select`); WEB `PremiumWorkspaces.jsx`; `customer-workspace.test.js` | `GET`/bootstrap observed R1; `select` and multi-workspace not run |
| 3 | Business onboarding | IMPLEMENTED AND VERIFIED | `src/workspace-onboarding/*` (`workspace-onboarding.v1`, CAS, idempotency); `workspace-onboarding.integration.test.js`, golden journey | R1 Steps 1–6 persistence PASS |
| 4 | Genie onboarding wizard | IMPLEMENTED AND VERIFIED (deterministic guide, labelled not a live AI assistant) | WEB `PremiumOnboarding.jsx`, `genieGuide.js`, `onboardingPanels.js` + tests | The hosted UI build was not independently re-observed |
| 5 | Brand Brain | IMPLEMENTED AND VERIFIED | `src/brand-brain/*`, owner-only writes; `brand-brain-*` tests | R1 persistence PASS |
| 6 | Brand asset uploads | PARTIALLY IMPLEMENTED | Customer reference-image intake (quarantine, rights attestation, inspection): `src/media-intake/*`, `customerReferenceImage*`, WEB `PremiumMedia.jsx`, `CreativeStudio.jsx`. **No approved brand-asset library (logo, can imagery) is bound to Brand Brain or auto-supplied to generation; no Fonzo assets exist in either repository.** Needs ClamAV and private bucket (external) | Not run |
| 7 | Business objectives | IMPLEMENTED AND VERIFIED | Onboarding goal + `planRecommendation` classification (`src/campaigns/recommendationStrategy.js`) | Recommendation observed (Step 7) |
| 8 | Audience definition | IMPLEMENTED AND VERIFIED | Brand Brain `audience` schema; onboarding step; now consumed by the plan | R1 persistence |
| 9 | Campaign strategy | PARTIALLY IMPLEMENTED | Deterministic recommendation (3 text starter items, trade/clinic/offer/lead/launch/awareness shapes); two-stage priced AI strategy workflow `src/strategy-workflows/*` (PG-tested with doubles). The strategy output is a text draft, not structured items | Recommendation accepted (Step 7); strategy workflow never hosted |
| 10 | Campaign creation | IMPLEMENTED AND VERIFIED | `POST /customer/campaigns`; R2 pinned root (#259); WEB root-only mode (#91) and ordinary create-with-starter-items | R2 pinned campaign accepted by the founder (#191) |
| 11 | Content planning | **WAS MISSING → IMPLEMENTED (this branch)** | Only 3 starter items existed. New `src/campaigns/contentPlan.js` + `GET /customer/campaigns/:id/content-plan`; WEB `contentPlanClient.js`, `ContentPlanPanel.jsx` | Not deployed (flag OFF; capability unlisted; bridge needs rebuild) |
| 12 | Script generation | PARTIALLY IMPLEMENTED | Video prompt compiler `src/video-generation/promptCompiler.js` and hybrid storyboard step; no customer-visible script artifact or approval step | Not run |
| 13 | Text generation | IMPLEMENTED AND VERIFIED | `text.standard` quote→confirm→worker→attach (`textAdapter.js`); legacy `/variants/:id/generate`. **Only for text-format items** (`OPERATION_UNSUPPORTED` for image/video variants) | Historical live staging output 1 Sep 2026 (BG-ACT-001); not current |
| 14 | Image generation | IMPLEMENTED AND VERIFIED | `src/image-generation/openaiProvider.js`, `creativeAdapter.js`, private storage; PG test with provider double | Historical live 1 Sep 2026; not current |
| 15 | Video generation | IMPLEMENTED AND VERIFIED (code) / see H | `googleVeoProvider.js`, durable submit/poll, `ExistingCreativeServicesAdapter` | Historical live 1 Sep 2026 (Veo 3.1 Fast, 4 s); none since |
| 16 | UGC and hybrid video | **MOCK OR FIXTURE ONLY** | `HybridCompositionAdapter` requires a compositor; the only one is `FixtureHybridCompositor` (`COMPOSITOR_FIXTURE_ONLY` unless the exact synthetic file; 4 s 16:9). **No production compositor exists** | Not possible today |
| 17 | Asset storage | IMPLEMENTED AND VERIFIED | `DurableMediaAssetStore`, private storage, authenticated preview delivery with ranges | Historical |
| 18 | Platform variants | IMPLEMENTED AND VERIFIED | One variant per item/platform/placement; plan emits destinations only where an active preview profile exists | Profile list verified hosted (12 active, #191 7120084354) |
| 19 | Platform previews | IMPLEMENTED AND VERIFIED | `previewRegistry.js`, 12 seeded profiles (no Instagram-feed video); WEB `CreativePreviewCard.jsx` | 12 profiles observed on staging DB |
| 20 | Content editing | **IMPLEMENTED BUT NOT CONNECTED (hosted bridge)** | Immutable copy revisions (#254) + WEB editor (#89); the bridge route table carries no revisions route and WEB marks `copyEditing` not carried under `bridge-v1` | Not run |
| 21 | Regeneration | IMPLEMENTED AND VERIFIED (as a new priced quote) | Failed/cancelled jobs report `new_quote_required`; new quote → confirm; failure test in this branch | Not run |
| 22 | Approval workflows | IMPLEMENTED AND VERIFIED | review → preview render → acknowledge → approve; revocation; PG tests; chained here | Not run hosted |
| 23 | Content calendar | IMPLEMENTED AND VERIFIED | `projection.calendar`, `GET /customer/calendar`, `/campaigns/:id/calendar`; WEB `PremiumWorkspaceCalendar.jsx`; 7 plan slots asserted here | A calendar read 503 was seen on the old revision only (#191); not accepted hosted |
| 24 | Scheduling | IMPLEMENTED AND VERIFIED | schedule/reschedule/unschedule; schedule only for an approved current revision; no dispatch | Not run hosted |
| 25 | Publishing readiness | PARTIALLY IMPLEMENTED / BLOCKED BY EXTERNAL DEPENDENCY | Manual publication flow verified; LinkedIn and TikTok connectors code complete (see I); TikTok direct post disabled by design; provider approvals and live accounts outstanding | Not run |
| 26 | Analytics and learning | IMPLEMENTED BUT NOT CONNECTED (hosted bridge) | Customer-attested measurements, insights, GrowthCentre; PG-tested; WEB marks `analytics` not carried under `bridge-v1` | Not run |
| 27 | Credit accounting | IMPLEMENTED AND VERIFIED | Append-only ledger, reservations, settlement (PG); plan states credit counts, never prices | Founder funding 100 credits verified (#191) |
| 28 | Provider expenditure controls | IMPLEMENTED AND VERIFIED (code) / NOT LIVE | `src/provider-spend/*` £100 / 10-customer cap, fail-closed (PG tests) | **`provider_spend_reservations` absent from staging DB (17 Nov evidence): not live** |
| 29 | Failure recovery | IMPLEMENTED AND VERIFIED | Fenced worker, reconcile, single release, no duplicate debit (existing + this branch) | Not run hosted |
| 30 | Customer support and error handling | PARTIALLY IMPLEMENTED | Mapped errors (`bridgeErrors`, `authErrors`, `CreativeJobResult`); **footer shows "Help and support / Terms / Privacy: not set up yet"** (screenshots); staging support/terms/privacy URLs unset | n/a |

## B. Exact functional gaps found by running the chain

1. **Strategy → content plan was missing.** A recommendation yields three text-only items; nothing produced a seven-day plan, media items, calls to action or slots. *Fixed:* deterministic launch-week planner, read-only route, WEB panel.
2. **Copy cannot be AI-drafted for image/video items.** `text.standard` is rejected for a non-text variant; media attach keeps the item's original copy. *Design consequence:* plan items carry editable template drafts (`initial_content`); only media is a priced step. Not changed (no new architecture).
3. **Quotes are campaign-version-bound.** Every attach bumps the campaign version, so quotes for several items cannot be held open: generation must be sequential (quote → confirm → run → attach → next). A batch "confirm the plan" does not exist and was not invented; each item still needs its own explicit price confirmation.
4. **Hybrid/UGC video has no production compositor** (fixture only).
5. **No approved brand-asset library**; no genuine Fonzo assets found.
6. **Hosted bridge does not carry** copy revisions, analytics or (until rebuilt) the plan route.
7. **Footer legal/support links unset.**
8. **Schedule `local_datetime` contract** (`YYYY-MM-DDTHH:mm:ss.sss`) was only discovered by running the chain; the planner now emits it exactly (defect caught by the integration test, not a hosted defect).

## C. Implemented fixes (changed files)

API (`bg-founder-e2e-final-01`): `src/campaigns/contentPlan.js` (new), `src/campaigns/router.js` (read-only `GET /:campaignId/content-plan`, optional `brandBrainRepository`), `index.js` (passes the existing repository), `src/studio-bridge/service.js` (read-only GET allowlist entry), `scripts/golden-journey/run.js` (new `content_plan` stage), `test/campaign-content-plan.test.js`, `test/fonzo-acceptance.postgres.integration.test.js`, `test/fixtures/fonzo-acceptance.js`, this document.
WEB (`bg-founder-e2e-final-01`): `src/premium/contentPlanClient.js`, `ContentPlanPanel.jsx`, `campaignManagementClient.js` (`addContentItem` accepts `initialContent` and a stable `idempotencyKey`; default behaviour unchanged), `featureGate.js` (`contentPlan`, flag `VITE_CONTENT_PLAN_API`), `src/App.jsx`, `src/styles.css`, tests (`contentPlanClient.test.js`, `ContentPlanPanel.test.jsx`, `App.premium.test.jsx` additions, fixtures), `qa/premium-content-plan.browser.qa.mjs`, route/contract tables (`qa/contracts/*`, `scripts`, `docs/studio/*`).

## D. Deterministic Fonzo acceptance (G)

Fixture: UK sugar-free soft drinks, 330ml cans; objectives as briefed. Facts limited to what was supplied; approved claims = "sugar-free soft drink" and "sold in 330ml cans"; no flavours, prices, nutrition values, certifications, testimonials or retailers. Placeholders: all brand imagery, product photography and the enquiry destination. Every generated asset is a test double and labelled FIXTURE.

Plan (`launch-week-7d.v1`): 7 posts + 1 key visual = 8 items; 5 images, 3 videos; destinations only where an active preview profile exists:
D1 Instagram image · D2 TikTok video · D3 LinkedIn image · D4 Facebook video · D5 Instagram image · D6 LinkedIn video · D7 Facebook image · key visual Instagram image (asset library, unscheduled). Slots in `Europe/London` with exact UTC offsets; CTA from Brand Brain; UTM tags; measurement plan (impressions, clicks, enquiries, leads, conversions as customer-attested counts).
Provisional credit estimate (staging.standard.v1: text 1 / image 2 / video 5, **not commercially approved**): 5×2 + 3×5 = **25 credits** of the 100 funded.

`test/fonzo-acceptance.postgres.integration.test.js` (disposable PG, 4 tests, 3 consecutive runs 4/4): fetches the plan through the real route; creates 8 items; per asset quote → explicit confirm at the quoted price → fenced worker → attach (never self-approves) → review → preview → acknowledge → approve → schedule; asserts provider calls exactly 5 image / 3 video, balance −25, 8 items, 7 scheduled + 1 approved, calendar occurrence times = plan slots, projection valid, replay adds nothing.

## E. Screenshots (F)

Mocked-API real-browser runs of the production build with the flag ON: `docs/evidence/bg-founder-e2e-final-01/` in the WEB branch: `1440-plan-built.png`, `1440-plan-added.png`, `390-plan-built.png`. Checks at 1440, 390 and 320 px: no horizontal overflow, targets ≥ 24 px, axe WCAG 2.0/2.1/2.2 A/AA with zero violations. **These show mock data; they are not a hosted or provider-generated experience.** Defects found and fixed by the run: plan table overflow at 390 px (stacked labelled rows now), a `nowrap` note overflowing, an over-long heading.

## H. Video provider readiness

| Question | Veo (`google-vertex-ai`, `veo-3.1-fast-generate-001` normal / `veo-3.1-generate-001` premium) |
|---|---|
| Implemented | Yes: one video adapter only; no other video provider exists |
| Valid request contract | Yes (obsolete `task` parameter removed in #42; `generateAudio:false`, 4 s, 720p) |
| Credentials / approval | Vertex AI via the runtime service account; output bucket write for the Vertex service agent; no new approval known |
| Async submit/poll | Yes (`VideoGenerationService.submit/poll`, durable state, restart reconcile) |
| Result retrieval | Yes: provider output → durable private asset → inspection → preview with ranges |
| UGC / hybrid | No production path (fixture compositor only) |
| Branded product assets | Reference-image intake exists; no brand-asset library |
| Expenditure limits | Code: £100/10-customer ledger, `FounderVideoSpend` £5 ceiling profile; **not live** (tables absent in staging as of 17 Nov) |
| Mock-only evidence | PG suites with a provider double |
| Genuine historical execution | One 4 s Veo 3.1 Fast output, staging, 1 Sep 2026 (BG-ACT-001). None on the current revision |

**Live video acceptance plan (for separate founder approval, nothing executed):** (1) apply the provider-spend ledger migration to staging with rehearsal and readback; (2) deploy the reviewed founder-video release profile (#253) as a no-traffic revision; (3) one founder-bound quote for one `video.normal` item (5 credits, ≤ £5 ceiling) with explicit confirmation; (4) observe submit, poll, private asset, preview, approval; (5) read-only evidence: one ledger reservation→settlement, one provider-spend exposure row, zero extra jobs; (6) independent review and rollback to the prior revision.

## I. TikTok and LinkedIn readiness

| Item | LinkedIn | TikTok |
|---|---|---|
| Code complete | OIDC web + PKCE + `w_member_social`; durable vault; refresh/disconnect; posting policy gate (`src/social-connectors/linkedin.js`) | `tiktok_web_v2` + PKCE; scopes `user.info.basic`, `video.upload`; draft upload with chunked transfer and reconciliation; direct post disabled by design |
| Test complete | PG + connector tests (OAuth, revocation, uncertain publish, no double post) | Same, incl. callback relay without token exchange |
| Provider configuration required | App client id/secret, redirect URI, `LINKEDIN_*`, posting policy | App client key/secret, redirect host, `TIKTOK_UPLOAD_ORIGINS`, chunk size, sandbox test user |
| Provider approval required | Product/permission approval for member posting (`app_review_status` must be `approved` or the route refuses) | Content Posting API app review (`PLATFORM_APP_REVIEW_REQUIRED`) — external, duration unknown |
| Genuine account connection verified | **No** | **No** |
| Publishing capability verified | **No** | **No** (draft upload only, never evidenced live) |
Nothing here connected an account, requested a permission, or exposed a token.

## J. Credit and expenditure safety evidence

| Scenario | Evidence (all deterministic, non-billable) |
|---|---|
| Insufficient credits | `generation-quotes.integration` (cannot confirm, no overspend); Fonzo test 3 (`INSUFFICIENT_AVAILABLE_CREDITS`, no provider call) |
| Provider budget exceeded | `provider-spend.postgres.integration` (cap 10000p across tenants/processes, one-shot dispatch permit, ambiguous failure holds the bound, fail-closed policy) — code only, not live in staging |
| Duplicate request | one reservation for replayed/concurrent confirms (existing + Fonzo test 3); plan items add once (key replay) |
| Partial failure | Fonzo test 2: failed video, completed work and item survive |
| Reservation release | released exactly once, replay never double-releases (existing + Fonzo test 2) |
| Successful settlement | Fonzo test 1: balance −25 exactly |
| Retry idempotency | reconcile replays; retry needs a fresh quote and debits once (Fonzo test 2) |
| Concurrent requests | two services confirm concurrently → one job/reservation; competing confirms cannot overspend (existing) |
| Application-level tenant isolation | Fonzo test 4 (foreign actor denied, no provider call); **not database isolation** |

## K. Remaining live execution requirements

1. WEB: reviewed compatibility-manifest entry for `contentPlan`, staging build with `VITE_CONTENT_PLAN_API`, manual release workflow (separate approval).
2. Bridge: rebuild/redeploy to carry the plan GET (separate approval, no-traffic then promote, rollback preserved).
3. For the founder-only staging campaign: the draft-workflow pins are bound to the existing Fairway campaign; a Fonzo campaign needs its own reviewed pin/profile (not done here).
4. Provider-spend ledger migration + live Veo test (plan in H); image and text live re-confirmation on the current revision.
5. TikTok and LinkedIn: app configuration, review/approval, sandbox/live account connection, one draft upload / one controlled post (separate approvals).
6. Legal/support/terms/privacy URLs and copy (adviser), Stripe test-mode then live evidence, £99 catalogue record, VAT.
7. Least-privilege database role / forced RLS before a second customer.
8. Production hybrid compositor, brand-asset library, copy-editing and analytics bridge carriage (post-launch unless the founder re-prioritises).

## L. Founder acceptance checklist (for the hosted run, after approvals)

1. Sign in; workspace shows Fonzo; Brand Brain shows only supplied facts.
2. Create a new campaign (not Fairway); open "Plan a launch week"; choose the first day; read the plan, placeholders and "please confirm" items.
3. Add the 8 items as drafts; confirm 8 drafts appear; nothing priced, generated, approved or scheduled.
4. For each item: get the price, confirm it, watch progress, review the result; labelled fixture/placeholder vs real provider output.
5. Review preview → acknowledge → approve → schedule; confirm 7 calendar entries.
6. Confirm credits fell by the quoted amounts only and nothing is left reserved.
7. Confirm no social post, Stripe charge or unexpected provider spend occurred.

## M. Estimated time to complete remaining work (engineering, excluding approvals and external waits)

WEB/bridge release steps ≈ 0.5–1 day; founder-journey bridge profile for a new campaign ≈ 1.5–3 days; spend-ledger migration + live Veo ≈ 0.5–1 day; TikTok/LinkedIn staging wiring ≈ 1–2 days plus external review (unknown); legal/support wiring ≈ 1 day plus adviser time; database role hardening ≈ 1–2 days; production hybrid compositor ≈ several days (needs a product decision). These are estimates, not commitments.

## N. Changes not independently verified

All results are from this session's local runs (Node 22; PostgreSQL 16 for the disposable-database tests; mocked-API Chromium) and are not independently reviewed. One existing test, `postgres-billing.integration` "runs against a real server…", fails on PostgreSQL 16 because it asserts PostgreSQL 17; it fails identically without these changes and runs on PG17 in CI. The WEB suite baseline (52 skips) is unchanged. No hosted CI exists for this branch until PRs are opened.

## O. Recommended next bounded command

"Claude: independently review API and WEB draft PRs for BG-FOUNDER-E2E-FINAL-01 at their exact heads (planner determinism, read-only route, bridge allowlist entry, WEB gating and idempotent add, test adequacy, hosted CI). Do not merge or deploy." Then, separately, founder approval for items K1–K2.
