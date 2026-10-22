# BG-STUDIO-006-BE — profile investigation and staging gate report

Engineering evidence, 2026-10-22. **Overall RED for the requested Instagram-feed video staging E2E; AMBER for consolidated backend readiness.** Local passing tests are not deployed E2E, founder acceptance or authorization to activate. [Mission Control](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains canonical governance. Parent authorities: #191, #128, #197.

## Authority and isolation

Fetched GitHub main and pull/208/head before edits. Main remains `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`; #208 and `bg-media-integration-003` both remain `bf12050939817ae6da3f696808fc5a7f054d74ab`. No superseding branch/ref commit was observed. Work is isolated on `bg-studio-006-be-readiness`, directly from that #208 head. Original #208 and incorporated #205/#206/#207 branches are untouched. Incorporated history and source-to-cherry-pick mapping are in [BG-MEDIA-INTEGRATION-003](BG-MEDIA-INTEGRATION-003.md).

GitHub API requests for #208 and its exact-head check runs return `Forbidden`. Git refs establish commits, not draft status, approvals, target or successful CI. No broader credentials were requested. Live cloud inventory is unavailable in this session (no gcloud CLI); no cloud credentials, tokens, personal accounts, buckets or live database were inspected. Source requirements below must not be mistaken for observed resource configuration. Historical September staging evidence is explicitly not current inventory.

## A. Root cause and product decision — no profile repair applied

`src/campaigns/previewRegistry.js` resolves an **exact active platform/placement/format tuple**. In-memory defaults and `supabase/migrations/20260908100000_create_campaign_preview_registry.sql` agree: Instagram feed text/image; TikTok feed video; YouTube shorts video; Facebook feed text; LinkedIn feed text; email message text. Instagram feed video has no registered profile. A review variant therefore reaches `PREVIEW_VERSION_UNAVAILABLE` (HTTP 409) before a receipt is issued. This is distinct from a stale campaign version/revision, failed generation, absent media or revoked rights.

The same registry exists on canonical main; #205–#208 did not remove an Instagram video profile. Historical commit `4e2c676` introduced the registry; `79f3e31` repaired receipt idempotency. [Registry evidence](../launch/CAMPAIGN_PREVIEW_REGISTRY_EVIDENCE.md) explicitly describes the **locked v1 profile set**, with profile administration a separate review point before staging activation. [Canonical contract §3.3](../launch/CAMPAIGN_SPINE_CONTRACT.md) allows review without a profile but requires approval to fail closed, immutable versioned profiles and no automatic replacement. Its platform enum does not promise provider/platform integration support.

Consequently Instagram-feed video is a representable campaign destination, but **not an established trusted preview profile under the current repository contract**. Neither general MP4 generation nor authenticated byte delivery authorizes that profile. There is insufficient authority to declare its renderer constraints approved. A memory-only addition would also leave PostgreSQL production composition broken; changing the historical migration would not update existing installations. No such partial repair, new migration, profile insertion, platform retargeting or publishing activation was performed.

Required owner decision:

1. Keep the locked set: show an actionable unsupported-preview state; permit only separately authorized existing supported tuples. Do not silently switch an Instagram variant to TikTok or approve without evidence.
2. Approve a new Instagram-feed video preview contract: specify supported source/container/codec/dimensions/duration, representation and acknowledgement wording, renderer identity/version and review owner. Then authorize a separate immutable profile provisioning mechanism for both existing PostgreSQL and test registries. Review deterministic profile hash/seed parity, no mutation of existing versions, revocation, stale receipts and same-actor approval tests. This would be an explicit contract/provisioning work order, not a no-migration repair authorized here.

Existing trace remains intact: generated asset → tenant/project/brand-bound generation job and manifest → current campaign revision reference → current preview rights → exact profile → receipt → same-actor acknowledgement → current-version approval. `src/campaigns/repository.js`, `src/campaigns/mediaPreviewAsset.js` and the registry enforce these different boundaries; downloading bytes issues no receipt or approval. Added tests characterize supported image/video tuples, invalid tuple fallback denial, tenant scope, stale revision and revoked profile receipt replay. Existing integrated tests cover revoked media, removed rights, brand/job lineage, stale version, private storage and explicit approval. Test-only fixtures do not assert that synthetic assets satisfy real platform video specifications.

## B. Read-only staging requirements inventory

Every live status below is **UNKNOWN / not inspected**. No resources, IAM, traffic or schema were changed. Historical `docs/activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md` names `bizgenie-api-staging` and revision `bizgenie-api-staging-00021-5fd`; neither is confirmed current or suitable for this code.

| Boundary | Required evidence before a separately authorized staging E2E | Repository evidence |
| --- | --- | --- |
| Cloud Run | Dedicated staging service/revision, reviewed image digest/commit, service identity, nonproduction bindings, current traffic map, max instances/concurrency/request timeout and ingress limits; no production traffic migration | `src/activation/config.js`, `productionComposition.js`; deployment settings not established by code |
| Supabase/session | Dedicated staging issuer/audience/JWKS, two synthetic tenant accounts, owner/member roles, expired-token and refresh proof, no production users; test authorizer graph and unauthorized/foreign scope | `src/authentication/tokenVerifier.js`, `src/authorization/{service,policy,postgresRepository}.js` |
| PostgreSQL | Dedicated staging DB already at reviewed existing schema; verify campaign revisions, preview profiles/receipts, authorization graph, generation_jobs, media_assets, durable video/billing tables and privileges/RLS. Seed only synthetic owned campaign/brand/job/media fixture through an approved process; record active exact profile | `supabase/migrations/`, `src/campaigns/previewRegistry.js`, PostgreSQL tests; no schema changes authorized here |
| Private GCS | Dedicated staging bucket, uniform bucket-level access, enforced public access prevention, least-privilege staging service identity, write-once application keys, no public/signed URLs; verify object MIME/size/generation and replacement race with safe fixtures | `src/media/storage.js` validates bucket settings at initialization, pins generation and ifGenerationMatch; IAM/lifecycle/version retention unverified |
| Browser/CORS | Exact staging web origin, Bearer on metadata/HEAD/GET, credentials omitted, Range preflight and exposed response headers; token refresh discards stale partial blobs and retries with newly authorized requests | `src/activation/cors.js`, browser smoke script; refresh and actual Studio integration not proven |
| Delivery limits | PNG/JPEG/WebP, bounded MP4; images <=50 MiB, video object <=1 GiB, <=8 MiB per transfer; single range only, no If-Range, 30-second storage deadline, four operations per storage instance/process | `src/media/previewDelivery.js`; not a distributed quota or whole-request DB deadline |
| Billing/provider safety | Existing durable billing configured and reconciled, synthetic entitlements/policy/reserve/debit/release fixtures; provider generation disabled for preview-only E2E; verify approved configuration without emitting secrets | `src/billing/productionComposition.js`, `src/generation-billing/service.js`, activation composition; media storage and image/video generation are distinct flags |
| Isolation/observability | Staging-only identities/DB/bucket, redacted error/request/byte/latency/429/5xx telemetry, no Bearer/body/bucket keys in customer logs; existing owner-operated budget/rate alarms and abort criteria | Sanitized delivery errors exist; current logging, retention, alarms and edge limits not verified |

`BIZGENIE_ENVIRONMENT=staging` is a required environment boundary, not evidence of isolation by itself. Do not enable `PRODUCTION_ACTIVATION_ENABLED`, image/video generation or external publishing for this preview test. Any need to provision credentials/resources/IAM, apply missing schema or fund egress is a separate approval boundary. Durable credit accounting protects generation economics; it does not meter preview download bandwidth.

## C. Threat, performance and release risk register

Threat assessment precedes any production-code change; this branch changes tests/documentation only. Untrusted customers may forge scopes/IDs/versions/ranges, replay receipts or retain already downloaded content; storage can race replacement or stall; an authorized tenant may exhaust bandwidth. Trust remains in server authorization, database integrity, the configured private storage adapter and trusted storage administration. No production behavior change was justified within the current profile authority.

| Risk | Severity | Mitigation / staging release classification |
| --- | --- | --- |
| Missing Instagram feed video profile | High functional | **Blocker for that workflow**: owner contract decision and approved durable profile provisioning; never bypass 409 or reuse another profile |
| Cross-tenant/brand/revision/job/right forgery | High security impact, deterministic controls pass | Keep scoped membership, current revision/version/reference and rights checks before storage; staging two-tenant proof required |
| In-flight revocation | Medium confidentiality residual | Recheck on every range/request; existing authorized response may finish after revocation and downloaded bytes cannot be recalled. **Owner acceptance blocker** if instantaneous revocation is required. Cancel browser requests/revoke local blob URLs; no claim of continuous revocation |
| Aggregate egress / shared-slot exhaustion | High cost/availability | Four process-local slots and transfer caps do not bound repeated reads, tenants or replicas. **Blocker absent reviewed existing edge/rate/budget/max-instance controls**; no new quotas or spending authority invented |
| 32 MiB client ceiling mismatch | High UX/memory | Backend allows larger objects. **Frontend integration blocker**: HEAD and reject >32 MiB total before downloading/assembling; track cumulative unique bytes, avoid unbounded Blob assembly, discard partials. <=8 MiB range is not <=32 MiB object. Do not silently truncate or transcode |
| MP4 does not prove H.264/browser playback | Medium compatibility | MIME/extension are not codec evidence; synthetic MP4 transport tests do not decode. **Playback E2E blocker**: approved existing nonpersonal H.264/MP4 fixture, actual desktop/mobile decode/seek/end test and bounded transfer; no paid generation |
| Storage replacement / byte identity | Medium integrity residual | Stat/read generation pin rejects races. Manifest hashes metadata, not bytes; historical privileged overwrite cannot be detected. Retain write-once IAM/admin trust; require separately approved digest/generation persistence if stronger identity is required |
| Slow DB or client / cancellation | Medium availability | Existing streaming cleanup/backpressure/30s storage deadline tested; DB authorization precedes deadline. Verify deployed request/DB timeout and cancellation behavior; storage-slot cap is not an authorization-query cap |
| Authentication/CORS/expired token | High if misconfigured | Exact origins, explicit Bearer, no query token/public URLs. Local CORS proof passes; actual Supabase refresh and deployed origin remain **staging verification blockers** |

Worst permitted local active image payload is 4 × 50 MiB (200 MiB transferred, not claimed resident buffering); videos 4 × 8 MiB (32 MiB) per simultaneous response set. Replicas/retries make aggregate egress unbounded. Estimate spend only from measured requests × bytes plus GCS operations/runtime at approved regional rates; current rates, traffic and owner budgets are unverified. No grounded total dollar estimate can be supplied from this source checkout.

## Claude contract and approval wording

No endpoint/response schema changes. Follow [combined frontend contract](BG-MEDIA-INTEGRATION-003.md#claude-frontend-integration-contract). On `PREVIEW_VERSION_UNAVAILABLE`, explain the destination profile is unavailable and keep acknowledgement/approval blocked; do not treat all 409s as a version refresh loop. Original media delivery remains separate from a platform-rendered artifact. Fetches do not acknowledge, approve, charge for generation or publish. Keep explicit wording that approval publishes nothing.

Add the client 32 MiB object ceiling check to the integration plan, not backend capability claims. HEAD and authenticated ranges require the same current scope/version; refresh tokens through the established session flow without stale-byte fallback. Cancel/discard late results on scope/version changes. Native video src cannot attach this Bearer contract; complete bounded authenticated Blob transfer or an independently tested media strategy is needed. Actual H.264 playback, mobile memory, retry/refresh UX and accessibility require Claude's separate web evidence. No message was sent to Claude; this report and any resulting draft are the documented handoff, pending GitHub availability.

## Approval checklist and rollback plan

Before proceeding, owner must record in Mission Control: chosen profile option and contract owner; permitted staging commit/image and isolated service/DB/bucket/identity; verified existing schema and synthetic fixtures; authenticated two-tenant browser matrix including revocation/refresh/version conflicts; <=32 MiB sample and codec evidence; accepted revocation residual; egress/instance/rate/budget constraints; observability and named stop/rollback operator. Approval of this report does not authorize spending, activation or deployment.

No runtime changed, so this work needs no operational rollback. For a separately authorized future staging trial: record prior revision/traffic/config and fixture IDs before starting; stop test clients on cross-scope leakage, rights bypass, budget/429/5xx or decoder/memory failure; an authorized operator may restore the previously approved staging revision/config and revoke only synthetic test sessions. Do not alter production or delete audit evidence. Feature-off behavior and rollback must be proven without exposing secrets. Any traffic or IAM action remains outside this work order.

## Validation and publication

Results are recorded below after execution. Test PostgreSQL schemas are disposable local fixtures only, not a staging/shared migration. Providers and GCS are mocked; local Chromium is a real browser against local fixtures. No deployed E2E was performed. GitHub CI must be verified at the final pushed SHA by an authorized owner if API access remains forbidden.

Executed on Node v22.23.3 with disposable local PostgreSQL 17:

| Validation | Observed result |
| --- | --- |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **694 passed**, 0 failed/cancelled/skipped; includes 8 new profile-boundary tests |
| `npm run test:billing:postgres` with same local test URL | **24 passed**, 0 failed/skipped |
| `npm run test:campaign:postgres` with same local test URL | **23 passed**, 0 failed/skipped |
| `node scripts/media-integration-browser-smoke.js /usr/bin/chromium` | Passed actual Chromium: metadata/HEAD 200; PNG decoded 1px/68 bytes; anonymous 401, foreign 404, stale 409, revoked 404; MP4 range 206 bytes 0–7/64; foreign origin blocked; cookies omitted |
| `git diff --check` | Passed |

**GREEN**: the above local deterministic and disposable PostgreSQL checks. **AMBER**: backend integration evidence with explicitly retained egress/revocation/storage trust assumptions. **RED**: Instagram profile workflow and permission to begin a controlled staging E2E until the profile decision, infrastructure evidence, client-size/playback and cost/isolation gates are resolved. No actual deployed E2E, independent GitHub CI or founder acceptance is claimed. No production source, schema, provider settings or frontend files changed.
