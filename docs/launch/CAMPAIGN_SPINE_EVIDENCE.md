# Campaign spine baseline, compatibility and evidence

**Task:** BG-LAUNCH-002I-A. **Evidence date:** 2026-09-02.
**Canonical proposal:** [campaign-spine.v1](CAMPAIGN_SPINE_CONTRACT.md).
**Acceptance/handoff:** [matrix and I-B scope](CAMPAIGN_SPINE_ACCEPTANCE.md).

## Verified authority and drift reconciliation

| Check | Observed evidence |
| --- | --- |
| Repository | `shirrie01/bizgenie-api` |
| Fresh GitHub main and local clone HEAD | `16f1ecb5102b7acaf15d1b382d6a7eb7cd1182d2` |
| Main tree | `c978e15e5956a1b5f83a31cb2ab8863f193ac3ff` |
| Latest canonical change | [PR #53](https://github.com/shirrie01/bizgenie-api/pull/53), paid-beta capture foundation, merged |
| Open PRs before this task | 0; live GitHub search, not inferred from a local checkout |
| Branch inventory | 35 remote branches including main, paginated to exhaustion; clone fetched every head |
| Overlap inspection | 34 retained non-main heads, all dated before current main; no campaign-spine branch or open overlapping PR; 22 heads are not ancestors of main, so ancestry alone was not treated as proof of active work or merge status |
| Issue #39 | Closed as completed; [final closure 5497361809](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5497361809) and canonical evidence pack read |
| Issue #51 | Open; full issue and all six comments read, including required [5508119002](https://github.com/shirrie01/bizgenie-api/issues/51#issuecomment-5508119002) and [5508588187](https://github.com/shirrie01/bizgenie-api/issues/51#issuecomment-5508588187) |
| Repository instructions | No AGENTS.md in the clean clone; Mission Control Codex/Task contracts read |
| Branch created | `bg-launch-002i-a-campaign-spine-contract`, from freshly verified origin/main |

**Baseline result: NO REPOSITORY DRIFT against the requested main/open-PR baseline.**
**Documentation result: DRIFT DETECTED and reported before editing**: Mission Control
still described Issue #39 as in review at `5df5b470...`, despite GitHub closure and
merged PRs #52/#53. Its current-status section is reconciled in this task. The original
activation evidence pack remains a historical artifact at its stated evidence cut-off;
its old open-issue/restart statements are superseded by the linked human closure.

The retained branches cover prior Auth, Billing, Mission Control, generation, CI,
runtime, activation and documentation tasks. Recent heads are paid-beta capture,
activation evidence, bounded refund, restart-safe Billing and durable Video. No new
contract work was overlaid onto a retained historical branch. This is repository
evidence only; it cannot discover an unpublished branch on another person's machine.

The product concept link from Issue #51 was opened read-only. It redirected to a fresh
OpenAI sign-in; no credentials were entered. Direct visual inspection was unavailable.
The accepted campaign-first behavior was read from the authoritative checkpoint,
including its explicit future-state concept boundary. No visual direction was changed.

## Compatibility analysis against actual main

Historical task docs describe their original implementation stage; actual source,
later merged changes and Issue #39 closure govern the current foundation.

| Foundation and source | Finding | Contract treatment |
| --- | --- | --- |
| [Authorization service](../../src/authorization/service.js), [policy](../../src/authorization/policy.js), [identity contract](../security/IDENTITY_AUTHORIZATION_FOUNDATION.md) | Canonical profile/membership/tenant/project/brand graph; owner has project:write; member has reads and generation:create | Reuse graph and roles; owner-only campaign writes, member reads; no implicit new scope |
| [Customer token verifier](../../src/authentication/tokenVerifier.js), [customer boundary](../security/CUSTOMER_TOKEN_VERIFICATION.md) | Verified Supabase claims create customer UUID; request user_id is not identity | Reuse verification and sanitized denial, reauthorize every read/replay/write |
| [Service contract](../security/GENERATION_JOB_SERVICE_BOUNDARY.md), [credential](../../src/service-principal/credential.js) | Global bounded worker has no tenant authority; job supplies immutable execution owner | No campaign service permission from generation:execute; future scope needs separate contract |
| [Brand schema](../../src/brand-brain/schema.js), [router](../../src/brand-brain/router.js), [PostgreSQL repository](../../src/brand-brain/postgresRepository.js) | Current row is upserted; source version is not automatically increased; no historical version table | New-domain immutable source snapshots identified by version AND hash; do not retrofit existing Brand behavior |
| [Brand resolver](../../src/brand-brain/contextResolver.js) | Uses approved current context when available, not a historically pinned generation version | Distinguish revision context from unknown historical generation context; no invented attribution |
| [Generation job schema](../../src/generation-jobs/schema.js), [service](../../src/generation-jobs/service.js), [repository](../../src/generation-jobs/postgresRepository.js) | Immutable tenant/project/optional-brand/actor/scope authority; ownership fingerprint and sanitized execution input, not durable generated text output | Exact job/asset owner checks; new campaign intent hashing remains separate; no job schema or generation replay changes |
| [Text generation](../../src/generation.js), [Image schema](../../src/image-generation/schema.js), [Video contract](../video-generation.md) | Existing engine formats, output qualification and generation approval states are separate from customer campaign workflow | Copy/verified-import into revision; no automatic campaign approval or new top-level format tools |
| [Generation Billing service](../../src/generation-billing/service.js), [durable Billing](../billing/DURABLE_POSTGRES_BILLING.md), [refund policy](../../src/billing/refundPolicy.js) | Tenant financial authority; immutable ledger, global durable financial key checks, reconstructed settlement, bounded refund | Zero financial side effects for campaign commands; manual publication failure cannot refund generation |
| [Stripe lifecycle](../billing/STRIPE_SUBSCRIPTION_LIFECYCLE.md) | Server-owned subscription/funding authority, webhook idempotency and customer mapping | No Stripe calls, entitlement writes or per-publication charge |
| [Media schema](../../src/media/schema.js), [repository](../../src/media/repository.js), [storage](../../src/media/storage.js) | Private server-owned bucket/key; active owned assets; generation-reference rights are a narrow allowlist; no customer export endpoint | Link immutable IDs, revalidate status; don't invent upload/publication rights or expose storage locations; I-F supplies authenticated export |
| [Durable Video repository](../../src/video-generation/repository.js), [staging contract](../activation/STAGING_ACTIVATION.md) | Accepted operation and state reconstruct after restart; terminal states and settlement remain independent | Campaign attempt state does not poll/resubmit video or reinterpret completed generation |
| [CORS](../../src/activation/cors.js) | Only GET/POST/OPTIONS and authorization/content-type allowed | Proposed commands use JSON idempotency/version fields; no new methods/headers/config changes |
| [Paid-beta capture](PAID_BETA_CAPTURE_AND_CHECKOUT_RETURN.md) | Backend merged, disabled and unstaged per current Issue #51; no tenant/account authority | No capture activation or coupling to campaign ownership |
| [Mission Control](../mission-control/README.md), [task contract](../mission-control/TASK_CONTRACT.md) | Internal task ledger/acceptance is distinct from customer campaign data | Documentation pointer and review state only; no Mission Control runtime/schema edits |
| [Migrations](../../supabase/migrations/20260901170000_create_paid_beta_interest_capture.sql) | Nine canonical migration files through paid-beta capture; earlier tables already hold relevant project/brand/job keys | I-A adds no SQL; I-B adds new-domain persistence without inferred legacy backfill |

Security review also checked current [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api)
and [changelog](https://supabase.com/changelog). Privileges and RLS are separate controls;
the contract explicitly revokes new-domain direct access rather than assuming a project
default exposes or hides tables. No Supabase product/configuration change is performed.

## Contract review decisions

- One campaign transaction/version boundary; variants own lifecycle and campaign/item
  status is a deterministic rollup. Content format is immutable and separate.
- Full append-only revisions; human approval binds revision plus acknowledged preview.
- Manual attempts have immutable terminal resolutions; unknown external outcome remains
  pending. One confirmation per variant; corrections never overwrite history.
- Scheduling is manual-action metadata, not an automatic publisher or proof of delivery.
- Brand Brain attribution uses immutable source snapshot/version/hash; preview attribution
  uses immutable profile/version/renderer evidence. Neither is a raw customer DTO.
- Exact command intent hashing and durable receipts cover retries/lost acknowledgement;
  aggregate version prevents lost edits; business uniqueness protects fresh-key duplicates.
- Current authorization precedes replay and resource-specific errors. Same-owner links,
  privileged-server checks, RLS and revoked grants remain mandatory.
- Archive preserves audit and idempotency identities. No physical deletion policy is
  invented. I-B receives exact relations, invariants and adversarial acceptance cases.

No runtime/schema validation artifact is needed to make this documentation contract
reviewable. Adding an executable partial model would prematurely implement I-B/I-F.
The acceptance matrix records future executable assertions explicitly instead.

## Executed verification and evidence location

The only changed repository files are this pack's three Markdown files and Mission
Control's README. No existing test, source, dependency, lockfile, workflow, migration,
configuration or activation file changes are included.

| Check | Result at commit preparation |
| --- | --- |
| Node/npm | Node `v22.23.2`, npm `10.9.8`, matching Node 22 repository contract |
| `npm ci --cache ../npm-cache --no-audit --no-fund` | PASS, exit 0; 167 packages installed; existing dependency deprecation notices only; no lockfile change |
| `npm test` | PASS, exit 0; 398 tests, 83 suites, 398 pass, 0 fail, 0 cancelled, 0 todo; reported test skip count 0 |
| Local database limitation | The enclosing real-PostgreSQL suite is marked SKIP because TEST_DATABASE_URL is absent; local test counts do not prove real-DB execution |
| Relevant syntax checks | PASS: 166 existing index/src/test JavaScript files checked with `node --check`; no new executable/schema artifact |
| Documentation checks | PASS: 49 local links, 2 anchors, 1 JSON example and 74 unique acceptance IDs; 7 distinct external links checked through the authoritative GitHub reads/current Supabase pages; concept sign-in limitation recorded separately |
| `git diff --check` | PASS for working/staged documentation and baseline comparison before commit |
| Sensitive-value scan | PASS: 4 changed documents, zero credential/token/private-key/connection-string pattern matches; manual review found no secret or live customer data |
| Non-regression scope | All 48 existing test files unchanged; Text/Image/Video, Auth, Billing, Brand Brain, Mission Control and storage tests remain in unchanged suite |
| GitHub Actions | Exact PR-head run required before final delivery; result, job URLs and head SHA are recorded in PR/final delivery evidence after commit exists |

The commit's evidence cannot contain its own hash or a completed CI run that only starts
after the PR exists. Those facts belong in the PR description and final delivery report,
with the exact immutable head SHA. Do not create a second implementation commit just
to replace that metadata. Human/Architecture Guardian review is still required; no
independent architecture acceptance or merge is claimed by this self-review.

## Mutation state and restart

Repository-only documentation change. Production and staging are untouched by this
task. No database migration/application, Cloud Run, Supabase, Stripe, IAM, secret,
traffic, environment, deployment, external publication or billable generation action
occurred. No live-state assertion is inferred from local tests or a historical checkpoint.

Exact restart: review the one I-A PR and its exact-head CI against this contract and
acceptance matrix. Merge only under separate explicit authority. Then reverify main,
Issue #51 and overlaps, and begin [BG-LAUNCH-002I-B — Additive Persistence](CAMPAIGN_SPINE_ACCEPTANCE.md#exact-handoff-to-bg-launch-002i-b).
I-C/D/E/F, W4B and activation remain later work with their recorded boundaries.

Proposed delivery verdict, subject to successful verification and review:
**CAMPAIGN SPINE CONTRACT LOCKED — READY FOR ADDITIVE PERSISTENCE REVIEW**.
