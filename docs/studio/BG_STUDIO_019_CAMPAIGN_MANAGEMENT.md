# BG-STUDIO-019 — campaign/manual-publication management

26 October 2026. Existing command architecture retained; no social posting.

Customer base `/customer/campaigns/:campaignId`. Bearer + current `project:write` authorization; present policy grants this to owners, not members. Brand Brain member non-identity edits use their separate policy and are unchanged. Every mutation uses `tenant_id`, `project_id`, `idempotency_key`, `expected_campaign_version`; database command transactions recheck authority. Response `{result:{campaign_id,campaign_version,created_ids},campaign:<safe detail>}`. Version advances once; same scoped request/intent replays; conflicting intent yields409. All errors use `{error:{code,message}}`: 401 authentication, 404 foreign/unauthorized, 400 validation, 409 `VERSION_CONFLICT` / `IDEMPOTENCY_KEY_CONFLICT` / transition code, 503 `CAMPAIGN_TEMPORARILY_UNAVAILABLE`.

| Capability | Existing route / required fields beyond common scope |
|---|---|
| Rename | PATCH base; `name`, `display_timezone` (preserve current timezone when renaming) |
| Archive / restore | POST `/archive` or `/restore`; `reason` |
| Start manual attempt | POST `/variants/:variantId/manual-publication`; `revision_id` |
| Manual success | POST `/variants/:variantId/manual-publication/confirm`; `attempt_id`, `published_at`, optional publication_url/external_reference/note |
| Manual failure / cancel | POST `/variants/:variantId/manual-publication/fail` or `/cancel`; `attempt_id`, `reason` |
| Schedule / reschedule | POST `/variants/:variantId/schedule` or `/reschedule`; `revision_id`, `scheduled_for`, `timezone`, `local_datetime`, `utc_offset_minutes` |
| **Added HTTP access to existing unschedule command** | POST `/variants/:variantId/unschedule`; `schedule_id` |

For unschedule, preserve the schedule ID from schedule response `result.created_ids.schedule_ids[0]`, or obtain the current occurrence's schedule_id from the new workspace calendar. The explicit stable ID allows exact lost-response retries without deriving a different intent from changed current state. It must be the active schedule under the expected version; foreign/stale IDs fail atomically. Old schedule evidence remains; approval is retained and workflow returns to approved. No provider/credit/publishing side effect.

Manual confirmation is customer attestation, not platform verification. UI must collect a truthful explicit action before calling it. Failure/cancellation removes an active schedule and returns approved; explicit rescheduling is required before retrying a failed manual attempt. Do not invent automatic retries or claim that scheduling publishes. Archives refuse unresolved pending attempts/active schedules rather than hiding them.

Evidence: new HTTP unschedule owner/member/foreign/revocation/stale/replay test, plus shared memory/PostgreSQL regression for unschedule wrong ID, replay, retained history/approval and valid projection. Existing HTTP rename/archive/restore and repository manual success/failure/cancel/concurrency tests preserved. Complete Node22 + disposable PostgreSQL suite **735/735, zero skipped**. No deployed E2E or actual publication tested.
