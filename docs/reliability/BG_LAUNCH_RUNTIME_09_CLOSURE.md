# BG-LAUNCH-RUNTIME-09 checkpoint — 13 November 2026

## Source corrections

Baseline: `5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5`. Existing root checkout and 46 clean worktrees were preserved. Recovery receipt and manifests are outside the repository at `/workspace/recovery/bg-launch-runtime-09`; the archive contains no changed files because all recorded worktrees were clean. It is not a full repository backup.

Issue #246: pg-pool removes a client from its tracked list before asynchronous socket shutdown completes. Consequently Pool.end() could resolve before the fixture's FORCE database drop killed that connection (57P01). A test-only drained pool waits for each connected client's end event. Fixture cleanup now drains sibling operations, reports all shutdown failures and uses ordinary DROP. A deterministic real-PostgreSQL regression contrasts the raw and drained pool without sleeps or suppressed errors. No application pool behavior changed.

Final Node 22.23.3 / disposable PostgreSQL 17.11 evidence: ten consecutive focused runs, 33/33 each; complete suites at two and four file concurrency, 1,311/1,311 each. Billing 27/27 and campaign 30/30. Logs are preserved in the recovery directory. Hosted exact-head CI and independent review remain required; this does not close #246 by itself.

## Issue #234: operator estimate authority

The cost branch depends on the teardown correction. Existing GBP upper bounds alone did not substantiate native price, FX and fees. Reserve and start now both validate explicit operator-owned estimate authority. The existing £100 aggregate UTC-calendar-month ceiling, ten-customer cohort, uncertain reservations, idempotency and policy-hash checks remain intact.

Each estimate requires `authority.native_currency` (GBP or USD), positive safe-integer `native_bound_minor`, explicit nonnegative safe-integer `fees_gbp_minor`, and `fx`. For GBP, fx must explicitly be null. For USD, fx requires from USD, to GBP, positive integer numerator/denominator, source_ref, version and unexpired valid_until. Required GBP exposure is ceil(native minor * numerator / denominator) plus fees, using BigInt. The approved GBP upper bound must cover it. Unknown, stale, unsupported or missing authority fails closed. These fields are operator policy JSON; there is no database migration or browser request change. Legacy policies missing authority are intentionally denied, not silently converted.

Source references identify approved operator assertions; code cannot establish that a provider tariff or FX source is truthful. Actual prices, FX, fee assumptions and initial cohort approval remain unresolved. No synthetic test value is a real tariff. Actual models needing approved evidence include Gemini 2.5 Flash, GPT Image 2, Veo 3.1 Fast and Veo 3.1; audio, duration, resolution, quality and variant affect the required bound. Hybrid fixture/prototype work is not proof of an operational provider. Status reconciliation remains bounded/one-shot; a verified charging and repeated-observation contract is required before live video use. No activation is authorised.

Final dependent-branch tests: 38/38 focused; 1,317/1,317 complete, zero failures, cancellations or skips. Existing dependencies were reused. No paid calls.

## Issue #245: read-only runtime approval package

Status: PREPARED, EXECUTION BLOCKED. Closed/deferred #231 source is not imported or approved by this report. No Job, endpoint, deployment or SQL execution is authorised.

Historical founder evidence identifies project bizgenie-backend, europe-west1, staging bizgenie-api-staging, dedicated tagged revision 00030-pob and historical rollback 00029-wtc. These are lookup targets, not fresh live verification. Current digest, traffic, database binding/version, principal permissions, named operator and backup/restore evidence remain UNKNOWN. Production bizgenie-apii and Supabase uvgblmejpbswkvlqvqmz are excluded; intended staging Supabase is zrczojyxebwjgpymbmgu.

The connected authorised operator must first supply metadata-only current revision/digest, runtime principal, database-secret reference/version and CA binding, traffic and rollback evidence. Never supply payloads, connection strings, fingerprints or whole environment dumps. Supabase admin, Stripe and provider credentials are not needed. This environment has no available authenticated GCP tool/session; no credential recovery or installation was attempted.

Founder approval must identify the exact reviewed source/digest, operator, staging revision, execution method, metadata allowlist, resource/time/output bounds, cost ceiling and abort/rollback conditions. An isolated same-configuration Job is NOT proof from the existing running application pool. No approved existing in-process diagnostic method is established; a new endpoint or revision would require separate approval. A proposed one-off 1 CPU / 512 MiB / 60-second / zero-retry / 16 KiB-output bound is a proposal, not approved infrastructure or a verified monetary estimate. A £1 maximum spend is a requested ceiling, not spending authority; operation is blocked until its cost can be substantiated and approved.

If an approved method can borrow the actual staging application-pool client: BEGIN READ ONLY; apply local statement and lock timeouts; obtain current_user/session_user, metadata-only SELECT/INSERT/UPDATE privileges, RLS/policy boundaries and migration catalog; invoke the exact reviewed exported preflight(client), expecting { professional: true }; ROLLBACK and release the client in finally. Never end the application's shared pool. Do not SET ROLE, query customer records, write, run migrations or print credentials. Missing permission, wrong project/revision, production reference, timeout, schema disagreement or unexpected output aborts. Privilege metadata does not prove HTTP tenant isolation or successful writes.

## Remaining integration gates

- Current shared migration state and effective application role remain unverified here. Do not replay already registered onboarding migrations. Require exact migration hashes/dependencies and backup/isolated restore proof before any separately authorised shared change.
- Source media rights/revocation controls are not deployed acceptance evidence. There is no per-asset licence-expiry contract in the current intake/schema; do not claim time-limited licensing is enforced. Real private-storage reads, video playback/ranges and provider output remain NOT RUN.
- Stripe source tests do not constitute a Stripe transaction, webhook or commercial-price acceptance. All live financial activity remains prohibited. PostgreSQL remains financial transaction authority; Mission Control governs the programme.
- Read-only WEB main inspection at df3b95d9ed462264669fc9640f3259739a33f2df found matching workspace/onboarding/Brain/quote/job/calendar/media/social and billing request routes. This is static alignment only, not browser or deployed verification. No frontend changes were made.
- Real sign-in, two-workspace onboarding/resume, owner/member correction, two-stage generation, private preview, calendar, social, checkout and recovery acceptance remain NOT RUN pending their separate gates. No premium capability is declared removed or launch-ready.

## Publication and governance

New hosted CI, review, merges and Mission Control writes must be recorded only when confirmed. Existing baseline CI acceptance is preserved. Source-only merge is blocked pending exact-head hosted CI and independent review; no deployment or operational authority follows from a merge. Launch remains NO-GO. The next priority is connected GitHub exact-head CI/review of the teardown branch, followed by its dependent cost-authority branch. The sole existing Mission Control should receive conditional updates to #246/#234/#245 evidence and blockers; no new register is proposed.
