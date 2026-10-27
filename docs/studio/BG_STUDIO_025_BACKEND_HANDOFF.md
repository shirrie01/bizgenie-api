# BG-STUDIO-025 — social, media and integration unblock

27 October 2026. Draft engineering only. STAGING RED. LAUNCH NO-GO. No live OAuth, provider, Stripe, publishing, shared migration, credential, IAM, deployment or traffic operation.

## Verified base and review boundary

Started clean on recovered `bg-studio-022-staged-strategy` at653482f09d27df40e0cb79813ddcad79b7ebd134, application44f849c54827036ceb84c98bb40ba3925644bc25. Live Git main remains ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f; PR219 ref matches653482f. New isolated continuation `bg-studio-025-social-contract`, dependent on219. Original #213–#219 branches untouched. `gh pr view219` returned GraphQL Forbidden; current draft/open/check status cannot be independently confirmed via API. Existing verified PASS evidence is retained.

Frontend59 fetched at4ebbe13cae9b331d46030855a47c074e1724eec6; read src/premium/socialClient.js and BG_STUDIO_024_FE_SOCIAL.md. Its expected field is **authorize_url**, not authorization_url. Frontend56's previous handoff targets218. This change adds to that contract; no guessed social route aliases or duplicate upload/ledger/job stores.

Governance baseline remains the17-tab Mission Control snapshot exported27 October and Constitution read during recovery, plus current founder work order. SRC001 sole governance, SRC004/016 engineering authority, DEC014 full premium scope, DEC020 onboarding A, DEC025 draft-only scope, LOCK012 durable backend financial authority. Snapshot is not current live operational proof. No register writes performed.

## Delivered / remaining

| Area | Delivered and locally tested | Remaining, not claimed |
|---|---|---|
| OAuth | Reviewed configuration URL builder, durable redirect/config binding, state/S256 one-use callback, owner/scoped authorization and revocation recheck, duplicate account upsert, sanitized errors | Current Meta flow/permissions/PKCE verification, real connector/vault, app approval and actual redirect registration; no live activation |
| Connections | Optional verified display_name; expiry derived on reads; local disconnect works even when platform is unavailable | External provider-token invalidation, old/orphan vault-reference cleanup and retention policy |
| Jobs/calendar | Existing APIs retained; typed text/plan/media detail, atomic attach and preview/approval contracts below | Claude F2/F3 adoption and reviewed deployment composition |
| Hybrid | Newer intake and quoted adapter retain stronger lineage than189 | General compositor/AI storyboard contracts; real provider recovery/price/inspection; not solved by image-upload API |
| Learning | Source/dictionary revocation checked in new snapshots; current/historical separation; additive canonical row version | Trusted real connectors/dictionaries/attribution and scheduling, frontend F5 wiring; no fabricated analytics |
| Recovery | Populated logical restore including BG022 and pending strategy reservation replay | Managed restore, GCS object bytes, secrets, Cloud Run/runtime recovery and deployed acceptance |

## F1: exact OAuth contract

All routes use bearer authentication and private/no-store, Vary Authorization. Scope is `{tenant_id,project_id,brand_id}` in query for GET or body for POST. Existing routes unchanged.

`POST /customer/social/oauth-intents` body adds `platform` and43-character base64url `pkce_challenge` (SHA256 of43–128-character browser verifier). Returns200:

```json
{"contract_version":"social-oauth-intent.v1","intent_id":"<uuid>","state":"<random opaque state>","expires_at":"<ISO timestamp>","authorize_url":"<https URL built from reviewed provider config>","redirect_uri":"<exact server-approved HTTPS URI>","authorization_status":"ready"}
```

Legacy synthetic connector configuration without OAuth metadata returns authorize_url/redirect_uri null and authorization_status provider_configuration_required. Frontend must not navigate then. Production default service remains absent/unconfigured503. **No live provider configuration supplied or approved by this code.** `ready` means this explicit server configuration validates, not independent verification of Meta approval.

Server-only `platforms[platform].oauth` fields:

- authorization_endpoint: exact documented/reviewed HTTPS provider endpoint; no credentials, query, fragment or custom port; restricted provider hostname. No endpoint or API version default is invented.
- client_id: public app identifier, never client secret.
- redirect_uri + approved_redirect_uris: exact registered URI/allowlist, HTTPS, no query/fragment/credentials/custom port; client-supplied redirect parameters cannot override it.
- scopes: explicit reviewed permissions, must include platform requiredScopes; no permission is inferred or automatically granted.
- pkce_method S256, pkce_support_verified true: requires evidence for the selected provider flow; do not set this merely because the browser supports PKCE.
- app_review_status approved, review_ref and documentation_ref: explicit operator-reviewed metadata. Fixtures use synthetic approvals, synthetic scopes and vTEST paths; these are not valid live Meta configuration.

Intent persists only state hash, challenge, scope, actor, expiry plus configuration hash/redirect, never verifier or credentials. Five-minute one-use state. The exact full configuration is hashed; changing app/redirect/scopes/review metadata invalidates old intents. Existing unbound intents cannot be exchanged after adopting bound configuration; issue a new intent. No arbitrary browser callback URL accepted.

`POST /customer/social/oauth-complete`: `{...scope,intent_id,state,code,code_verifier}`. Verifies current owner/scope/state/expiry/config and S256 before atomically consuming intent. Exchanges once outside DB transaction with exact pinned redirect/client/config identity, then rechecks owner membership and configuration before committing connection. Timeout/error consumes intent and does not retry exchange automatically. Restart with a fresh intent after checking connections. Duplicate scoped platform/account updates one connection and increments version; no second row. Refresh retains existing fence rules.

Returns200 connection `{connection_id,platform,account_id,display_name:string|null,status:active|revoked|expired,expires_at,version}`. display_name comes only from validated connector output, max200 and no control characters. Frontend renders as text and may fall back to account_id. Never token_reference, access token, authorization code or secret. Active-but-expired reads report expired without mutating history. Token persistence remains an opaque UUID vault reference: this task does not supply a real vault or store raw tokens. Real connectors must persist secrets securely before returning references and handle superseded/orphan tokens and revocation under separately reviewed operational authority.

Errors use `{error:{code,message}}`, message deliberately generic:

| HTTP | Code | Frontend action |
|---|---|---|
|401|AUTHENTICATION_REQUIRED|Refresh/sign in; do not reuse stale scoped attempts |
|404|RESOURCE_NOT_AVAILABLE|Owner/scope unavailable; no cross-tenant detail |
|400|OAUTH_PKCE_REQUIRED|Discard attempt; generate valid verifier/challenge |
|409|OAUTH_STATE_INVALID|Wrong/expired/replayed state; fresh intent, never repeat exchange |
|409|OAUTH_CONFIGURATION_CHANGED|Config/redirect changed; fresh intent |
|422|PLATFORM_PERMISSION_REQUIRED / PLATFORM_APP_REVIEW_REQUIRED / OAUTH_ACCESS_DENIED|Permissions, approval or consent unresolved; no connected claim |
|503|SOCIAL_NOT_CONFIGURED / OAUTH_CONFIGURATION_UNAVAILABLE|Unavailable; do not navigate |
|503|OAUTH_PROVIDER_UNAVAILABLE|Exchange failed/unknown; attempt consumed, check connections first |

Provider exceptions are mapped only for the listed explicit codes; no guessing from raw messages. Browser `error=access_denied` without a code should be handled as cancelled consent, clearing the local attempt; it cannot complete a connection, and unused intent expires. Do not show Nothing changed for all503: a nonce may have been consumed or exchange accepted even if persistence failed.

`POST /connections/:id/disconnect` body scope remains owner-only. Local revocation no longer requires working provider configuration/enabled flag. Idempotent, increments version once, clears refresh claim; subsequent admission rechecks prevent new sends/learning. This is **local access revocation**, not proof that Meta credentials were invalidated or that a send already accepted by a provider was recalled. `POST /dispatches/:id/cancel` remains owner-only, scoped, and only queued/claimed; sending/uncertain fails409 PUBLICATION_ALREADY_STARTED. No auto-refund or publish on disconnect.

### Meta source boundary

Attempted public sources27 October2026:
- https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/

Proxy returned403; the Facebook documentation retry outside sandbox also returned403. **Content/current requirements were not verified.** Different Facebook/Instagram login products may have different endpoints, eligible accounts, scopes, API versions, redirect rules and PKCE support. Do not populate this gated S256 contract with speculative Meta settings. If the approved Meta flow lacks verified S256 support, this contract fails closed; bring its exact documented alternative for scoped review rather than silently removing the guard. App-review/permission evidence, approved redirect origin/path, server connector transport and token-vault lifecycle are genuine activation blockers. URL examples in tests are deliberately synthetic, not supported provider URLs.

## F2: Creative Jobs and media contracts

- GET /customer/creative-jobs?tenant_id&project_id&brand_id&limit<=100&cursor returns creative-job-list.v1 `{jobs,next_cursor}`. GET /:job_id returns creative-job.v1. job_id is opaque (`quoted:<uuid>`); URL-encode it. List summaries do not contain full outputs; fetch detail.
- States: queued, claimed, calling, recovery_required, succeeded, failed, cancelled. Unknown/recovery_required means reconcile_do_not_resubmit, not new paid retry. Only owner/creator can cancel unstarted work; reads remain scoped as existing service allows. Status also available at GET /customer/generation-quotes/:quote_id.
- Detail outputs: text has output_type text/content/provenance; strategy plan has output_type strategy_plan/strategy/provenance; media has asset_id/media_kind/mime_type/provenance. Media outputs use existing shape, not a fabricated universal output_type. Missing/revoked media is omitted. Never render storage keys/URLs from provider output.
- POST /customer/creative-jobs/:job_id/attach body scope is owner-only and atomically creates a campaign revision/link. Strategy planning job returns422 STAGE_NOT_ATTACHABLE. Only final draft/media result can attach; repeat returns association, no duplicate revision. Attach never approves or publishes.
- Detail association includes current/current_campaign_version/approval_status. Preview paths only for current association; media_paths only asset-backed outputs. GET /customer/campaigns/:campaignId/variants/:variantId/creative-preview requires tenant/project and expected version as existing query contract.
- Authenticated private bytes: GET .../revisions/:revisionId/assets/:assetId/preview. Bearer, tenant/project, expected campaign version and existing receipt/media access rules; no bucket keys/signed URLs. PNG/JPEG/WebP plus bounded MP4 single byte range. Follow server range limits; client ceiling32MiB is not permission to request arbitrary32MiB ranges (server transfer cap8MiB). Abort stale/changed-workspace requests. CORS/session refresh require separately reviewed deployed composition; not proven by local tests.
- POST .../preview-renders body tenant/project/idempotency_key/revision_id returns201 `{preview:<receipt>}`. POST .../preview-acknowledgements additionally expected_campaign_version/render_receipt_id/acknowledged:true returns command result and current campaign. POST .../approval uses current expected_campaign_version/revision_id/preview_id/approved:true. Receipt/ack actor, revision/profile/rights and version checks remain mandatory; refresh campaign version after every command. Never bypass409.
- Existing intake /customer/assets: GET list; POST /uploads (scope,filename,content_type,bytes,rights_confirmed:true,idempotency_key); PUT /uploads/:assetId/bytes (scope query/raw content type); POST /:assetId/complete (scope); GET /:assetId and /:assetId/preview; POST /:assetId/revoke; DELETE /:assetId. Supports PNG/JPEG/WebP/MP4, <=32MiB, quarantine→ready/rejected→revoked/deleted. Ready requires configured inspection and rights policy; attestation is not legal verification. Optional composition remains503 by default.

## F3: workspace calendar and scheduling

GET /customer/calendar?tenant_id&project_id&from&to&limit&cursor; optional campaign_id/platform/workflow. workspace-calendar.v1 `{window:{from,to},display_timezone:"UTC",entries,unscheduled,next_cursor}`. Absolute ISO instants with offsets; from inclusive/to exclusive; nonempty interval <=93days, limit1..100. Carry exact filters with opaque cursor; do not concatenate guessed pages or cache across workspaces. Campaign discovery GET /customer/campaigns/discovery supports bounded archive-aware list; no per-campaign fan-out needed.

Scheduling remains POST /customer/campaigns/:campaignId/variants/:variantId/schedule or /reschedule with body scope,idempotency_key,expected_campaign_version,revision_id,approval_id,scheduled_for,timezone,local_datetime,utc_offset_minutes. Unschedule uses current schedule_id/version. No social publish implied.

Social overlay GET /customer/social/calendar additionally requires brand_id, returns publishing-calendar.v1 dispatches plus delivery_state (queued/publishing/uncertain/published/failed/cancelled). POST /customer/social/dispatches uses scope,connection_id,campaign_id,variant_id,schedule_id,expected_campaign_version,publishing_confirmed:true. Destination connection must be the campaign-approved destination. Returns200, not publication success. A canonical platform result requires state published + evidence_kind platform_api + publication ID/URL/time. Join overlays by campaign/variant/revision/schedule identity, not array concatenation. Manual publication remains customer_attestation; platform projections from verified_campaign_publications are read-only. Never double-count schedule, queue and confirmed result.

## F4: Hybrid lineage decision

Fetched PR189 at ae0f148f23f4e5cf2cf7823266e03bed08d992dd; compared against origin/main. Unique files: docs/implementation/BG-MEDIA-HYBRID-001.md, src/media/customerReferenceImageRouter.js, customerReferenceImageService.js and test/customer-reference-image-service.test.js. It provides fail-closed scanned reference IMAGE ingestion (10MiB, JPEG/PNG/WebP, scoped rights, cleanup). Its router is explicitly unmounted; its contract does not claim video editing or composed output. Preserve that branch/history; do not call it a complete hybrid backend.

Current219 uses CustomerMediaIntakeService with immutable object generation/SHA, durable quarantine/audit/idempotency, explicit ownership attestation and readiness/rights rechecks, supports images and MP4, then existing quoted HybridCompositionAdapter. The actual synthetic hybrid test renders changed H264 bytes using a known fixture digest; it is not a general compositor. Existing video provider submit/poll is separate. Newer rights/version/job binding should be canonical for Studio F2/F4. No blanket rebase/cherry-pick189: that would duplicate endpoints and omit newer lineage. Reuse its bounded image-sniff/scanner/cleanup lessons in existing intake; no unique verified general rendering capability was found to transplant.

Required lineage: tenant/project/brand; intake asset ID/source_kind/status/allowed_uses; immutable object generation+SHA and inspection/rights policy; generation quote/job/claim and approved model/composition engine; campaign/variant/current revision/version and Brand Brain snapshot/hash; result media generation; receipt/ack/approval provenance. Current AI-video reference admission is deliberately unsupported422 where the existing provider cannot preserve generation-pinned reference identity. General hybrid engine, true provider-specific reference support, isolation/inspection and approved spend/recovery contracts remain engineering/external prerequisites, not permission to fall back to unsafe legacy generation.

## F5: persisted learning

Existing /customer/insights routes retained: POST /objectives, POST /snapshots, POST /recommendations; GET /recommendations (scope,limit,cursor); POST /feedback. Snapshot/recommendation creation and feedback are owner writes, recommendation reads authorized members. No invented /customer/learning/insights or public observation ingestion endpoint.

New snapshots return performance-snapshot.v1 + snapshot_id/state/reason/observations. Each new row now matches canonical src/performance-evidence/contract.js: `{contract_version:"performance-observation.v1",observation,fingerprint,superseded_by:null}`. Previously persisted snapshots may lack row contract_version; preserve them as historical and accept that shape. Source fingerprints are unchanged; immutable snapshot payload/hash is never retroactively edited. New snapshots exclude expired/revoked/missing connector scopes, stale/future observations, obsolete objective versions and incompatible dictionary metadata, not just age. When fresh rows exist but none are authorized, unavailable/source_unavailable. Rejected data is not rewritten as zero metrics.

Recommendations use evidence-recommendation.v1/recommendation_id and evidence_state current|unavailable. Feedback body `{...scope,recommendation_id,decision:"accepted"|"rejected",expected_version,idempotency_key}`. No recommendation_hash authorization. Existing accepted history remains, but unavailable evidence cannot enter future context. Currentness is a point-in-time read and is rechecked on subsequent write/generation boundaries; immutable historical snapshot is not a live promise. Observational change only, causal_claim:false, no unvalidated winner. Synthetic fixtures are not actual business metrics. Customer product claims remain not_fetched/not externally verified; no automatic Brand Brain correction.

## Migration/recovery order and rollback

Preserve #213→#214→#215→#216→#217→#218→#219. BG022 migrations160000/161000/162000/163000 precede strategy164000; new proposal20261027180000 follows them. Dependencies are existing private social tables and role/security foundations. New migration adds nullable configuration_hash/redirect and display_name columns plus paired/length checks. Legacy rows preserved; no table recreation/grant broadening/RLS weakening. Old code can ignore extra columns. Bound OAuth needs new columns; without them the new configured transaction fails503/rolls back. This report does not authorize application to shared environments.

Before approved shared application: verify actual migration history/schema, role ownership/RLS/deny grants, backups+restore evidence, drain incompatible workers, review app/config/vault mapping and fresh-intent policy. Preserve column data on rollback: disable optional composition/revert reviewed application revision first; do not drop financial, media, nonce or workflow history. In-flight exchange must not be blindly replayed; retire attempt and inspect connections/vault. Credential revocation, deployments and migrations require separate approvals.

Disposable rehearsal: two newly created UUID databases on loopback PostgreSQL17.11; apply sorted existing chain+proposal to empty source; seed synthetic records, pg_dump17/pg_restore into empty target. Compare financial/BG02113 populated tables and BG02212 populated tables; verify queued strategy confirmation replay holds exactly2 synthetic credits and same job, OAuth binding, job association, platform publication and accepted learning reads. Private object bytes and managed/production restore NOT tested. Source/target dropped afterward. Initial restored learning assertion failed because the fixture supplied no connector metadata after source-check hardening; corrected explicit synthetic read scope, no assertion weakening. One new fixture table-name typo corrected to runtime_limit_activation. Full-suite freshness test initially saw valid rows from previous cases; isolated its fixture clock beyond earlier data, retaining strict unavailable assertions.

## Mission Control update manifest — proposal only

Update existing BG-STUDIO-022-BE task with this dependent branch/SHA, contract/migration/recovery evidence; link current founder BG025 work order without creating a duplicate task/register. Append new evidence for OAuth mock contract (not Meta-approved), learning correction, full/PG/restore results and API access boundary. Existing R11/social, media and learning tasks receive delivered-versus-external distinctions above. TD-STUDIO-BE-009/010 remain open for real costs/activation/provenance evidence. SRC023/024/025 and VER013/014 should link this newer draft contract after current live-row verification, preserving prior evidence; retain EV079/frontend PASS. SESSION_LOG/EOD/checkpoint should record exact restart: Claude F1 authorize_url/display_name/error wording + F2/F3/F5 harness against this code; F4 general engine and Meta contract blocked precisely above. No Mission Control writes or new IDs here.

## Local validation checkpoint

Node22.23.3, disposable PostgreSQL17.11. Full suite966/966, zero failed/cancelled/skipped (28.191s). Focused OAuth/expiry/learning/strategy9/9. Separate billing/campaign PostgreSQL57/57. Syntax313 files and git diff whitespace clean. Final populated dump/restore PASS, including preserved pending reservation and same-job idempotent replay. All provider/authorization-code exchanges synthetic. No real external call except unsuccessful public documentation/Git metadata reads. Hosted CI UNKNOWN because GitHub API Forbidden; no GREEN release claim.

Commands: `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres node --test`; focused selection in recovery log; separate node --test test/postgres-billing.integration.test.js test/postgres-campaign.integration.test.js; `BIZGENIE_DISPOSABLE_RESTORE_PROOF=1 node scripts/local-onboarding-restore-proof.cjs`. Use existing Node22 tool path, no package installation. Raw local logs under /workspace/recovery/20261027T172123Z; versioned evidence JSON supplies hashes.

## Exact-code publication checkpoint

Application/test SHA **e653ed346c41887261ff6861342e3861995edcc0**, pushed and remote-ref verified on bg-studio-025-social-contract. Full suite rerun at that exact commit with Node22 prepended to PATH: **966/966**, zero failed/cancelled/skipped,26.486s. Subsequent evidence commit changes documentation/JSON only.

Draft creation against base bg-studio-022-staged-strategy failed `Post "https://api.github.com/graphql": Forbidden`. No PR number or hosted success claimed. Authorized maintainer can open [this dependent comparison](https://github.com/shirrie01/bizgenie-api/compare/bg-studio-022-staged-strategy...bg-studio-025-social-contract) as a draft and verify both exact-head CI jobs. Prepared body: /workspace/recovery/20261027T172123Z/bg025-draft-body.md. No broader credentials requested.

Next frontend step: Claude uses this exact code for #59 authorize_url/display_name and uncertain503 wording, then F2 job/attach/receipt approval and F3 calendar+dispatch overlay, F5 canonical/historical observation rows. Live Meta configuration and general hybrid engine remain explicit unresolved work, not reasons to duplicate existing backend models.
