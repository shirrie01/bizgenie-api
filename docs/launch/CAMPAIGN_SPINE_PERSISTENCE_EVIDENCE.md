# BG-LAUNCH-002I-B campaign-spine persistence evidence

**Status:** I-B review findings remediated and locally verified on 2026-09-07;
PR #55 remains draft, unmerged and undeployed pending fresh independent review.

## Remediation checkpoint — 2026-09-07

The founder confirmed that
[bizgenie-implementation-contract-amendment-v1.1](IMPLEMENTATION_CONTRACT_AMENDMENT_V1_1.md)
supersedes the earlier failed-publication wording. The policy conflict recorded in
the historical review below is resolved: record attributed failure metadata, expire
the active schedule, return to Approved and require explicit new scheduling before
another attempt. Original schedules, attempts, resolutions and events remain immutable.

The remediation addresses the confirmed review findings:

| Finding | Implemented correction and proof |
| --- | --- |
| Terminal/revoke transitions | Domain rejects Published edits; revoke returns Review; both adapters run the same regression cases |
| Media ownership and attribution | Resolve/lock active generated media and its immutable job under exact tenant/project/brand/kind; compute immutable manifest provenance; reject missing, foreign, null-brand, revoked, wrong-kind and reference-only assets |
| Preview binding | Strict receipt shape and exact revision hash/platform/placement/format; trusted availability callback fails closed; database binds content and approver acknowledgement |
| Projection verification | Independent typed-event replay compares root, item, variant, revision and immutable lifecycle records; corruption probe returns invalid |
| PostgreSQL parity | Normalize database timestamps; share derived item/campaign rollups and corrected calendar projection; use repeatable-read transactions across aggregate reads; concurrent writer regression proves one snapshot |
| Publication metadata | Enforce prospective bounds using numeric dates, strict HTTPS metadata and deterministic correction chains; fresh-instance calendar reflects corrected occurrence time |
| Strict command boundary | Exhaustive command schemas; unknown/internal methods and invalid typed/nested metadata reject before mutation; normalize bounded text/time inputs |
| Migration enforcement/recovery | Row-level identity/terminal guards, nested content and event-shape validation, receipt/sequence/root/workflow checks, publication guards, transactional rerun and startup privilege checks |

Local verification of the remediation worktree:

- **475/475 full tests PASS**, no failures/skips, on Node 22.23.2 with a disposable
  PostgreSQL **17.10** instance bound to loopback on port 55439.
- **55/55 focused campaign tests PASS**, including **21/21 real PostgreSQL campaign
  cases** and all **10/10 original independent review probes**.
- Existing tests retain their assertions. Preview fixtures now provide the actual
  revision hash and explicit trusted availability. The original adapter probe's
  transport stub now supports the added read transaction; its stage assertion remains.
- Database tests cover migration rerun with evidence intact, unsafe direct grants,
  immutable-record writes, identity/format/counter/workflow mutation, consistent reads,
  corrected calendar reconstruction and media ownership/revocation.
- No repository dependency or lockfile changes. The PostgreSQL binary/runtime is a
  workspace-only test dependency outside the repository. No shared database was used.

Exact resulting head and CI are recorded in the follow-up Issue #51 checkpoint;
local PASS does not substitute for that exact-head CI or a fresh independent review.
The historical failures below apply to `891a5fa...` and are retained as review evidence,
not the current remediation results. All eight review threads remain available for
independent verification; they have not been silently dismissed.

**Current restart:** Re-fetch draft PR #55, main and Issue #51; review the remediation
commit and exact-head CI, confirm v1.1 and the reproduced regression coverage, and
perform a fresh independent review. Keep the PR unmerged; no next phase, shared
migration, activation, connector or deployment is implied.

## Historical independent review checkpoint — 2026-09-07

Reviewed implementation head: `891a5fa512888e78e2c44e219033365bafbeca66`.
Actual current base and canonical main: `3b7ded9dc16dbeec5b9a13b27b2b8bc6814db727`
(tree `dbc7d815195f4643d4a55899d34ebb9393ec5223`). The merge base equals current main.
Live reconciliation found one open PR (#55), draft/mergeable, 13 commits and 13
changed files, no submitted reviews and no review threads before this review.
This checkpoint changes documentation only; all implementation line references
below are anchored to the reviewed head.

### Verification actually performed

- Current-head [CI run 104](https://github.com/shirrie01/bizgenie-api/actions/runs/34028680340)
  passed: 437/437 automated tests, 21/21 dedicated PostgreSQL Billing tests,
  5/5 dedicated PostgreSQL campaign tests, syntax, and Docker/Google Buildpack
  Node 22 build/runtime/smoke checks. Counts were re-read from the job log.
- Local Node 22.23.2: unchanged suite 411/411 PASS; 176 tracked JavaScript files
  passed syntax checks; diff whitespace passed.
- Ten additional independent contract probes: **0 passed / 10 failed**. These
  required-behavior assertions reproduce the defects listed below. They are
  review probes, not existing CI tests and not a PostgreSQL integration run.
  The adapter-stage probe uses a stubbed transport; the timestamp probe uses
  the installed `pg` timestamptz parser without a database.
- No local PostgreSQL or Docker executable was available on PATH; real database
  and container results above are live CI evidence only.
- A pattern scan across all 13 PR commits found no private-key, GitHub-token,
  live Stripe-key, Google API-key, AWS access-key or JWT candidates. This is a
  bounded scan, not a guarantee that every possible sensitive value is absent.
- GitHub reported `main.protected=false` and no repository rulesets. The separate
  branch-protection endpoint returned 403 for this integration, so its settings
  were not independently readable. No protection or repository settings changed.
- Recent canonical history uses merge commits. No merge was attempted.

### Material findings requiring remediation and a new review

1. **Lifecycle / adapter parity:** `src/campaigns/repository.js:302-319` permits
   `save_revision` on Published and sets Draft while retaining publication evidence.
   The memory adapter commits this; PostgreSQL's pointer-shape constraint rejects
   it later. `:363` also returns revocation to Draft instead of contract section 4's
   Review. Both required-behavior probes fail. Deny terminal edits at the domain
   boundary and restore the specified revoke transition.
2. **Media ownership / attribution:** `repository.js:251-255,299-319` accepts a
   syntactically valid nonexistent asset ID into draft content. Neither repository
   resolves/locks `media_assets` or immutable generation jobs. Content completeness
   only counts primary references. This fails CS-41/42 and the rule that even draft
   assets must be active and owned; it is not merely deferred I-F transport.
3. **Preview binding:** `repository.js:335-345` checks revision/variant IDs but not
   the trusted receipt's content hash or destination/profile/format binding.
   A wrong content hash can be acknowledged and approved. The current test fixture
   itself returns a synthetic constant hash. Revision hashing at `:300` also omits
   contract-required format, destination tuple and ordered generation links.
4. **Reconstruction / projection verification:** `repository.js:177-181` and
   `postgresRepository.js:183` check counters only. Changing the current campaign
   name without changing history still returns `valid:true`; neither implements
   CS-55 field-for-field replay. Event shapes at `repository.js:258-260` also differ
   from the exhaustive contract taxonomy. Rebuild from events and immutable records
   and compare current fields, pointers, counters and lineage.
5. **PostgreSQL read consistency / stage:** `postgresRepository.js:121-144,179-182`
   returns raw projections without the memory adapter's derived status/counts and
   loads multiple relations without a consistent read transaction. The stage probe
   returns undefined instead of Approved. Mixed Approved + Published must yield
   Approved in both adapters; a consistent concurrent snapshot must be proved.
6. **Publication metadata:** `repository.js:401` compares an ISO string against a
   PostgreSQL `Date`, so publication-before-attempt is accepted after hydration.
   `:407-414` accepts a future correction and unsafe URL without equivalent checks;
   calendar reads also ignore corrections. Preserve original immutable evidence,
   validate correction metadata, and deterministically apply the latest correction.
7. **Strict command dispatch / validation:** `repository.js:211-212` dispatches any
   matching method, allowing internal `result` as a command in memory. `requireFields`
   only checks keys; `update_campaign_details` accepts an object name/invalid zone.
   Enforce the exhaustive public command set and typed, bounded normalized payloads
   before execution, with equivalent sanitized errors in both adapters.

Additional static migration concerns must be verified with disposable PostgreSQL:
the statement-level projection guard (`migration:413-434,508`) checks only the
transaction marker, not immutable OLD/NEW identities; JSONB checks validate container
types rather than the required nested contract; no complete event/receipt/projection
correspondence validator exists. Re-executing the SQL file encounters unconditional
ADD CONSTRAINT statements, so safe rerun/recovery must be defined and tested rather
than inferred from CREATE TABLE IF NOT EXISTS. The migration is additive to existing
relations, correctly ordered after `20260901170000`, and does revoke direct-role
access/enable RLS; these positives do not establish full migration acceptance.

### Authority conflict and downstream sequence

The review request requires a failed Scheduled publication to return to Approved.
The locked contract section 4 (`CAMPAIGN_SPINE_CONTRACT.md:287`) and CS-28 instead
retain Scheduled and its schedule. Founder clarification is pending. Do not silently
change either interpretation or treat this ambiguity as a passing acceptance case.

Canonical names remain I-B — Additive Persistence; I-C — Preview Registry;
I-D — Customer Brand-context Boundary; I-E — Goal Recommendation;
I-F — Customer Campaign APIs.

For founder confirmation after I-B is corrected and accepted, recommend:
**I-B → I-D → I-F → I-C → I-E → launch surfaces → field-sales pilot**.
I-D establishes customer-owned approved Brand context before customer APIs can consume
it. I-F must retain fail-closed preview dependencies until I-C exists. This is a
sequencing recommendation, not authority to begin the next phase.

Production, staging, Billing, providers, Stripe, IAM, secrets, DNS, CORS and Cloud Run
were untouched. No migration was applied to any database in this review. No generation,
deployment or social publishing occurred. Preserve Issue #39's accepted staging verdict;
W4A revision `bizgenie-api-staging-00022-rtx` and application-level HOLD are unchanged.
Legal retention/erasure, privacy/image rights, employment/commission terms, commercial
lock and all activation decisions remain separate founder/legal gates.

**Exact restart:** Resume BG-LAUNCH-002I-B remediation of PR #55. Re-fetch main, the
current PR head/CI and Issue #51; read this independent review checkpoint; resolve the
failed-publication authority conflict; correct and prove the listed contract defects
in both repository adapters and disposable PostgreSQL 17; obtain a fresh independent
review before any ready/merge decision. Do not start I-D or any later phase.

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

The historical implementation restart is superseded by the independent HOLD
checkpoint above. No staging migration or customer activation is implied by merge.
