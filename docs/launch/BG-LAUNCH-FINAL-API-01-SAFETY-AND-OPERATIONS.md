# BG-LAUNCH-FINAL-API-01 — source safety, commercial gates and operator runbook

15 November2026. Accepted baseline ed680727e067532518bdfce8a3e12fbbb483147f. Bounded work packages C–I; reuse accepted implementation, no activation or financial-policy change. Source tests are distinct from runtime/commercial acceptance. New source additions are golden-journey and unsupported-financial-event regression tests plus these runbooks, not a new platform.

## C. £100 aggregate provider safeguard — source verified, configuration blocked

Authority: #234 current accepted code, not its stale description of an old daily stack. `src/provider-spend/index.js`, estimateAuthority.js, dispatch.js, fencedWorkerScope.js; `src/activation/premiumComposition.js`; concrete SDK admission in src/generation.js, image-generation/openaiProvider.js, video-generation/googleVeoProvider.js.

- One PostgreSQL UTC-calendar-month bucket, cap_minor exactly10000/customer_limit10; approved cohort must contain at most ten active tenants. It is neither a per-customer cap, daily allowance nor customer credit entitlement.
- Cross-instance advisory transaction lock, schema/ACL/RLS checks, durable reservations and dispatch token/worker fencing. Runtime may not edit policy/cohort/delete ledger. In-memory/free mocks do not replace financial authority.
- Native price bound and explicit fees required. GBP requires explicit fx:null; USD requires approved numerator/denominator/source/version/expiry, ceil rational conversion with BigInt then GBP fees. Other/unknown currency fails closed. Total must fit approved GBP upper bound. No default zero-fee or guessed FX/rate.
- Policy source/version/validity and estimate expiry checked at reservation and dispatch. Runtime policy hash prevents stale reservations dispatching under changed authority. DB unavailable, unknown/inactive11th customer, unsafe role/schema, stale/disabled/unavailable policy and exhausted cap prevent paid dispatch.
- One execution identity per job/operation; restarts/ambiguous outcomes cannot replay or release exposure. Partial/final bills conservatively retain the bound; only proven pre-dispatch cancellation releases it. Late invoices/month transitions/clock regression are bounded; over-bound bill triggers durable global hold.
- Concrete real SDK/fetch defaults deny outside reviewed fenced worker scope. Premium composition takes explicit server-injected providerSpend AND providerSpendOperations together, not user/env cost guesses. Missing operation authority denies. Reconciliation is a one-shot operation identity; repeated video observations and actual charge authority must be approved before live use, not bypassed with random operation IDs.

Focused provider/FX/teardown checks **32/32 PASS**, including independent pools/processes and restricted runtime DB role. Existing test/provider-spend.postgres.integration.test.js covers concurrency, exact cap, cohort11, ambiguity, cancellation race, acknowledgement loss, breach/late correction, UTC rollover and policy/FX expiry. No new mechanism needed. No real tariff established.

### Operator configuration guide (not executed)

Existing provider_spend_policy stores enabled, version/source_ref, currencyGBP, cap10000, customer_limit10, valid_from/valid_until and estimates. Approved model-operation entries need currency/upper_bound_minor/source_ref/version/valid_until plus `authority:{native_currency,native_bound_minor,fees_gbp_minor,fx}`. Confirm the exact accepted parser fields before entering policy; no SQL/config written here. Disable an operation by withholding its approved worker mapping/estimate, or disable the whole policy; no per-estimate enabled flag is implemented or implied. Approved cohort is server-owned tenant identities, never customer inputs. Worker maps operation→estimateVersion, binding durable job/tenant/project/brand/token/fence and current rights before actual SDK dispatch.

Required actual decisions: operator-reviewed prices for configured Gemini/text, GPT Image/model-quality-size-format, Veo model/duration/resolution/audio, transfer/reconciliation/fees; native billing currency; FX authority and expiry; explicit fee assumptions; exact pilot cohort; billing evidence/settlement/recovery operator; budget alerts and hold handling. All actual values remain UNKNOWN/UNAPPROVED here. No test number is a real tariff. Do not alter the £100 ceiling to resolve a denial; do not conflate internal provider exposure with60 customer credits. Keep all real-provider profiles disabled until this evidence and explicit activation authority exist.

## D. PostgreSQL async teardown — already fixed, no repeat implementation

Source issue246 root: pg-pool `_remove` retires a client before asynchronous socket shutdown completes; old FORCE DROP could kill it after Pool.end resolved and emit57P01 outside the test. Accepted test/helpers/drained-pg-pool.js waits for client end events, drains sibling operations, ordinary-drops fixtures and surfaces shutdown failures. No global error suppression/sleep/retry added.

Deterministic test/pg-pool-shutdown.integration.test.js proves raw end returns early, ordinary DROP55006 and intentional FORCE57P01, then drained end→ordinary DROP succeeds. Historical preserved Runtime09 evidence: ten33/33 focused runs;1311/1311 full at concurrency2 and4 on the relevant fix. New accepted-main combined spend/teardown run32/32 PASS. Main ed680727 CI43656707919 SUCCESS2/2. Unchanged helper was not rewritten or subjected to ten pointless new runs. New golden fixture also reuses it. This closes source repair evidence, not all runtime database readiness.

## E. Tenant/runtime evidence — source PASS, actual app-pool BLOCKED

Existing tests exercise owner/member/foreign/revoked HTTP boundaries, transaction revocation races, RLS/schema preflight and scoped media denial. Source Brain guardedUpsert locks authority/current record; onboarding commit rechecks owner/project/brand in the write transaction. Test administrators do NOT prove the actual Cloud Run pool role.

Approval-gated #245 packet is incorporated in STAGING-RELEASE section4: actual current_user/session_user and privilege metadata/RLS/preflight from a borrowed actual app-pool client, never SQL Editor. No customer rows, SET ROLE, DDL/DML, secret payload, live Job or new endpoint. Actual method/source/revision/operator/cost/timeout/redaction/rollback must be separately approved; same-config Job is not proof of running process identity. Source-only deferment of231 remains intact, not retroactively executed. Supabase and service-account isolation remain operator metadata requirements, not guessed PASS.

## F. Stripe and credits — offline contract, proposed tariff not activated

Existing `src/billing/stripe/{config,service,fencedRepository}.js`, billing/postgresRepository.js, commercialCatalog.js and tests stripe-billing/webhook/postgres-billing/paid-beta. Real provider is NEVER called in these checks. Signature tests use synthetic SDK/HMAC fixtures; PG tests use disposable databases.

Source covers server-owned price/policy mapping, owner/tenant linkage, request idempotency, raw-body signatures, environment/API-version checks, event hash/replay, subscription lifecycle/out-of-order reconciliation, monthly grants, reserve/debit/refund/insufficient balance, customer eligibility and ambiguous acknowledgements. Existing optional FencedStripeBillingRepository/recoverVerifiedEvent tests prove abandoned-claim fencing, crash-after-grant recovery and stale-owner exclusion. It is an **opt-in draft**, not selected by production composition; do not declare interrupted-claim runtime risk solved. Ordinary processing claims may remain held pending controlled recovery. No recovery policy/composition or shared schema enabled here.

The £99/month +60-credit Standard target is PROPOSED in this work order, NOT a live tariff decision. Existing60-credit paid-beta fixture is not proof of approved Standard Stripe pricing/entitlements or image/video access. CommercialCatalog requires approved plan/version/amount/currency/cadence/tax/terms/credit/policy/entitlement and Stripe-mode mapping consistency; no browser price IDs or default allowances. Existing env names include STRIPE_MODE, STRIPE_PRICE_STANDARD, STRIPE_POLICY_STANDARD, STRIPE_SUCCESS_URL/CANCEL_URL plus server-only keys; do not put values in public documents. Approval must resolve VAT inclusive/exclusive/jurisdiction, legal identity/terms, renewal/cancellation/refund/dispute, credit expiry/carryover/proration/overage and entitlement details. No £99/60 changes made.

`ALLOWED_STRIPE_EVENTS` currently excludes refund/dispute events. New test/stripe-unapproved-events.test.js proves those events return handled:false without claim or credit/refund effects. This is a safe non-effect boundary, NOT automatic refund/dispute support. Approved operator/financial policy required before such effects; don't infer subscription deletion should erase/reverse consumed credits. No new ledger architecture or financial behavior implemented.

### Exact hosted drill plan — NOT AUTHORISED / NOT RUN

After founder approves mapped test-mode price/policy/catalogue, isolated test tenants and key/webhook bindings: verify owner checkout with SAME request_id on ambiguity; no entitlement before verified event; deliver signed controlled paid invoice and duplicate/out-of-order replay; verify one durable grant, period references and subscription state; exercise approved failed-payment/cancellation transitions; reconcile balances/ledger/claim state using approved operator tooling. Missing configuration/foreign/nonowner/unsigned event must deny. Any real Stripe test-mode network call is outside this instruction. All actual test transaction, refund/dispute policy, tax/terms and provider configuration remain gated. Production untouched, checkout gatefalse.

## G/H. Media/video/social readiness matrix

| Capability | Source evidence / result | Actual hosted gate |
|---|---|---|
| Quote→credit→fenced job→media adapter | premium-composition-worker and generation-quotes integration tests use real PG, router, execution policy, job fencing and billing with provider mocks | Operator wiring, approved provider prices/cohort and generation activation UNKNOWN/OFF |
| Real encoded4s video validation | Existing ffmpeg-generated bytes test inspector MIME/codec/duration/audio/aspect, invalid output, recoverable failures | This is NOT a real provider-generated4s video or deployed sandbox acceptance |
| Asset/attachment provenance | Real records/jobs/revision/rights/version associations plus synthetic object store | Real private GCS/R2 storage/IAM/object metadata NOT RUN |
| Private preview | Tests deny missing/foreign/admin substitution/revoked/stale generation/rights; generation-pinned reads, safe MIME/size, CORS, bounded206 ranges, cancellation and in-flight recheck | Real playback/egress/concurrency/storage proof NOT RUN; no unrestricted signed URL exposed |
| Signed URL expiry | Browser media delivery is authenticated streaming, not an unrestricted public signed-URL contract; credential/token-expiry and provider upload URL rules are separate | Do not claim a nonexistent browser signed-URL-expiry feature or licence-expiry enforcement |
| Failed/retried/cancelled jobs | Existing durable worker/credit/provenance tests hold ambiguity, prevent duplicate provider/debit and bind attachment to current revision | Real restart/provider reconciliation remains separately approved |
| Calendar content | New goldenPG test proves persisted draft variant/campaign in unscheduled calendar and foreign denial, no schedule | Founder gate admits only persistence writes; broader journey writes not activated |
| TikTok | OAuth state/internalPKCE, token-vault binding/rotation, revocation, exact upload URL/range/cancellation/errors, durable inbox status tested with deterministic transport | Portal app/scopes/redirect and hosted callback/vault UNKNOWN; no OAuth account or upload performed |
| TikTok state truth | SEND_TO_USER_INBOX means uploaded/awaiting creator action, not published. Direct Post/video.publish not enabled. PUBLISH_COMPLETE is not invented public visibility/URL | Real creator action/moderation verification NOT RUN |
| LinkedIn | OIDC identity/openid/profile, scoped member lifecycle, fail-closed posting policy and local credential revocation tests | Member text posting requires configured approved current Posts contract; images/video/org/analytics/refresh/remote revoke unsupported or gated, not inferred from scopes |
| Public callbacks | API social router includes state-checked relay; owner+browser verifier still required for oauth-complete. Bridge does not carry GET social/oauth/callback | Actual registered redirect reachability/public relay/private upstream topology unresolved; do not expose private API or add unauthenticated routes without separate reviewed authority |
| Analytics | Existing scoped ingestion/measurement/provenance/snapshot tests; insufficient evidence stays explicit | No platform analytics permission or fabricated metrics; external approval/integration remains UNKNOWN |

Focused financial/media/social run **332/332 PASS**, zero fail/skip/cancel. New unsupported-event safety check1/1. Full suite separately reported in final checkpoint; counts from overlapping runs must not be added together. No new provider profile, social platform, runtime sandbox permission or external callback activation.

## I. First-ten-customer operator checks / observability

No new infrastructure or diagnostic endpoint. Use existing redacted application codes and permitted Cloud Run/service metadata. Verify observation access separately; this document authorises no live queries/customer-data access. General request-ID header forwarding is NOT uniform: use existing Cloud Run trace metadata where available and stable operation/job/event/idempotency IDs in approved private records; do not invent an end-to-end ID or log bearer headers/customer payloads.

| Signal | Existing operator action / safe response |
|---|---|
| Revision/health/CORS | Match served WEB/appSHA, bridge digest/upstream pin/traffic/rollback; supported OPTIONS204 and unauthenticated GET401; root404 not health success |
| Auth/tenant denial | Count401/403/404 without tokens/user payloads; wrong issuer/project or foreign data stops testing, never remove checks |
| Workspace refusal/save ambiguity | Distinguish STAGING_WRITES_DISABLED, owner denial,400/422 validation,409 conflict,429 allowance,5xx unknown outcome; GET saved state before same-key retry |
| Provider-spend denial | Preserve code/operation reference; missing/stale policy/cap/ambiguity blocks call; reconcile authoritative ledger, never raise cap or assume failure free |
| Credit exhaustion | Server eligibility/balance denial; no manual free-credit adjustment or entitlement from onboarding completion |
| Worker/media failure | Preserve durable job/fence/generation identity; do not rerun ambiguous paid work, disclose buckets or fabricate assets; revoked media must stop delivery |
| Stripe replay/claim | Verify same event hash/one financial effect through approved tools; held processing claim requires reviewed fenced recovery, not browser override or regrant |
| OAuth failure | Redacted state/config/error only; no token/code logging, no unsupported grant or public-post retry |
| Rates/resources | Respect existing per-user60/min, concurrency8,30s bridge timeout and media byte/range bounds; no throughput override to force a pilot |
| Backup/recovery | Require actual backup/PITR and isolated restore proof before runtime/data changes; none established by source tests |

Evidence to existing191/249 and canonical Mission Control only after successful write/readback. No duplicate tracker/financial ledger; PostgreSQL is financial authority. Abort/rollback is in STAGING-RELEASE section6. Price, runtime, security/legal and hosted customer gates remain; source/mock PASS never means launch GO.
