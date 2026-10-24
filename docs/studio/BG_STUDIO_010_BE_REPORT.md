# BG-STUDIO-010-BE report: persistent customer onboarding and frontend contract completion

Authority: Google Sheets Mission Control Register v1.0 (DEC-015). This report is evidence for it, not a status change. **Architecture A approved under DEC-020 / LOCK-018; implementation not release-accepted or deployed, and no shared migration executed.**

## Current hardening checkpoint — BG-STUDIO-011-BE

Founder DEC-020 / LOCK-018 approves Architecture A and supersedes B. This is architecture authority, **not deployment or launch acceptance**. The original BG-STUDIO-010 evidence below is historical; current security changes and test evidence are in [`BG_STUDIO_011_BE_HARDENING.md`](BG_STUDIO_011_BE_HARDENING.md).

On the same PR #213 branch: owner-only writes with transaction-bound membership/project/brand locks; completion validates saved genuine business facts without changing source provenance; private/no-store responses; pending tenant FK/channel hardening and fail-closed catalog preflight. Local evidence: full suite 689, focused 43, PostgreSQL onboarding 19/billing 24/campaign 22 passed, no skips. Same-key recovery after a lost COMMIT acknowledgement is tested. Frontend #48's 503 copy requires an unconfirmed-outcome clarification; protocol remains v1.

Both migrations remain unexecuted on shared databases. Retention/account-deletion/backups and non-destructive rollback are documented in the updated migration plan. Exact SHA and GitHub CI/access evidence are recorded in the hardening report; no CI GREEN is inferred from local passes.

## 1. Verified starting state
* Base: `main` at `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` (live GitHub state read at the start of the session). Branch `bg-studio-010-be-onboarding-persistence` was cut from it. The media/video stack (#208–#211, BG-STUDIO-009-BE) was **not** used as a base because nothing here depends on it, and basing on unmerged draft PRs would couple this work to them. If those merge first, this branch should rebase without conflict in new files (it adds files plus small edits to `index.js`, `src/campaigns/router.js` and `src/campaigns/goalRecommendation.js`; not yet tried).
* Frontend contract read: `FE_BE_CONTRACT_BG_STUDIO_008.md` (frontend PR #47). Gaps G1–G6 are the scope.
* Baseline before changes: `npm test` 581/581. PostgreSQL integration (local PG 16.15): 45/46; the one failure, `PostgresBillingRepository real PostgreSQL adversarial proof › runs against a real server with every durable authority guard initialized`, is **pre-existing and environmental** (it asserts PostgreSQL 17; CI uses 17). It fails identically on untouched `main`.

## 2. What was built
New module `src/workspace-onboarding/` (schema, service, in-memory and PostgreSQL repositories, router), migration `20261023100000_create_workspace_onboarding_profiles.sql`, wiring in `index.js`, a deterministic recommendation tweak. Contract: `FE_BE_CONTRACT_BG_STUDIO_010.md`. Migration plan: `BG_STUDIO_010_MIGRATION_PLAN.md`.

Design decisions
* **Separate table keyed by the workspace scope**, not Brand Brain fields: preserves Brand Brain content/version/timestamps (campaign snapshot provenance) and avoids the unguarded Brand Brain PUT. This extends the existing workspace/tenant structures (same scope, same membership check) rather than adding a customer-profile system.
* **Scope only from the verified token's trusted scope**; membership re-checked on every call, so revoked memberships stop immediately.
* **Optimistic concurrency + idempotency**: `expected_version` compare-and-set (atomic in SQL), per-workspace last-write idempotency receipt. Identical retries replay; reused keys with new content conflict; stale writes get `VERSION_CONFLICT` with the current version.
* **Customer vs inferred**: sources are stored; an inferred value can never replace a customer-chosen one.
* **Completion is server-decided** (sector + ≥ 1 channel) and cannot be bypassed by editing a completed profile into an incomplete one. Failed or rejected requests never persist.
* **Strict validation and bounds** (zod `.strict()`, enumerated sectors/channels, length caps) mirrored by DB CHECK constraints.

## 3. Gaps
| Gap | Result |
|---|---|
| G1, G2, G3 | Built and tested (in-memory + disposable PostgreSQL). |
| G4 | Verified: this API only generates `BizGenie Workspace`; `Customer Campaign Workspace` comes from the frontend's legacy heuristic. Added read-only `brand_name_placeholder` flag. No names rewritten. Follow-up (frontend): drop the hard-coded string and the customer-specific literal in `businessNameFromGoal`. |
| G5 | Verified existing `selection_required` / `select` behaviour; no change; contract documented and tested. |
| G6 | Verified order (`updated_at` desc, then `campaign_id`; archived excluded) and field set; pinned by a test; documented. |

## 4. Recommendations (D)
Completed onboarding's saved channels reorder `suggested_items` (stable sort). No items added/removed/rewritten, no model or provider call, no cost. Sector is stored but **not** consumed: there are no sector-specific rules, and fabricating them would be inventing output. A sector-aware strategy engine needs its own work order; this contract is ready for it (`sector.key`, `industry_text`). Known caveat: replaying an old idempotency key after preferences change yields `IDEMPOTENCY_KEY_CONFLICT` (documented; frontend uses fresh keys).

## 5. Revoked-media recovery path (documented, nothing activated)
Verified in code: a campaign media reference must resolve to a `media_assets` row with `status = 'active'`, generated, matching tenant/project/brand and allowed use (`src/campaigns/postgresRepository.js`, in-memory equivalent in `repository.js`); otherwise the request fails with the generic not-available error and **no detail about why** (deliberate, to avoid leaking existence). `media_assets.status` can be `active | revoked | deleted`. There is **no customer-facing endpoint that un-revokes an asset**. The only recovery that exists today is: generate or supply a replacement asset and attach it through a new revision (a revision change also revokes any active approval and cancels its schedule). Whether revocation should offer a guided "replace" flow is a product decision for Codex/founder; the frontend's current non-accusatory hint is consistent with this behaviour.

## 6. Non-provisionable Instagram video profile (documented, nothing activated)
Verified: the default preview profiles are `instagram.feed.text`, `instagram.feed.image`, `facebook.feed.text`, `linkedin.feed.text`, `tiktok.feed.video`, `youtube.shorts.video`, `email.message.text`. There is **no `instagram.feed.video`**, so rendering an Instagram video variant raises `PREVIEW_VERSION_UNAVAILABLE` (409) and review stays blocked. That is correct fail-closed behaviour. Adding the profile requires the #210 contract to be accepted and a renderer/codec decision; this branch does not add it, and saved `instagram` channel preference does not imply video support.

## 7. Verification (local, this session)
| Check | Result |
|---|---|
| `npm test` (no `TEST_DATABASE_URL`) | **610 / 610 pass** (baseline 581 + 29 new) |
| New: `workspace-onboarding.test.js` | 24 pass: auth, defaults, partial save/resume, merge, stale/concurrent/duplicate, strict validation, inferred-vs-customer, completion rules, failure not saved, 503 path, tenant + workspace isolation, forged scope, account switching, revoked membership, placeholder flag, Brand Brain untouched/compatible, recommendation reordering and no cross-workspace leakage |
| New: `studio-010-contract-g5-g6.test.js` | 2 pass |
| New: `workspace-onboarding-migration.test.js` | 3 pass |
| New: `workspace-onboarding.integration.test.js` (disposable PG 16.15, all migrations applied) | 7 pass |
| All `*integration.test.js` against disposable PG 16.15 | 52 / 53; the single failure is the pre-existing PG-17-only billing assertion above |

Not verified: staging, production, a real Supabase auth token flow, PostgreSQL 17 locally (CI provides it), any frontend integration.

## 8. Remaining blockers / decisions
1. Founder approval + review before the migration is applied anywhere (see migration plan).
2. Frontend work order: consume `workspace-onboarding.v1`, remove "not saved yet" labels, handle `VERSION_CONFLICT`/`503`, use `brand_name_placeholder`, refresh the session after workspace selection.
3. Bootstrap seeds Brand Brain `identity.description` from the website/profile URL and `commercial.primary_cta` from the marketing challenge. The frontend's "profile complete" test (real name + description) can therefore be satisfied by seeded text the customer never wrote. Backend fix would change existing behaviour; deliberately not done here. Recommend a decision.
4. Sector-aware recommendations: separate work order.
5. Revoked-media replace flow and Instagram video profile: product/contract decisions (§5–6).
