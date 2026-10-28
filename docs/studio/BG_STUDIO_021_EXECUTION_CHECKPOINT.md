# BG-STUDIO-021 — engineering checkpoint

26 October 2026. **STAGING RED. LAUNCH NO-GO. No founder acceptance or deployed verification claimed.** This is a substantial local integration increment; the complete premium launch scope remains mandatory.

## Executive result and immutable checkpoints

Implemented and pushed seven dependent workstream branches plus an integration branch from exact backend217. Original217 and S1 branches are unchanged. The final application/test code is **fe97156cee87a34efd665b6d97b8677e92ef17e2**, branch **bg-studio-021-backend-integration**. This checkpoint/evidence is a later documentation-only commit; its exact published SHA is supplied in the handoff rather than embedded self-referentially.

| Branch | Pushed code SHA | Review boundary |
|---|---|---|
| bg-studio-021-financial-enforcement | 9e27e8e6ae6215e9ee522b1feda8ca8294d3962c | explicit universal quoted-mode guard; default legacy preserved |
| bg-studio-021-creative-jobs | 532b4f5308496a50b9b9bdb68d4cfd511e2adb4f | durable job read/reload and atomic revision association |
| bg-studio-021-media-intake | 09aa41b695f3f8258504a1baf4b7e00bdbef19fe | quarantined authenticated private intake |
| bg-studio-021-video-hybrid | 2eec7e3b64c3c7e4036902dabb50251399b4f28a | existing video submit/poll and real synthetic hybrid rendering |
| bg-studio-021-social-publishing | 1c78aa217a073028921c114db84cb4d3faa6ec21 | durable OAuth metadata/outbox/fences/reconciliation |
| bg-studio-021-learning-persistence | f50131bfd67784b99041ac5e433cf94fb7ed87f8 | persisted measurements/snapshots/feedback/future context |
| bg-studio-021-campaign-contract | 4609fbe69f757c3f212481d4924bb507962e3520 | safe reload facts and bounded archive discovery |
| bg-studio-021-backend-integration | fe97156cee87a34efd665b6d97b8677e92ef17e2 | owner-spend correction, pinned reference delivery, schema drift, publication exclusion, restore and FE handoff |

These form a linear dependency chain, not independent alternatives. Earlier increments are review checkpoints; security corrections are at the final integration head. Do not activate an intermediate branch. [Review comparison](https://github.com/shirrie01/bizgenie-api/compare/bg-studio-020-backend-integration...bg-studio-021-backend-integration). No new PR number is claimed: `gh pr create --draft` against base bg-studio-020-backend-integration failed with `Post "https://api.github.com/graphql": Forbidden`. Code is recoverable from pushed native Git branches. A GitHub-authorized maintainer can open that comparison as a **draft**, retaining217 as dependency, or request separately scoped dependent drafts for the existing commits. Do not create duplicate implementations or merge.

## Canonical reconciliation and access

Native Git confirmed main ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f; backend213120a874dfa02313a8c28dad82ddb6582f0065469;21451e8ca493be1bfd6b45da1cb540d4bc090de2a85;215e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b;216f8d81bf07977b57496d97db0df75e984bc8c425f;21723f49038f36acf8414a079e27a8d5ffc8d302f2b. Frontend50/51/52 Git refs fetched; newer integration branch ac2c14f057f64e372641c845d2020e2a051ee7c4 report identifies53. Its harness was based on216, not this integration. Latest API comments/issues128/191/197, decision records and hosted checks could not be read. Sole Google Sheets Mission Control is not connected. This limitation is not bypassed with wider credentials; no old checkpoint is presented as a fresh governance read.

`gh run list --repo shirrie01/bizgenie-api --branch bg-studio-021-backend-integration` failed: `GET https://api.github.com/repos/shirrie01/bizgenie-api/actions/runs?...: Forbidden`. Hosted CI **UNKNOWN/unverified**, not GREEN. Current workflow runs pull requests, main/architecture pushes or manual dispatch; a feature-branch push alone is not a successful CI run. Maintainer must open the draft or dispatch CI and inspect both completed exact-head jobs. No merge or launch decision follows from local passes.

## Functionality delivered and five mandatory directions

| Mandatory direction | Classification | Verified increment | Still required for launch |
|---|---|---|---|
| Approved prices/customer terms | IMPLEMENTED LOCAL fail-closed contract; actual canon NOT STARTED here because unavailable | catalogue validation retained; no fabricated monetary/credit/tax/legal values | canonical source/version/effective approval, mappings/terms/customer wording |
| Calendar/subscription management | Calendar INTEGRATED LOCAL; management/invoices MOCK-TESTED and unmounted | bounded calendar/archive discovery, unschedule/manual reload facts; publishing calendar overlay | real FE53 integration, platform-history projection, owner billing composition/intent audit/approved policy/test-clock proof |
| Image/video/hybrid | INTEGRATED LOCAL with synthetic providers/storage/scanner | quote→job→private result→revision→render/ack/approve; actual H264 transport; actual synthetic hybrid byte composition | real supported provider contracts/recovery/costs, general compositor/scanner/rights/retention, unsupported reference/Instagram tuple gaps |
| Authoritative credit disclosure/enforcement | INTEGRATED LOCAL on new composition; production remains legacy | fixed durable quote/confirm/reservation, fences, no unknown resend, guarded single submit, owner-only writes | independent review/activation/draining; explicit priced durable multi-step strategy; real provider transport retry/reconcile/cost audit |
| Campaign/manual workflows | INTEGRATED LOCAL | safe nested schedule/attempt/corrected-attestation facts; member reads; owner CAS writes; archive discovery; manual-vs-autonomous exclusion | frontend adapter/browser acceptance, existing legacy-list retirement, platform publication projection/query-load evidence |

No row is STAGING VERIFIED or FOUNDER ACCEPTED. None of the full-product requirements is deferred to post-launch by this report. Brand Brain, onboarding Architecture A, owner-only identity policy, professional_services persistence, workspace permissions and existing commercial lifecycle safeguards are preserved. The full multi-step strategy is **not completed** by the single-call text draft adapter; quoted one-call policy deliberately refuses a hidden second provider call. That missing durable step/cost contract remains a mandatory launch blocker.

## Creative, social and learning evidence

* Jobs reuse generation_jobs/quotes/claims/ledger, not a competing queue. Pinned tenant/project/brand/campaign/revision/snapshot/platform/placement/model/profile/price/reference digest context survives reload. Attach and immutable association commit together and rollback together. New output never auto-approves. Regeneration requires fresh quote/confirmation; stale attach does not rebase.
* Intake records customer rights attestation, private create-only object, digest/generation, quarantine, mock inspection, promotion, revocation/tombstone and immutable audit. Owner writes, member reads; foreign scope denied before storage. Physical deletion/backup erasure is not implemented without retention policy. A mock scanner is not malware assurance.
* Video uses existing durable video service/repository and mock submit/status. Existing TikTok-feed local fixture progresses through private inspected H264, revision, real PostgreSQL receipt/ack/approval and206 ranges. No real video provider, Instagram provisioning or Meta compliance claim.
* Hybrid uses customer-selected inspected source and mock AI storyboard with real FFmpeg overlays and a new output digest, private storage/provenance and approval. Engine accepts only a known synthetic fixture. It is not a general customer compositor or completed real AI production service.
* Social persists actor/scope-bound nonce/PKCE, opaque vault reference, expiry/scopes/version, refresh fences, approved exact destination and durable due outbox/audit. Concurrent dispatchers submit once; accepted-response timeout remains uncertain; fresh service reconciles one confirmed publication without another publish. Cancellation after sending is refused. No real OAuth redirect/vault/platform connector, scheduler deployment or app-review permission is established. Verified platform history remains separate from manual campaign events. A root-lock exclusion prevents manual and automatic paths both committing for a destination; the platform-publication spine projection still needs implementation before launch.
* Learning persists explicit objectives/metric, source/account/record/publication binding, reporting windows/organic-paid semantics, dedup/correction/retraction, bounded snapshots/recommendations and customer CAS feedback. Full synthetic journey reaches accepted future campaign context, with Brand Brain row unchanged. No caller can inject fabricated metrics via customer HTTP. Missing/stale/retracted data is unavailable, not zero. No causal improvement claims. Actual platform dictionaries/interval/source policy/connectors, ingestion scheduling and full history pagination are unresolved.

## Financial-safety matrix

| Failure/race | Deterministic result |
|---|---|
| Duplicate/concurrent confirmation | one job/claim/reservation; stable replay; conflicting key/intent rejected |
| Credit exhaustion across services | account transaction serializes reservations; loser cannot spend |
| Expired/changed intent/profile/price/Brain/campaign/learning | reject before reservation or before call; no silent mutable context |
| Member/demotion/nonmember/foreign scope | owner writes enforced; status reads retained where authorized; no foreign version oracle |
| Revocation/stale context after claim, before calling | exact claimed fence cancelled, one release, zero provider calls |
| Worker pre-call takeover | new fence wins; stale worker cannot submit/settle/release |
| Timeout/accepted response lost/calling crash | recovery_required, reservation held; no automatic paid resend or guessed refund |
| Failed settlement after provider result | held until reconcile; no duplicate provider submission/debit |
| Definitive failed result / safe cancellation | one release under existing ledger identity; calling cannot be falsely cancelled |
| Hidden OpenAI retries | quoted provider view maxAttempts1, legacy instance preserved |
| Asynchronous child/internal/legacy bypass | expired single-use capability/internal guard denial; legacy routes428 under explicit quoted mode |
| Unattachable published/pending target |409 CREATIVE_TARGET_UNAVAILABLE before quote/reservation |
| Unpinned reference compatibility | image uses intake generation/digest loader; Veo image reference combination422 unsupported; no gs:// fallback |

Direct role grants/RLS-disabled/missing guards on new private schemas fail closed at checked service boundaries. Preflight is not a complete DDL/constraint/function-definition attestation or proof of a least-privilege deployed role. Privileged DB operator access remains a separate control-plane gate. Generic errors/lost DB acknowledgements never prove an unpaid call. A revoked owner with an unclaimed queued job may still need controlled unstarted-job recovery; no blanket timeout refund introduced.

## Validation (local; not hosted or deployed)

Exact application code fe97156cee87a34efd665b6d97b8677e92ef17e2, Node22.23.3, disposable PostgreSQL17.11, FFmpeg7.1.5/prlimit. All data/providers/Stripe/OAuth/analytics mocks synthetic; actual local FFmpeg/Chromium executed.

| Check | Result |
|---|---|
| Full `node --test` with TEST_DATABASE_URL | **948/948**,128suites,0skipped/failed/cancelled |
| Workflow-equivalent separate PG billing/campaign files | **57/57**,0skips; also included in full suite |
| Optional Brand Brain PostgreSQL script | **1/1** in newly created/dropped DB |
| JavaScript syntax | **299/299** source/test/scripts/index files |
| Private media Chromium transport | metadata/head/image display;401/404/409;206range;foreign-origin denial;revoked404;no cookie propagation PASS |
| Real synthetic H264 Chromium |1280×720,4sec,seek/play-to-end,5716bytes,2068byte range,revoked404 PASS |
| Logical pg_dump17.11/pg_restore | PASS; two new DBs; onboarding+ledger/job claims and13 populated BG021 media/social/learning tables equal; restored job/publication/accepted context readable |
| Container/toolchain contract scripts | PASS; **no fresh Docker/Buildpack artifact build claimed** |
| Diff whitespace | PASS |
| npm audit |6moderately affected packages,0high/critical; one root uuid advisory; unresolved |
| Hosted exact-head CI | BLOCKED by Forbidden; no run/result asserted |

The optional old Brand Brain script initially failed because its fixture omitted tenant/project FK parents. Added isolated synthetic parents/cleanup; application policy/assertions unchanged. Full suite also exposed a partial older campaign route fixture after additive DTO facts; added missing empty aggregate maps without weakening assertions. Intermediate failures are not concealed as passing runs. Current totals above are the successful reruns.

Restore does **not** recover GCS bytes, token-vault secrets, cloud backups/PITR or validate a production restore. Its synthetic policy amounts are test data, not public pricing authority. npm currently reports GHSA-w5hq-g745-h8pq via uuid9.0.1/gaxios6.7.1/google-auth-library9.15.1/Vertex1.12.0 and propagated dependents. Registry check: Vertex latest1.12.0; gaxios6 latest6.7.1. Previous two-package count is superseded by this six-package audit result (same root advisory, not six independent advisories). No unsafe major override or dependency removal.

Reproduction scripts: generation-quotes.integration.test.js, bg021-contract.test.js, quoted-reference-binding.test.js, campaign-remediation/customer-campaigns/postgres-campaign, scripts/local-onboarding-restore-proof.cjs, scripts/media-integration-browser-smoke.js, scripts/video-inspection-browser-smoke.js. Logical restore requires BIZGENIE_DISPOSABLE_RESTORE_PROOF=1 and the documented loopback5433 Docker fixture, never a shared DB. Machine-readable evidence in `evidence/BG_STUDIO_021_LOCAL_EVIDENCE.json`.

## Security/performance and remaining launch blockers

| Severity | Risk / verified bound | Required mitigation before activation |
|---|---|---|
| HIGH / blocker | Legacy production still uses process-local generation execution; SDK/internal retry audit incomplete | separately approve shared DDL/composition, drain old jobs, enforce same quoted policy and provider transport limits; never overlap unfenced Stripe recovery |
| HIGH / blocker | Aggregate provider spend/egress is not globally rate-limited | durable per-tenant/global budgets and load proof; credit reservation is not a currency provider-cost ceiling |
| HIGH / blocker | Preview cap4/process, transfer8MiB/request; old source limit1GiB vs32MiB client ceiling; ranges can accumulate unbounded egress | distributed limits/quotas, metadata/size UX, measured allowed playback/requests; no1GiB client fetch |
| HIGH / blocker | Revocation checked around bounded reads/start, cannot retract bytes/prompts/remote calls already delivered | document in-flight guarantees, bounded time/bytes, mid-stream policy/rechecks and deployed adversarial proof |
| HIGH / blocker | Intake32MiB and20pending/project bound only pending (~640MiB declared); ready storage/unretained audit growth not bounded | malware/rights/retention policy, storage quota/rate controls, authenticated deletion/backup policy; no physical deletion guessed |
| HIGH / blocker | Production scanner/general compositor/platform/credential/app permissions unproven | real hardened approved engine/infrastructure and contract validation; fixture-only engine must never accept live data |
| HIGH / blocker | Platform history not projected to campaign spine; conservative manual exclusion prevents reuse | integrate immutable verified source history/revision/workflow without fabricated attestations; deterministic rollback/races |
| HIGH / blocker | Full priced multi-stage strategy and real FE full-product integration incomplete | durable stage/cost contract, adapter tests and real authenticated owner/member/five-industry/two-workspace acceptance |
| HIGH / blocker | Shared schema/role/function/retention/backup/effective IAM unknown | gate-by-gate schema preflight and recovery/isolation evidence; no shared SQL here |
| MEDIUM / configuration blocker | Worker run+reconcile total2 per pool/process; reconciliation/fence holds outer transaction while internal work needs a connection | pool≥4 plus request headroom (fixtures12); cancellation/timeouts/load proof; process cap is not distributed rate control |
| MEDIUM / blocker pending dependency decision | transitive uuid buffer bounds advisory | reviewed compatible dependency/SDK migration and provider regressions; no cosmetic override |
| MEDIUM / integration blocker | recommendation history max50/no cursor, legacy collection unbounded, public social-list cursor UUID only | frontend adoption, full history pagination, production query-plan/load tests and request rate limits |

Provider/runtime unit cost and production throughput are UNKNOWN: no real provider contract/billing/approved profiles were accessed. No unsupported monetary estimate is supplied. Local synthetic quote2/6credits are not financial canon. Actual FFmpeg/browser work used existing disposable environment, no external provider calls. Future Cloud Run/GCS/egress/provider/vault/Stripe costs need operator pricing/budget evidence; alerts alone are not hard spend caps.

## Founder approvals and next controlled sequence

1. GitHub-authorized maintainer opens dependent draft/reviews separated commits and verifies exact-head hosted Node22+PG and Docker/Buildpack jobs. This is source review, not merge approval.
2. Claude adopts actual BG021 contracts from `BG_STUDIO_021_BACKEND_FRONTEND_CONTRACT.md`; keep gates off. Run real frontend/backend adapters, reload/private preview/approval, concurrent owner/member/two-workspace paths, no ambiguous paid replay. Current frontend53 source is a dependency, not accepted compatibility.
3. Close safe product blockers in separate reviews: priced durable multi-step strategy, platform-publication projection, billing intent/tenant resolution, full history/distributed quotas, real connector/schema/role contracts. Founder supplies locked prices/terms/policy source and decisions required for actual legal/provider/retention contract; no invented canon.
4. Separately review proposed onboarding/professional/quote/Stripe-fence SQL plus new20261026120000job links,130000intake,140000social,150000learning. No historical migration edited; no shared migration applied. Backup/restore/role/RLS/preflight/retention/deletion need operator evidence and explicit migration approval. The claim error_code addition is currently in the dependent learning migration; final migration packaging/order must be reviewed before shared use.
5. S1 unchanged at16c1d71fd32a5240d531585f22afd38ad6c66195; founder operator, reviewer pending, £1/30days proposed **unapproved**, inherited IAM/key provenance unresolved. No S1/cloud change authorized here. First operational step remains metadata evidence/reviewer sign-off, not secret creation or deployment.
6. Only after independent review and separate explicit approvals: shared migration, isolated deployment, capability activation, bounded real auth/provider/Stripe/OAuth/publishing tests. No permission inferred from this local checkpoint. Staging/launch remain RED/NO-GO until all mandatory directions integrated and founder-accepted.

Rollback preparation: before activation, keep all new server DI null/disabled and frontend gates off. After any future approved trial, stop new dispatch/generation first; reconcile calling/sending/unknown jobs rather than replaying/refunding; preserve reservations/receipts/nonce/outbox/evidence/history. Drain old/new workers before switching compositions. Roll to compatible artifacts only; never down-migrate/delete evidence or restore shared credentials. Do not re-enable legacy generation/manual publishing against pending outbox work as a shortcut. Restore only into an approved isolated target and validate object/vault dependencies before cutover; none executed here.

Mission Control handoff: attach these Git evidence/contract/checkpoint links to existing BG-STUDIO-021, full-launch directions, TD-STUDIO-BE-003/004 and relevant existing integration/security records through ChatGPT. BG016/S1 remains separate. Exact unseen row ownership/status is not invented; no duplicate task/register or closure claim.
