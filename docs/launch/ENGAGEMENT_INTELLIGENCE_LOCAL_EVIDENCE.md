# Engagement Intelligence — bounded local continuation (#203 / draft PR #204)

Status: local implementation evidence for review, not founder acceptance or runtime activation.
The [Google Sheets Mission Control register](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains canonical governance. This document is engineering evidence, not a parallel register.

## Verified starting state

- Isolated checkout: `/workspace/bizgenie-api`; clean `work` branch preserved.
- Existing remote feature branch fetched and verified at `ab1f96ec45e80e1a954569ace325c0aac1222548`, then checked out as `bg-launch28-w04-engagement-intelligence` under explicit resume authorisation.
- Remote main: `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`; main was not checked out or edited.
- Issue #203, comment 6327966562 and PR #204 could not be read through the existing GitHub API access (`Forbidden`). The founder's bounded resume work order supplied the local scope.
- CI run [39686870833](https://github.com/shirrie01/bizgenie-api/actions/runs/39686870833), at the starting feature SHA, was reported passing by the founder. It has **not** been independently verified: the run API also returns `Forbidden`. Local tests below are separate evidence, not a CI claim.

## Inspection and integration decision

`src/campaigns/measurementRegistry.js` stores scoped observations with measurement/publication/variant/content-item/campaign IDs, units, observation and recording timestamps, and `customer_attestation` provenance. In-memory and PostgreSQL reads constrain tenant, project and brand. `safeMeasurement` deliberately omits publication ID and scope metadata, so the public response alone cannot support a trusted join.

`supabase/migrations/20260920163000_create_campaign_measurements.sql` already enforces a composite foreign key to `campaign_publications`. `src/campaigns/router.js` records only against a published variant and uses the effective corrected publication timestamp. `src/campaigns/projection.js` resolves the publication correction chain; `repository.js` and `postgresRepository.js` expose publication, revision, approval, platform, placement and destination metadata through scoped campaign reads.

The structural join exists, but its analytical semantics are incomplete: there is no authoritative typed objective, measurement interval, organic/paid classification or creative-family provenance in the persisted measurement contract. Campaign `goal` is free text. Existing counters cannot be assumed to be equal-window outcomes or platform-verified analytics. An observation valid when recorded may also precede a subsequently corrected publication time.

**No read-only integration adapter or runtime route was added.** A safe adapter requires those missing semantics and the current effective publication metadata; copying labels, parsing free-text goals or inventing a measurement period would fabricate evidence. No registry/schema/API response changes are included. Existing recommendation behaviour is unchanged.

## Pure policy integrity changes

`src/campaigns/engagementIntelligence.js` remains unreferenced by runtime callers. Its internal draft input now requires:

- Explicit evaluation `window: {from, to}` (half-open) and `as_of`; canonical campaign timestamp validation, with timezone, is reused. No implicit wall clock, lookback or freshness threshold is invented.
- Scoped publication metadata including campaign/content/variant/publication IDs, revision and approval IDs, platform, placement, destination, effective `published_at`, and customer attestation. Measurement bindings must match exactly. Content-item fallback grouping is removed.
- An explicit objective on observations and publication context matching the requested supported objective. Awareness, unknown goals and inherited object-property names fail closed. Existing supported objective mappings and minimum sample/exposure guardrails are retained.
- Explicit organic/paid provenance and `count` units with bounded nonnegative integer values. Customer attestation stays customer attestation; `platform_verified` is unsupported until an authoritative verification path exists.
- Explicit `period_start` and `period_end` on relevant observations, inside the evaluation window and no later than observation time. Selected exposure and outcome must share observation time and measurement interval. Across publications, metric, interval, placement, destination, platform and traffic class must agree.

Latest snapshots replace older values rather than summing cumulative counts. Equal-time conflicting values or periods fail closed even when a newer snapshot is present. Duplicate measurement/publication IDs cannot inflate the sample. Evidence IDs include only selected denominators and objective-aligned outcomes in deterministic order.

Cadence considers only distinct, measured publications published inside the evaluation window, sorted by actual publication time. Five repetitive unmeasured or historical posts cannot justify reducing current cadence. Missing creative classification cannot establish repetition. All decisions require customer review; no automatic action or causal/statistical significance claim is introduced.

These metadata fields describe an isolated pure-policy draft contract, not new database columns or a claim that production can supply them. Synthetic test fixture counts are never treated as real performance.

## Executed local validation

Runtime: Node v22.23.3; disposable PostgreSQL 17. No external service credentials or production data used.

- `node --test test/engagement-intelligence.test.js`: 58 passed; 0 failed, skipped or cancelled.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test`: 685 passed; 0 failed, skipped or cancelled, including real PostgreSQL billing and campaign integration tests.
- `node --check index.js` and syntax checks of every JavaScript file under `src` and `test`: passed.
- `git diff --check`: passed.

Tests cover tenant/project/brand separation for observations and publications, missing publication/revision/approval metadata, wrong publication joins, corrected publication time, stale/out-of-window/future observations, equal-time conflicts, snapshot deduplication, objective mismatches, incompatible units/denominators/intervals/destinations/placements, organic/paid separation, source provenance, creative ordering, timezone equivalence and input immutability.

## Review boundary

No new environment variables, dependencies or migrations. No merge, deployment, production traffic, live social publishing, paid generation, pricing, or spending. Docker/Buildpack artifact CI was not run locally for this pure-policy change. Fresh remote CI and PR/issue metadata updates depend on existing authorised access; do not infer success from a local commit or branch push. Google Sheets governance status has not been changed. Confidence is high for the executed pure-policy behaviours; runtime integration remains blocked on authoritative metadata and review.

## Morning continuation — 22 October 2026

Starting local and remote feature SHA both verified as `f0e4ee802569bdd117bfe4bdd5cf198e5cc1aca3`; remote main remains `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`. Checkout was clean on the authorised isolated feature branch. The founder reported CI run [39692832016](https://github.com/shirrie01/bizgenie-api/actions/runs/39692832016) successful for that prior feature SHA. Fresh reads of PR #204 and that CI run still returned `Forbidden`; neither is independently verified.

Independent review reproduced three defects with failing regression tests before changing code:

1. Missing/zero exposure could silently exclude a positive business outcome while other posts supported reduction. The policy now returns `MISSING_COMPARABLE_EXPOSURE` instead of dropping that publication.
2. Cadence examined only measured publications, hiding newer unmeasured posts. It now enumerates potentially relevant recent publications, including unknown objective/traffic classifications. Missing selected-publication coverage returns `MISSING_CADENCE_COVERAGE`. An explicitly supported different objective or known different traffic cohort remains separate.
3. A measurement interval wholly before a corrected publication time was accepted if its observation timestamp was later. It now returns `MEASUREMENT_BEFORE_PUBLICATION` when the half-open period ends at or before effective publication.

Six additional deterministic tests cover these regressions, reversed ordering, unknown metadata, explicit cohort separation and the publication/interval boundary. The new [minimum source-data contract and implementation plan](ENGAGEMENT_INTELLIGENCE_SOURCE_CONTRACT.md) identifies exact existing authorities and missing definitions, preserves customer-attested provenance, requires complete cohort enumeration and proposes reusing the repository's existing consistent read boundary. It does not create a new metadata authority or infer facts from notes/goals.

Executed validation for the morning continuation:

- `node --test test/engagement-intelligence.test.js`: 64 passed, 0 failed/skipped/cancelled.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test`: 691 passed, 0 failed/skipped/cancelled, with real PostgreSQL 17 test fixtures.
- JavaScript syntax checks of `index.js`, `src` and `test`, and `git diff --check`: passed.

No dependency, environment-variable, runtime route or migration file changes. No application/shared database migrations, production changes or external calls to generation/publishing providers. Existing tests initialise disposable database fixtures. The prior validation above is historical evidence; these are the new results. Confidence is high in the executed pure-policy regressions; integration remains blocked on an approved authoritative source/qualification/interval/traffic contract. No launch readiness or governance acceptance is asserted.
