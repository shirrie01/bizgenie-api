# BG-MEDIA-DELIVERY-002 — threat assessment and implementation contract

Authority: founder work order; [Mission Control](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains canonical. This is a non-activating implementation proposal, not deployment or launch acceptance.

## Pre-implementation inspection

Canonical main verified at `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`. New branch `bg-media-delivery-002` starts from main. Git pull-request refs #205 and #206 verified at `69dd72a66650f5c69d764bef63942bc0aa25a0c7` and `63eda4aafb6bdb551a95b5ad405ae04955a8b64a`; their source contracts/audit were inspected, not merged or changed. GitHub API PR access returns Forbidden, so current reviews/CI are not independently verified.

Existing `GoogleCloudMediaStorage` uses the configured private bucket and runtime token provider, and the activation composition already verifies uniform bucket access and public-access prevention. Existing campaign `_resolveMedia` joins asset ownership to immutable generation jobs and brand; revisions contain generation links and manifest hashes. Existing internal `download()` buffers the entire response and is unsuitable for public video delivery. Existing repeatable-read/read-only repository reads can supply a consistent scoped authorization snapshot. #205 exposes unavailable private references and does not supply bytes; this work adds a separate optional byte operation without changing its response.

## Threat assessment — recorded before implementation

| Threat | Required mitigation / boundary |
| --- | --- |
| IDOR / asset enumeration / forged scope | Verified customer identity and project:read, scoped campaign lookup, exact variant/current revision/expected version, asset membership and generation-link/manifest match, same tenant/project/brand and active campaign.preview rights. Foreign/missing/revoked denied before any storage request. Admin key alone is insufficient. |
| Storage SSRF / redirect credential leak | No client URLs/keys/buckets. Fixed storage.googleapis.com endpoint, server-configured bucket, validated canonical storage key. Token only goes to that endpoint; redirects disabled. No signed URLs or raw storage metadata in customer responses. |
| Object replacement between check and read | Stat existing private object; require stored MIME/byte metadata agreement, pin byte read to returned GCS object generation. Reject upstream status/length/range inconsistencies. No fallback to an unpinned object. |
| Memory, egress, slow transfer and range amplification | Streaming with backpressure; existing object caps 50 MiB image/1 GiB video; engineering transfer cap 8 MiB per video response; single byte range only, no multipart or excessive/invalid integers. Image ranges unsupported. Oversized full/open/suffix video ranges return 416, never silently truncate or change semantics. Total storage/transfer deadline 30s, abort on disconnect; count streamed bytes and reject short/overlong bodies. |
| Cross-origin/token/cache leak | Existing exact-origin policy, route-specific HEAD/Range CORS addition only. Authorization header, no token query field. private/no-store, Vary Authorization/Origin, nosniff, fixed safe inline filename and sandbox CSP; never reflect upstream headers or errors verbatim. |
| Stale approval / generating from a read | Read-only repository/storage methods; no receipt, acknowledgement, approval, job, debit, provider poll or generation. Existing optimistic concurrency and same-actor approval remain unchanged. |
| Revocation race / stale server authorization | Recheck DB rights for every GET/HEAD/range before storage. One bounded request uses a consistent authorization snapshot; revocation after that snapshot cannot retract bytes already authorised/in flight. No unrestricted reusable bearer URLs. Immediate continuous revocation would need a separately reviewed mechanism. |
| Provider/model or new infrastructure activation | Reuse only the existing media-enabled storage object, credentials and bucket. Default absent storage returns unavailable after authorization, without creating resources. Mocked IO tests only; do not set activation flags or access live storage. |

Safe implementation is possible without migrations or new credentials/infrastructure: expose a read-only scoped operation using the existing storage instance only when already configured. This does not enable media storage, image/video generation or any deployment. Unsupported or unavailable storage fails closed.

## Implemented request/response contract

`GET` or `HEAD /customer/campaigns/:campaignId/variants/:variantId/revisions/:revisionId/assets/:assetId/preview?tenant_id=...&project_id=...&expected_campaign_version=...`

All path identities are canonical UUIDs; scope uses existing identifiers; version is an explicit decimal integer at most 2147483647. Unknown query fields (including token/URL/bucket/key authority) are rejected. Use `Authorization: Bearer <current customer session token>`; administrator keys do not authenticate this operation.

The repository authorizes project access and loads campaign, exact current revision and generated asset in one existing repeatable-read/read-only transaction. Delivery requires an asset reference on that revision plus matching immutable job ID, output kind and manifest hash. The generated job supplies brand authority; the asset must be active with `campaign.preview` use. Storage key must equal the existing `objectKey` ownership-partition convention for that MIME/asset, and bucket must equal the already configured private storage instance. This intentionally does not extend support to customer-reference assets that the current campaign persistence contract rejects; #206's hybrid input/output issue is not bypassed.

Storage metadata is bounded to 16 KiB and validates MIME/length/object size; recorded length, where present, must agree. Reads pin `generation` and `ifGenerationMatch` to the stat result. The application receives only existing bytes, not an upstream URI or signed URL. No storage keys, bearer credentials, job IDs or provider data are returned to the customer. Existing stored manifests hash metadata, not the media bytes: this implementation relies on the existing write-once object-key convention and trusted storage administrators. Generation pinning prevents replacement *between stat and read*, but cannot detect a privileged historical overwrite with identical metadata; a persisted byte digest/object generation would need a separately reviewed persistence contract.

### Image and video semantics

- PNG, JPEG and WebP: full GET only, maximum 50 MiB, no image ranges. The streaming body uses backpressure and does not call the old buffering download helper.
- MP4: total object maximum 1 GiB. One GET response may deliver at most 8 MiB. A full GET is allowed only for smaller objects; larger objects require a satisfiable single range no greater than 8 MiB. No transcoding, audio activation or container rewriting occurs.
- Supported video ranges: `bytes=start-end`, `bytes=start-`, `bytes=-suffix`. Range normalization follows actual object size. An open/suffix range is rejected if the resulting transfer exceeds 8 MiB; never silently clamp to a smaller transfer budget. End beyond EOF is normalized to EOF. Multiple ranges, zero suffix, reversed/out-of-bounds/unsafe integers and malformed syntax return 416. `If-Range` is unsupported and returns 400; no invented validator/ETag is used.
- HEAD performs authorization and stat only, returning full length/MIME/Accept-Ranges with no byte read. Range is ignored for HEAD. Object-size and conditional-request limits still apply.
- Four concurrent metadata/transfer operations maximum per configured storage object/process; excess receives 429 before storage IO. This is a local engineering bound, not a distributed tenant quota or dollar spending cap.
- Total storage/transfer deadline: 30 seconds. Client disconnect aborts storage and cancels the upstream reader. Streamed bytes must match the exact expected length: overlong/short/error/timeout streams terminate the connection, never append JSON to media or report a fake complete success. A body failure can close the connection even before the first byte; clients must treat network failures as unavailable.

Responses use a server-controlled inline filename, allowlisted Content-Type, nosniff and sandbox CSP, `Cache-Control: private, no-store`, preserved `Vary: Authorization` and exact-origin CORS. Only this route adds HEAD/Range to the existing CORS policy and exposes Content-Length, Content-Range and Accept-Ranges. Other API CORS permissions remain unchanged. Upstream response headers, redirects and error text are not forwarded.

| Outcome | Response |
| --- | --- |
| Full media or HEAD | 200; body bytes only for GET |
| Accepted video range | 206; exact Content-Range and Content-Length |
| Invalid request or unsupported If-Range | 400 |
| Missing/invalid customer identity | 401 |
| Foreign/missing/revoked/rightless/unbound asset or campaign | Uniform 404 before storage IO |
| Stale campaign version or revision | 409 VERSION_CONFLICT before storage IO |
| Verified object exceeds image/video total cap | 413 MEDIA_PREVIEW_TOO_LARGE; no byte read |
| Unsupported/oversized/unsatisfiable range | 416 MEDIA_RANGE_NOT_SATISFIABLE, Content-Range `bytes */total`; no byte read |
| Per-process preview concurrency saturated | 429 MEDIA_PREVIEW_BUSY before storage IO |
| No configured storage, metadata mismatch, timeout or upstream failure before streaming | Sanitized 503 MEDIA_PREVIEW_UNAVAILABLE |
| Body failure after streaming begins | Connection termination; discard partial media |

No raw-media content is returned on errors. Reads issue no render receipts, acknowledgements, approvals, generation requests, provider polls, Billing debits or publishing actions. Default storage remains absent when `MEDIA_STORAGE_ENABLED` is off. Enabling that flag, provider flags, IAM or deployments is not part of this work.

## Claude frontend integration requirements

1. Use existing campaign/current revision and persisted reference IDs (or #205's reference metadata); never derive a storage URL. Construct this API route with `URLSearchParams` for session scope and current campaign version. No tokens in URLs, img/video source attributes or browser storage invented by this change.
2. Authenticated HEAD can discover authorized MIME/size and range support. Fetch image or small MP4 with the existing Bearer session header and an AbortController; validate successful status/MIME and completed transfer before displaying a local blob URL. Revoke blob URLs on replacement, unmount, scope change or error. Never insert fetched media as HTML.
3. A larger MP4 requires explicitly bounded ranges; native `<video src=api-url>` generally cannot attach the Bearer header and may ask for an unbounded range that returns 416. Do not claim generic native streaming support. A separately tested range-fetch/assembly or supported fragmented-MP4 playback path is needed, with a frontend memory limit and exact Content-Range checks. This backend does not certify codec/container/browser playback.
4. Key requests and results by campaign/variant/revision/asset/version; cancel and discard late results on any identity or version change. On 409 clear stale media and existing receipt/acknowledgement state and reload canonical campaign. On 401 use the existing session flow. On 404/413/416 show explicit unavailable/unsupported media, not a placeholder success. On 429 wait until prior work completes before retry; on 503/network error discard partial bytes and offer bounded/manual retry.
5. Display actual successfully fetched media before claiming the reviewer saw it. Keep #205's separate persisted-copy response and its platform-unrendered distinction. This endpoint supplies original asset bytes, **not a platform-specific visual render**. #205's null URL/unavailable fields are intentionally not edited by this branch; the frontend may use this operation for known references after integration is reviewed.
6. Preserve existing explicit render-receipt POST, same-actor acknowledgement, version/revision-bound approval and idempotency keys. Delivery is not a receipt and never auto-acknowledges/approves/schedules/publishes. Approval increments the campaign version, so subsequent media requests need that fresh version. Keep approval wording that nothing is scheduled or published.
7. Add actual frontend tests for loading/error/retry, stale and late results, cancellation/blob cleanup, unavailable media and keyboard/screen-reader review flow. No frontend files or browser screenshots are changed/claimed here.

## Compatibility and residual release risks

No schema, dependency, environment-variable or infrastructure additions. `mediaPreviewStorage` is an internal composition dependency pointing to the same private storage/token provider already used for references; it is not a customer/configuration field. Existing mutation media locks remain `FOR SHARE`; the new read path omits them because its transaction is read-only. This overlaps #205's small repository-lock adaptation: a future integrator must retain both distinct read methods/routes and one compatible optional-lock signature rather than overwrite either branch. No merge is performed here.

Every new range request rechecks rights. Revocation after the authorization snapshot can leave one bounded in-flight request; already delivered/downloaded bytes cannot be retracted. Local concurrency limits do not provide distributed rate limiting, a total egress budget or protection against a legitimately authenticated repeated-download workload. Those controls, storage administrator trust/IAM, lifecycle/retention, actual GCS HEAD/GET/range compatibility and existing deployed IAM must be reviewed before any deployment/activation. No live bucket or credential was accessed to prove them. The existing 30-second storage token acquisition/transfer deadline prevents waiting forever but does not establish live service availability. Full premium playback and founder acceptance are not certified by deterministic byte tests.

## Executed evidence and review gate

- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres node --test test/media-preview-delivery.test.js test/media-preview-streaming.test.js test/postgres-campaign.integration.test.js test/activation-composition.test.js`: **61 passed, 0 failed/skipped/cancelled**.
- `node --test test/media-preview-delivery.test.js test/media-preview-streaming.test.js`: **26 passed, 0 failed/skipped/cancelled**; includes exact byte-content assertions for each supported MIME.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test`: **653 passed, 0 failed/skipped/cancelled**, including PostgreSQL 17 campaign/Billing integration.
- `node --check index.js`, syntax checks of every JS file under `src`/`test`, and `git diff --check`: passed.

Tests cover authentication/admin-key rejection, tenant/project/brand/variant/revision/asset isolation, missing and revoked rights, immutable job/manifest checks, wrong bucket/canonical-key rejection, stale versions, all existing MIME types, exact bytes, HEAD without byte read, full/single/open/suffix ranges, multi-range/unsafe integer/If-Range denial, total and per-transfer size bounds, upstream metadata/header/status/encoding mismatch, source generation pinning, redirect denial, bounded metadata buffering, short/overlong bodies, deadlines and client cancellation, concurrency saturation/release, exact-origin route-specific CORS, unchanged campaign events and actual read-only PostgreSQL media resolution. Existing approval/idempotency suites also pass in the complete run.

All storage and token-provider IO in these tests is mocked; only disposable local test databases are initialised. No live GCS object, provider request, real credential, activation flag, resource, deployment, pricing or publishing action was used. No migration files or dependencies changed. PR #205/#206 remain untouched, and this branch contains neither of their commits. No GitHub CI success is asserted: API reads for #205 and its check runs returned Forbidden; current exact-head CI and draft creation need existing authorised API access. The prepared PR and source commit are separate from publication/deployment.

Confidence is high in the deterministic authorization/streaming protocol checks; live GCS interoperability, frontend playback, IAM/retention, aggregate egress controls and the documented revocation/overwrite trust boundaries remain release risks. Founder review and an independently authorised non-production interoperability proof are required before deployment or activation. No founder acceptance is claimed.
