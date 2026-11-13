# BG-STUDIO-019 — workspace calendar handoff

26 October 2026. Draft code, Node 22 / disposable PostgreSQL only. Staging RED; launch NO-GO.

`GET /customer/calendar?tenant_id&project_id&from&to[&campaign_id][&platform][&workflow][&limit][&cursor]` now exists in this isolated branch. Bearer authentication and current project read authorization are required; PostgreSQL rechecks authorization in its repeatable-read read-only transaction. Owners and authorized members may read. Missing/foreign scope is 404; invalid query/cursor is 400 `VALIDATION_ERROR`; no token is 401; persistence/timeout is 503 `CAMPAIGN_TEMPORARILY_UNAVAILABLE`. Existing `{error:{code,message}}` campaign error envelope applies.

Dates require explicit ISO8601 offsets; instants are normalized to UTC. `from` inclusive / `to` exclusive, strictly increasing, maximum 93 elapsed days. No implicit viewer timezone or server-local date conversion. Response `display_timezone:"UTC"`; Claude may format in a stated viewer timezone. `limit` defaults 50, maximum 100, applied across both lists. Platform values: linkedin, instagram, facebook, tiktok, youtube, email, other. Workflow: draft, review, approved, scheduled, published. Unknown query keys fail.

Response:
```
{contract_version:"workspace-calendar.v1", window:{from,to}, display_timezone:"UTC",
 entries:[{campaign_id,campaign_name,content_item_id,content_item_name,format,
 variant_id,platform,placement,destination_label,workflow,occurrence_at,
 occurrence_kind:"scheduled"|"published",schedule_id,publication_id}],
 unscheduled:[{...same fields,occurrence_at:null,occurrence_kind:"unscheduled",
 schedule_id:null,publication_id:null}],next_cursor:null|"opaque"}
```

Archived campaigns/items are excluded. Each current variant appears at most once: current publication (latest correction) takes precedence over active schedule; neither means unscheduled. Historical superseded schedules are not occurrences. Publication means recorded manual evidence, not a verified platform response. Undated content is independent of the date window and paged after dated entries. Dated entries sort by instant then variant UUID, undated by UUID. Cursor is an untrusted position bound to scope/window/filters, never authority; changing filters/window requires restart. Page size may change. Pages are individually consistent, not a frozen multi-request snapshot: concurrent rescheduling may move an entry between pages; refresh from page one after writes. A snapshot token would require a separate contract, not a false consistency claim.

PostgreSQL executes one scoped projection query rather than hydrating every campaign, revision, event and snapshot. LIMIT is `limit+1` and the transaction sets a 2-second statement timeout. Existing relational indexes are reused; scanned work is not mathematically constant, and very large tenants may time out. Query-plan/index and load/egress evidence remains required before operational rollout; no index migration is silently introduced. Memory repository mirrors projection semantics for deterministic tests.

Frontend #51 can replace `workspaceCalendarClient.js` fan-out with this endpoint. Consume both arrays and follow `next_cursor`; do not retain the eight-campaign cap or claim completeness before all pages load. Discard old-workspace responses, preserve session refresh, clear cursor on filter/window changes. Existing per-campaign route and behaviour remain unchanged.

Evidence: focused 26/26 (including real local PostgreSQL parity, cursor traversal, latest correction, foreign scope and revoked membership); full suite 725/725, zero skipped, Node 22.23.3, local PostgreSQL 17. No deployed/browser/live provider claim. GitHub exact-head CI requires API access; git transport does not prove CI. Dependency: professional-services draft `adc9b41` and restore fix `22c8642` on the preserved #215/calendar stack.
