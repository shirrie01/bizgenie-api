# BG-MEDIA-INTEGRATION-003 — integration evidence and Claude contract

Engineering review only. [Google Sheets BizGenie Mission Control](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains canonical governance, with parent #191, launch #128 and Studio #197. No merge, release, deployment or founder acceptance is certified.

## Verified inputs and history

Latest main fetched and verified as `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`. Clean checkout preserved; new branch `bg-media-integration-003` starts from that main. The following Git pull-request head refs were fetched and verified, with all three source commits having that same canonical main parent:

| Source PR | Exact source commit | Integration cherry-pick |
| --- | --- | --- |
| [#205: persisted creative metadata](https://github.com/shirrie01/bizgenie-api/pull/205) | `69dd72a66650f5c69d764bef63942bc0aa25a0c7` | `fb4f4d7b19a94f3645b7db47d59e92922a44f73a` |
| [#206: reference recovery/audit](https://github.com/shirrie01/bizgenie-api/pull/206) | `63eda4aafb6bdb551a95b5ad405ae04955a8b64a` | `3c76bf8cd4270dcddd2e6d1fd92be74783d30345` |
| [#207: authenticated delivery](https://github.com/shirrie01/bizgenie-api/pull/207) | `d2ba99315d02e387e5a7dc519510b978ee9589a8` | `f3829ed96750cb739b286e6516e8ff2a9e2eee84` |

The founder reports the three drafts target main, are unmerged and have passing CI. GitHub API reads still return `Forbidden`, so target/draft/review status and CI runs cannot be independently verified here. Git refs do verify the exact source heads and unchanged canonical main. No source branch or PR was updated by this task.

Cherry-picks preserve source changes, with four overlapping files resolved explicitly: both repository methods/imports/interfaces remain; both distinct GET routes remain; PostgreSQL tests retain both metadata and byte-authorization/revocation assertions; the shared media resolver keeps its default mutation locks and optional non-locking read path. No blanket ours/theirs resolution or approval shortcut was used. Original standalone #205 and #206 implementation/tests/docs compare unchanged at their paths. #207's delivery module has only the bounded cleanup fixes below in addition to integration test coverage.

Inherited source work-order documents remain historical evidence at their respective baselines. Their statements that another PR's feature is absent are superseded by this combined contract; do not read those historical statements as the current integrated inventory.

## Combined operation and unchanged contracts

1. A brand-owned reference image passes the real rights-aware loader through the recovered job-brand handoff from #206. Tests exercise the actual image service/OpenAI adapter and video service/Veo adapter with mocked provider transports, plus the real private storage adapter and durable media store with in-memory media records and mocked GCS.
2. Generated media retains tenant/project/job lineage and is imported into an immutable campaign revision through the existing generated-media checks. The request cannot choose storage authority.
3. `GET /customer/campaigns/:campaignId/variants/:variantId/creative-preview` requires session scope, current `revision_id` and `expected_campaign_version`, and returns exact copy and bounded reference metadata.
4. `GET|HEAD /customer/campaigns/:campaignId/variants/:variantId/revisions/:revisionId/assets/:assetId/preview` separately authorizes that same scope/version/revision/asset and current rights. Media identity in a metadata response is not storage authorization; rights are rechecked for every byte/range request.
5. Storage stat and generation-pinned byte reads validate MIME/size/range. GETs do not generate, poll, issue receipts, acknowledge, approve, debit or publish. HTTP reads leave campaign state and provider-call counts unchanged.
6. Explicit submit-review, render receipt, same-actor acknowledgement and current-version approval remain required. Tested byte delivery alone cannot approve; later version changes invalidate old byte requests.

No metadata or delivery response schema was changed. #205 still returns null public URLs and a private-reference unavailable reason; these are not a promise that an authenticated delivery request will succeed. A frontend can attempt the known bounded byte operation for an eligible reference and mark its local media display available only after a successful complete authenticated transfer. The platform artifact remains unrendered: an original image/MP4 is not a platform-specific rendered preview. Hybrid input-reference versus generated-output persistence remains unresolved as documented by #206; this integration does not invent a finished UGC pipeline.

## Security findings and bounded fixes

| Finding | Result |
| --- | --- |
| Tenant/project/brand, current revision/version, reference membership, generation job/manifest and preview rights | Existing controls retained and tested together. Foreign/revoked/rightless/unbound media denied before GCS IO; metadata never substitutes for authorization. |
| GCS replacement between stat and read | Generation and ifGenerationMatch remain pinned. Test replaces the object generation after stat; the byte request fails closed, with one pinned attempt and no unpinned fallback. |
| Stalled body cancellation after an invalid upstream response | **Fixed:** cleanup initiates cancellation without awaiting an unbounded cancellation promise. Storage abort and concurrency-slot release still execute; failure returns promptly rather than occupying a slot forever. |
| A body arriving after the request deadline | **Fixed:** the abort wrapper now starts operations lazily, removes abort listeners on settlement and cancels late response bodies instead of orphaning them. |
| Request disconnected before delivery entry | **Fixed:** no storage/token work starts for an already aborted/destroyed request after its authorization lookup completes. |
| Browser authentication/CORS | Local Chromium proof uses actual cross-origin fetch/preflight, Bearer headers and credentials:omit. PNG display succeeds; HEAD/MP4 Range headers are readable; anonymous=401, foreign tenant=404, stale version=409, revoked=404. Foreign origin is blocked before storage. No admin fallback, token query or cookie authority. |
| Streaming protocol | Existing 50 MiB image/1 GiB object caps, 8 MiB per-video-transfer cap, single normalized range semantics, deadlines, backpressure, exact length validation, redirects denied, private/no-store, MIME/nosniff/CSP and route-specific CORS retained. |

The three cleanup tests failed against the combined unmodified source and pass with the fixes (initial cleanup suite 5 passed / 3 failed; fixed suite 8 passed / 0 failed). No new schema, dependency, app environment variable, response field, provider capability or infrastructure is introduced.

### In-flight revocation assessment

Each request authorizes against a consistent repository snapshot. Revoking rights after that snapshot can leave that request's already-authorized bytes in flight; an integration test revokes during stat, observes the first bounded transfer finish and proves the next request is denied without further storage access. This is not instantaneous revocation. Storage's 30-second deadline does not bound the earlier DB authorization stage or retract already delivered bytes. Multiple pre-revocation snapshots/instances and downloaded blob URLs cannot be treated as a single global revocation budget. Hard continuous revocation would require a separately approved design; no event bus, polling reauthorization or new infrastructure is added.

### Aggregate egress and availability assessment

Four concurrent operations per configured storage instance/process and per-response byte/deadline bounds limit local active work. They do **not** impose per-tenant fairness, a distributed request rate, lifetime byte limit, instance-count limit or dollar spending cap. Up to four active responses can include images of up to 50 MiB each; repeated or multi-instance requests have no total egress ceiling here. HEAD still performs metadata IO. Three sequential authorised downloads are tested to succeed, issue three reads and no new generation/debit: this is evidence of the remaining aggregate-budget gap, not cost containment.

The same authenticated tenant could repeatedly consume permitted bandwidth or occupy shared slots; revocation stops newly authorized requests but is not rate limiting. Before deployment, the owner must decide whether existing infrastructure rate/egress controls and a reviewed budget are sufficient, or authorize a separate durable/distributed quota work order. No arbitrary production quota or commercial charge was invented. GCS/runtime rates, live IAM/lifecycle and actual invoices remain unverified.

Object-generation pinning prevents a stat/read race; inherited manifest hashes cover metadata, not the media bytes. The existing write-once key convention and trusted storage-administrator assumption remain. A privileged historical overwrite preserving metadata cannot be detected cryptographically without a separately reviewed persisted generation/digest contract. No claim of stronger byte identity or production readiness is made.

## Claude frontend integration contract

- Use the existing customer session Bearer header and exact session scope on **both** metadata and byte operations. Never use admin keys, token query strings, bucket paths, raw gs:// locations or unrestricted signed URLs. Use credentials:omit when using the header-based fetch path; cookies are not media authority.
- Key UI state and requests by campaign ID, variant ID, revision ID, asset ID **and campaign version**. Fetch metadata, then HEAD if size/range information is needed, then authenticate GET/ranges. Cancel/discard late results and revoke local blob URLs on navigation, scope/version changes or errors.
- Render persisted copy as escaped text. Treat metadata unavailable/null URL as no public transport URL; do not discard a valid private reference merely because that historic field is unchanged. A failed current byte authorization overrides any earlier successful metadata response. A successful original-asset fetch does not change platform_preview.status or create approval evidence.
- Images can be fetched to a typed blob URL after full transfer, with an accessible description from persisted copy. Small MP4 can use a completed authenticated blob; larger MP4 requires explicit ranges <=8 MiB and a separately tested bounded-assembly or supported fragmented-media strategy. Native video src cannot generally carry this Bearer header and may request an oversized open range. No general MP4 playback claim is made by the range test.
- Handle 400 unsupported requests, 401 session flow, 404 unavailable/revoked, 409 clear stale state/reload campaign, 413 unsupported size, 416 range adjustment, 429 wait for earlier work and manual retry, 503/network interruption discard partial media and offer bounded retry. Do not silently show old content after an error.
- Show successfully fetched media before asserting the customer has seen it. Keep existing receipt POST, acknowledgement POST, returned preview ID and explicit approval POST with their operation keys/current version/revision. These writes increment campaign version where applicable; subsequent reads need fresh versions. Delivery must never auto-acknowledge/approve/schedule/publish. Retain wording that approval publishes nothing.
- Frontend application integration, accessibility of the actual Studio and real browser codec/playback/large-video UX still require separate frontend QA. This task changes no web repository files.

## Executed validation

Node v22.23.3, existing disposable PostgreSQL 17, local Playwright with /usr/bin/chromium. No live provider/storage credentials or paid API calls.

| Command / proof | Result |
| --- | --- |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | 686 passed; 0 failed/skipped/cancelled |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm run test:billing:postgres` | 24 passed; 0 failed/skipped/cancelled |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm run test:campaign:postgres` | 23 passed; 0 failed/skipped/cancelled |
| `node --test test/media-integration.test.js` | 8 combined-flow tests passed |
| `node --test test/media-preview-streaming.test.js` | 8 passed, including three cleanup regressions |
| `node scripts/media-integration-browser-smoke.js /usr/bin/chromium` | Passed actual local Chromium PNG decode (1px/68 bytes), metadata/HEAD, anonymous/foreign/stale/revoked denials, cookie omission, foreign-origin block and MP4 206 bytes 0–7/64 |
| `node --check index.js` plus every JS in src/test/scripts; `git diff --check` | Passed |

The optional browser script uses a preinstalled Playwright module and Chromium; it adds no application dependency or CI browser requirement. Provider transports and GCS are mocked, but image/video services, adapters, rights loader, durable media store, metadata/delivery routes and real browser fetch/CORS are exercised. The synthetic MP4 is a transport fixture, not proof of video decoding. PostgreSQL tests initialise only disposable fixtures; no application/shared migration is performed. Source work-order docs/test counts describe earlier runs and are retained as historical evidence.

## Proposed merge sequence — no merge performed

**Preferred consolidated route:** review this integration PR and exact source mapping, independent CI and security findings; after explicit human approval, an authorised owner may merge **only the integration PR** into main. Treat #205/#206/#207 as incorporated/superseded and close them without separately merging their duplicate cherry-picked patches. Preserve their source links and review evidence in Mission Control. Do not imply that approval to merge authorizes deployment or resolves the residual egress/revocation/IAM/playback review.

**If the owner instead requires original PRs to merge individually:** order #205, #206, #207 (retaining both read methods/routes and all conflict-resolved tests); then rebase/reduce the integration review to the cleanup fixes and integration tests/docs only before any final merge decision. The current integration branch is a complete bundle from main, not a ready-made delta on top of three future merges. Do not blindly merge both approaches. No original branches were rebased, rewritten, force-pushed or commented on by this task.

After either reviewed code-integration route, Claude should integrate the bounded authenticated fetch flow in its separate web branch and run actual Studio QA. A separately authorised non-production GCS/interoperability and cost-control proof is required before any deployment/activation decision. No merge, deployment, paid call, provider activation, public pricing change, production traffic change or founder acceptance claim is part of BG-MEDIA-INTEGRATION-003.
