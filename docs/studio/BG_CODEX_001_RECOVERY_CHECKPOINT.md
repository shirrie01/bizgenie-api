# BG-CODEX-001 recovered checkout and integration checkpoint

27 October 2026. STAGING RED; LAUNCH NO-GO. No shared database, provider, Stripe, credential, IAM or deployment operations performed. This engineering evidence is not a second Mission Control.

## Preserved state

Recovered repository `/workspace/bizgenie-api`, branch `bg-studio-022-staged-strategy`, original HEAD `589573c7dc9c284049d2a12d58adfff707d3b780`. Original ten tracked modifications and five untracked files were archived before source edits. Archive outside checkout: `/workspace/recovery/20261027T172123Z/recovered-work.tar.gz`; SHA256 `e027c62b08874de7778817a0cd2bc579a063b2f06afdc1cf69707b478460e477`. All 15 archived file hashes checked against original bytes; 19 members including status, manifest, binary tracked diff and diff summary. Explicit JS/SQL allowlist excludes environment files, credentials and dependencies. This archive preserves changes relative to HEAD, not the entire Git history or offsite recovery. Original checkout never reset, cleaned, stashed, rebased or switched.

| Original file | Recovered workstream |
|---|---|
| index.js | Optional two-stage router composition, default off |
| src/campaigns/generation.js | Export existing strategy-rendering contract for reuse |
| src/creative-intelligence/schema.js | BG022 objective/version provenance in DNA |
| src/generation-quotes/jobs.js | Strategy-plan attachment denial; safe text/plan outputs and media paths; DNA |
| src/generation-quotes/service.js | Two-stage request/quote/confirmation integration; objective binding |
| src/generation-quotes/textAdapter.js | Existing text adapter delegates one explicit stage |
| src/generation-quotes/worker.js | Workflow/context recheck and proven pre-call cancellation |
| src/learning-persistence/service.js | BG022 scope/dictionary/freshness revocation checks |
| src/product-intelligence/service.js | BG022 project source quota and serialized admission |
| test/generation-quotes.integration.test.js | Two-stage confirmation/restart/stop tests |
| src/strategy-workflows/router.js (untracked) | Authenticated explicit-stage API |
| src/strategy-workflows/service.js (untracked) | Durable links to existing quotes/jobs/ledger |
| src/strategy-workflows/stageHandler.js (untracked) | Existing strategy validators, one call per stage |
| supabase/migrations/20261026164000_create_strategy_workflow_links.sql (untracked) | Proposed local-only immutable workflow metadata |
| test/helpers/strategy-stage-local.js (untracked) | Synthetic policy/provider fixture |

Two-stage generation is part of BG022, not a competing implementation. HEAD already contains core/DNA/experiments commit `80702dd` and product/distributed-limit commit `589573c` above #218. No original PR branch modified.

## Environment and defect verification

package.json and GitHub CI require Node22; existing local binary `/workspace/.onboarding/tools/node_modules/.bin/node` is v22.23.3. Default system Node v24.19.0 was not changed. Existing dependencies resolve locally; no installation or lockfile update. Existing Docker PostgreSQL17.11 container `bizgenie-dev-postgres17` restarted, loopback5433 only. Did not execute automatic development migration bootstrap. Inspected sorted fixture migration dependencies (authorization/Brand Brain/ledger/campaign/private-media precede BG022 tables and strategy links). Existing tests apply this chain only to newly created, UUID-named disposable databases, then drop those databases; no existing development/shared schema updated. Proposed strategy SQL is not provisioned anywhere live.

The recovered SQL joins already contain the prior spacing/join correction. Both original strategy regressions passed on first rerun: no current SQL defect reproduced. Do not attribute a fresh code fix to an unavailable historical failing trace. Untouched recovered baseline: 958/958 tests, zero skipped, 41.608s, `recovered-full.log` in recovery directory.

Additional safety coverage injects failure inside settlement before commit. Reservation remains held, debit/release count stays zero; a freshly constructed worker queries a synthetic authoritative result, debits once, then replays without another probe. Repeated confirmation returns same job with zero reserved credits; exactly one reservation and one debit. Real text adapter still reports unknown if no trustworthy recovery result exists; the test does not invent real provider reconciliation capability. Existing stop test retains unknown work and releases only unstarted work.

Bounded genuine fix: reject nonpositive, noninteger, unsafe or nonnumeric configured product source limits before database access. Added deterministic constructor cases. Added HTTP tests for authentication, private/no-store, Authorization variance and default-off503 on every strategy route. No production composition or provider activation changed.

## Governance baseline: snapshot, not a live read

Read the supplied XLSX export dated27 October2026 (exact export time not supplied) and complete Operating Constitution v1.0 PDF (effective19 July2026). Workbook has all17 tabs: DASHBOARD, CONFIG, CURRENT_STATUS, PHASE_PLAN, LAUNCH_BLOCKERS, TASK_REGISTER, TECHNICAL_DEBT, LOCK_REGISTER, VERSION_REGISTER, SOURCE_REGISTRY, EVIDENCE_REGISTER, SESSION_LOG, DECISION_LOG, EOD_REPORT, BACKUP_REGISTER, AUDIT_LOG, CHECKPOINT_INDEX. Extract retained under recovery directory. Later specific founder authority prevails within scope over historical constitution credit/stack/BG002 text. No live financial state inspected.

| Source | Authority/version | Supersession and conflict | Action |
|---|---|---|---|
| SRC001 | Sole governance; workbook snapshot v1.0 | Later live rows may differ | Reconcile proposed rows via ChatGPT; no silent writes |
| SRC002 | Active Constitution v1.0 | Historical Sheets ledger, stack and initial BG002 conflict with later locks | Apply scoped later decisions; propose explicit cross-references |
| SRC019 / VER009 | Canon v2 product positioning | Supersedes VER001 positioning only | Preserve; no commercial inference |
| SRC018 | #128 launch contract | DEC014 supersedes DEC009 deferral within stated scope | Preserve full approved premium scope; no launch acceptance |
| SRC004 / SRC016 | Actual backend/frontend Git code | Git refs current; API metadata access Forbidden | Record full SHAs; PR state and CI remain separately unverified |
| LOCK012 | Historical Sheets authority explicitly SUPERSEDED | Durable append-only PostgreSQL ledger is financial authority | No Sheets financial writes or inferred balances |
| SRC009 / VER002; SRC010 | Historical pack / reference framework | Cannot override Canon or current verified code | No architecture rebuilding from these sources |
| LOCK018 / DEC020 | Architecture A onboarding | B superseded, pre-workspace save deferred | Preserve #213 contract |
| LOCK019/020 | Owner-only identity; admin-key-only identity prohibited | DEC022 row absent from snapshot DECISION_LOG although LOCK020 references it | Propose backfill from verified founder approval, not invented decision |
| SRC023/024 / VER013 | #218 checkpoint/contract9346055 | Live Git head matches; newer BG022 not yet in snapshot evidence | Add linked evidence to existing task |
| SRC025 / VER014 | BG022 work order | Snapshot says no backend code verified | Propose current local evidence with hosted-CI UNKNOWN |

Historical duplicate LOCK002 and LOCK004 rows are both marked superseded. Do not renumber/delete. CURRENT_STATUS, checkpoint index (endsCP83), audit log and several source/version rows lag later EV079/session evidence. VER004/007 have apparently shifted column values; BLK-STUDIO08 title describes identity authorization but body describes production IAM. Propose cell-specific corrections after live row verification; retain history. Pricing DEC010/013 remains unapproved. DEC025 authorizes draft/local work, not S1 execution. No new governance IDs allocated here.

## Exact integration dependency chain

Live Git transport on27 October verified main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` and the following PR refs. GraphQL PR/check metadata returned `Post "https://api.github.com/graphql": Forbidden`; refs alone do not prove open/draft/unmerged/CI state. The draft/unmerged classification is the supplied checkpoint, pending maintainer verification.

| PR | Exact Git head | Integration treatment |
|---|---|---|
|205|69dd72a66650f5c69d764bef63942bc0aa25a0c7|Preview history incorporated by208; do not reapply |
|206|63eda4aafb6bdb551a95b5ad405ae04955a8b64a|Recovery history incorporated by208 |
|207|d2ba99315d02e387e5a7dc519510b978ee9589a8|Delivery history incorporated by208 |
|208|bf12050939817ae6da3f696808fc5a7f054d74ab|Consolidated history; leave intact |
|209|6911ffc2aaa8687432b6e28fd34bdca59a40be90|Readiness history |
|210|e26b79d273fe2a906245b1ce52fd6d7e67df4250|Immutable preview contract history |
|211|fb9edce8c17e363a3bf13c77dc5ffa00231fe302|Video compliance history |
|212|b60e380479d36f206e68697ed0fd2f57b2b04b07|Inspection runtime separate scope; no activation |
|213|120a874dfa02313a8c28dad82ddb6582f0065469|Canonical onboarding A |
|214|51e8ca493be1bfd6b45da1cb540d4bc090de2a85|Depends213: identity policy |
|215|e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b|Depends214: reliability |
|216|f8d81bf07977b57496d97db0df75e984bc8c425f|Depends215: sector/calendar |
|217|23f49038f36acf8414a079e27a8d5ffc8d302f2b|Depends216: safety integration |
|218|9346055a4b0c2057f8ab13274396ecf502296ed6|Depends217: premium integration |

213→214→215→216→217→218 ancestry verified with merge-base. Existing current branch extends218→80702dd→589573c→recovered strategy. These are cumulative dependent changes, not alternatives to cherry-pick twice. Main unchanged. Source-level migrations retain historical order; no shared application authorized. Do not merge any dependency in this task.

## Claude frontend56 handover

Fetched exact frontend56 `205a9830ceb84a497b9bf09b551e5a5f1241fdc6` into frontend/pr-56 without checkout switching. Read BG_STUDIO_023_BACKEND_HANDOFF and FE_REPORT. Its integration target is218, not recovered BG022. Its CI claims are frontend-reported here, not independently fetched checks.

1. Preserve adopted nested campaign schedule/manual-publication/publication and real recommendation_id/CAS/idempotency feedback. Do not reintroduce invented recommendation-hash authorization.
2. Adopt existing creative-jobs list/detail/attach and authenticated preview/receipt/ack/current-version approval. Successful text now appears as output_type text; plan output_type strategy_plan is not attachable. Media paths include only asset-backed outputs.
3. Replace nonexistent social-accounts/publishing-queue paths with existing /customer/social routes; no new alias/backend duplicate. Keep platform confirmation distinct from queue acceptance/manual attestation.
4. Wire existing /customer/insights reads/actions and discovery; no public observation-ingestion route. Experiments/DNA/growth now have backend draft services under /customer/intelligence; source evidence, dictionaries and observational-only no-winner policy govern validity. Stored evaluation summaries are historical until current evidence revalidation; do not infer causal winners or invent statistical thresholds.
5. Product sources under /customer/product-intelligence are owner-submitted text with explicit not_fetched provenance; accepted is not externally verified. External website fetch stays disabled. Market functions are internal contracts only, not a customer research service.
6. Two-stage API is additive and optional: POST /customer/strategy-workflows with tenant/project/brand, request (existing generation-quote intent), max_total_credits and idempotency_key. No reservation on creation. POST /:id/quote with same scope, stage strategy|draft and quote_attempt1..100 returns existing generation-quote.v1. Confirm each quote separately via existing route with confirmed:true, exact max_credits and stable idempotency_key. GET /:id returns stages/job states and completed; POST /:id/stop stops future work and releases only proven unstarted reservations. No automatic second paid call; fresh expiry attempt cannot bypass one-confirmed-stage or total cap. Missing explicit approved workflow policy/source/price mapping fails503. Synthetic fixture prices are not commercial authority.
7. Keep optional capabilities off until separate reviewed composition. General hybrid rendering, real connectors/inspector, billing management/invoice mounting, pricing canon, S1 isolation and authenticated deployed acceptance remain unfinished; local success is not release approval.

## Proposed Mission Control update manifest (no writes)

- Existing BG-STUDIO-022-BE-CLOSED-LOOP-INTELLIGENCE task: append recovered branch/base, new review SHA and local test evidence; status remains IN PROGRESS / DRAFT, not COMPLETE or CI GREEN.
- Existing TD-STUDIO-BE-009: record opt-in distributed quota implementation and synthetic tests; retain approved real cost policies, deployment wiring, legacy drain and load proof as open.
- Existing TD-STUDIO-BE-010: record read-only verified publication projection and scoped experiment/DNA joins; retain real-source and frontend adoption gates.
- EVIDENCE_REGISTER: append this code SHA, exact commands/results, archive hash and GraphQL403 as agent-run local evidence; independent verification remains pending. Preserve previous independently verified PASS rows.
- SESSION_LOG/EOD_REPORT: one recovery checkpoint and exact restart point, no new programme/task/register. CHECKPOINT_INDEX links this evidence using canonical writer-assigned ID.
- SOURCE_REGISTRY/SRC025 and VERSION_REGISTER/VER014: append BG022 reviewed code and frontend56 links after live verification, preserve previous versions; SRC021/022 are historical checkpoint links, not latest-head claims.
- LOCK_REGISTER: annotate duplicate historical LOCK002/004 without deletion/renumbering. Constitution cross-reference LOCK012's supersession. DECISION_LOG: propose missing DEC022 provenance recovery; do not create approval.
- CURRENT_STATUS and malformed VER004/007/BLK-STUDIO08: propose exact live-cell corrections only after current row reads. No infrastructure, secret or financial-state assumptions.

Hosted CI remains UNKNOWN until an authorized maintainer opens/dispatches the dependent draft and verifies both exact-head jobs. This is the immediate publication boundary if API permissions remain Forbidden. No broader credentials requested.

## Final local validation

- Recovered unmodified baseline: 958/958, zero failures/skips.
- After bounded fix and settlement-crash regression: `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres /workspace/.onboarding/tools/node_modules/.bin/node --test`: 960/960, zero failures/cancelled/skips,39.609s. This run started before the new standalone HTTP file was added.
- New HTTP file separately: `node --test test/strategy-workflows-http.test.js`:1/1. Thus961 tests covered across these invocations; not a claim of one961-test invocation.
- Focused strategy/source-budget selection:4/4, zero skips.
- Separate `node --test test/postgres-billing.integration.test.js test/postgres-campaign.integration.test.js`:57/57, zero skips.
-308 JS files syntax-checked before the standalone HTTP file; that file separately parsed and executed successfully. `git diff --check` clean.
- No current SQL join/recovery-test failure reproduced. Original failure trace absent; existing recovered correction retained. General live-provider recovery remains unknown/fail-closed.
- Logs and original recovery manifest retained outside checkout; hashes in version-controlled evidence JSON. Hosted CI not verified.
