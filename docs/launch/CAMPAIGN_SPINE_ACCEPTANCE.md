# Campaign spine acceptance and persistence handoff

**Authority:** [campaign-spine.v1](CAMPAIGN_SPINE_CONTRACT.md).
**Task:** BG-LAUNCH-002I-A; documentation-first contract lock, review pending.

## Evidence classes

I-A proves the contract is specified, internally reviewed and compatible with unchanged
repository tests. The matrix below specifies future implementation acceptance; these
campaign behaviors are **NOT IMPLEMENTED / NOT EXECUTED** by I-A. Existing generation
PASS is preserved separately in [the evidence report](CAMPAIGN_SPINE_EVIDENCE.md).
Repository tests are not campaign/calendar customer-journey proof.

I-B must exercise domain/transaction rows against a deterministic repository and a
disposable PostgreSQL 17 database. I-C supplies trusted profile/preview fixtures; I-D
supplies the customer Brand-context boundary; I-F executes the proposed HTTP/read/export
rows. Fixtures for I-B are explicitly synthetic and do not claim external-platform
accuracy. Human architecture review must approve this pack before persistence begins.

## Acceptance-test matrix

Every rejected command must assert no domain writes, events, receipts, version change,
generation/provider call or Billing effect, unless a preceding committed command is
explicitly the subject of replay. Snapshot row counts/hashes before and after rejection.

| ID | Scenario | Required result / evidence | First implementation owner |
| --- | --- | --- | --- |
| CS-01 | Create campaign with approved owned brand | One campaign, immutable snapshot, event and receipt; version/sequence 1 | I-B |
| CS-02 | Same project ID claimed under another tenant; brand under another project | Same non-enumerating denial, zero campaign rows | I-B/I-F |
| CS-03 | Create item | Item, first variant and initial revision commit together; no empty committed item | I-B |
| CS-04 | Add variants across platforms/destinations | Independent identities and workflow; duplicate destination tuple rejected even with fresh key | I-B |
| CS-05 | Tenant/project/brand/item/variant reparent or format change | Database and command denial; original authority unchanged | I-B |
| CS-06 | Empty campaign / all items archived / mixed workflow / all Published | Draft / Draft / least advanced / Published with exact counts; no writable rollup | I-B/I-F |
| CS-07 | New item in fully Published campaign | Campaign rollup becomes Draft; old variants/publications stay terminal | I-B |
| CS-08 | Full prospective manual journey | Draft → Review → Approved → Scheduled → Published, matching immutable lineage at every step | I-B/I-F |
| CS-09 | Unscheduled manual journey | Approved → pending attempt → Published without forced scheduling | I-B/I-F |
| CS-10 | Every unlisted transition and direct state setter | Deterministic INVALID_TRANSITION or strict-shape error; include Draft→Published and Published→Draft | I-B/I-F |
| CS-11 | Save in Draft/Review/Approved/Scheduled | New complete revision; old approval revoked and schedule cancelled when present; returns Draft atomically | I-B |
| CS-12 | Restore older content | New revision ID/number/parent and reason; old bytes/history unchanged | I-B |
| CS-13 | Change asset order, content, brand snapshot or destination after preview | Old preview cannot approve a different hash/revision; destination edit itself forbidden | I-B/I-C |
| CS-14 | Missing/foreign/current-mismatched preview; another owner's acknowledgement | Approval denied; only approver's exact acknowledged preview qualifies | I-B/I-C/I-F |
| CS-15 | Approve own draft as owner; attempt approval as member | Owner self-approval permitted; member receives non-enumerating denial | I-B/I-F |
| CS-16 | Request changes / revoke approval | Append decision/revocation with reason; correct Draft/Review state; scheduled approval cancels schedule | I-B |
| CS-17 | Draft incomplete text/image/video | Draft can persist incomplete; submit_review fails CONTENT_INCOMPLETE; no fake media | I-B |
| CS-18 | Schedule future instant with zone and offset | Schedule pins same revision/approval and exact UTC/local resolution | I-B |
| CS-19 | DST spring gap, autumn fold, missing offset, invalid/future publication time | Deterministic rejection; two valid fold offsets resolve to distinct exact instants | I-B/I-F |
| CS-20 | Reschedule / unschedule / change display zone | New entry plus cancellation / Approved / existing stored instant unchanged | I-B |
| CS-21 | Time reaches/passes scheduled instant | Scheduled remains; Manual action required appears on reads; no event/automatic publication | I-B/I-F |
| CS-22 | Start manual attempt | Immutable revision/approval/destination pin; at most one pending; no publisher call | I-B |
| CS-23 | Two owners start simultaneously under same version | One commits; other version conflict; cannot create parallel pending attempts | I-B |
| CS-24 | Outcome unknown after external post / app restart | Same pending attempt restored; no automatic new attempt or failure assumption | I-B/I-F |
| CS-25 | Another current owner resolves pending attempt | Allowed after current authorization; attribution records starter and resolver separately | I-B/I-F |
| CS-26 | Confirm without URL / clean permanent URL | Both valid with attestation/time; Published means customer attestation only | I-B/I-F |
| CS-27 | URL credentials, query, fragment, unsupported scheme; forged status/evidence kind | Reject strict unsafe metadata; no URL fetch and no platform verification claim | I-B/I-F |
| CS-28 | Fail/cancel requires not-published attestation | Terminal resolution, no publication, prior workflow/schedule retained | I-B |
| CS-29 | Fresh attempt after failed/cancelled resolution | New identity; historical outcome retained; old attempt can never confirm later | I-B |
| CS-30 | Confirm twice using same key, then using new key | Exact replay first; second fresh effect denied; one publication and resolution | I-B |
| CS-31 | Edit/revoke/reschedule/archive with pending attempt | MANUAL_ATTEMPT_PENDING; no loss of reconciliation anchor | I-B |
| CS-32 | Asset/profile revoked while external attempt pending | Deny new byte delivery; allow truthful confirm/fail/cancel of pinned attempt | I-B/I-F |
| CS-33 | Publication metadata correction and replay | Append reasoned full correction chain; never rewrite original or unpublish | I-B |
| CS-34 | Copy/download/export Draft/Review/Approved/Published | Read-only and clearly labelled; no automatic approval, publication or charge | I-F |
| CS-35 | Stale export link, revoked asset, cross-tenant revision | Reauthorize; no private location or foreign bytes exposed | I-F |
| CS-36 | Brand updated while campaign exists | Pinned snapshot unchanged; explicit current capture creates/deduplicates snapshot | I-B |
| CS-37 | Same Brand Brain reported version, changed data/hash | Distinct immutable snapshots; no unique-version collision or overwritten attribution | I-B |
| CS-38 | Brand archived or missing before new capture | Fail closed; prior pinned approved revision remains reconstructible | I-B/I-D |
| CS-39 | Imported historical output has no exact generation Brand version | Generation attribution remains null; campaign snapshot not misrepresented as generation evidence | I-B/I-F |
| CS-40 | Preview profile upgrade/revocation | Upgrade immutable; existing approval stays pinned; revoked profile blocks new approval/start | I-B/I-C |
| CS-41 | Owned generated media with exact immutable job tenant/project/brand | Valid lineage; source_kind, format and active status verified from server records | I-B |
| CS-42 | Forged campaign IDs in legacy generation input; foreign/null-brand job; reference-only asset | Cannot gain campaign ownership/provenance or approval | I-B/I-F |
| CS-43 | Manually pasted text with invented generation ID | No verified generation provenance; only trusted imported output may link job | I-B/I-F |
| CS-44 | Link persistence fails after successful existing generation | Owned original asset/job/ledger survive; retry linkage only, no regeneration/refund | I-B/I-F |
| CS-45 | Same key/intent from concurrent instances | One successful receipt/event interval/effect; identical status/result on replay | I-B |
| CS-46 | Same key, changed target/type/payload/actor scope | Same actor scope conflicts on changed intent; distinct authorized actor scope independent | I-B |
| CS-47 | Same textual key in Tenant A and Tenant B / generation/Billing namespace | Independent campaign identities; no receipt leakage or financial-key collision | I-B |
| CS-48 | Exact replay after later campaign edits/archive | Return original stable receipt before version/business-state checks; zero new events | I-B |
| CS-49 | Replay after membership removal | Denied, no stored result/content exposed | I-B/I-F |
| CS-50 | Same key after pre-commit validation or database failure | No prior receipt; valid identical retry can commit once | I-B |
| CS-51 | Lost commit acknowledgement | Fresh process reads original receipt and result; no duplicated revision/publication | I-B |
| CS-52 | Different-key edits to different variants with same campaign version | Exactly one winner; loser explicit version conflict, no silent rebase | I-B |
| CS-53 | Inject failure after each domain insert/event/pointer/receipt write | Complete rollback; no sequence/version holes in committed stream | I-B |
| CS-54 | Same-timestamp events; clock regression; publication occurrence out of order | Order solely by campaign sequence; supplied occurrence time never reorders history | I-B |
| CS-55 | Rebuild aggregate solely from events and referenced immutable records | Field-for-field equality with current projection and counters | I-B |
| CS-56 | Ordinary UPDATE/DELETE/TRUNCATE of all immutable tables | Database denial; no cascade from membership/customer deletion | I-B |
| CS-57 | Direct anon/authenticated/service_role/PUBLIC access including functions/views | No table/sequence/function authority; RLS enabled; initialization fails if grants unsafe | I-B |
| CS-58 | Customer body role/user_id/service scope injection | Reject untrusted authority; existing owner/member policy governs | I-B/I-F |
| CS-59 | Global generation worker with valid/invalid/insufficient generation scope | Existing service behavior preserved; none grants campaign authority | I-B/I-F |
| CS-60 | Admin key at customer campaign boundary | No customer principal; missing/invalid bearer gives 401 | I-F |
| CS-61 | Concurrent owner→member or membership deletion against a command | Linearizable lock boundary; no write under already-revoked authority | I-B |
| CS-62 | Foreign parent and foreign referenced object in replay/validation errors | Uniform 404, empty details, no hashes/counts/current versions disclosed | I-B/I-F |
| CS-63 | Auth/database outage | Sanitized unavailability, zero optimistic client success/provider effects | I-B/I-F |
| CS-64 | Archive with active schedule; archive/restore without pending work | Unschedule required; append archive/restore, keep all history/identities/receipts | I-B |
| CS-65 | View archived/history; attempt write; restore revoked assets | Authorized history survives; write denied until restore; no resurrected asset rights | I-B/I-F |
| CS-66 | Reload on a new authenticated session/device | Resume current committed revision, pending attempt, schedule and exact next action | I-F |
| CS-67 | Home/campaign/calendar under concurrent write | Each view consistent; no revision/approval mixing; one calendar row per published variant | I-B/I-F |
| CS-68 | Next-action precedence/ties/member read-only case | One deterministic action plus why; pending attempt resolution comes first | I-B/I-F |
| CS-69 | Alter cursor principal/tenant/project/filter/sort or expire cursor | Reject CURSOR_INVALID or authorization denial without enumeration | I-F |
| CS-70 | Unknown nested field, duplicate JSON key, invalid Unicode, oversize payload, integer overflow | Stable bounded error shape; no attacker values in details | I-B/I-F |
| CS-71 | Customer DTO scan including history/exports/errors | No providers/models/prompts/raw snapshots/storage keys/auth UUIDs/internal finance | I-F |
| CS-72 | Full existing generation/Auth/Billing/Brand Brain/storage/Mission Control suite | Existing test files unchanged and passing; no behavior regression | I-A and every later task |
| CS-73 | Real PostgreSQL migration chain on empty and already-canonical disposable fixture | Additive only; safe rerun/startup; existing data/contracts unchanged | I-B |
| CS-74 | Genuine end-to-end campaign/calendar journey | Separate later evidence pack with implemented I-B/C/D/F; never inferred from I-A or Issue #39 | W4B |

## Migration-readiness checklist

This is an implementation checklist, not authority to apply a migration anywhere.

- [ ] I-A architecture review and human acceptance recorded; PR CI passes on exact head;
  merge is separately authorized. Re-read live main/PRs/Issue #51 before branching I-B.
- [ ] Create only a new timestamped additive migration after the actual latest migration
  (currently `20260901170000_create_paid_beta_interest_capture.sql`); never edit history.
- [ ] Inventory canonical keys: projects `(project_id,tenant_id)`, Brand Brain
  `(project_id,brand_id)`, jobs `(job_id,tenant_id,project_id)`, media `asset_id`.
  Required brand snapshots must not be confused with versioned source rows that do not exist.
- [ ] Use empty new campaign tables; no inferred owners, old campaigns, approvals,
  publication evidence or Brand-version backfill. Any orphan legacy references are
  reported, not assigned invented authority.
- [ ] Name and test all same-owner FKs, uniques, bounds, enum checks, immutable guards,
  current-pointer checks, receipt/event correspondence and version/sequence enforcement.
- [ ] Avoid modifying existing tables where new-domain triggers can validate existing
  parent authority. Reuse existing composite keys. Any necessary additional index on an
  existing table must be justified as additive and checked for impact before review.
- [ ] New relations, sequences, functions and views enable RLS/revoke public/customer/
  service-role access; no SECURITY DEFINER shortcut; startup verifies effective grants.
- [ ] Separate protected immutable records from mutable current projections. Mutation
  paths enforce the contract's exact command/lock order and atomic transaction boundary.
- [ ] Implement serialization tests with two tenants, two same-tenant owners, a member,
  a global worker, revoked membership and private/revoked media. Use synthetic fixtures only.
- [ ] Inject failures at every pre-commit boundary and lost-ack after commit; fresh
  repository instances prove replay/reconstruction without process-memory authority.
- [ ] Add justified indexes: tenant/project campaign updated ordering; item/variant parent
  lookup; pending manual attempts; current schedule time; publication time; campaign
  sequence; revision number; all unique receipt and business-effect identities.
- [ ] Prove no new migration changes ledger/job/media behavior, grants or existing test
  assertions. Run canonical chain and all tests against disposable PostgreSQL 17.
- [ ] Record rollback as disabling future composition/reverting code while retaining
  durable evidence; use reviewed forward-fix after data exists, never drop tables to reset.
- [ ] Preserve unresolved external activation gates: legal retention, actual preview
  profiles/rendering, customer boundaries/export, staging rollout and complete W4B proof.

## Exact handoff to BG-LAUNCH-002I-B

**Start only after I-A is accepted and separately merged:** read this pack, current
Issue #51 and Issue #39 closure, verify fresh main/tree/open PRs/overlapping branches,
then create one bounded I-B branch. Implement additive persistence and repository/domain
tests, with no customer route, provider, Billing, connector or deployment changes.

Create the following conceptual relations using the exact section 3 fields and same-owner
rules (physical private/public schema choice must retain the stated privilege boundary):

| New relation | Contract responsibility |
| --- | --- |
| `campaigns` | Root current projection and aggregate counters |
| `campaign_content_items` | Item identity/name/format/archive projection |
| `campaign_platform_variants` | Destination identity and current workflow pointers |
| `campaign_revisions` | Full immutable revision content and provenance |
| `campaign_brand_snapshots` | Immutable approved source snapshot + source version/hash |
| `campaign_preview_evidence` | Immutable acknowledged revision/profile/render binding; I-C fixtures until registry exists |
| `campaign_approval_events` | Append-only approve/request-changes/revoke decisions |
| `campaign_schedule_entries` | Immutable schedule details; cancellation/consumption in events/projections |
| `campaign_manual_attempts` | Immutable attempted publication intent |
| `campaign_attempt_resolutions` | Unique terminal resolution per attempt |
| `campaign_publications` | Unique confirmed attestation per variant/attempt |
| `campaign_publication_corrections` | Immutable metadata correction chain |
| `campaign_events` | Typed ordered campaign audit stream |
| `campaign_command_receipts` | Immutable successful command result and intent identity |

Nested content, lineage and typed payloads may be strict JSONB with required database
validation; identity/ownership/pointer/uniqueness/time fields must be explicit columns.
No standalone mutable destination registry is required: resolve/deduplicate destination
keys within the campaign under its aggregate lock. No Brand snapshot history rewrite,
shadow generation-output store or generic event bus is authorized.

Provide a repository seam accepting a verified internal authorization context and a
strict command, exposing `executeCommand`, `getCampaign`, `listCampaigns`,
`listCalendarEntries`, `listCampaignEvents`, and read-only `verifyCampaignProjection`.
The seam must revalidate/lock live membership in the same write transaction; a forged
object alone is not proof. An in-memory adapter is only a deterministic test double.
PostgreSQL remains runtime authority. No production wiring is required in I-B.

I-B may model trusted preview/profile fixtures and immutable references, but MUST NOT
declare platform rules/rendering implemented. I-C implements those next. I-D implements
customer Brand-context management; I-E goal recommendations; I-F customer campaign,
resume/calendar and export boundaries. These stages consume this model without
redefining lifecycle, ownership, approval or idempotency. Import evidence transport is
an I-F dependency; missing evidence must stay missing rather than modifying generation.

I-B evidence must return exact migration file, relations/constraints/indexes/grants,
tests and fault-injection outcomes, unchanged-foundation diff, commit/head CI, unresolved
dependencies and exact next stage. Database application, staging, production and paid
generation require separate authority and are not implied by this handoff.

## Decisions remaining outside the contract lock

No unresolved ownership, lifecycle, revision, approval, attempt, event, idempotency,
concurrency or transaction-model choice is delegated to I-B. Physical schema/function
names and tested enforcement mechanisms are implementation choices within this pack.
Review may request explicit amendments before acceptance.

Remaining separate gates: approved platform-profile contents and renderer versions
(I-C); customer Brand boundary (I-D); recommendation implementation (I-E); customer
HTTP/export/import transport and response-size shaping (I-F); human legal retention/
erasure policy; campaign/calendar W4B proof; all commercial and environment activation
decisions. Direct visual inspection of the concept required a fresh sign-in; accepted
behavior was consumed from the authoritative Issue #51 checkpoint. These limitations
must not be presented as existing customer capability.
