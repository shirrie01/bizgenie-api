# BG-SOCIAL-001 continuation — implemented draft lifecycle

31 October2026. Existing PR224 / branch bg-social-001-tiktok, starting SHA d8528012a2b437891fdfa139a23909c69527a526. No new PR. **Partial programme delivery: real TikTok OAuth and upload transport remain blocked on the referenced official contract checkpoint.** Staging RED; launch NO-GO.

## Implemented now

Existing social dispatch service supports server-configured `deliveryMode: 'draft_upload'`, invoking `connector.uploadDraft` instead of `connector.publish`. No provider is registered or activated. TikTok Direct Post admission is rejected422 DIRECT_POST_DISABLED, including injected publishers; TikTok draft admission requires a video content item. All existing owner/scope/approved revision/schedule/rights checks remain. Scope is derived from the existing trusted campaign binding, not request flags.

No new route/store/job/ledger. Existing POST /customer/social/dispatches remains the entry point, with the existing strict scope/connection/campaign/variant/schedule/expected_campaign_version/publishing_confirmed:true body. That legacy confirmation field is retained for wire compatibility; frontend customer wording must say sending a draft, not publishing now. Delivery mode is server-only and cannot be chosen by the request body.

Normalized provider adapter result (internal DTO, **not TikTok wire fields**):

```json
{"status":"uploaded","confirmed_by_platform":true,"upload_reference":"<opaque task identity>","uploaded_at":"<ISO timestamp>"}
```

Pending/unknown result retains reconciliation_required and any known provider_reference. Only authoritative uploaded or definitive failed result can settle. Uncertain initialization with no reference never permits blind re-initialization/re-upload. Actual HTTP chunks/retries/cancellation/status mapping are not implemented without the official contract.

The service persists operation_kind draft_upload, uploaded_at and the existing provider_reference, never publication_id/URL/published_at. `uploaded` is immutable terminal metadata for this attempt, with creator action still required externally. It is distinct from queued, claimed, sending, reconciliation_required, failed and cancelled. Duplicate confirmed result with the same reference replays; a conflicting result is rejected. Restart reconciliation uses the existing dispatch identity/fence/reference; no second upload. Cancellation remains owner-only and only safe before sending; it cannot recall an uploaded task or an ambiguous external operation.

Existing list/detail/calendar dispatch DTO for draft operations adds:

```json
{"operation_kind":"draft_upload","state":"uploaded","creator_action_required":true,"uploaded_at":"<ISO>","publication_id":null,"publication_url":null,"published_at":null,"evidence_kind":null}
```

Social calendar delivery_state is uploading during sending and awaiting_creator_action after uploaded. Legacy publication DTO remains unchanged. Claude must accept uploaded in its dispatch parser, display Awaiting creator action, and retain the existing rule that only state published + platform_api evidence is a confirmed public post. Do not combine draft receipts with publication metrics or remove current-version media review. No active Claude frontend/composition/Veo/profile file changed here; coordination is through this reviewable contract on224.

Verified publication view already filters state published, so uploaded tasks cannot enter campaign platform-publication or Learning Brain evidence. The new database constraint additionally prohibits published state or publication fields on draft operations. Ledger entries are unchanged by upload/reconciliation. A later creator action is not inferred; representing actual subsequent publication requires separately verified provider evidence and contract work.

## Migration and worker compatibility

New proposal supabase/migrations/20261031190000_add_social_draft_upload_lifecycle.sql follows the existing social foundations. Adds operation_kind default publish and nullable uploaded_at, expands state check, preserves original rows as publish, and replaces the existing transition guard without widening grants/RLS. No historical migration edited. Applied only inside new disposable test databases.

Draft-aware claim/start transactions set transaction-local bizgenie.social_draft_worker=v1. The trigger rejects draft claim/sending transitions without it. This prevents an older worker from claiming/sending a new draft through its old publish path; it is a compatibility guard, not authorization against a malicious database administrator. Normal membership/rights checks and fences still apply. Existing published operations retain their old lifecycle.

Before any shared application: obtain explicit migration/deployment authority, verify schema/backups, drain old workers and prove every consumer handles operation kind and uploaded state. No automatic migration or feature activation. Non-draft queries remain compatible with the old schema; configured draft insertion without its migration fails closed before external work. Rollback disables new production of draft operations and retains schema/history/guard; do not drop columns/constraints or run old workers against draft queues. Readonly projections must continue distinguishing uploaded history. Nothing here authorizes deleting/recalling provider uploads.

## Deterministic proof

New regression exercises real PostgreSQL dispatch/trigger/fence transitions with a synthetic adapter: one pending upload, reconstruct service, authoritative reconciliation to uploaded, repeated reconciliation no second probe/upload, creator-action calendar, zero verified publication rows, unchanged ledger. It rejects a legacy claim lacking the draft-aware transaction flag and attempts to relabel an uploaded task as published. Another case proves pre-send cancellation makes zero calls and transport exceptions remain uncertain until a definitive failed reconciliation. TikTok Direct Post is denied before provider access. These are provider-neutral lifecycle tests, not TikTok API conformance.

Populated local pg_dump/restore fixture now includes an uploaded draft, asserting its post-restore DTO, creator-action flag and exclusion from verified publication view alongside existing credit reservation replay/learning/media metadata proofs. Object bytes, production storage and managed restore are not claimed.

## Still blocked: exact contract input required

All four supplied current URLs returned403:
- https://developers.tiktok.com/docs/en/login-kit-web
- https://developers.tiktok.com/docs/en/login-kit-overview
- https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video
- https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content

PR224 body/comments/checks also return GitHub GraphQL Forbidden. The referenced alternative canonical checkpoint details are not present in available checkout/attachments and were requested from the user while independent work continued. No guessed token/identity/refresh/revoke endpoints, authorization parameter names, PKCE applicability, upload request fields, status mappings, media/chunk limits, transport retries or cancellation APIs were added.

**Required owner action:** paste/export that checkpoint's official contract details (including token and upload-status references), or provide an accessible file containing them. Identify the approved durable vault driver/key-management design if one exists. Existing SocialTokenVault remains unavailable without a driver; encrypted persistence/refresh/revocation/orphan cleanup are not falsely claimed. This is missing source/design evidence, not a request to reapprove the already-authorized adapter engineering. Once available, implement/register the real TikTok adapter against this lifecycle and secure vault boundary.

Callback remains exactly https://getbizgenie.com/customer/social/oauth/callback/tiktok, implemented locally in prior224 code, not deployed/publicly verified. TikTok-specific redirect rules remain unverified until the contract is accessible. No callback change made.

## Governance / evidence proposal

Update existing BG-SOCIAL-001/R11 task and224 evidence only: draft-aware lifecycle implemented/tested, real provider adapter BLOCKED on checkpoint content, approved vault unavailable, official URL/API403, exact local results and uploaded-draft restore. Retain existing independently verified PASS, Direct Post disabled, no active OAuth/publishing. No duplicate Mission Control tasks/registers or live writes. Hosted CI must be independently read at the new exact PR head; source Git refs are not CI evidence.

Local validation: Node22.23.3/PostgreSQL17.11, full1028/1028, zero failures/cancelled/skips (30.080s); focused6/6; separate billing/campaign PostgreSQL57/57; populated dump/restore PASS including uploaded-draft read/exclusion assertions. Three changed JS files syntax checked; git diff --check clean. Commands use TEST_DATABASE_URL loopback5433 and the existing Node22 path; restore requires BIZGENIE_DISPOSABLE_RESTORE_PROOF=1. Logs under /workspace/recovery/bg-social-001; hashes in the adjacent evidence JSON.

Supersession after founder contract reply: [implemented TikTok Web OAuth, encrypted vault and FILE_UPLOAD adapter](BG_SOCIAL_001_TIKTOK_IMPLEMENTATION.md) replaces the earlier missing-contract blocker. Live key/media-policy wiring, portal approval and deployment remain gated.
