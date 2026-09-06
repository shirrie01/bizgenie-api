# BG-LAUNCH-002I-B campaign-spine persistence evidence

**Status:** implementation candidate in draft PR #55; unmerged and not deployed.

## Authority and boundary

- Canonical task-start `main`: `3b7ded9dc16dbeec5b9a13b27b2b8bc6814db727`.
- Authority: [campaign-spine contract](CAMPAIGN_SPINE_CONTRACT.md),
  [acceptance matrix and I-B handoff](CAMPAIGN_SPINE_ACCEPTANCE.md), and the
  latest canonical Issue #51 checkpoint.
- Scope is additive persistence, an internal repository seam, deterministic
  domain tests and disposable PostgreSQL 17 verification only.
- No customer route, UI, preview renderer/profile registry, provider, Billing,
  connector or deployment composition was added.
- Staging and production were not mutated. The migration was not applied to any
  shared environment and no billable generation occurred.

## Implementation

The additive migration is
[`20260903090000_create_campaign_spine_persistence.sql`](../../supabase/migrations/20260903090000_create_campaign_spine_persistence.sql).
It creates the fourteen relations handed off by I-A:

1. `campaigns`
2. `campaign_content_items`
3. `campaign_platform_variants`
4. `campaign_revisions`
5. `campaign_brand_snapshots`
6. `campaign_preview_evidence`
7. `campaign_approval_events`
8. `campaign_schedule_entries`
9. `campaign_manual_attempts`
10. `campaign_attempt_resolutions`
11. `campaign_publications`
12. `campaign_publication_corrections`
13. `campaign_events`
14. `campaign_command_receipts`

The migration adds same-owner/restrict references, bounded checks, unique
business identities, read-path indexes, immutable evidence guards, controlled
projection guards, deferred projection validation, RLS and explicit revocation
from `PUBLIC`, `anon`, `authenticated` and `service_role`. It contains no legacy
backfill and no destructive change to an existing relation.

The repository exposes the required internal seam:

- `executeCommand`
- `getCampaign`
- `listCampaigns`
- `listCalendarEntries`
- `listCampaignEvents`
- `verifyCampaignProjection`

PostgreSQL is the runtime authority. The in-memory repository is a deterministic
test double only. Writes revalidate and lock live tenant ownership in the same
transaction, serialize command receipts and aggregate versions, and retain
immutable event/revision/publication evidence.

## Proved behaviour

The current tests prove the following bounded I-B surface:

- atomic campaign, Brand snapshot, item, variant and first-revision creation;
- exact idempotent replay and changed-intent conflict;
- aggregate optimistic concurrency and one-winner serialization;
- tenant/project ownership denial and forged-member denial;
- Draft to Review to Approved to Published manual journey;
- preview-bound approval using a trusted synthetic receipt seam;
- explicit timezone/offset schedule validation;
- incomplete-content and strict nested-content rejection;
- pre-commit rollback, lost-ack recovery and fresh-process reconstruction;
- immutable evidence and fail-closed projection mutation guards;
- RLS/direct-role denial and unchanged real-PostgreSQL Billing behaviour.

This evidence does **not** claim implemented customer transport, platform
rendering, connector publishing, external-platform verification or the complete
campaign/calendar W4B journey. Shared and later-stage acceptance rows remain
owned by I-C through I-F and W4B as stated in the canonical matrix.

## Verification

On the final implementation head `6b5df3f00c1dcab770cca33e17754cf124fd055c`, GitHub
Actions run 103 recorded:

- Node 22 automated suite: **437/437 PASS**;
- dedicated real-PostgreSQL Billing suite: **21/21 PASS**;
- dedicated real-PostgreSQL campaign suite: **5/5 PASS**;
- JavaScript syntax: **PASS**.

The Node 22 Docker and Google Buildpack artifact job also completed both image
builds, runtime checks and smoke tests successfully on this final PR head. No
staging or production deployment was performed.

Local verification after the final content-validation amendment recorded
13/13 focused campaign tests and 411/411 non-PostgreSQL tests.

## Defects found and corrected by PostgreSQL CI

1. NUL-delimited advisory-lock keys were replaced by deterministic JSON text.
2. JavaScript arrays destined for JSONB are serialized explicitly.
3. pooled-session command authority is cleared before connection release.
4. projection authority is bound to the current transaction identity.
5. a missing command marker now fails closed using `IS DISTINCT FROM`.
6. empty-only fixture truncation remains compatible; populated campaign
   evidence and projections remain protected.

## Rollback and restart

Rollback before shared application is branch/PR closure. After durable data
exists, rollback means disabling future composition and applying a reviewed
forward fix; campaign evidence must not be dropped or rewritten.

Exact restart: reconcile PR #55 and exact-head CI, complete human/architecture
review of the migration and repository boundary, and merge only with separate
explicit authority. After an authorised merge, re-read `main`, Issue #51 and
open PRs before starting I-C. No staging migration or customer activation is
implied by merge.
