# BG-STUDIO-021 — campaign reload and bounded discovery

26 October 2026. Additive draft contract; original PR217 unchanged. **INTEGRATED LOCAL**, no staging deployment. Founder work order authorizes local integration; Mission Control remains sole operational authority.

## Customer detail reload (frontend53 R1/R2)

GET `/customer/campaigns/:campaign_id?tenant_id=&project_id=` retains its envelope and member-readable scope. Each variant now includes:

* `current_schedule: null | {schedule_id, revision_id, scheduled_for, timezone}` for its active schedule only.
* `manual_publication: null | {attempt_id, revision_id, started_at, method:"manual"}` for its unresolved attempt only.
* `publication: null | {record_id, revision_id, published_at, publication_url, method:"manual", evidence_kind:"customer_attestation", correction_id}` with latest immutable correction applied.

Use current_schedule.schedule_id to unschedule, manual_publication.attempt_id to resolve an attempt, and publication.record_id as the existing correction request's publication_id. Raw approval/pointer fields, historical maps, actor IDs and Brand Brain snapshots stay private. This intentionally offers narrow nested facts rather than exposing internal aggregate maps. Claude must adapt R1 to these names; do not rely on browser-remembered IDs as authority. Existing owner mutations/CAS/receipt checks are unchanged. A manual attestation is never a platform-confirmed post.

## Discovery

GET `/customer/campaigns/discovery?tenant_id=&project_id=&archived=active|archived|all&limit=25&cursor=` returns `{contract_version:"campaign-discovery.v1",campaigns:[summary],next_cursor}`. Default active, limit1–100; opaque cursor bound to actor/scope/filter, ordered updated_at descending then campaign UUID ascending. No total count or snapshot isolation guarantee. A campaign edited during traversal can move; reload from first page to refresh. Summary has existing root identity/name/goal/timezone/version/status/counts/archive/timestamps, no items/history/next_action. Existing GET collection remains compatible; frontend must adopt discovery for bounded lists and archive recovery.

PostgreSQL bounds roots before current-item/variant rollups and uses a two-second statement timeout; no revision/event/snapshot hydration. In-memory and SQL summaries/cursors have parity tests. Existing workspace calendar remains `/customer/calendar`, half-open explicit window≤93days, limit≤100, separate opaque cursor contract; do not reuse discovery cursors. Autonomous publishing status is a separate source, never inferred from a planned time.

## Verification and limits

Focused Node22/PG17 customer HTTP + memory/SQL regression suite: **54/54**, no skips. Schedule→reload, pending attempt→reload, confirm/correct→reload, archived discovery, equal-timestamp traversal, no repeats, filter/scope cursor rejection, foreign scope404/private headers and unchanged internal DTO restrictions tested. Broad repeat after final integration is recorded in the main BG021 checkpoint. No shared schema changes. Legacy unbounded collection is retained for compatibility and must be retired through explicit frontend adoption. Production query plans/load and deployed authentication remain unverified.
