# Durable manual-publication campaign spine contract

**Contract:** `campaign-spine.v1` — BG-LAUNCH-002I-A.
**Status:** locked implementation proposal; architecture/human acceptance and merge pending.
**Scope:** documentation only. No campaign persistence, customer API, preview registry,
publisher, deployment or end-to-end campaign proof is implemented by this pack.

## 1. Authority and pack index

Programme authority is [Issue #51](https://github.com/shirrie01/bizgenie-api/issues/51),
especially checkpoints [5508119002](https://github.com/shirrie01/bizgenie-api/issues/51#issuecomment-5508119002)
and [5508588187](https://github.com/shirrie01/bizgenie-api/issues/51#issuecomment-5508588187).
The [Issue #39 closure](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5497361809)
accepts the [staging evidence pack](../activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md).
It preserves the verified generation foundation and does not prove campaigns or calendars.
Current GitHub authority supersedes historical status/positioning statements in older
documents, including the [product canon](../product/BizGenie_Canon_v2.md); this pack
does not reopen or edit product strategy.

This document is normative. MUST, MUST NOT and REQUIRED specify acceptance conditions.
The other parts of this one canonical pack are:

- [Acceptance matrix and additive-persistence handoff](CAMPAIGN_SPINE_ACCEPTANCE.md).
- [Baseline, compatibility and verification evidence](CAMPAIGN_SPINE_EVIDENCE.md).
- [Mission Control status and restart point](../mission-control/README.md).

Campaign remains the dominant product object: **One campaign. One obvious next
action. No visible machinery.** Entry is goal-first, Home is resume-first, and the
Content Calendar is launch-critical. The customer lifecycle is Draft → Review →
Approved → Scheduled → Published; exception labels are Blocked, Failed and Manual
action required. Format uses icons/labels; workflow progression uses colour. Manual
copy/download/export and manual publishing remain permanent first-class paths.
Preview is central to approval. Recommendations carry a customer-readable reason.
Provider routing, prompts, models and proprietary mechanisms remain internal.

## 2. Domain and identity

The authority chain is the existing verified customer → membership → tenant → project
→ Brand Brain, followed by campaign → content item → platform variant → revision.
There is no second tenant, project, brand, identity, asset or credit-account model.

| Entity | Identity, owner and responsibility |
| --- | --- |
| Campaign | Server-generated UUID `campaign_id`; immutable `tenant_id`, `project_id`, required `brand_id`; one goal and one original Brand Brain snapshot |
| Content item | UUID `content_item_id`; exactly one campaign; a named piece of work in one immutable `format` |
| Platform variant | UUID `variant_id`; exactly one item; immutable platform, placement and manual destination; independently reviewed/scheduled/published |
| Revision | UUID `revision_id`; append-only, complete content snapshot for exactly one variant; strictly increasing `revision_number` |
| Brand snapshot | UUID `brand_snapshot_id`; immutable copy of the approved canonical Brand Brain observed at capture, including its reported version |
| Preview evidence | UUID `preview_id`; immutable record binding one revision to a pinned preview profile and renderer version |
| Approval event | UUID `approval_id`; a human decision on exactly one revision and preview; never a flag on a generated asset |
| Schedule entry | UUID `schedule_id`; append-only instruction for manual action at an explicit instant; no dispatch promise |
| Manual attempt | UUID `attempt_id`; immutable declaration of intent to publish one approved revision to its fixed destination |
| Attempt resolution | UUID `resolution_id`; exactly one terminal resolution per attempt: confirmed, failed or cancelled |
| Publication | UUID `publication_id`; exactly one confirmed manual publication per variant; customer attestation, never inferred delivery |
| Publication correction | UUID `correction_id`; append-only replacement of descriptive publication metadata with reason; original confirmation retained |
| Command receipt | UUID `command_id`; durable, immutable successful command outcome and replay identity |
| Campaign event | UUID `event_id`; append-only audit envelope and bounded typed payload in a campaign stream |

Campaign is the transaction aggregate. Every descendant stores or derives the exact
`tenant_id/project_id/brand_id/campaign_id` tuple from its parent. Client IDs select
resources; they never establish ownership. Moving or reparenting any object is forbidden.
Creating an item atomically creates its first variant and initial revision; a committed
item always has at least one variant. A variant always has a current revision.
The maximum is 500 items per campaign and 20 variants per item (including archived
items); exceeding either limit is `CAMPAIGN_LIMIT_REACHED`.

One item may have several variants for a platform, but the tuple
`(content_item_id, platform, placement, destination_key)` is unique for its lifetime.
`destination_key` is a server-generated UUID representing a manual destination in this
campaign, not an OAuth account, external account identifier or posting credential.
Its immutable `destination_label` is supplied by the customer and describes where
they intend to publish. A new destination or format requires a new variant/item.
Multiple posts to the same destination require separate content items.

## 3. Field-level conventions

All command objects are strict: reject unknown properties recursively. Fields below
are required unless marked nullable or optional. A nullable persisted field is present
as JSON null; optional command fields default only as explicitly stated. Reject NaN,
infinity, duplicate JSON object keys, invalid Unicode and numeric/string coercion.
Metadata text is trimmed, Unicode NFC, with CRLF converted to LF; content text preserves
leading/trailing whitespace but uses NFC and LF. Empty optional content becomes null.
Bounds count Unicode code points. Total decoded JSON command size is at most 256 KiB.
No HTML is trusted or executed. JSON examples are synthetic, not live records.

| Primitive | Exact definition |
| --- | --- |
| `Id` | Existing identifier grammar: 1–128 characters, `^[A-Za-z0-9][A-Za-z0-9._:-]*$`; IDs remain case-sensitive |
| `Uuid` | Lowercase canonical UUID string; new domain identities generated server-side; customer/Auth UUID remains the verified canonical value |
| `Count` | Integer 1–2147483647; no wraparound; overflow fails closed |
| `Time` | RFC3339 timestamp with explicit offset, normalized to UTC millisecond `...Z`; PostgreSQL `timestamptz`; reject invalid calendar dates |
| `Hash` | Lowercase 64-character SHA-256 hex; generated server-side over canonical JSON or exact bytes as stated |
| `Name` | Normalized nonempty metadata text, at most 200 characters |
| `Reason` | Normalized nonempty metadata text, at most 1000 characters; no secrets/raw provider errors |
| `Zone` | Valid IANA timezone identifier; preserve name and resolved UTC instant, never infer from browser/server location |
| `Platform` | `linkedin`, `instagram`, `facebook`, `tiktok`, `youtube`, `email`, `other`; identifies manual destination only, not implemented integration support |
| `Format` | `text`, `image`, `video`; separate from both campaign workflow and generation execution class |
| `Workflow` | `draft`, `review`, `approved`, `scheduled`, `published`; labels use title case |

Canonical JSON (`CJ1`) recursively sorts object keys by Unicode code-point order,
preserves array order, uses JSON string escaping without ASCII-only escaping, emits
safe integers in decimal without leading zeros, and has no insignificant whitespace.
Hash input is UTF-8, no BOM. Optional defaults/nulls are materialized before hashing.
CJ1 forbids floating point numbers in command intent except strings already normalized
as timestamps; media duration in content manifests is integer milliseconds. It is a
versioned local contract, not a claim of general RFC canonicalization compatibility.

### 3.1 Campaign and content projections

These are mutable current projections maintained only by accepted transactions; the
events and referenced records are immutable. Each new campaign starts `version=1`.
`version` advances once per successful mutating command, not once per emitted event.

| Record | Fields and rules |
| --- | --- |
| Campaign | `campaign_id:Uuid`, ownership tuple of `Id`s, `name:Name`, `goal:string(1..2000)`, `initial_brand_snapshot_id:Uuid`, `display_timezone:Zone`, `version:Count`, `last_event_sequence:Count`, `archived_at:Time|null`, `created_at:Time`, `updated_at:Time`, `created_by:CustomerActor` |
| Content item | `content_item_id:Uuid`, parent/ownership tuple, `name:Name`, `format:Format`, `archived_at:Time|null`, `created_at:Time`, `updated_at:Time`, `created_by:CustomerActor` |
| Variant | `variant_id:Uuid`, item/parent/ownership tuple, `platform:Platform`, `placement:Id`, `destination_key:Uuid`, `destination_label:Name`, `workflow:Workflow`, `current_revision_id:Uuid`, `active_approval_id:Uuid|null`, `active_schedule_id:Uuid|null`, `pending_attempt_id:Uuid|null`, `publication_id:Uuid|null`, `created_at:Time`, `updated_at:Time` |

Campaign goal and original snapshot are immutable in v1: a new goal creates a new
campaign. `update_campaign_details` changes only name/display timezone; item name
changes only through `rename_content_item`. These display edits do not alter approval.
Campaign/item/variant `updated_at` changes only when that projection is touched;
campaign `updated_at` changes for every accepted mutating command in its aggregate.

Campaign/item `status` is a **derived** workflow rollup, never directly writable:
take the least advanced workflow in `draft < review < approved < scheduled < published`
among included variants. Item uses all its variants; campaign excludes archived items.
An empty campaign, or one with only archived items, is Draft. Published means all
included variants are Published and the set is nonempty. Return counts for all five
states plus included/archived item counts so mixed progress is visible. Adding an item
to a Published campaign returns its rollup to Draft without reopening any publication.
Archive is an independent flag, not a sixth lifecycle state. Archived items still
have reconstructible rollups in history.

### 3.2 Revision and content snapshot

| Field | Rule |
| --- | --- |
| `revision_id`, full variant/parent ownership | UUID and exact parent tuple; immutable |
| `revision_number` | Starts at 1 per variant, then previous maximum +1 in aggregate lock |
| `parent_revision_id` | Null only for revision 1; otherwise previous current revision of this same variant |
| `content` | Strict object: `title:string(1..200)|null`, `body:string(1..32000)|null`, `caption:string(1..8000)|null`, `alt_text:string(1..2000)|null`, `asset_refs:array(0..10)` |
| `asset_refs[]` | Ordered, unique `asset_id:Uuid` plus `role` of `primary` or `supporting`; see asset rules below; no locations or bytes |
| `brand_snapshot_id` | Required UUID of approved snapshot for this campaign's exact brand/project/tenant |
| `source` | `manual` or `generated_import`; never inferred from a content-shaped string |
| `generation_links` | Array 0..10 of internal records in section 8; absent provenance stays unverified |
| `content_hash` | SHA-256 of CJ1 of the complete `content`, snapshot ID, format, destination tuple and ordered generation links |
| `change_reason` | `Reason`; initial revision uses fixed `Initial draft` if omitted |
| `created_at`, `created_by` | Server time and verified customer actor |

Text requires body or caption and zero primary media. Image requires exactly one
primary image; video exactly one primary video; supporting media must be images.
Drafts may have missing required text/media (including an empty initial content object
with all nullable fields null and `asset_refs=[]`); `submit_review` validates completeness.
Never accept an unavailable or foreign asset even in a draft. Media count/format and
platform limits are checked at review, preview, approval and attempt start.
Every save appends a complete revision; no in-place content edits or patch chains.
A restore copies an old revision's content into a new revision with its own parent,
timestamp, reason and explicit snapshot choice. A new revision revokes live approval,
cancels its schedule, invalidates current preview selection and returns to Draft in
one transaction. Old records remain unchanged. No implicit regeneration occurs.

### 3.3 Attribution and preview records

| Record | Fields and invariants |
| --- | --- |
| Brand snapshot | `brand_snapshot_id:Uuid`, tenant/project/brand IDs, `source_version:integer(1..1000000)`, `source_updated_at:Time`, `source_schema_version:"brand-brain.v1"`, `snapshot:BrandBrainSchema`, `snapshot_hash:Hash`, `captured_at:Time`; unique `(tenant_id,project_id,brand_id,source_version,snapshot_hash)` |
| Preview profile reference | `profile_id:Id`, `profile_version:Count`, `profile_hash:Hash`, `platform:Platform`, `placement:Id`, `format:Format`; all immutable; tuple identifies an I-C registry version |
| Preview evidence | `preview_id:Uuid`, complete revision/parent ownership, `revision_content_hash:Hash`, `profile_ref`, `renderer_version:Id`, `render_input_hash:Hash`, `preview_digest:Hash`, `rendered_at:Time`, `observed_at:Time`, `observed_by:CustomerActor` |

Brand snapshot is captured from a locked server-read canonical approved Brand Brain,
validated through the existing schema. The client never submits snapshot JSON as
authority. `snapshot_hash` covers the entire normalized BrandBrainSchema record.
The legacy current row permits content edits without incrementing `version`, so
`source_version` alone is not unique and MUST NOT be a revision FK. Capture differing
hashes as distinct snapshots even when the source version is unchanged. Historical
snapshots survive current-row edits and archival. No historical version backfill may
be fabricated. Campaign creation requires an approved current Brand Brain; subsequent
revisions may retain a pinned approved snapshot or explicitly capture the current
approved one. A current-brand archive denies new captures/campaigns; it does not
silently rewrite or invalidate previously pinned approved content.

Brand attribution means **context selected for this campaign revision**. Existing jobs
do not preserve the exact Brand Brain version used by generation. Never label an
imported historical output as generated using this snapshot without contemporaneous
trusted evidence. Section 8 distinguishes these two claims.

I-C owns registry contents and rendering, after I-B. I-B stores strict references and
immutable evidence, not invented platform limits or a fake production registry. Review
may be entered before a profile exists, but approval MUST fail closed until a trusted
profile version and preview evidence are available. Preview input is the exact revision
content/hash, ordered immutable media identities, profile reference and renderer version.
The digest hashes the deterministic rendered preview representation, excluding ephemeral
access URLs. An authenticated explicit acknowledgement records that the human viewed
that exact preview; it is not evidence of a real external-platform render.
All timestamps/hashes are server-attested; clients supply only an opaque trusted preview
reference and acknowledgement. A profile upgrade creates a new version, never mutates
history. It does not silently invalidate approvals. A separately recorded server-side
profile revocation blocks new approval/attempt start for that version; already pending
attempts can still be resolved truthfully. No automatic profile replacement is allowed.

### 3.4 Approval and schedule

| Record | Fields and rules |
| --- | --- |
| Approval | `approval_id:Uuid`, complete revision/parent ownership, `decision` = `approved`, `changes_requested`, or `revoked`; `preview_id:Uuid|null`, `supersedes_approval_id:Uuid|null`, `reason:Reason|null`, `created_at:Time`, `created_by:CustomerActor` |
| Schedule | `schedule_id:Uuid`, complete revision/parent ownership, `approval_id:Uuid`, `scheduled_for:Time`, `timezone:Zone`, `local_datetime:string`, `utc_offset_minutes:integer(-840..840)`, `created_at:Time`, `created_by:CustomerActor` |

An approved decision requires a preview acknowledged by that same approver, exact
current revision/hash, and active matching profile. Self-approval is allowed for owners;
there is no two-person rule. Changes requested require a reason and return to Draft.
Revocation references the currently active approved decision and requires a reason.
Approved decisions have non-null preview_id, null supersedes_approval_id and null reason.
Changes-requested decisions have null preview_id/supersedes_approval_id and a required
reason. Revoked decisions have null preview_id, the revoked approval as
supersedes_approval_id and a required reason; generated revocations use fixed reason
`Revision changed`. Schedule cancellation caused by a revision uses that same reason;
reschedule/unschedule use null reason unless explicitly supplied by a command that
permits it. Internal composite effects cannot invent an extra public payload field.
At most one live approval per variant; append revocation rather than updating its row.
The invariant is enforced through the variant projection plus event/referential checks.
Approval does not authorize a different revision, platform, placement or destination.

Scheduling requires the live approved revision and a future instant at transaction
time. `local_datetime` is `YYYY-MM-DDTHH:mm:ss.SSS`, together with zone and explicit
offset; it MUST resolve exactly to `scheduled_for`. Reject nonexistent DST local times
and ambiguous times without a matching explicit offset. Reads use the stored instant
and zone; a campaign display-zone change never moves an existing schedule. Rescheduling
appends a new schedule and a cancellation event for the previous one. Unscheduling
appends cancellation and returns to Approved. Reaching/passing the time never publishes
or changes workflow automatically: it produces Manual action required on reads.
There is no recurrence, dispatch queue, auto-publish or connector promise in v1.

### 3.5 Manual publication records

| Record | Fields and rules |
| --- | --- |
| Attempt | `attempt_id:Uuid`, variant/parent ownership, `revision_id:Uuid`, `approval_id:Uuid`, `schedule_id:Uuid|null`, `method:"manual"`, `started_at:Time`, `started_by:CustomerActor` |
| Resolution | `resolution_id:Uuid`, attempt/variant/parent ownership, `outcome` = `confirmed`, `failed`, or `cancelled`; `reason:Reason|null`, `not_published_attestation:boolean`, `resolved_at:Time`, `resolved_by:CustomerActor` |
| Publication | `publication_id:Uuid`, resolution/attempt/variant/parent ownership, original revision/approval IDs, `method:"manual"`, `evidence_kind:"customer_attestation"`, `published_at:Time`, `recorded_at:Time`, `recorded_by:CustomerActor`, `publication_url:string|null`, `external_reference:Id|null`, `note:Reason|null`, `attested_published:true` |
| Correction | `correction_id:Uuid`, publication/variant/parent ownership, `supersedes_correction_id:Uuid|null`, full replacement of `published_at/publication_url/external_reference/note`, `reason:Reason`, `created_at:Time`, `created_by:CustomerActor` |

`published_at` is customer-reported actual time, required to be no earlier than attempt
start and no later than server `recorded_at`. Future/backdated-before-attempt reporting
is rejected; v1 is a prospective workflow, not an import of old publications. Resolution
confirmed requires `not_published_attestation=false` and atomically creates publication.
Failed/cancelled require `not_published_attestation=true`, a reason and no publication.
Unknown whether posting succeeded is **pending**, not failed and not permission to retry.
The UI directs the human to inspect the external destination before resolving it.
Any currently authorized owner can resume/resolve another owner's pending attempt.

URL is optional HTTPS, max 2048 characters, no credentials, query or fragment; store a
clean permanent link, not a signed/private access token. It is untrusted descriptive
text: never fetched automatically, never establishes tenant/platform/delivery authority.
External reference/note are optional; manual publication without a permalink is valid.
The only evidence claim is the human attestation, not independently verified delivery.
Corrections append full metadata with a reason and chain to the previous correction;
they cannot change publication identity, destination, content, approval, method or
evidence kind, delete the original, or undo Published. Mistaken confirmation is recorded
in a correction note, not silently erased. Retraction/unpublish is a later contract.

## 4. Transition matrix and exception semantics

All commands below require current aggregate version, authorized customer, unarchived
campaign/item and same-owner references, except reads, replay and restore/archive rules
explicitly noted. `pending_attempt_id` blocks revision, approval, schedule and archive
changes until resolved. Published is terminal for that variant's content and lifecycle.
Every pair not listed is forbidden with `INVALID_TRANSITION`; direct state setters do
not exist. Selecting an unknown/inaccessible resource yields the non-enumerating denial
before any lifecycle detail is disclosed.

| Command | From | To | Additional guard / atomic effects |
| --- | --- | --- | --- |
| `create_content_item`, `add_variant` | Absent | Draft | First revision plus parent identities; no implicit generation |
| `save_revision` | Draft, Review, Approved, Scheduled | Draft | Append full snapshot; revoke live approval and cancel schedule; no pending attempt |
| `submit_review` | Draft | Review | Complete format/content, active owned assets, valid pinned Brand snapshot |
| `acknowledge_preview` | Review | Review | Trusted renderer evidence matches exact current revision; records viewer |
| `request_changes` | Review | Draft | Append changes-requested decision with reason |
| `approve` | Review | Approved | Explicit human approval bound to own acknowledged preview |
| `revoke_approval` | Approved, Scheduled | Review | Reason; append revocation, cancel schedule, clear live approval |
| `schedule` | Approved | Scheduled | Live approval; future explicit instant |
| `reschedule` | Scheduled | Scheduled | Cancel old schedule, append replacement; same live approval |
| `unschedule` | Scheduled | Approved | Append cancellation; preserve approval |
| `begin_manual_publication` | Approved, Scheduled | Same | One pending attempt; exact live approval/revision; validate availability; scheduled date may be early or overdue |
| `confirm_manual_publication` | Approved, Scheduled | Published | Pending attempt; attest published; append resolution/publication; clear pending attempt and active schedule |
| `fail_manual_publication` | Approved, Scheduled | Same | Pending attempt; attest nothing published; append failed resolution; schedule retained |
| `cancel_manual_publication` | Approved, Scheduled | Same | Pending attempt; attest nothing published; append cancelled resolution; schedule retained |
| `correct_publication` | Published | Published | Append descriptive correction, preserve original confirmation |

The Approved → Published shortcut is deliberate: unscheduled manual publishing is a
first-class path. Scheduled is a planning milestone, not mandatory friction. Copy,
download and export never approve, schedule, confirm or change workflow. They require
current read authorization and active assets; non-approved revisions carry Draft/Review
labels, and only an approved exact revision may be offered as publication-ready.

`exception` is a computed overlay, nullable, not a replacement lifecycle field. It
contains `code`, `label`, `reason_code`, `next_action`, `why`, and `evaluated_at:Time`.
Select at most one by precedence below; expose all reasons in bounded detail if needed.

1. `blocked` / Blocked: an existing linked media asset is revoked/deleted/unavailable,
   or a required preview profile for approval/start is absent/revoked, or pinned data
   cannot be resolved. Fixed reason codes: `asset_unavailable`, `preview_unavailable`,
   `attribution_unavailable`. Data-store outage returns 503, never a false workflow fact.
2. `failed` / Failed: latest terminal manual attempt is failed for the current revision
   and no later attempt is pending/confirmed. Reason `manual_attempt_failed`.
3. `manual_action_required` / Manual action required: attempt pending (reason
   `publication_unconfirmed`), or scheduled instant has arrived (reason `schedule_due`).

A pending attempt takes precedence over live availability checks: truthful resolution
must remain available even if an asset/profile is subsequently revoked. Hence while
pending, emit only `publication_unconfirmed`; do not enable a new attempt or export of
revoked bytes. For Published, no publication exception reopens state; revoked media
may be displayed as an availability warning beside preserved history. Failed resolves
by beginning a fresh attempt, cancelling/unscheduling where appropriate, or saving a
new revision; pure reads do not mutate records. Availability/due overlays are read-time
observations, not immutable claims that an external action happened. Persisted attempt
failures and all actual lifecycle changes are in the event stream.

## 5. Append-only events, ordering and transactions

### 5.1 Envelope

Every event has exactly:

`event_id:Uuid`, `contract_version:"campaign-spine.v1"`, `event_type:Id`,
`payload_version:1`, full campaign ownership, `sequence:Count`,
`campaign_version:Count`, `command_id:Uuid`, `command_event_index:Count`,
`request_id:Uuid`, `actor:CustomerActor`, `authorization_context`,
`recorded_at:Time`, and `payload` from the taxonomy below.

CustomerActor reuses `{kind:"customer",auth_user_id:Uuid}`. Authorization context is
server-only `{policy_version:"campaign-owner.v1",membership_role:"owner",action:Id,
tenant_id:Id,project_id:Id,brand_id:Id}`; action is `project:write` for every mutation.
Never persist credentials, raw JWTs, client headers, compiled prompts or provider data.
Actor identity is durable audit attribution, not a reusable authorization grant.
Future service/admin event types require an explicit new bounded contract; v1 has none.

`sequence` starts at 1, increases without committed gaps per campaign, and is allocated
under its row lock. Event IDs and timestamps are never used for ordering. There is no
cross-campaign total order. `recorded_at` is database transaction time shared by a
command's events; equal or clock-regressed timestamps do not affect sequence ordering.
`published_at` is external occurrence metadata, not stream order. Multi-event commands
use contiguous sequences and `command_event_index` 1..N.

### 5.2 Exhaustive v1 taxonomy

Payloads are strict and carry the following fields only, including referenced records
from section 3 in the same transaction. A payload `record` is the full immutable record;
events do not duplicate binary media. Current projections are reconstructed from these
events plus immutable records. IDs in payloads must resolve within the envelope owner.

| Event type | Payload and meaning |
| --- | --- |
| `campaign.created` | `campaign` initial projection excluding derived version/sequence; `brand_snapshot_id` |
| `campaign.details_updated` | `name`, `display_timezone` full new display values |
| `campaign.archived`, `campaign.restored` | `reason:Reason`; archive flag set/cleared at event time |
| `content_item.created` | `content_item` initial identity/display/format record |
| `content_item.renamed` | `content_item_id`, `name` |
| `content_item.archived`, `content_item.restored` | `content_item_id`, `reason:Reason` |
| `variant.created` | `variant` immutable identity/destination fields |
| `revision.created` | `record:Revision`; sets current revision, Draft |
| `review.submitted` | `variant_id`, `revision_id` |
| `preview.acknowledged` | `record:PreviewEvidence` |
| `approval.approved`, `approval.changes_requested`, `approval.revoked` | `record:Approval`; exact matching decision |
| `schedule.created` | `record:Schedule`; installs active schedule, Scheduled |
| `schedule.cancelled` | `variant_id`, `schedule_id`, `reason_code` = `unscheduled`, `rescheduled`, `revision_changed`, `approval_revoked`; `reason:Reason|null` |
| `publication.attempt_started` | `record:Attempt`; sets pending pointer |
| `publication.attempt_failed`, `publication.attempt_cancelled` | `record:Resolution`; clears pending pointer |
| `publication.confirmed` | `resolution:Resolution`, `publication:Publication`; sets Published, clears pending/schedule; schedule history remains |
| `publication.corrected` | `record:Correction` |

Brand snapshots are inserted/deduplicated with their referencing revision/campaign.
They have no autonomous campaign event (a snapshot can be shared within one owner).
No format-specific generation event becomes campaign approval/publication evidence.
No generic JSON event, arbitrary status override, automatic repair event or provider
callback is accepted.

Event order inside composite commands is fixed: creation is campaign, item, variant,
revision when those records are created together; revision save is schedule cancellation,
approval revocation, revision creation (omit absent effects); approval revocation is
schedule cancellation then revocation; reschedule is cancellation then creation.
All other commands emit the one corresponding event, except first item creation emits
item, variant, revision. Each command advances campaign version once.

### 5.3 Transaction algorithm and failure atomicity

1. Authenticate; normalize/validate command shape and requested resource selectors.
2. Begin transaction; authorize against current profile/membership/project/brand. Lock
   profile, membership, project and brand as required in a consistent order, holding
   a membership `FOR SHARE` lock that conflicts with deletion/role change. Revalidate
   after waiting. A concurrent revocation is linearized before or after this command,
   not treated as a stale cached grant.
3. Claim the idempotency identity with a transaction-scoped lock or unique insert;
   authorize any discovered receipt target before returning it. Resolve exact replay
   before applying optimistic concurrency or time-sensitive business validation.
4. Lock the campaign row `FOR UPDATE` (creation inserts a new row). Check expected
   aggregate version, archive flags, parent links, workflow and pending-attempt guards.
5. Hold `FOR SHARE` locks on referenced mutable asset/current brand rows; validate
   ownership, status and immutable snapshots. No network/storage/provider call occurs
   in this transaction. Trusted preview evidence must already exist before the command.
6. Insert immutable domain records; append events; update projections, version and
   sequence; insert the successful receipt. Enforce deferred same-owner and pointer
   consistency constraints before commit. Commit once; then return the saved outcome.

Lock order for v1 is profile UUID → membership `(tenant,auth UUID)` → project ID →
brand ID → command-identity lock → campaign ID → referenced media IDs sorted by UUID.
All writers of this new domain follow that order. Snapshot capture occurs under the
brand lock acquired before the campaign. Only one campaign per transaction; no bulk
multi-campaign commands. SQL deadlocks/serialization failures roll back and return
retryable unavailability; no blind optimistic-version rewrite. I-B must prove this
against concurrent real PostgreSQL sessions, including membership revocation.

Any failure before commit leaves no receipt, revision, approval, event, pointer/version
change or publication. Post-commit lost acknowledgement is recovered from the receipt.
Post-commit response failure must not undo committed truth. An external manual post
cannot be atomically committed with our database: its pending attempt is the durable
reconciliation point. Never promise exactly-once external posting; guarantee at most
one accepted confirmation per variant and one effect per accepted command.

## 6. Idempotency and optimistic concurrency

Every mutation body includes `contract_version:"campaign-spine.v1"`,
`idempotency_key:Id`, and `expected_campaign_version:integer(0..2147483647)`.
Only campaign creation uses 0. All later mutations carry the last observed nonzero
version, including changes to different variants in the same campaign. This deliberately
serializes a bounded campaign and makes concurrent edits explicit.

The receipt fields are `command_id:Uuid`, `namespace:"campaign-spine.v1"`,
`tenant_id:Id`, `project_id:Id`, `actor:CustomerActor`, `idempotency_key:Id`,
`command_type:Id`, `intent_hash:Hash`, `campaign_id:Uuid`, `expected_campaign_version`,
`result_campaign_version:Count`, `first_sequence:Count`, `last_sequence:Count`,
`http_status:200|201`, `result` as below, and `recorded_at:Time`.
Unique identity is `(namespace,tenant_id,project_id,auth_user_id,idempotency_key)`.
Command type and target are intentionally **not** part of this uniqueness key: reusing
a key for another command or campaign in that scope is a conflict. Other principals
and tenants may reuse the same client key independently and cannot inspect this receipt.
This namespace never reads/writes existing generation/Billing/Stripe idempotency tables.

Intent hash = SHA-256(CJ1 of contract version, command type, complete target selectors,
verified owner/actor, expected version and full normalized semantic payload)). Exclude
idempotency key itself, request correlation, server timestamps and generated IDs. Include
explicit preview/profile selection, approval/revision IDs and schedule/published times.
No comparison based only on ownership or key is sufficient for campaign commands.

Same identity + same hash + current authorization returns the original status and
immutable `result` (IDs, resulting version, sequence interval); append nothing and
perform no side effects even if the current aggregate is newer/archived or the supplied
version is now stale. A per-delivery `request_id` may differ outside that saved result.
Revoked membership still denies replay. Changed hash returns 409
`IDEMPOTENCY_KEY_CONFLICT`, without returning stored intent. Stale non-replay version
returns 409 `VERSION_CONFLICT`. Refetch and review before issuing a new key/version;
never silently overwrite. For an in-flight duplicate, wait bounded by 5 seconds for
the first transaction; if still unresolved, return 503 `CAMPAIGN_TEMPORARILY_UNAVAILABLE`
with retryable true, then retry the identical intent/key.

Only successes receive durable receipts. Authentication, validation, authorization,
concurrency and business-rule failures roll back completely and do not consume the key.
Retries re-evaluate those conditions. New-key duplicate business effects are still
constrained by unique variant destination, pending attempt, attempt resolution and
publication-per-variant identities. A second approve/schedule/confirm is an invalid
transition, not a silently successful fresh event. Receipts are retained with audit
history without a TTL in v1; archive never expires a key or frees an identity.

## 7. Tenant, auth, service scope and access

Reuse [customer token verification](../security/CUSTOMER_TOKEN_VERIFICATION.md),
the [ownership graph](../security/IDENTITY_AUTHORIZATION_FOUNDATION.md), and
[service separation](../security/GENERATION_JOB_SERVICE_BOUNDARY.md).
V1 does not widen the existing owner/member role matrix:

| Actor/action | Permission |
| --- | --- |
| Verified owner or member: read campaign, calendar, revision/history, copy/export existing owned content | Existing `project:read` plus `brand:read`, current membership and complete resource chain |
| Verified owner: any campaign mutation, approval, scheduling or publication attestation | Existing `project:write` plus brand ownership resolution; all commands use owner policy |
| Member: any campaign mutation | Non-enumerating 404 `RESOURCE_NOT_AVAILABLE`; existing `generation:create` does not confer campaign write authority |
| Existing global generation service with `generation:execute` | No campaign list/read/write/approve/publish authority; only its existing immutable-job seam |
| Administrator key | No customer campaign authority; operator database work is separately controlled, not a campaign API bypass |
| Anonymous, invalid/expired customer token | 401 `AUTHENTICATION_REQUIRED` before any campaign lookup |

No v1 campaign service route or service scope is introduced. A future worker must use
a separate reviewed scope and immutable campaign-bound work item, never arbitrary
request tenant/project fields. A generation job alone cannot authorize campaign writes.
Body/query/header `user_id`, roles, allowed scopes and authority overrides are rejected.
Persist safe actor attribution with non-cascading audit references: user or membership
removal MUST NOT delete or rewrite audit history. A historical UUID is attribution only;
do not require the actor to remain a current member to read authorized history.

Every lookup, list, cursor, child link, asset export and replay is tenant/project scoped.
Missing object, foreign tenant/project/brand, forbidden role and wrong parent have the
same 404 code/message. Never return foreign IDs, conflict versions, counts or hashes.
Pagination totals and cursors must not reveal another tenant. Authorization outages
fail closed with sanitized 503, not cached allow. HTTP adapters must not trust a
client-constructed authorization-context object.

Receipt replay rechecks **ownership and current caller permission**, not mutable asset,
profile, schedule or brand availability. Those business checks run only for a fresh
command. Thus a revoked asset prevents new export/start but cannot turn a committed
same-intent command into a second execution or erase its receipt. Receipt responses
contain stable outcome IDs only, not asset bytes or fresh access grants.

I-B MUST enable RLS on every new exposed-schema table and revoke ALL from PUBLIC,
anon, authenticated and service_role (including sequences/functions/views). No public
policies or direct Data API access are introduced. Use the existing direct PostgreSQL
server boundary with mandatory authorization; RLS alone cannot protect against its
privileged connection. Triggers reject ordinary update/delete/truncate of immutable
evidence; projection writes require the controlled transaction seam. Private functions
have fixed/empty search_path, qualified names and no PUBLIC EXECUTE. Prefer invoker
semantics. Owner/superuser bypass is an operator trust boundary, not tamper-proof audit;
backup/access control and separate deployment review remain required.

## 8. Generated-asset linkage and compatibility seam

Use existing `media_assets.asset_id` and `generation_jobs.job_id`; do not duplicate
storage authority, mutate jobs or derive authorization from optional legacy
`campaign_id/content_item_id` fields in generation requests. A generated-media link
requires an active owned asset and its actual immutable generation job with exact
tenant/project and the campaign's required brand. A null or different job brand cannot
prove brand compatibility and is denied in v1. Asset/media kind must match revision
format. A reference-only asset or arbitrary storage URL cannot become generated output.
No upload/reference-publication rights are invented by this task.

Internal `generation_links[]` contains `job_id:Id`, `asset_id:Uuid|null`,
`output_kind:"text"|"image"|"video"`, `output_hash:Hash`,
`provenance:"verified_import"`, and
`generation_brand_snapshot_id:Uuid|null` (null unless contemporaneously proven).
For media, `asset_id` is mandatory and must occur in content.asset_refs; `output_hash`
covers the immutable normalized media manifest, including ID, MIME, dimensions and byte
size where known, not provider location. For text, asset ID is null and `output_hash`
covers the normalized imported complete text bytes. A trusted server-side import seam
must verify the actual output before adding provenance. Existing immutable execution
input or a debit alone cannot reconstruct/prove output text. User-pasted text is `manual`
with no generation link; historical output without evidence must not be promoted.

`source=generated_import` requires at least one verified link; later human edits may
retain links as lineage, never as a claim that all resulting text was generated. A link
asserts origin, not human approval, publication, ownership transfer or credit entitlement.
Pinned campaign Brand context and observed generation context remain separate claims.
I-B supports these fields but exposes no import/generation route and does not modify
the existing generator to capture new evidence.

All link checks happen again at review, approval and attempt start. Copy/download of
media checks current asset status and ownership every time; replay of a mutation returns
only stable IDs, never an expired or newly authorized access URL. File delivery uses a
future authenticated same-origin proxy over the existing private asset store; it must
not return buckets, object keys, `gs://` locations or provider URLs. Transient download
failure is retryable and changes no approval/publication/Billing state. There is no
customer download API today; I-F must implement and test it.

Campaign commands make zero provider/Stripe/Billing calls and change zero financial
rows. Copy/export/approve/schedule/record-published cannot reserve, debit, release or
refund credits. If a future campaign action explicitly requests generation, it must
use the existing authorized immutable-job → reserve → generation → durable output →
debit/release chain with its own idempotency namespace. A later failure to link the
already generated asset leaves it owned and recoverable; it does not repeat generation
or manufacture a refund. Manual publishing failures are not qualifying generation
refund evidence. Existing Image/Video `approval_status` is not campaign approval.

## 9. Archive, retention and immutable history

V1 supports campaign and item archive/restore only, with a required reason and event.
No variant archive, soft-delete flag, hard delete, cascade delete or ID reuse exists.
Archive is permitted in any rollup only when all affected variants have no pending
attempt and no active schedule; explicitly unschedule first. Approvals remain historical
and live pointers may be retained. Restore rechecks ownership and makes the same objects
visible; it does not reinstate a cancelled schedule or revalidate a revoked asset/profile.
Item restore requires an unarchived campaign. Repeating archive/restore under a new key
is `INVALID_TRANSITION`; exact receipt replay is permitted under current authorization.

Default Home/calendar excludes archived campaigns/items; explicit history reads include
them. Archived objects permit read/export/corrections only as follows: history export
remains read-only; `correct_publication` requires restoring the campaign/item first.
Receipts, events, revisions, approvals, schedules, snapshots and publications remain
immutable. Ordinary retention has no expiry/purge in this contract. Legal retention,
erasure and actor pseudonymization need a separately approved policy before activation;
I-B must preserve restrict/non-cascade references and must not invent a deletion rule.

## 10. Proposed customer API boundary and resumability

These paths are a proposal for I-F; none are mounted in I-A or I-B. They deliberately
fit the current GET/POST CORS method and authorization/content-type header allowlists.
Idempotency/concurrency stay in JSON, avoiding new headers or CORS configuration.

| Proposed boundary | Contract |
| --- | --- |
| `POST /customer/campaigns` | `create_campaign`; tenant/project/brand selectors, name, goal, timezone and common command fields |
| `POST /customer/campaigns/:campaign_id/commands` | One `command_type` and strict payload from the transition/entity tables; tenant/project selectors; complete common command fields |
| `GET /customer/campaigns?tenant_id=...&project_id=...` | Authorized resume-first campaign list, current status/counts and next action |
| `GET /customer/campaigns/:campaign_id?tenant_id=...&project_id=...` | Consistent current campaign view and immutable referenced revision/approval/schedule/publication state |
| `GET /customer/campaigns/:campaign_id/events?tenant_id=...&project_id=...` | Sanitized customer history, sequential pagination; not raw internal audit envelopes |
| `GET /customer/calendar?tenant_id=...&project_id=...&from=...&to=...` | Variant-level manual schedules and confirmed publications in half-open `[from,to)` UTC interval, max 93 days |
| `GET /customer/campaigns/:campaign_id/variants/:variant_id/export?tenant_id=...&project_id=...&revision_id=...` | Exact revision content/manifest or authenticated private media delivery; read-only, reauthorized, no publication implication |

All command-specific fields are section 3 inputs or named matrix IDs/reasons. Client
supplies initial/additional variant platform/placement/destination label and optional
existing campaign destination key; server allocates a key if omitted. Existing keys
must resolve in the same campaign with exactly matching platform/label. Initial revision
payload defaults to empty Draft; an existing approved snapshot ID can be selected for
save, or `capture_current_brand:true` (mutually exclusive); omitted means retain current.
Campaign creation always captures current approved Brand. The server fills records,
IDs, hashes, audit time and ownership; accepting a persisted-record-shaped client body
is forbidden. Trusted preview references must resolve to server evidence; I-C/I-F define
the rendering transport without changing these approval invariants.

### 10.1 Exact command payload dictionary

The common command fields are outside `payload`; `command_type` is required except on
the creation route where it is fixed as `create_campaign`. Tenant/project selectors
are required on every mutation; brand selector is supplied only for creation and is
otherwise derived from the campaign. `?` below means optional; no other fields are
accepted. All field types/bounds are section 3 types. `initial_content?` defaults to
the empty Draft content; `initial_content` and `content` require all five content keys
when supplied. Empty or missing optional title/body/caption/alt_text normalizes to null.

| Command type | Complete payload |
| --- | --- |
| `create_campaign` | `brand_id`, `name`, `goal`, `display_timezone` |
| `update_campaign_details` | `name`, `display_timezone` (complete new values) |
| `archive_campaign`, `restore_campaign` | `reason` |
| `create_content_item` | `name`, `format`, `platform`, `placement`, `destination_label`, `destination_key?`, `initial_content?` |
| `rename_content_item` | `content_item_id`, `name` |
| `archive_content_item`, `restore_content_item` | `content_item_id`, `reason` |
| `add_variant` | `content_item_id`, `platform`, `placement`, `destination_label`, `destination_key?`, `initial_content?` |
| `save_revision` | `variant_id`, `content`, `change_reason`, `brand_snapshot_id?`, `capture_current_brand?` |
| `submit_review` | `variant_id`, `revision_id` |
| `acknowledge_preview` | `variant_id`, `revision_id`, `render_receipt_id:Uuid`, `acknowledged:true` |
| `request_changes` | `variant_id`, `revision_id`, `reason` |
| `approve` | `variant_id`, `revision_id`, `preview_id`, `approved:true` |
| `revoke_approval` | `variant_id`, `approval_id`, `reason` |
| `schedule`, `reschedule` | `variant_id`, `revision_id`, `approval_id`, `scheduled_for`, `timezone`, `local_datetime`, `utc_offset_minutes` |
| `unschedule` | `variant_id`, `schedule_id` |
| `begin_manual_publication` | `variant_id`, `revision_id`, `approval_id` |
| `confirm_manual_publication` | `variant_id`, `attempt_id`, `published_at`, `publication_url?`, `external_reference?`, `note?`, `attested_published:true` |
| `fail_manual_publication`, `cancel_manual_publication` | `variant_id`, `attempt_id`, `reason`, `not_published_attestation:true` |
| `correct_publication` | `variant_id`, `publication_id`, `published_at`, `publication_url`, `external_reference`, `note`, `reason` (nullable descriptive values explicitly supplied) |

Optional publication fields normalize to null. `capture_current_brand` defaults false;
true and an explicit snapshot ID together are invalid. Initial item/variant revisions
use the campaign's original pinned snapshot. New revisions inherit the variant's
snapshot unless explicitly changed. Restoring old content uses save_revision, not a
second command with different revision semantics. No bulk-create variants, hidden
status override, standalone destination mutation or client actor field is defined.
An existing destination key is usable only with the exact same platform/label as every
previous variant using it in this campaign; reject mismatch as RESOURCE_NOT_AVAILABLE.

`render_receipt_id` refers to I-C's trusted, immutable completed render result containing
the profile reference, renderer version, revision/input hashes, digest and rendered time
from section 3.3. It is bound to this owner/variant/revision and is not client-supplied
render data. Acknowledgement copies that verified binding into preview evidence with
the current viewer/time. Missing or foreign receipt is RESOURCE_NOT_AVAILABLE; wrong
revision is PREVIEW_REQUIRED. I-B uses trusted synthetic receipts only, until I-C exists.

Public content commands never accept `source` or `generation_links`. Manual text is
manual; links for selected generated media are resolved from owned canonical assets by
the trusted seam. Verified text import is a separately authenticated internal I-F
adapter over save_revision, carrying validated output evidence and the same current
owner authorization, receipt and transaction rules; no generic service scope is implied.
For that internal adapter, source/provenance is included in the intent hash. Replacing
text manually cannot claim verified text import; retained links are lineage only.

Successful creation is HTTP 201; every other command HTTP 200. Stable receipt `result`
has `{command_id,campaign_id,campaign_version,first_sequence,last_sequence,created_ids}`.
`created_ids` is an object of record type to ordered UUID array, empty if none; only
created records in that command appear. The response envelope is
`{contract_version:"campaign-spine.v1",request_id,result}`. Replays return the same
result/status; a fresh read returns current state. Mutation receipts never contain
content, generated prompts, raw snapshots or delivery URLs.

Reads use a consistent database snapshot and include `campaign_version`, last event
sequence and server `evaluated_at` so Home/calendar never mixes approvals from one
version with content from another. Reload/login/new device rebuilds from committed
state; browser memory/local storage is not the authority. Unsaved typing is not claimed
durable until save returns/replay resolves. Event pagination uses sequence, not time.
List limit is integer 1..100, default 50. Cursors are opaque signed, expire after 15
minutes and bind principal, tenant, project, filters, sort, last key and read time;
revalidate authorization on every page. Invalid/stale cursor returns `CURSOR_INVALID`.
Resume lists order `updated_at DESC,campaign_id ASC`. Calendar orders occurrence instant
then variant UUID, deduplicates a Published variant to its actual publication instant,
and does not show its old planned slot as a second pending post. A schedule remains
visible at its planned instant until publication/unscheduling/archive removes it.
There is no guarantee of a multi-page frozen snapshot during concurrent edits; clients
deduplicate IDs and refetch on mutation. Individual campaign reads are atomic snapshots.

One `next_action` is chosen per campaign, within current actor permissions: pending
attempt resolution first, then Blocked, Failed, overdue schedule, Review, Draft,
Approved, future Scheduled, Published. Ties use due time (null last), then item UUID,
then variant UUID. Empty campaign action is create content. Each action includes code,
target IDs, plain-language label and `why`; no speculative performance claim. A member
receives read-only inspect/view action with why owner action is required. This is a
deterministic resume projection, not the later I-E goal recommendation engine.
In explicit archived views, the next action is restore for an owner or inspect history
for a member; default Home/calendar does not offer archived work as active work.

Customer read DTOs allowlist campaign/item/variant labels and IDs, format, workflow,
counts, safe content, authorized asset IDs, schedule/publication metadata, next action,
and safe revision/approval history. Brand/preview attribution is an opaque reference
plus version; raw Brand snapshot, auth UUIDs, policy context, generation job IDs,
execution classes, hashes, provider/model fields, prompt internals, storage keys and
financial internals stay server-side. Do not serialize repositories/events directly.

## 11. Stable error catalogue

For this future customer boundary the exact failure envelope is:

```json
{
  "status": "failed",
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "The campaign changed; reload before continuing",
    "retryable": false,
    "details": []
  },
  "request_id": "00000000-0000-4000-8000-000000000001"
}
```

`request_id` is server-generated per delivery. `details` is always an array; only
VALIDATION_ERROR may include up to 20 `{path,code}` entries. Path is an allowlisted
schema field path, never an unknown attacker-supplied property name; code is one of
`required`, `type`, `format`, `bounds`, `unknown_field`. No input values, current versions,
stored intent or foreign resource data are included. All other details are empty.

| HTTP | Code | Fixed message | Retryable |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Request validation failed | false |
| 400 | `CONTRACT_VERSION_UNSUPPORTED` | This campaign contract version is not supported | false |
| 400 | `CURSOR_INVALID` | Reload this view to continue | false |
| 401 | `AUTHENTICATION_REQUIRED` | A verified customer identity is required | false |
| 404 | `RESOURCE_NOT_AVAILABLE` | The requested resource is not available | false |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | This request key was already used for different intent | false |
| 409 | `VERSION_CONFLICT` | The campaign changed; reload before continuing | false |
| 409 | `INVALID_TRANSITION` | This action is not available in the current state | false |
| 409 | `CAMPAIGN_ARCHIVED` | Restore this campaign or content item before continuing | false |
| 409 | `VARIANT_ALREADY_EXISTS` | This content item already has that destination variant | false |
| 409 | `MANUAL_ATTEMPT_PENDING` | Resolve the existing manual publication attempt first | false |
| 409 | `APPROVAL_REQUIRED` | Approve the current revision before continuing | false |
| 409 | `PREVIEW_REQUIRED` | Review the current platform preview before approving | false |
| 409 | `PREVIEW_VERSION_UNAVAILABLE` | The selected preview version is not available | false |
| 409 | `BRAND_CONTEXT_UNAVAILABLE` | Approved brand context is required | false |
| 409 | `CONTENT_INCOMPLETE` | Complete the content before submitting for review | false |
| 409 | `SCHEDULE_INVALID` | Choose a valid future schedule with an explicit timezone | false |
| 409 | `PUBLICATION_EVIDENCE_INVALID` | Confirm the actual publication details before continuing | false |
| 409 | `CAMPAIGN_LIMIT_REACHED` | This campaign has reached its content limit | false |
| 413 | `PAYLOAD_TOO_LARGE` | The request is too large | false |
| 503 | `CAMPAIGN_TEMPORARILY_UNAVAILABLE` | Campaign state is temporarily unavailable | true |
| 500 | `CAMPAIGN_INTERNAL_ERROR` | The campaign action could not be completed | false |

Reference lookup failure (including unavailable asset) uses RESOURCE_NOT_AVAILABLE to
avoid resource enumeration; a blocked read may say an already-owned linked asset is
unavailable without disclosing its storage or a foreign resource. Brand/preview-specific
errors occur only after resource authorization. Processing precedence: transport/CORS
and size gates → authentication → strict syntax/contract validation → authorization of
target and references → receipt replay/conflict → version → archive → pending attempt
→ transition → approval/preview → content/attribution/assets → schedule/publication
semantics. Unavailable external reference is handled during authorized resolution; no
resource-specific detail is emitted before that stage. Infrastructure failure at any
stage stops immediately with sanitized 503/500. Existing CORS 403 `{error:"Forbidden"}`
and existing generation/service error contracts remain unchanged outside this new DTO.

## 12. Persistence invariants and non-goals

I-B MUST enforce these in storage, not only HTTP validation:

1. Immutable tenant/project/brand/campaign/item/variant identities and parent links;
   composite same-owner FKs or equally strong locked trigger checks for every link.
2. Unique variant destination, revision number, campaign event sequence, receipt identity,
   terminal resolution per attempt and publication per variant/attempt.
3. No projection can point to another variant's revision/approval/schedule/attempt;
   approved/scheduled/publication references resolve to the exact same revision.
4. At most one pending attempt; approvals and content cannot change while one is pending.
5. Published implies an immutable confirmed resolution/publication and has no pending
   attempt or active schedule. Approved/Scheduled implies a live exact approval.
6. Draft/Review has no live approval/schedule. Scheduled has exactly one active schedule;
   Approved has none. Current revision exists and is the highest committed revision.
7. Immutable records reject UPDATE/DELETE/TRUNCATE; ordinary rollback/revert cannot
   erase evidence. Actor/membership deletion never cascades into campaign history.
8. Every mutation has one receipt and one or more ordered events; version/sequence and
   projections agree with those records at commit. Replay creates none.
9. Failure leaves the aggregate entirely unchanged; no external calls or credit effects
   inside campaign transactions. Reconstructed reads agree with the committed stream.
10. RLS/revoked privileges and server authorization jointly defend every new table/view;
    no default grant, token claim or broad service scope supplies campaign authority.

Explicit non-goals: schema/migration creation in I-A; any schema application; customer
API or connector implementation; social/email dispatch; billable generation; generation
or Billing changes; production/staging/configuration/IAM/secret/traffic changes; new
pricing; product/design repositioning; autonomous publication; analytics/measurement
proof; recommendation engine; upload/editing suite; recurrence; unpublish; physical
erasure; independent platform-delivery verification; paid-beta/production activation.
The [handoff](CAMPAIGN_SPINE_ACCEPTANCE.md#exact-handoff-to-bg-launch-002i-b) is the
only next persistence implementation scope after I-A review/acceptance.
