# BG-STUDIO-019 — backend/frontend integration checkpoint

26 October 2026. **Staging RED / launch NO-GO. Partial engineering delivery, not full-premium completion or founder acceptance.** Canonical operational authority is sole Google Sheets Mission Control (DEC-015). DEC-014/020–025 are founder-supplied authority; their latest Sheet rows/comments were not independently accessible. No operational approval inferred.

## Recovery and canonical reconciliation

Previous execution stopped with professional-services changes uncommitted, restore repair `22c8642` committed locally, and a new fixture ReferenceError. Existing work was preserved, inspected and finished; no old audit or original PR branch was rewritten. The fixture's client declaration/transaction handling was repaired without weakening assertions. The sector discrepancy was real: #50 source used `professional`; #51 corrected it against the earlier backend proposal to **`professional_services`**. New backend enum, CHECK migration, strict manifest, HTTP/PG tests now use only that canonical key. Neither unshipped spelling required a live data rewrite.

Native git fetched current main/PR heads and frontend source. Verified backend main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`; #213 `120a874dfa02313a8c28dad82ddb6582f0065469`; #214 `51e8ca493be1bfd6b45da1cb540d4bc090de2a85`; #215 `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b`. Frontend #50 `f25c1f3d271e4f8c13943bef5d590c2c39bf467c`; #51/report `0c3078c5b5f4e590c00fa567acfec7a087d75596`. No published frontend BG-STUDIO-019 branch was seen in the inspected remote heads; Claude may have unpublished work. Native git does **not** verify PR draft/base/review/CI metadata.

GitHub REST/GraphQL reads of PR215, frontend51, issue191/comments, open PRs and CI returned **Forbidden**; latest Issues128/191/197 and decisions therefore remain access-blocked, not reconstructed from historical reports. Existing backend #215 CI40136091719 is founder-verified history, not evidence for these new heads. No GitHub/Sheets credentials were requested or broadened. No Mission Control task/row was created, duplicated or repaired without readback.

## Engineering branches (sequential dependencies, original branches unchanged)

| Branch | Exact SHA | Delivered state |
|---|---|---|
| bg-studio-016-restore-reliability | 22c8642d3904a720e4bf8965f92473d57d6456e4 | Exact restore-CHECK rendering allowlist; weakened bound denied |
| dec-023-professional-services | adc9b41a0b7dd1043af64cce92e05d5ee092df4d | Canonical enum, additive unapplied SQL, dual reviewed manifests, old-schema transition |
| bg-studio-019-workspace-calendar | 2a03bc703dc6dc34cb1d6aec619cc7b842242dbf | Authenticated paginated scoped calendar |
| bg-studio-019-commercial-contracts | bb7aa6833f24bc991a6298a97adabe779d14c825 | Fail-closed catalogue contract, read-only cost preview, unmounted/disabled mock billing management |
| bg-studio-019-dependency-repair | bbb919e2fabcb830fc00154ae2828858138e6593 | Compatible security patches; two moderate dependency nodes remain |
| bg-studio-019-campaign-read-batching | 92358895abb2c243663e352ff40887156463166e | Fixed-query aggregate reads, exact projection parity |
| bg-studio-019-restore-proof | b659530dfb6c0cd3614b77b4f57967764d2f15cd | Explicitly local pg_dump/restore rehearsal |
| bg-studio-019-campaign-management | 88db0c34ec60b73e9e12c0c04a9f0a06f2dd1ae7 | Existing unschedule command exposed |
| bg-studio-019-backend-integration | Commit containing this report | Combined review branch, based on above and original #215; no merge/deploy |
| bg-studio-016-staging-isolation-recovery | 2560621d164ffc9e222aaf6dfe2731c35ecf96a0 | Separate S1 operator/reviewer/cost package, no product code |

The existing calendar validation `f8a7dba0bb97accdc23c04bf68805990d0672c6f` and documentation6279832 remain in the ancestry. These branches do not inherit the media/runtime drafts unnecessarily. In particular #208 `bf120509…` is **not an ancestor** of this onboarding/product branch. Frontend creative-preview/media features that depend on that stack are not integrated merely because their routes exist elsewhere. The chosen smallest current base is #215 plus preserved calendar work; separate future media integration must reconcile schema/profile/runtime dependencies and run their full contracts, without changing original draft branches or activating inspection.

## Five mandatory directions and Claude handoff

| Capability | Endpoint / contract | State and evidence | Next frontend/dependency |
|---|---|---|---|
| Professional services | workspace-onboarding.v1 + professional_services | Implemented; 63 focused HTTP/PG tests, included full suite | Keep VITE_PROFESSIONAL_SECTOR_PERSISTED off until compatible schema/backend separately approved/verified; see sector report |
| Pricing/terms | GET /customer/billing/plans; commercial-catalog.v1 | Schema/adapter implemented; deterministic synthetic tests; default503, **no approved catalogue** | Consume only approved server output; founder must supply locked canon, terms/tax/Stripe mapping |
| Workspace calendar | GET /customer/calendar; workspace-calendar.v1 | Implemented; bounded93-day/100-row pages; PG projection/cursor/isolation tests | Replace #51 eight-campaign fan-out; follow all pages, reset on scope/filter change; see calendar report |
| Billing management | Draft factory: POST /customer/billing/management/{portal-session,subscription/change,subscription/cancel} | **Unmounted/disabled**, mocked hosted flows only; no entitlement mutation | Do not call as a shipped route. Commercial and portal configuration/policy, durable intent/claim recovery and integration review first |
| Credit cost preview | GET /customer/billing/credit-preview; execution-cost-preview.v1 | Implemented read-only policy/balance preview, no reservation/provider/debit; concurrency read tests | Can show informational preview, **cannot claim quote confirmation/spend protection** |
| Quote/confirm | Durable contract in commercial report | **Not implemented**; no signed binding quote or mandatory execution gate | Must atomically bind job/request, tenant/project/brand/actor, policy/cap/expiry, reservation and durable execution claim before UI enables chargeable confirmation |
| Image/video generation | Existing POST /customer/generate-image and /customer/generate-video; video GET /:generationId and POST /:generationId/poll | Existing adapters and mocks preserved; not executed against providers | Reuse exact schemas; do not assume campaign image/video orchestration or private delivery is integrated here |
| Hybrid UGC | Existing campaign variant /generate with execution_mode and supplied_assets | Text generation accepts authorized existing image references; **not full audiovisual composition/upload** | Rights-aware intake/selection and immutable private media binding still required; see below |
| Campaign management | Existing PATCH campaign, archive/restore, manual attempt confirm/fail/cancel; added unschedule | Existing contracts verified; new HTTP plus shared PG/memory unschedule regressions | See management report; manual evidence never means platform verification |
| Publishing | Existing schedule/reschedule records a plan; no OAuth/scheduler publisher | **Not implemented as autonomous/social publishing** in this stack | Separate provider-specific connection, token lifecycle, permission and scheduled-worker contracts/activation review |
| Learning/analytics | Existing measurements and goal registry | Customer attestation only; no authoritative ingestion or autonomous Learning Brain | Do not label attested results verified or invent performance; #204 remains separate |

Exact request/response fields, permissions, errors, CAS/idempotency and compatibility for new implemented endpoints are in `BG_STUDIO_019_SECTOR_CONTRACT.md`, `BG_STUDIO_019_WORKSPACE_CALENDAR.md`, `BG_STUDIO_019_COMMERCIAL_CONTRACTS.md`, `BG_STUDIO_019_CAMPAIGN_MANAGEMENT.md`. All customer routes retain existing private/no-store + Authorization variance. No frontend file or PR was changed.

## Existing media contracts and bounded integration requirements

Sources: `src/image-generation/{schema,router,service,openaiProvider}.js`, `src/video-generation/{schema,router,service,googleVeoProvider,referenceAssetLoader,assetStore}.js`, `src/media/{schema,repository,storage}.js`, `src/generation-jobs/*`, `src/generation-billing/service.js`, `src/campaigns/generation.js`.

* Image request schema: execution_id, generation_id, optional parent_generation_id, project_id, optional brand_id/campaign_id/content_item_id, topic, image_purpose, aspect_ratio (1:1/4:5/9:16/16:9), optional platform/audience/goal/intent_stage/product_service_context/additional_context and up to5 reference_assets {asset_id,...legacy optional metadata}. Customer boundary takes tenant_id for authorization and overwrites user_id from the verified actor; caller identity is never authority. Immutable job creation and request fingerprint/idempotency remain mandatory. Response `{status,execution_id,generation_id,media:{provider,provider_job_id,asset,aspect_ratio,approval_status,created_at,completed_at}}`. This older response is **not the private customer media-delivery contract** from #208.
* Video request reuses above context, with video_purpose, quality normal/premium, aspect_ratio16:9/9:16, duration_seconds4/6/8 and optional input_image {asset_id,...legacy metadata}. Service resolves rights/scoped private reference; never trust client locations. POST returns202; GET/poll use existing scoped job status and settle/release existing ledger effects, not a new debit per poll. Response `{status,execution_id,generation_id,video:{parent_generation_id,quality,aspect_ratio,duration_seconds,approval_status,asset,created_at,updated_at,completed_at}}`. These are repository contracts, not new authoritative provider guarantees.
* Shared billing failures:402 `GENERATION_CREDITS_UNAVAILABLE`,503 `GENERATION_BILLING_UNAVAILABLE`; boundary401/404/503 with kind-specific null media/video/script fallback. Exact other request/provider failures are defined by existing per-media errors. Do not invent a universal retry rule: replay only the exact same immutable job/request; ambiguous paid execution requires reconciliation.
* Campaign POST `/customer/campaigns/:campaignId/variants/:variantId/generate`: scope/idempotency/expected_campaign_version, execution_mode ai/human/hybrid (defaultai), optional execution_brief<=4000, supplied_assets<=10 unique UUIDs with role primary/supporting. Hybrid requires at least one asset. Current service targets **text variants only**, refuses human generation and checks existing reference assets for tenant/project/brand and campaign.preview rights. It adds references to a text revision; it is not an AI video compositor.
* Existing `media_assets` records generated/reference source kinds, active/revoked/deleted state, private storage bucket/key, JPEG/PNG/WebP/MP4 and allowed-use rights. Reference records alone do not prove customer ownership/consent. A customer upload/selection contract must collect attestations and retention/deletion policy, bind actor+tenant+project+brand and asset revision, inspect bounded actual bytes/MIME/size/duration, quarantine until passed, and issue only authenticated delivery IDs. No upload endpoint, signed URL, arbitrary URL fetch, storage duplication or new provider adapter was invented here. Applying #208/#212 runtime migrations or activating inspection is not authorized.
* Approval/revision/render receipts remain the existing immutable versioned architecture. No bypass409, inferred approval, new Instagram profile provisioning or external publication was added.

## Full-premium capability boundaries

Brand Brain continuity and owner identity policy are preserved by #213/#214/#215 and regression suites. There is no social OAuth connection/token-lifecycle module or autonomous publisher in this integration base; calendar scheduling is not dispatch. No platform performance-ingestion or closed-loop Learning Brain implementation was found here. Existing measurement registry records `evidence_kind:customer_attestation` bound to publication; goal recommendations do not establish measured outcomes. Those launch requirements remain **open**, not removed.

For social integration, reuse campaign/variant/revision IDs and current-version approval. A future connection contract must bind tenant/project/brand, provider account, granted scopes, expiry/revocation, encrypted token reference and owner consent; authorization-code/PKCE/state protections, callback allowlists, token-refresh concurrency and disconnected-account errors need provider-specific evidence. A publishing worker must require live authorization/rights/current revision, durable per-destination dispatch identity and provider reconciliation before retries. No endpoint is claimed implemented or authoritative platform scope/limit invented without current provider documentation. Provider credentials, external app setup and controlled activation remain explicit gates.

For learning, require authoritative objective, reporting interval, organic/paid attribution and source/provenance plus publication/platform join. Reject stale/incompatible/missing observations, preserve attestation separately, and version recommendations with source snapshots. Do not synthesize analytics. Read-only ingestion adapter and correction/retraction semantics remain dependent on trustworthy data joins and existing #204 scope.

## Reliability/security register handoff (existing IDs only)

| Finding | Evidence / severity | State / next gate |
|---|---|---|
| TD-STUDIO-BE-003 cross-instance duplicate paid execution | Orchestrator `states` Map is process-local; one debit does not prove one provider call. HIGH launch blocker | Not fixed; durable fenced claim + ambiguous-outcome recovery contract specified in commercial report. No automatic lease retry or unsafe financial policy installed |
| TD-STUDIO-BE-004 orphan Stripe processing claim | Existing processing claim can remain503 after crash. HIGH release blocker | Not fixed; reconcile against durable effects/current subscription and atomically finalize before controlled retry; no deleting claims/refunds or client-triggered financial replay |
| Binding quote/confirmation absent | Read-only preview cannot reserve or enforce cap at execution. HIGH paid-generation blocker | Draft durable contract only; existing ledger concurrency/idempotency tests remain valid but insufficient for provider exactly-once |
| Dependencies | Current registry7 nodes before ->2 moderate after patches, no high/critical in response | Remaining gaxios/uuid under older Vertex auth chain needs supported SDK upgrade/reachability evidence; not a clean-audit claim |
| Campaign query N+1 | Old4/12 campaign probe56/160; new6/14 fixture16/16 commands, exact aggregates | Fixed query fan-out; legacy full list still unbounded memory/output. Workspace calendar separately capped/timeout; production query plans/load/egress UNKNOWN |
| Logical restore preflight | PostgreSQL re-parses one CHECK parentheses; exact equivalent rendering now accepted, weakened bounds still denied | Local17.11 dump/restore passes; actual managed backup/RPO/RTO/role/auth/storage restoration UNKNOWN |
| S1 credential/IAM isolation | Founder metadata shows shared access and broad default runtime/deploy paths | RED; separate `2560621` package, reviewer/effective inheritance/consumer inventory/current price/approvals still required |
| Media integration | #208 not ancestor of this stack; approval/private delivery/runtime dependencies unresolved here | No full secure creative integration claim; separate reviewed combined draft/testing required |

## Tests and evidence classes

Full Node22.23.3 suite with `TEST_DATABASE_URL` pointed only to local PostgreSQL17 loopback5433: **735/735 pass, zero skipped** after campaign-management changes. Includes existing billing/idempotency/provider mocks/tenant/Brand Brain/onboarding tests and added HTTP/PG contracts. This is **local/mock + local PostgreSQL**, not actual Stripe/provider/browser/deployed E2E. Focused sector63/63, calendar26/26 before later additions, commercial6/6, restore byte-for-byte onboarding record parity. Syntax/exact final-head verification is recorded at publication checkpoint.

Local evidence files under `/workspace/.onboarding`: professional-full.log, calendar-full.log, commercial-full.log, dependency-full.log, batching-full.log, management-full.log, logical-restore-proof-final.json, bg019-audit-final.json. Reproducible committed restore script is intentionally local-only and guarded. Do not treat local logs as hosted CI IDs.

## Shortest controlled next sequence

1. Read this draft's exact code/schema/contracts; Claude can implement calendar client, canonical sector mapping and management UI against them without enabling paid calls. Review new routes against current frontend/source; GitHub comments/PR handoff remain access-blocked here.
2. Obtain fresh exact-head GitHub CI and reviewer approval for this dependent branch. Preserve original213->214->215 and frontend48->49->50->51 order; no merge authorized. Resolve media stack separately rather than assume incorporated.
3. Founder supplies commercial canon/terms, nominates S1 reviewer, obtains metadata-only effective IAM/consumer/pricing evidence and explicitly approves numeric budget/window/cleanup before S1. S1 is not approved by this document.
4. Review/apply no shared SQL until isolated restore/preflight/RLS/auth/test-workspace prerequisites and explicit migration/deployment approvals. Compatible backend first, additive sector CHECK next, professional frontend flag last; each gated with non-destructive rollback.
5. Complete durable quote/confirm and provider/Stripe recovery, actual private media integration and UGC intake/composition, provider-specific social/publishing/analytics/learning requirements. They remain mandatory launch blockers, not deferred acceptance.
6. Only after separately approved isolated staging deployment: real owner/member/two-workspace sign-in, refresh, save/resume, revocation/F-08d/e, CAS/retries/403-or-policy404/409/422/503, real bounded media/browser/backup recovery, then founder-visible acceptance. No paid/provider/publishing step without its own approval.

Mission Control reconciliation is for ChatGPT to apply to existing rows after readback: BG016/017 and BG019 authority, DEC023–025, EV067–069 and existing BLK06/07/08/TD IDs. Reported row/dashboard misalignment remains untouched and unverified. No parallel governance register or acceptance claim created.
