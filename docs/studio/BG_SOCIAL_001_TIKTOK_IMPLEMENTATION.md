# BG-SOCIAL-001 — TikTok adapter implementation

31 October2026. Existing branch bg-social-001-tiktok / draft PR224, based on PR222 d2eecc3a57e93ae37697d73417718b6d5705961d. Continues the uploaded/creator-action lifecycle at0f8f3f8. **Code implemented and locally tested; no public activation, deployment, shared migration, live token exchange/upload, paid provider action or Direct Post. Staging RED / launch NO-GO.**

## Authority and source evidence

Founder supplied the official contract excerpts in this session on31 October2026 after the four current documentation URLs returned403 locally. These excerpts unblock deterministic implementation; this is not a claim that local HTTP documentation reads or live TikTok conformance succeeded. Source URLs:

- https://developers.tiktok.com/docs/en/login-kit-web
- https://developers.tiktok.com/docs/en/login-kit-overview
- https://developers.tiktok.com/docs/en/oauth-user-access-token-management
- https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info
- https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video
- https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content
- https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status

This implementation supersedes the earlier documentation403 blocker in the foundation report. Google Sheets remains sole governance; no register writes or new tasks/PRs created. No original PR222, Claude activation/composition, Veo validation, preview-profile or Studio media file changed.

## Real OAuth wire adapter

src/social-connectors/tiktok.js implements the supplied Web Login Kit contract, registered in the existing connector registry. No alternative social account store, queue or credit ledger.

- Authorization GET https://www.tiktok.com/v2/auth/authorize/ sends client_key, response_type=code, the fixed requested scopes user.info.basic,video.upload, redirect_uri and state. No client_id/code_challenge/code_challenge_method is sent to TikTok. BizGenie's internal S256 verifier/challenge remains required and persisted in the existing scoped one-use intent. Generic existing platform behavior is unchanged; only reviewed protocol tiktok_web_v2 takes this path.
- POST https://open.tiktokapis.com/v2/oauth/token/ uses application/x-www-form-urlencoded client_key/client_secret/code/grant_type=authorization_code/redirect_uri. Never browser verifier or secrets in the URL. Parses open_id/scope/access_token/expires_in/refresh_token/refresh_expires_in/token_type. Positive bounded lifetimes and actual grants required; missing video.upload is not silently accepted.
- GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url uses bearer token. data.user.open_id must exactly match token open_id. display_name validated; avatar is not persisted. Account/task IDs are opaque bounded printable data, allowing provider characters such as ~ without weakening BizGenie tenant/project scope identifiers.
- Refresh uses the token endpoint with grant_type=refresh_token and stored refresh_token. Stable account identity and granted scopes revalidated; rotated credentials encrypted and committed atomically. Access expiry does not prevent a valid refresh. Concurrent/unknown refresh cannot reuse an older refresh token.
- Revoke POST https://open.tiktokapis.com/v2/oauth/revoke/ uses form client_key/client_secret/token. Local connection/vault revocation occurs before external confirmation. Repeated retirement does not issue another revoke. Unknown remote outcome remains explicitly unknown. OAuth identity/persistence failure attempts cleanup of the new grant; failures are sanitized/audited.

HTTP redirects disabled, ambient credentials omitted, bounded10-second requests (maximum configurable30s), JSON response ceiling64KiB, no SDK/application retries. HTTP401/403/429 mapped to sanitized authorization/permission/rate errors. Invalid/malformed/error-bearing replies fail closed. No tokens, authorization codes, upload URLs or raw provider diagnostic bodies are logged or exposed in customer DTOs.

## Exact callback / frontend contract

**Intended production URI: https://getbizgenie.com/customer/social/oauth/callback/tiktok**

Absolute/static HTTPS with no query/fragment; byte-identical redirect is used for authorization and exchange. Callback remains the existing locally implemented GET relay; it is **not deployed, routed or publicly reachability-tested**. Registering a portal URI is not deployment proof. All browser return targets remain approved HTTPS getbizgenie.com paths, and bearer-owner/internal PKCE completion remains POST /customer/social/oauth-complete. Callback/query log redaction, TLS/routing and session-origin behavior must be verified before public activation.

Existing social intent/complete/read/enqueue/disconnect routes retain their envelope. Added owner-only POST /customer/social/connections/:id/refresh with scope body. Existing refresh claim/fence/version checks are reused. An ambiguous refresh leaves the claim and vault rotation blocked; reconnect with a fresh intent or approved operator recovery, never automatic retry of the old refresh token. Reconnect upserts one scoped account and retires the superseded local vault reference without remotely revoking a newly issued grant by accident. Owner revocation between exchange and connection commit rejects commit and retires/revokes the new credential.

Disconnect returns local status revoked even if external cleanup fails, with optional provider_revocation_status confirmed|unknown|previously_retired. Missing confirmation is not proof of provider-side revocation. Remote access may persist after network failure and requires portal/operator follow-up. Existing queued dispatches pin connection version; refresh/reconnect does not silently reauthorize old queued work.

## Durable encrypted vault and operation journal

src/social-connectors/postgresRuntime.js provides the durable driver for existing SocialTokenVault. New proposal20261031200000_create_private_social_connector_runtime.sql adds:

- social_token_secrets: AES-256-GCM ciphertext, random96-bit IV, authentication tag, key identifier, credential revision, immutable binding and scoped generated foreign keys, revocation and rotation fence/state.
- social_provider_operations: existing dispatch identity -> immutable optional publish_id. This is a provider-effect journal, **not another dispatch queue**.
- social_provider_rate_windows: private account/app-global rolling60-second budgets.
- social_connector_audit: append-only sanitized lifecycle events/reference/hash/timestamp; no raw credentials or vendor response bodies.

All tables deny PUBLIC/anon/authenticated/service_role and enable RLS; backend role must be reviewed explicitly. Binding/reference/revocation and operation IDs are guarded; no historical migration edited. Encryption authenticates reference, tenant/project/brand/platform/account binding, revision and key ID. Cross-scope read or ciphertext/tag tampering cannot produce credentials.

The injected keyProvider.getKey(keyId) supplies a32-byte key from the separately approved key-management design. **No production key provider, key, credential, IAM grant or resource was created/read.** Missing key/provider/schema/grants makes preflight fail before OAuth exchange. The production pool configuration accepts the encrypted PostgreSQL runtime on the same pool for vault and journal; an in-memory test store is not a production fallback.

Refresh first commits calling+fence, then makes one remote exchange. The new encrypted refresh token replaces the old one only after a matching, unrevoked fence check. Lost reply/failed settlement leaves unknown and blocks another rotation. Revocation is monotonic. External side effects cannot be rolled back: cleanup failures and in-flight revocation remain operational risks, not false exactly-once claims.

Key provisioning/approval, old-key retention, backups, rotation and deletion policy remain founder/security gates. Normal app operations do not delete token/audit history. Revoke can deny local use even when key access is unavailable; remote revocation then remains unknown.

## FILE_UPLOAD transport and recovery

Only the private FILE_UPLOAD path is implemented. No PULL_FROM_URL/public/signed-media URL is created or used.

The trusted mediaSource.loadApprovedVideo/revalidate boundary reuses Claude's existing media work. Input includes tenant/project/brand/account and dispatch actor/campaign/variant/revision/approval/schedule/current-version identity. It must validate current owner/connection/approval/rights, load private immutable-generation bytes and preserve existing inspection/profile decisions. Output is {assetId,bytes,mimeType:'video/mp4',generation,sha256}. Connector checks approved content asset membership, exact SHA and generation presence,32MiB BizGenie ceiling, and revalidates before initialization, each byte request and completion. It also rechecks active vault access before initialization/chunks. Source/connection revocation or AbortSignal stops subsequent requests; bytes already accepted/in flight cannot be recalled.

POST https://open.tiktokapis.com/v2/post/publish/inbox/video/init/ sends bearer JSON source_info.source=FILE_UPLOAD and exact video_size/chunk_size/total_chunk_count. The init journal is committed before the call; returned data.publish_id is committed **before PUT**. If the init response is lost and no ID is known, the operation stays unknown and will not initialize again. If ID persistence succeeds but worker/parent settlement fails, a reconstructed connector recovers that ID from PostgreSQL.

PUT uses the **exact returned data.upload_url** with Content-Type/Length/Range, no bearer/cookies and no redirects. URL remains memory-only; persisted journal stores no upload URL. Exact HTTPS upload origins must be allowlisted by a reviewed server policy. One-hour expiry counted conservatively from initiation; bounded requests, no automatic PUT retries. Abort after init retains reconciliation identity and never guesses a remote cancel/delete API.

Chunk policy is explicit, not invented from missing numerical constraints. uploadPolicy supplies reviewRef, chunkBytes (BizGenie request ceiling), uploadOrigins and optionally planFile(size)->{chunkSize,totalChunkCount,ranges:[{start,end}]}. A file fitting the reviewed request ceiling can use one whole-file chunk. Multipart requires the explicit reviewed plan; no guessed ceil/floor/provider minimum/maximum formula. Connector validates contiguous complete coverage/count/nonfinal sizes and a1000-request BizGenie safety ceiling. Synthetic tests use tiny ranges only as transport fixtures, not claimed TikTok media limits. Approve actual TikTok chunk/domain policy before activation.

Rolling account/app budgets: at most6 init requests and30 status queries in any60-second interval across workers/workspaces sharing that account/app. Duplicate identities do not initialize or consume another init slot. These are technical API budgets, not customer-credit prices. Existing generation quote/confirmation/debit/reservation contracts are unchanged.

POST https://open.tiktokapis.com/v2/post/publish/status/fetch/ sends bearer JSON {publish_id}. Mapping:

| Provider status | BizGenie result |
|---|---|
|PROCESSING_UPLOAD / PROCESSING_DOWNLOAD / unknown status|pending, reconcile only|
|SEND_TO_USER_INBOX|uploaded / awaiting_creator_action|
|PUBLISH_COMPLETE|uploaded / creator_completed_visibility_unverified, creator_action_required:false|
|FAILED|definitive failed|

No status creates published state, public URL or analytics evidence. Public post IDs/moderation visibility are not inferred. uploaded_at for this adapter means status confirmation observed on the server, with upload_time_source=server_confirmation_observed_at; it is not a fabricated provider upload timestamp. The immutable handoff snapshot is not continuous monitoring of future creator actions.

## Integration configuration, unchanged OFF by default

Supported metadata/credential variable names (values never shown): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_APP_REVIEW_APPROVED, TIKTOK_OAUTH_REVIEW_REF, optional TIKTOK_BROWSER_RETURN_URI. Redirect is the fixed intended URI above. App approval must be verified, not inferred from a flag; actual returned OAuth scopes are always checked. No video.publish request or Direct Post path exists; connector.publish rejects422 DIRECT_POST_DISABLED.

Existing SOCIAL_PUBLISHING_ENABLED/SOCIAL_PLATFORMS controls are unchanged/OFF. Registry factory fails closed until explicitly injected with vault, operations, approved mediaSource and uploadPolicy. Existing premium-composition connectors injection can wrap createTikTokPlatform(ctx) with these reviewed dependencies. No edits to Claude's active composition/media/profile files; agree this interface through PR224 evidence before activating it. Operations/vault use the existing PostgreSQL pool/transaction architecture.

Migration order: existing parent222 -> draft lifecycle20261031190000 -> private runtime20261031200000. Local tests apply to new UUID databases only. Before any shared application, verify actual schema/role, backup/key recovery, all-worker draft compatibility, private storage and identity isolation. Drain old workers. Rollback disables new admission and preserves columns, encrypted credentials, journal, unknown refresh claims and audit; never reset ambiguous init/refresh or remove the draft-aware database guard. A DB dump alone does not restore encryption keys.

## Remaining owner-controlled gates and handover

1. Founder/security approve key-provider provisioning, retention and recovery; no secret/IAM action implied.
2. Claude/backend wire reviewed loadApprovedVideo/revalidate to existing private GCS/media authority; do not duplicate Veo/inspection. Approve upload origin/chunk plan and concurrency/egress budgets for the target.
3. Founder verify portal Web Login Kit/Content Posting approval and actual user.info.basic,video.upload permissions, register exact callback, supply credentials securely through approved existing mechanisms. Direct Post stays disabled.
4. Separate founder approval for shared migration, staging deployment/routing/log redaction, isolated test accounts and controlled authenticated OAuth/draft-upload acceptance. No production traffic or publishing approval granted.
5. Independently inspect exact-head PR224 CI; GitHub API access remains Forbidden here. Existing verified PASS is not downgraded.

Mission Control proposal: update existing BG-SOCIAL-001/R11 checkpoint from documentation-blocked to implemented-local / activation gated; attach exact SHA, source provenance, wire/PG/restore evidence and remaining gates above. No new PR/register/task or silent governance writes. Full premium scope retained; no other connectors implemented.

## Final local evidence

Node22.23.3/PostgreSQL17.11: full **1040/1040**, zero failed/cancelled/skipped (29.072s); wire adapter **8/8**; focused OAuth/vault/upload PostgreSQL **7/7**; separate billing/campaign PostgreSQL **57/57**. Encrypted populated dump/restore **PASS**: credentials decrypt only with separately supplied synthetic key; operation identity prevents reinit after restore; uploaded drafts remain non-publication evidence. This is not managed key/GCS/production recovery proof. Twelve changed JS/CJS files syntax checked; whitespace clean. Logs/hashes in evidence JSON; no live TikTok calls.

Tests cover exact Web parameters/forms, identity mismatch/cleanup, token expiry/refresh/reconnect/revoke, owner revocation before commit, concurrent/unknown refresh fencing, scope isolation, ciphertext tampering and RLS, exact upload URL/ranges/no bearer forwarding, rejected target origins, abort/rights loss, lost-init/PUT/restart journal, rolling6/30 budgets, status semantics and Direct Post denial. Full suite retains generation/credit/worker safeguards. Hosted CI remains UNKNOWN until exact-head GitHub checks can be read.
