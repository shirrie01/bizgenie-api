# BG-ACT-001 final activation evidence pack

- **Task:** BG-ACT-001L
- **Parent authority:** [Issue #39 — BG-ACT-001](https://github.com/shirrie01/bizgenie-api/issues/39)
- **Evidence cut-off:** 2026-09-01
- **Repository baseline:** `5df5b470a4472c479907a900754f2ab352b36826`
- **Baseline tree:** `82a5cd092bcdbbca69b09ae170a1b547068df2a9`
- **Issue state:** OPEN; this pack does not close Issue #39
- **Production authority:** none; production remains untouched and unauthorised

## Purpose and authority

This is the canonical sanitised evidence pack for the Issue #39 staging
activation contract. It reconciles the issue body, every Issue #39 comment,
Issues and PRs #40 through #50, the current repository contracts and tests, and
the separate Issue #51 launch-preparation programme.

Issue #39 comment
[`5495297859`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5495297859)
is the canonical drift-control starting point. Comment
[`5496692697`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5496692697)
is the evidence-recovery authority. Earlier checkpoints remain evidence, but
their stale baselines, blockers and restart instructions are superseded where
those two comments or this pack say so.

No provider was called, no paid generation was repeated, and no staging,
cloud, Stripe, Supabase or production state was changed to assemble this pack.

## Classification model

- `LIVE STAGING PASS`: directly observed in the dedicated staging environment.
- `STAGING-CORROBORATED PASS`: deterministic or real-PostgreSQL proof plus
  preserved live-staging evidence for the same boundary.
- `REAL-POSTGRESQL / DETERMINISTIC PASS`: the relevant branch and durable
  authority were executed against real PostgreSQL and/or a deterministic
  acceptance harness.
- `AUTOMATED CONTRACT PASS`: a repository test executes the exact contract.
- `PARTIAL`: some, but not all, of the stated surface is evidenced.
- `NOT TESTABLE WITH CURRENT SAFE FIXTURE`: a live specimen would require an
  unsupported or unjustified mutation; stronger safe evidence may still pass
  the underlying requirement.
- `SUPERSEDED`: valid historical evidence that is not current authority.
- `UNRECOVERED HISTORICAL SPECIMEN DETAIL`: the original label or identifier is
  unavailable; this is not itself a failed underlying acceptance behaviour.
- `BLOCKER`: an underlying Issue #39 acceptance behaviour lacks sufficient
  evidence or contradicts a locked safety requirement.

## Reconciliation and drift findings

At evidence cut-off, GitHub and the clean local clone agree on `main` commit
and tree. The open-PR search returned zero pull requests. PR #50 is the last
merged activation change.

No current-authority conflict was found in the final acceptance state. Older
task-scoped documents and comments describe then-current gaps such as an
unconfigured durable Billing adapter, absent durable Video state, or a missing
refund policy. Those statements are historical at their stated baselines and
are superseded by PRs #40, #47, #48 and #50 and the later live checkpoints.
No newer authoritative record contradicts the 1 September canonical lock.

The activation change lineage is:

| Authority | Result used by this pack |
| --- | --- |
| PR #40 / BG-ACT-001B | Durable media authority, customer Video, activation gates and tenant-safe reference handling; merged as `035b355d…` |
| Issue #41 | Historical infrastructure reconnaissance; explicitly superseded after dedicated staging activation |
| PR #42 | Real-Veo request-contract blocker corrected; merged as `f6757f4a…` |
| PR #44 | Dedicated Stripe webhook ingress added; merged as `ead3f151…` |
| PR #45 | Stripe Dahlia `invoice.paid` compatibility corrected; merged as `172a33e3…` |
| Issue #46 / PR #47 | Durable PostgreSQL Video state added; merged as `43e9ea4b…` |
| PR #48 | Restart-safe Billing reconstruction added; merged as `b506ac98…` |
| Issue #49 / PR #50 | Bounded post-debit refund policy wired; merged as canonical `5df5b470…` |
| Issue #51 | Separate launch-preparation programme; it cannot alter Issue #39 technical authority or authorise production |

## Issue #39 final report

### 1. Canonical baseline SHA/tree

`main` is `5df5b470a4472c479907a900754f2ab352b36826`, tree
`82a5cd092bcdbbca69b09ae170a1b547068df2a9`. The local clone was clean and
matched `origin/main`. GitHub reported zero open pull requests at task start.

Classification: **LIVE REPOSITORY PASS**.

### 2. Staging environment

The preserved environment is the dedicated non-production BizGenie staging
stack. The main API is `bizgenie-api-staging`; the canonical evidence revision
is `bizgenie-api-staging-00021-5fd`, serving 100% traffic from the exact
`5df5b470…` artifact. Stripe used test mode through a separate webhook ingress.
The database, media bucket and provider output prefix were staging resources.

The evidence pack intentionally omits hostnames, credentials, signed URLs and
secret values.

Classification: **LIVE STAGING PASS**. Evidence: Issue #39 comments
[`5485470335`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485470335)
and
[`5432459421`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5432459421).

### 3. Preflight findings

Preflight found a safe dedicated staging target and several bounded repository
or staging blockers. Each was resolved without production mutation:

- missing activation/media/customer-Video seams: PR #40;
- obsolete Veo `task` parameter: PR #42;
- authenticated main API unsuitable as public Stripe webhook ingress: PR #44;
- Stripe Dahlia invoice shape: PR #45;
- process-local Video orchestration state: Issue #46 / PR #47;
- process-local Billing settlement reconstruction: PR #48;
- missing production-composition refund policy: Issue #49 / PR #50.

The older Issue #41 reconnaissance baseline is **SUPERSEDED** by its closure
comment and the later live evidence.

Classification: **STAGING-CORROBORATED PASS**.

### 4. Migration rehearsal

The complete ordered chain is:

1. `20260808170000_create_brand_brains.sql`
2. `20260818010000_create_customer_tenant_authorization_foundation.sql`
3. `20260819231206_create_commercial_credit_ledger_foundation.sql`
4. `20260820010000_create_stripe_subscription_lifecycle.sql`
5. `20260821000000_create_generation_jobs.sql`
6. `20260823001722_durable_billing_authority.sql`
7. `20260823133000_create_durable_media_assets.sql`
8. `20260829143000_create_durable_video_generations.sql`

Issue #41 records successful application of the then-complete chain including
durable media. The later durable-Video restart specimen could only be
reconstructed from a fresh revision because the final Video migration and
PostgreSQL repository were present. CI also parses/applies the chain to a
disposable PostgreSQL 17 database.

Classification: **STAGING-CORROBORATED PASS**. Evidence: Issue #41, Issue #39
comment
[`5465090296`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5465090296),
and `test/postgres-billing.integration.test.js`.

### 5. RLS and privilege evidence

All tenant, job, Billing, Stripe, media and Video authority tables enable RLS.
The financial, generation-job, media and Video migrations revoke direct table
authority from customer-facing roles; the Billing and media boundaries also
revoke `service_role`. Server-side authorization remains mandatory even where
RLS is present. Real-PostgreSQL tests prove customer roles cannot mutate the
ledger and cross-boundary media lookup is denied.

Classification: **REAL-POSTGRESQL / DETERMINISTIC PASS**. Evidence:
`test/authorization-migration.test.js`, `test/billing-migration.test.js`,
`test/postgres-billing-migration.test.js`, `test/media-activation.test.js`, and
`test/postgres-billing.integration.test.js`.

### 6. Staging commercial policy configuration

Staging used non-production policy IDs `staging.test.v1`,
`staging.standard.v1` and `staging.pro.v1`. The Golden Journey used the active
`staging.standard.v1` entitlement and server-owned costs of 1 credit for
`text.standard`, 2 for `image.normal`, and 5 for `video.normal`. These are
staging evidence values, not production economics. Production policy approval
for every launch class remains a separate paid-beta/production decision.

Classification: **LIVE STAGING PASS** for staging policy; **NOT AUTHORISED** for
production policy. Evidence: comments
[`5432459421`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5432459421)
and
[`5446498773`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5446498773).

### 7. Auth and service configuration

Tenant A used canonical verified Supabase Auth, membership, tenant/project and
optional Brand Brain authorization. The successful paid calls were bound to
the authenticated user and `generation:execute`. Invalid service credentials
returned a non-enumerating HTTP 403 in staging. The insufficient-scope branch
returns the same 403 in the canonical automated contract.

The healthy staging fixture has one valid service principal with the required
scope and no second valid intentionally under-scoped credential. A new live
scope specimen is therefore not justified.

Classification: **STAGING-CORROBORATED PASS**. Evidence: comments
[`5483760870`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5483760870)
and
[`5485536427`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485536427),
plus `test/service-principal-middleware.test.js` and
`test/service-execution.test.js`.

### 8. Media storage and reference ownership

The live Image and Video outputs were durable, active, linked to the immutable
Tenant A job, and bound to Tenant A/project A. Storage identities are derived
server-side; the private bucket contract requires uniform bucket-level access
and public-access prevention. Cross-tenant/cross-project references, revoked
rights and caller-provided locations are rejected before provider or storage
access. Video retries reuse the accepted operation and do not create a second
submission; persistence failures remain recoverable.

Classification: **STAGING-CORROBORATED PASS**. Evidence: Golden Journey comment
[`5446498773`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5446498773),
canonical lock
[`5495297859`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5495297859),
`test/media-activation.test.js`, `test/video-generation.test.js`, and
`test/postgres-billing.integration.test.js`.

### 9. Image provider

Tenant A Image completed through the configured real staging provider, created
one 2-credit reservation/debit pair and one durable authorised JPEG. Raw
provider details and storage URLs are not included here. The provider contract
fails closed and storage failures do not create a false successful asset.

Classification: **LIVE STAGING PASS**. Evidence: comment
[`5446498773`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5446498773),
`test/openai-image-provider.test.js`, and `test/image-generation.test.js`.

### 10. Video provider

Tenant A Video returned 202 while submitted, was polled to completion, produced
one durable authorised MP4, and settled one 5-credit debit. PR #42 corrected
the real-provider request contract. The separate restart specimen later
completed from a fresh revision without resubmission or duplicate settlement.

Classification: **LIVE STAGING PASS**. Evidence: comments
[`5446498773`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5446498773)
and
[`5465090296`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5465090296),
plus PR #42.

### 11. Stripe test mode

Hosted Checkout, tenant-owned Customer mapping, active subscription and
entitlement, a single 100-credit monthly grant, cancellation, cancelled-state
generation denial and replay/idempotency were exercised in Stripe test mode.
The balance moved 193 to 293 once. Deterministic tests cover `past_due` to
grace; that transition was not represented as a live failed-payment specimen.
No live Stripe object or payment was created.

Classification: **STAGING-CORROBORATED PASS**. Evidence: comments
[`5432459421`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5432459421),
[`5485650269`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485650269),
and
[`5485671741`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485671741),
plus `test/stripe-billing.test.js` and
`test/postgres-billing.integration.test.js`.

### 12. Frontend integration

The authenticated customer API and hosted Checkout path were exercised
against staging. The post-Checkout redirect returned 403 because the staging
success URL pointed at the protected API root. That is a frontend/configuration
UX limitation, not a failed subscription, funding or generation lifecycle.
Issue #51 remains the separate public website, paid-beta form, pricing and
launch-preparation programme; its current form has no live submission endpoint.

Classification: **PARTIAL** for public frontend integration; **PASS** for the
Issue #39 authenticated backend and Stripe lifecycle under test. This does not
remove the production activation decision gate.

### 13. Tenant A Golden Journey

The authenticated Tenant A sequence completed Text, Image and asynchronous
Video generation using immutable jobs, durable Billing and durable media:

| Path | Sanitised execution reference | Result | Financial result |
| --- | --- | --- | --- |
| Text | `staging-text-golden-1787872217` | HTTP 200, completed output | one reservation + one debit, 1 credit |
| Image | `staging-image-golden-1787873280` | HTTP 200, durable authorised JPEG | one reservation + one debit, 2 credits |
| Video | `staging-video-golden-1787873576` | HTTP 202 then HTTP 200, durable authorised MP4 | one reservation + one debit, 5 credits |

The sequence reconciled exactly from 293 to 285, eight credits consumed and
zero reserved at completion.

Classification: **LIVE STAGING PASS**. Evidence: comment
[`5446498773`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5446498773).

### 14. Tenant B isolation matrix

`B-ISO-01` and `B-ISO-02` are not reused below as if their original meanings
or execution identifiers were known. The matrix maps the underlying Issue #39
requirements to later preserved evidence.

| # | Requirement | Classification | Evidence type and citation | Sanitised execution reference | Observed response | Side-effect result | Remaining limitation |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | B cannot read A project data | STAGING-CORROBORATED PASS | Live identifier-injection lock in comment `5467632205`; `test/authorization.test.js` and `test/customer-generation-job-boundary.test.js` | Original B-ISO detail unrecovered | Customer boundary uses sanitized HTTP 404 `RESOURCE_NOT_AVAILABLE` | denied request creates no job/provider call | original B-ISO label/ref unavailable |
| 2 | B cannot read A Brand Brain | LIVE STAGING PASS | comment [`5486305335`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5486305335); `test/brand-brain-generation.test.js` | `staging-brand-isolation-1788219242` | HTTP 404 `RESOURCE_NOT_AVAILABLE` | 0 generation jobs; 0 ledger rows | none for underlying requirement |
| 3 | B cannot access A generation job | STAGING-CORROBORATED PASS | live Video status/access lock in comment `5467632205`; `test/customer-video-activation.test.js` and `test/customer-generation-job-boundary.test.js` | original historical execution ref unrecovered | HTTP 404 at customer Video boundary; customer credential receives 403 at service boundary | 0 provider polls; 0 debit/release | original B-ISO detail unavailable |
| 4 | B cannot execute A job | AUTOMATED CONTRACT PASS | `test/service-execution.test.js` and `test/customer-generation-job-boundary.test.js`; invalid credential live comment `5483760870` | none; no fabricated specimen | non-service/customer credential: 403 `Forbidden`; injected authority cannot reinterpret immutable job | job authority unchanged; no customer-triggered execution | no dedicated cross-tenant live service credential specimen |
| 5 | B cannot retrieve A Image asset | STAGING-CORROBORATED PASS | live A-media-as-B-reference lock in comment `5467632205`; `test/media-activation.test.js`; real-PostgreSQL media lookup test | original historical execution ref unrecovered | non-enumerating media unavailable denial | no storage download/provider call | no separate public raw-download route/specimen; private reference boundary is authoritative |
| 6 | B cannot retrieve A Video asset | STAGING-CORROBORATED PASS | live A Video status/access lock in comment `5467632205`; `test/customer-video-activation.test.js` | original historical execution ref unrecovered | HTTP 404 `RESOURCE_NOT_AVAILABLE` | 0 provider polls; 0 settlement | original B-ISO detail unavailable |
| 7 | B cannot use A media as an unauthorised reference | STAGING-CORROBORATED PASS | live reference denial in comment `5467632205`; `test/media-activation.test.js` and `test/video-generation.test.js` | original historical execution ref unrecovered | sanitized media/reference unavailable | no provider call and no storage download | original B-ISO detail unavailable |
| 8 | B cannot alter A subscription/entitlement | STAGING-CORROBORATED PASS | live B Stripe checkout/mapping denial summarized in comments `5467632205` and [`5485650269`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485650269); `test/stripe-billing.test.js` | preserved label `B-ISO-07`; full execution ref not retained | request rejected at tenant/owner boundary | no Stripe object, entitlement or B-ledger mutation | full live request identifier unavailable |
| 9 | B cannot reserve A credits | STAGING-CORROBORATED PASS | Brand Brain live denial comment `5486305335`; `test/billing.test.js`; real-PostgreSQL reconstruction/isolation test | `staging-brand-isolation-1788219242` for live no-ledger proof | HTTP 404 before Billing | 0 ledger rows; cross-tenant reservation rejected | original B-ISO detail unavailable |
| 10 | B cannot debit A credits | REAL-POSTGRESQL / DETERMINISTIC PASS | `test/billing.test.js` “does not let Tenant B settle Tenant A's reservation”; `test/postgres-billing.integration.test.js` reconstruction/isolation | none required | financial resource unavailable | A reservation remains; B balance unchanged | no dedicated live debit-forgery specimen, safely unnecessary |
| 11 | B cannot refund A credits | REAL-POSTGRESQL / DETERMINISTIC PASS | `test/postgres-billing.integration.test.js` “refunds the original tenant-bound debit once under concurrency” | none required | cross-tenant refund raises financial resource unavailable | exactly one A refund only; B cannot add one | no dedicated live refund-forgery specimen, safely unnecessary |
| 12 | B cannot reuse A Stripe mapping | STAGING-CORROBORATED PASS | comment [`5485650269`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485650269); real-PostgreSQL Stripe isolation test | preserved label `B-ISO-07`; full execution ref not retained | rejected at tenant boundary / mapping unavailable | no checkout, mapping or B-ledger mutation | full live request identifier unavailable |
| 13 | B cannot inject A IDs through body/query/header | STAGING-CORROBORATED PASS | live identifier-injection lock in comment `5467632205`; `test/service-execution.test.js` “cannot reinterpret a Tenant B job using Tenant A request authority” | original historical execution ref unrecovered | customer route denied, or bounded service response retains stored authority | immutable tenant/project/brand/class unchanged | original B-ISO detail unavailable |
| 14 | Denials are sanitised and non-enumerating | LIVE STAGING PASS | Brand Brain comment `5486305335`; invalid credential comment `5483760870`; customer/service boundary tests | `staging-brand-isolation-1788219242` | 404 `RESOURCE_NOT_AVAILABLE` or 403 `Forbidden` without existence detail | no diagnostic leakage or authority mutation | different boundaries intentionally use 404 vs 403 |
| 15 | Failed attempts create no inappropriate generation, ledger, media or Stripe effects | STAGING-CORROBORATED PASS | live 0-row Brand Brain proof; comment `5467632205`; Video/media/Stripe/Billing tests | `staging-brand-isolation-1788219242` plus unrecovered historical refs | fail-closed denial | 0 jobs/ledger for live Brand case; tests prove 0 provider/storage/Stripe effects | original B-ISO specimen identifiers remain unavailable |

Summary: all 15 underlying isolation behaviours are covered. The evidence mix
is deliberately not described as 15 separate live specimens. Missing original
labels do not override the later live and durable evidence.

### 15. Ledger, reservation, debit, release and refund evidence

- Golden Journey: exactly three reservations and three debits totalling eight
  credits; 293 to 285; zero reserved; no refund.
- Provider terminal failure: exactly one release, no debit, idempotent across
  reconstruction.
- Duplicate request: one job, one reservation, one debit, no release/refund.
- Lost acknowledgement: committed effects are recovered by identity; provider
  execution is not repeated.
- Refund: the only approved reason is
  `durable_output_unavailable_after_debit`; it must match the immutable debit,
  tenant and job and remains exactly once. Pre-debit failure releases instead.
- Cross-tenant reserve/debit/refund and project correlation fail closed in the
  real-PostgreSQL suite.

Classification: **STAGING-CORROBORATED PASS**.

### 16. Failure-drill matrix

| Drill | Classification and evidence level | Expected error/outcome | Provider execution | Ledger result | Durable-state result | Evidence citation | Further execution justified? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Insufficient credits | REAL-POSTGRESQL / DETERMINISTIC PASS | customer HTTP 402 `GENERATION_CREDITS_UNAVAILABLE`; durable domain rejects insufficient availability | none | no reservation/debit; balance unchanged | no job settlement/output | comment [`5485591267`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485591267); generation-Billing and PostgreSQL tests | No; low balance cannot be safely manufactured with current fixture |
| Billing unavailable | STAGING-CORROBORATED PASS | HTTP 503 `GENERATION_BILLING_UNAVAILABLE` | blocked, or accepted operation is not resubmitted during settlement recovery | no silent effect; original durable reservation preserved | historical live restart failed closed, then same specimen recovered after PR #48 | comment [`5485616161`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485616161) | No; do not manufacture an outage |
| Provider failure after reservation | REAL-POSTGRESQL / DETERMINISTIC PASS | original sanitized provider failure | one accepted attempt; no paid retry | exactly one release; no debit | durable Video `failed`; reconstruction remains idempotent | comment [`5485632051`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485632051); customer Video tests | No; do not manufacture a paid failure |
| Duplicate/replayed request | LIVE STAGING PASS | both requests return HTTP 200 completed for same execution | no independent second execution effect; provider call count was not separately preserved | one reservation, one debit, no release/refund | exactly one immutable job | comment [`5480410727`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5480410727), execution `staging-text-replay-1788187979` | No |
| Lost acknowledgement/retry | STAGING-CORROBORATED PASS | retry resolves committed result | exactly one provider execution | one of each committed effect; no duplicate | result/ledger reconstruct from PostgreSQL | canonical lock `5495297859`; PostgreSQL lost-ack tests | No |
| Stale asynchronous Video completion | STAGING-CORROBORATED PASS | terminal state cannot resurrect; repeated poll returns same completion | no resubmission | one reservation and one debit | same durable Video/asset survives revision replacement | comments `5465090296` and `5495297859`, execution `staging-video-restart-1788036190` | No |
| Invalid service credential | LIVE STAGING PASS | HTTP 403 `Forbidden` | none | none | no job/authority mutation | comment [`5483760870`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5483760870) | No |
| Insufficient service scope | AUTOMATED CONTRACT PASS; NOT TESTABLE WITH CURRENT SAFE FIXTURE live | HTTP 403 `Forbidden`, same as missing/invalid | none | none | job unchanged | comment [`5485536427`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485536427); service-principal/service-execution tests | No; a new credential would be evidence-only staging mutation |
| Wrong tenant/project/Brand Brain | LIVE STAGING PASS for Brand Brain; deterministic for project | HTTP 404 `RESOURCE_NOT_AVAILABLE` | none | 0 live ledger rows | 0 live jobs | comment [`5486305335`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5486305335), execution `staging-brand-isolation-1788219242` | No |
| Wrong asset ownership | STAGING-CORROBORATED PASS | sanitized media/reference unavailable | none | none | no download and no new asset | canonical lock plus media activation tests | No |
| Wrong Stripe mapping | STAGING-CORROBORATED PASS | tenant/mapping unavailable | no Stripe creation | no grant or ledger change | canonical mapping unchanged | comment [`5485650269`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485650269) | No |
| Webhook replay | STAGING-CORROBORATED PASS | replay acknowledged as replay | no provider relevance | one monthly grant only | immutable event identity/result reused | comments `5432459421` and [`5485671741`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485671741); PostgreSQL replay test | No |
| Storage failure | REAL-POSTGRESQL / DETERMINISTIC PASS | sanitized storage/provider error; retry remains bounded | Image persistence is not retried; Video polls accepted operation without resubmission | no debit before durable output; reservation remains recoverable | no false completed asset; Video remains processing/retryable | canonical lock `5495297859`; Image and Video provider tests | No; do not damage staging |
| Application restart/reconstruction | LIVE STAGING PASS | same accepted Video completes from fresh revision | no second submission | exactly one original 5-credit reservation and one debit | same Video record and durable MP4 recovered | comment [`5465090296`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5465090296) | No |
| Bounded post-debit refund qualification/rejection | STAGING-CORROBORATED PASS | only named durable-output failure qualifies; other reasons/authority mismatches deny | no provider action in refund seam | qualifying test: one refund; replay: no duplicate; non-qualifying: none; pre-debit: release | exact PR #50 code deployed healthy; no artificial live refund transaction | comment [`5485470335`](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5485470335); `test/refund-policy.test.js` and generation-Billing/PostgreSQL tests | No; current runtime has no safe natural live trigger |

### 17. Restart and recovery

The preserved Video `staging-video-restart-1788036190` was submitted on one
revision, found after revision replacement, exposed the old Billing
reconstruction defect, and then completed from the exact same durable state
after PR #48. PostgreSQL contains one original 5-credit reservation and one
later debit referencing it, with no duplicate reservation, release or debit.

Classification: **LIVE STAGING PASS**.

### 18. Evidence-pack location

Canonical path:
`docs/activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md`.

The Mission Control index in `docs/mission-control/README.md` points here.

### 19. Production mutation state

**UNTOUCHED / UNAUTHORISED.** This evidence task performed no production
deployment, migration, configuration change, provider call, Stripe action or
activation. The proposed verdict is not production approval.

### 20. Unresolved blockers and limitations

No underlying Tenant B isolation, Billing authority or provider-settlement
acceptance blocker remains in the preserved Issue #39 contract.

Recorded non-blocking limitations:

- original `B-ISO-01`/`B-ISO-02` labels, request identifiers and detailed
  specimens remain **UNRECOVERED HISTORICAL SPECIMEN DETAIL**;
- insufficient scope has canonical automated proof but no dedicated live
  under-scoped credential, because the healthy fixture has only the required
  scope;
- `past_due` to grace is deterministic rather than a live failed-payment drill;
- the public frontend/paid-beta form and post-Checkout success destination are
  launch-preparation work in Issue #51;
- production commercial policy, pricing, release timing and activation remain
  separate human decisions.

These limitations do not justify unsafe or aesthetic-only staging retests.

### 21. Rollback readiness

The last recorded staging deployment was healthy at revision
`bizgenie-api-staging-00021-5fd`. Revision
`bizgenie-api-staging-00020-5tj` is the immediately preceding preserved healthy
revision and restart/reconstruction PASS specimen. Application rollback must
preserve additive database authority and use forward-fix for immutable
financial and ownership records. No rollback is required for this
documentation-only change: revert its commit or close the PR without merge.

Classification: **READY**, subject to the existing operator approval gates.

### 22. Final verdict

**STAGING GOLDEN JOURNEY PASSED — READY FOR CONTROLLED PAID-BETA DECISION**

Why the verdict remains supported despite missing historical specimen labels:
the labels are not acceptance behaviours. Later preserved live evidence plus
canonical deterministic and real-PostgreSQL tests cover every individual
Issue #39 isolation row, while Billing and provider settlement have live or
durable acceptance proof. No authoritative record contradicts those results.

This verdict permits only a separate controlled paid-beta/production-
activation decision. It does not authorise production, close Issue #39, approve
commercial policy, or merge this evidence change.

## Mission Control state and exact restart point

- BG-ACT-001 status: **review — final evidence reconciled; Issue #39 remains
  open pending human review**.
- Complete/pass cells: baseline, dedicated staging, migration chain, RLS,
  staging policy, Auth/service boundary, media, Image, Video, Stripe test
  lifecycle, Tenant A Golden Journey, all 15 isolation behaviours, ledger,
  failure drills, restart/recovery and rollback readiness.
- Partial cell: public frontend integration; tracked separately under Issue
  #51 and not an underlying paid-execution authority gap.
- Unrecovered cells: historical `B-ISO-01`/`B-ISO-02` specimen detail only.
- Production: untouched, disabled and unauthorised.
- Exact restart point: **human review of the BG-ACT-001L evidence PR against
  Issue #39; do not merge, close Issue #39 or activate production without the
  next explicit authority**.
- Issue #51 remains the separate parallel launch-preparation programme and
  cannot change this technical activation gate.
