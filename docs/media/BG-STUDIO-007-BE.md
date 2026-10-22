# BG-STUDIO-007-BE — Instagram-feed video preview contract checkpoint

Evidence date: **2026-10-23**. This is isolated contract/test implementation, not an activated Instagram profile, platform-compliance certificate or staging acceptance. [Google Sheets BizGenie Mission Control](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains canonical governance; parent #191 / launch #128 / Studio #197. Founder direction authorizes design and isolated implementation, explicitly not live provisioning or deployment.

## Verified authority and continuation

The previous execution stopped before edits after a public-documentation network failure and a cancelled permission retry. It did not finish BG-STUDIO-007-BE. This continuation preserved existing work, fetched GitHub main and PR head refs again, and branched from #209 rather than recreating it:

| Git authority | Verified head |
| --- | --- |
| main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| #208 / bg-media-integration-003 | `bf12050939817ae6da3f696808fc5a7f054d74ab` |
| #209 / bg-studio-006-be-readiness | `6911ffc2aaa8687432b6e28fd34bdca59a40be90` |
| New isolated branch | `bg-studio-007-be-instagram-video-contract`, parent #209 |

GitHub API reads for both PRs and exact-head checks remain `Forbidden`; Git refs independently establish the heads but not CI, current draft/review state or target. No credentials were broadened. #209 contains readiness evidence and locked-boundary tests, not this candidate contract. #208/#209 source branches and main remain untouched. This draft delta should target the #209 branch to avoid duplicating its changes. If source PRs merge separately later, an owner must review/rebase the stack before choosing a merge sequence.

Read starting evidence: [consolidated integration](BG-MEDIA-INTEGRATION-003.md), [readiness report](BG-STUDIO-006-BE.md), [canonical campaign contract](../launch/CAMPAIGN_SPINE_CONTRACT.md), [accepted registry history](../launch/CAMPAIGN_PREVIEW_REGISTRY_EVIDENCE.md). Historical registry commits `4e2c676` and `79f3e31` establish the locked set and later idempotency repair; canonical main already lacks Instagram-feed video. The founder has now authorized proposing an addition, superseding #209's lack-of-design-authority blocker; unresolved technical specifications and live approval gates remain.

## Current Meta research status — do not treat unverified references as facts

The following official Meta references are the required verification targets, **not verified quotations or current numeric limits**:

| Official reference | Verification status / questions |
| --- | --- |
| https://developers.facebook.com/docs/instagram-platform/content-publishing/ | Direct read attempted during the initial execution: proxy CONNECT returned 403; permission retry was cancelled. Current content not retrieved. Confirm current feed-video versus Reels behavior and supported account/API flow. |
| https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/ | Reference location to verify; page content/date/version not retrieved. Confirm codec/container, audio, aspect, dimensions, frame rate, bitrate, duration and size requirements. |
| https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/ | Reference location to verify; not retrieved. Determine whether requirements differ by login/API path. |
| https://developers.facebook.com/docs/instagram-api/reference/ig-user/media/ | Historical media-creation reference to check against current platform docs; not retrieved. Confirm VIDEO/REELS/share-to-feed semantics rather than equating a BizGenie feed destination with a Meta media type. |

No public-web connector is available. This continuation did not bypass the earlier network denial, use a third-party proxy or request credentials. **Current authoritative Meta limits remain unresolved as of 2026-10-23.** There is no defensible source publication/update date, API version or accepted numeric limit to quote from this session. A reviewer must record the exact current official page, retrieval date, API version and relevant excerpts before provisioning. This report deliberately makes no Meta duration/size/aspect-ratio guarantee. Generic recollection and provider output settings are insufficient authority.

## Proposed immutable v1 definition

The machine-readable [candidate contract](contracts/instagram-feed-video-preview.v1.proposed.json) has status `proposal_not_provisionable`. It is loaded only by tests, never by application composition, default registries or migrations. The production entrypoint, routes, defaults and schema are unchanged. Do not copy a synthetic active test record into any live database.

| Field | Proposed BizGenie constraint; **not asserted as a Meta requirement** |
| --- | --- |
| Identity | `instagram.feed.video`, profile version 1; exact `instagram / feed / video` tuple |
| Renderer identity | `bizgenie-instagram-feed-video-preview.v1`; proposed representation contract, not a newly implemented external renderer |
| Container/video | MP4 / `video/mp4`, H.264 AVC, square pixels, zero rotation; decoded byte inspection required, MIME/extension alone insufficient |
| Audio | No audio track in initial candidate; provider has native audio disabled, but actual source bytes still need inspection. Audio-bearing assets unsupported pending a new reviewed contract. |
| Ratios/dimensions | Only 9:16 at 720×1280 and 16:9 at 1280×720. Chosen from current Veo adapter request settings, not Meta acceptance proof. Square/4:5/other sizes unsupported by this candidate. |
| Duration | Only 4, 6 or 8 seconds; initial proposed request envelope from repository video schema. Provider-returned dimensions/duration are presently derived from requests, not independently measured; no real-asset enforcement claim. |
| Size | <=33,554,432 bytes (32 MiB) total client object; each authenticated MP4 transfer <=8,388,608 bytes (8 MiB). This is a proposed Studio memory budget, not a new backend object limit or Meta limit. |
| Representation | Original asset and escaped persisted copy; no crop, transcode, Instagram chrome or simulated external render. `platform_preview.status` remains `unrendered`; preserve full image/video and letterbox if necessary. |
| Accessibility | Keyboard-operable native controls, no autoplay, accessible description using persisted copy/alt text with a meaningful fallback. Copy outside video; no reliance on color/audio alone. Spoken or meaningful audio requires a separately reviewed captions/transcript policy and is not supported by this initial silent candidate. Actual frontend QA remains required. |
| Acknowledgement | “I reviewed this campaign revision's video and copy. This preview is not an Instagram render or a guarantee of Instagram acceptance. Approval does not publish anything.” |

This is an intentionally narrow **proposal**, not a claim every existing Veo MP4 conforms. H.264 profile/level, frame rate, bitrate, color and MP4 fragmentation/layout are not yet settled. Positive byte inspection, browser decode and an accepted complete contract must precede any provisioning path. Unknown media measurements must produce unsupported/unverified states rather than inferred metadata or automatic re-encoding.

Candidate registry identity hash: `858e82f419c2efba01d40052076895e6e86c1fa1e82c05a18c5046769492babb`.
Full proposal digest: `3438970ac117a87dfd2393f7a808ec332e41831bb3948cf824cc4c179b8444ef`.

`profileHash` hashes canonical JSON for profile ID/version/platform/placement/format/renderer version only. It excludes status and does **not** hash a semantic limits document. Tests independently pin both the identity hash and the complete candidate digest. Once accepted/provisioned, representation or constraint changes require a reviewed new profile/renderer version, never alteration of an existing version. The proposal digest is a review artifact; it is not a new persisted field or automatic authorization mechanism.

## Existing receipt and approval chain

`src/campaigns/previewRegistry.js` performs exact active tuple lookup; defaults still contain seven historical profiles. PostgreSQL selects the active tuple from `campaign_preview_profiles`; no fallback exists. The registry's current renderer computes a deterministic representation digest, not platform pixels or container validation. Arbitrarily supplying a renderer label does not implement that renderer.

A receipt binds scoped campaign/variant/revision, revision content hash, tuple, profile identity/hash, renderer, input hash, digest and server time. PostgreSQL also binds the rendered-by actor in receipt persistence/idempotency. Acknowledgement resolves a trusted receipt, checks current revision/content/tuple and active profile, and records the observing actor. Approval requires the same actor's acknowledgement, current campaign command version/revision, current media rights and active matching profile. Editing creates a new revision, invalidates approval and cancels a schedule. Reads/downloads cannot replace acknowledgement or approval.

The test helper permits explicit synthetic profile injection and a chosen platform **only in test fixtures**. Tests prove candidate identity can travel through the existing chain; they do not prove codec/media eligibility, renderer implementation, Meta compliance or provisioning safety. Synthetic provider/GCS transports incur no paid calls.

Security residual: render/acknowledgement alone do not continuously reauthorize media bytes. The media-delivery route and approval recheck current rights; a receipt never grants storage authority. An explicit acknowledgement is human attestation, not server proof of playback. In-flight revocation and previously downloaded bytes retain the limitations in #208/#209. No safeguarding checks were removed.

## Separately reviewable durable provisioning design — not implemented

Because current specifications and inspection authority remain unresolved, the work order explicitly requires stopping **before provisioning logic**. There is no SQL seed, migration, provisioning CLI, auto-registration flag or startup writer in this change. Historical migration and locked profile rows remain byte-for-byte unchanged.

After specification acceptance, a separately reviewed work order should implement:

1. An immutable reviewed manifest shared by a test registry and an explicit offline owner-operated provisioner, with deterministic identity/contract digests. Separate code acceptance from founder approval to run it against a named environment.
2. Read-only preflight of environment/database fingerprint, existing schema/privileges, exact tuple/version and historical rows. Detect unexpected active profiles, hash/renderer mismatches and prior revocation as conflicts. Do not reactivate a revoked row via retry or silently replace a different version.
3. A transaction whose first application is insert-only; exact pre-existing identity/status may be an explicit no-op. Any differing content/status fails closed with no update/upsert overwrite. Address concurrent invocations and the existing unique-active-tuple index. Grant no browser/service-role direct table access and create no admin HTTP endpoint.
4. Test against a disposable existing-schema PostgreSQL installation: first application, exact retry, mismatch, revoked conflict, concurrent calls and rollback atomicity; test parity with the explicitly configured in-memory registry. Preserve all seven original hashes. No approved source version may silently enable a missing deployment profile.
5. Record operator approval, environment fingerprint, manifest hash, row ID/version/hash and outcome in the existing governance evidence without credentials. Live application remains an explicit founder-controlled action.

Future operational rollback: disable the new profile through an approved revocation process rather than deleting immutable history or resurrecting an old version. Confirm new acknowledgement/approval/attempt-start is blocked, and preserve truthful resolution of already pending manual attempts. Rollback code and database/profile state are separate decisions; a code rollback alone may leave a profile row active. This branch has no runtime effects to roll back.

## Claude contract — existing APIs unchanged

Use the scoped authenticated metadata and byte routes in [the consolidated contract](BG-MEDIA-INTEGRATION-003.md#claude-frontend-integration-contract). No new DTO, profile-status endpoint or error code is introduced here. States below are UI interpretations, not new API enums:

| State | Frontend behavior |
| --- | --- |
| Profile unavailable (`409 PREVIEW_VERSION_UNAVAILABLE`) | Explain unsupported/unavailable destination preview; no blind retry/reload loop, no acknowledgement/approval. This remains expected for Instagram video in current defaults. |
| Version conflict / wrong revision | Discard old requests/blobs; reload current campaign and require fresh revision-bound review. |
| Original private media eligible for attempted delivery | Authenticate metadata/HEAD/GET using current scope/version. Null public URL does not mean a signed/public URL should be invented. |
| Unknown codec/audio/measurements or >32 MiB | Do not label candidate-compliant or assemble an unbounded blob. Unknown inspection evidence is a blocker, not inferred H.264. No new machine-readable conformance field is available yet. |
| Transfer ready | Use explicit ranges <=8 MiB, verify total size/completeness and bounded client memory; cancel/discard partial or stale transfers and revoke blob URLs. Native video src does not carry the required Bearer headers. |
| Playback succeeded but platform artifact unrendered | Display original asset/copy with controls and accessible description; keep “not an Instagram render” wording. Playback never auto-acknowledges/approves. |
| Revoked/foreign/unavailable (`404`) | Clear displayed content, block approval; do not fall back to old blob, bucket key or public URL. |
| Auth refresh / interruption / 429 | Established session refresh and bounded retry with fresh authorization; discard invalid partial results. No token in URL or cookie fallback. |

Only after a separately accepted and provisioned contract may Claude present its candidate-specific acknowledgement wording. The existing explicit receipt → acknowledgement → approval operations and operation keys remain; writes can advance the campaign version, requiring refreshed read parameters. No publishing capability is added.

## Recovery and delivery-limit engineering proof

The requested next-task check does not reveal work already complete in #209: that PR stopped before defining this candidate. Nevertheless the candidate security tests also establish a safe revoked-media recovery path. After explicit approval, revoke media rights/status, then the owner can explicitly revoke the approval without restoring those rights. The variant returns to Review; reapproval fails. A new Draft revision can remove the revoked asset while preserving historical revision/approval evidence. Submission remains blocked without valid replacement content. No production recovery shortcut or automatic rights restoration was needed or added. Replacement and new review must use a separately authorized active asset and fresh evidence.

Deterministic range analysis (not a network/codec/memory benchmark): the exact 32 MiB candidate ceiling needs four adjacent <=8 MiB ranges. Open full-object requests and 8 MiB+1 responses are rejected with 416. The backend still accepts a bounded range from a 32 MiB+1 object; the proposed client ceiling is **not enforced server-side**. Existing backend video cap is 1 GiB, potentially 128 full 8 MiB transfers. Four active operations per storage instance/process bound local concurrent work only, not tenant/lifetime/multi-instance egress. No total egress budget or dollar cap was introduced. These remain staging gates in #209, as do actual H.264 decode/seek/mobile-memory and token-refresh tests.

## Validation and checkpoint

Local results are recorded after execution below. Disposable PostgreSQL fixtures initialize existing schema only for tests; no staging/shared schema or live profile is provisioned. No deployment, IAM/resource change, provider activation, publishing, paid generation, main change or source PR update occurred. Security findings and the provisioner design require owner review; this report does not self-certify staging or launch readiness.

| Executed local check | Result |
| --- | --- |
| `node --test test/instagram-video-preview-contract.test.js` | **15 passed**, 0 failed/skipped |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **710 passed**, 0 failed/cancelled/skipped |
| Same local URL, `npm run test:billing:postgres` | **24 passed**, 0 failed/skipped |
| Same local URL, `npm run test:campaign:postgres` | **24 passed**, 0 failed/skipped; includes new real PostgreSQL historical seed/hash parity and candidate-absence check |
| `node scripts/media-integration-browser-smoke.js /usr/bin/chromium` | Passed actual local Chromium PNG decode, metadata/HEAD, anonymous/foreign/stale/revoked denial, cookie omission, foreign-origin block and synthetic MP4 byte-range 206 |
| JavaScript syntax / diff whitespace | Passed |

Node v22.23.3 and local PostgreSQL 17. Initial focused tests exposed three test-fixture lookup mistakes, corrected before the above successful run; no production defect or safeguard bypass was needed. The new tests include independent identity/contract hash checks, all historical seed hashes, default fail-closed resolution, same-actor approval, stale version/revision, revoked profile acknowledgement/approval, revoked media/rights before byte access, foreign receipt/media access, unsupported tuple, the 32 MiB range boundary and explicit revoked-media approval recovery. PostgreSQL tests do **not** insert the proposed profile: provisioning logic remains deliberately unimplemented.

Local logs are retained at `/workspace/.onboarding/bg-studio-007-{contract,full,billing,campaign,browser}.log`. GitHub CI is unverified: source check reads were Forbidden, and `.github/workflows/ci.yml` runs feature work through PR events rather than arbitrary feature-branch pushes. A successful Git push alone does not establish a CI run. The report and `docs/mission-control/README.md` record this engineering checkpoint; the canonical external Sheet was not modified.

**Checkpoint:** GREEN for these local deterministic checks; AMBER for proposed contract/implementation preparation; RED for live provisioning, deployment or Instagram platform-compliance claims until current Meta specifications, byte inspection, representation/frontend QA, egress controls and separate founder approval are resolved. Next actions: obtain the official requirement evidence, accept/finalize the candidate and metadata authority, then authorize reviewable provisioner implementation/testing. Do not rerun research or recreate #209 merely to restate its gates.
