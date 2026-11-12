# BG-MEDIA-INTEGRATION-04 — combined media delivery

Authority: [Issue #191 work order 6838677219](https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-6838677219). Local evidence dated 12 November 2026; not deployed acceptance or programme approval. Mission Control remains canonical governance.

## Source composition

Base main: `150d028aa85e263f08f1cfb5ac146d04c7607ac1`, containing merged #205 and #206. Isolated branch: `bg-media-integration-04`.

Replay only #208 commits `f3829ed` (adapted #207 delivery) and `bf12050939817ae6da3f696808fc5a7f054d74ab` (cleanup/integration). Original #207 head: `d2ba99315d02e387e5a7dc519510b978ee9589a8`. The replay commits retain source attribution. Do not replay #208's earlier metadata/recovery commits over their merged successors.

The main versions of `creativePreview.js`, image-generation/service.js and video-generation/service.js are unchanged. Campaign repository/router and storage changes add delivery while retaining existing reference recovery and immutable job-brand binding. No migration, dependency, workflow, profile or provider activation changes.

## Additional defect and correction

Two direct adapter regressions failed before the correction: a late successful response could escape after cancellation, and an upstream error could wait indefinitely for body cancellation. `previewRequest` now rechecks abort after fetch and initiates cancellation without awaiting its potentially stalled promise. The generic generation/storage methods are unchanged. Regressions also cover disconnect before stat completes and revoked reference/output rights before storage access.

## Local validation

Node 22.23.3, disposable local PostgreSQL 17.11. Existing test container was stopped; first full run produced 709 passes and 47 cancellations from ECONNREFUSED, not a product assertion failure. After starting only the existing disposable container:

| Check | Result |
| --- | --- |
| `npm test` with TEST_DATABASE_URL | 756/756 PASS, zero skipped/cancelled |
| `npm run test:billing:postgres` | 24/24 PASS |
| `npm run test:campaign:postgres` | 23/23 PASS |
| Three focused media suites | 41/41 PASS |
| index.js and all src/test JS syntax; diff whitespace | PASS |
| Existing Chromium integration smoke | PASS |

Counts overlap; do not add them. Browser smoke uses local authenticated synthetic fixtures: metadata/head/image 200, anonymous 401, foreign 404, stale 409, MP4 byte range 206, revoked 404, foreign-origin CORS blocked, cookies omitted. It proves browser transport and PNG rendering, not deployed GCS, live customer acceptance or MP4/H.264 decoding. Provider calls in tests are deterministic stand-ins only.

## Frontend contract and security

Use authenticated metadata to obtain the scoped preview URL. Delivery is GET/HEAD `/customer/campaigns/:campaignId/variants/:variantId/revisions/:revisionId/assets/:assetId/preview?tenant_id=<tenant>&project_id=<project>&expected_campaign_version=<version>` with customer bearer token; range requests retain that token. No bucket/key or signed URL is a customer contract. Unauthenticated: 401; hidden foreign/missing/revoked media: 404; stale campaign/revision: 409. Consume the existing structured errors; never treat a preview read as acknowledgement, approval or publication.

Tenant/project/brand, current version/revision, revision attachment, immutable generation-job lineage, asset status, preview rights and MIME are checked before storage. Storage reads pin both GCS generation and ifGenerationMatch. Strict response length/range/encoding checks and exact byte counters prevent oversized or mismatched delivery. Responses are private/no-store with nosniff and sandbox headers. CORS grants only configured exact origins; preview methods GET/HEAD/OPTIONS and bearer/range headers, without cookie credentials.

Limits: images JPEG/PNG/WebP up to 50 MiB; MP4 object up to 1 GiB, transfer at most 8 MiB; 30 second deadline; four concurrent transfers per storage instance. Video over the transfer ceiling requires a valid bounded single range. This is not aggregate egress, per-tenant rate limiting or a multi-instance quota. A 32 MiB frontend blob ceiling may reject otherwise valid larger images. HEAD does not deliver a body. MP4 MIME does not prove codec/playback support.

Revocation is rechecked for each new request; an already-authorized bounded in-flight transfer may complete. Immediate mid-transfer revocation, aggregate egress control, durable cluster-wide limits and real playback remain release considerations; do not imply this source integration solves them. No credits, campaign state, generation, acknowledgement, publishing or approval changes occur on reads.

## Integration and release gates

#207/#208 remain open until this combined change is reviewed, green and merged into main. Reconcile exact incorporated patches before closing either; fresh branch CI is required, historical runs are not evidence for this head. Required review/protection must not be bypassed. This report cannot certify hosted CI or a merge before their actual results exist.

#213 and migration/runtime-dependent descendants remain on their existing application-pool role/grants/RLS/preflight gate. This media integration does not authorize shared SQL or diagnostic execution. Legal-template availability does not supply founder-approved public SUPPORT/TERMS/PRIVACY URLs; those frontend configuration decisions remain separate. No deployment, traffic, IAM/secrets, paid provider or publishing operations were performed.

Rollback before deployment is source revert through review; no schema rollback is needed. No new operational release is authorized.
