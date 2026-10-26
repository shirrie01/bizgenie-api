# BG-STUDIO-019 — commercial and credit handoff

26 October 2026. Draft/local mock evidence only. Staging RED; launch NO-GO.

## Canon recovery and founder gate

No approved public monetary schedule or terms was found in accessible source/history. Sources inspected: `docs/product/BizGenie_Canon_v2.md` (does not approve pricing/legal), billing foundation commit `5b7fafb`, Stripe lifecycle `9368b54`, generation accounting `feace19`, paid-beta `dd2d53d`, current `src/billing/schema.js`, `src/billing/stripe/config.js`, and frontend #51 report at `0c3078c5`. GitHub API issue/decision comments and sole Mission Control are inaccessible, so this is a source-linked gap report, not proof no canon exists.

| Commercial field | Verified source | Current approved public value |
|---|---|---|
| Plan identifiers | Stripe config: `standard`, `pro` | Identifiers implemented; current marketed names UNKNOWN |
| Amount, currency, cadence | No approved schedule recovered | UNKNOWN |
| VAT/tax presentation and jurisdiction | No approved terms recovered | UNKNOWN |
| Public included credits | Schema stores per-policy monthly grants; paid-beta seed is not public launch authority | UNKNOWN |
| Entitlement mapping | Existing policy/entitlement ledger | Public launch mapping UNKNOWN |
| Effective date/version/approval | No locked launch schedule recovered | UNKNOWN |
| Terms, cancellation and refund references | No approved public references recovered | UNKNOWN |
| Stripe Price mapping | Server-only `STRIPE_PRICE_*` + `STRIPE_POLICY_*` configuration | Actual approved launch mappings UNKNOWN; no env/credential read |

Founder must supply the exact canon source/version, amounts, tax/terms wording, monthly credit grants, effective window and Stripe test/live mapping approval. No £99/£149/£199 or invented allowances are installed. Synthetic example.test fixtures are explicitly not commercial decisions.

## Implemented read contracts

With existing billing composition: `GET /customer/billing/plans?tenant_id=...`, Bearer + authorized tenant read. `commercial-catalog.v1` returns `plans` with plan_code, plan_version, amount_minor, uppercase currency, billing_cadence (month/year), tax {presentation,jurisdiction,wording}, included_credits, **credit_grant_cadence:month**, policy_id, entitlement_codes, effective_from/to, terms {version,url,cancellation_url,refund_url}, approval {decision,source,approved_at}. Server-only catalog must match active commercial policy, monthly allowance and Stripe mode. Price identifiers are omitted from public output. No catalog is wired in production: 503 `{status:"unavailable",error:{code:"COMMERCIAL_CATALOG_UNAVAILABLE",message:"Approved plans and terms are unavailable"}}`. Missing token 401; foreign tenant 404. Existing subscription endpoint unchanged. All customer routes inherit private/no-store and Authorization variance.

`GET /customer/billing/credit-preview?tenant_id&project_id&brand_id&execution_class&spend_cap` requires `generation:create` on the exact brand/project. No client price/balance accepted. `execution-cost-preview.v1` returns tenant/project/brand, execution_class, credit_cost, policy_id, entitlement_id, available_credits, spend_cap, affordability (`within_limit`, `spend_cap_exceeded`, `insufficient_credits`), observed_at, expires_at (+60 seconds), **reserved:false, execution_authorized:false, confirmation_supported:false**. 400 invalid input, 401 auth, 404 foreign scope, 503 `CREDIT_PREVIEW_UNAVAILABLE` for missing policy/cost/balance. Current balance is informational and not an atomic reservation; two parallel reads do not promise capacity to both. Policy pricing is authoritative at observation, not a locked quote.

Claude may show this read-only preview but must **not** present a binding quote, confirmed spend cap or safe chargeable confirmation flow. Existing generation routes still lack a quote requirement. That remains a launch blocker until durable quote/confirm and execution ownership are implemented and reviewed. No provider is called or ledger mutated by preview.

## Draft billing management adapter — NOT MOUNTED

`src/billing/stripe/managementDraft.js` exports a disabled-by-default router. Intended mount `/customer/billing/management`; POST `/portal-session`, `/subscription/change`, `/subscription/cancel`; JSON `{request_id}` plus `plan_code` only for change. Body is strict; caller price/redirect/customer/subscription is refused. Only verified customer owner with `billing:checkout`; rechecked after awaits before session creation. Uses existing tenant->Stripe mapping without creating customers. Refuses live mappings. Server-owned portal configuration and fixed HTTPS return route required. Change/cancel return Stripe-hosted confirmation flows; invoices/receipts remain in Stripe portal. Output 201 `{status:"confirmation_required",portal_url,entitlement_confirmed:false}`. Only https://billing.stripe.com URLs returned. Scoped request key is passed to Stripe idempotency. Existing webhook/entitlement reconciliation remains authority; redirect is not payment, cancellation, refund or entitlement evidence.

Errors: 400 `STRIPE_BILLING_VALIDATION_ERROR`, 401 `AUTHENTICATION_REQUIRED`, 404 `RESOURCE_NOT_AVAILABLE` (owner) / `STRIPE_BILLING_RESOURCE_NOT_AVAILABLE` (mapping), 409 `STRIPE_BILLING_CONFLICT`, 503 `STRIPE_BILLING_NOT_CONFIGURED` / `BILLING_MANAGEMENT_UNAVAILABLE`; envelope `{error:{code,message}}`. No active route or real Stripe calls introduced. Real portal configuration, plan proration/cancellation/refund policy, durable intent auditing, revocation race across external calls and failure/lost-response recovery still require integration work. Client tests do not establish external exactly-once execution. Status refresh remains existing GET subscription; failed webhook recovery is not silently converted into client-triggered webhook replay.

## Required durable recovery contract

TD-STUDIO-BE-003: use existing immutable generation job and request fingerprint; persist execution ownership with unique job/operation identity, attempt/fencing generation, provider idempotency identity and durable provider operation reference. Reserve via existing unique ledger identity before execution. Claim transaction must lock current membership/brand, quote policy/cap/expiry and credit account; reject stale quote with 409 and no provider call. A lease expiry alone never permits repeating an ambiguous paid call. Reconcile provider status by durable reference/idempotency first; if unavailable, enter `recovery_required`, hold reservation and require bounded operator reconciliation. Crash before/after provider acceptance and two independent workers must be tested. New schema/policy/recovery approval is required before activation, not an in-memory mutex or advisory lock presented as crash recovery.

TD-STUDIO-BE-004: distinguish received/claimed/applied/finalized events with immutable fingerprint, handler version and durable attempt ownership. Reconcile an abandoned claim against existing unique financial effects and fresh canonical Stripe subscription before controlled retry. Final ledger/entitlement effects and event finalization should be one database transaction where possible; ambiguous cross-system effects remain recovery-required. No timeout-based automatic replay, deleting claims, guessed refunds or client entitlement grants. Test crashes at each boundary, stale/out-of-order events, conflicting event IDs and repeated reconciliation. Current orphan `processing` still returns honest 503; NOT FIXED by these contracts.

Local tests use only mock Stripe and synthetic commercial data. A full-suite result and exact SHAs are recorded in the final checkpoint. No live Stripe, paid provider, activation, migration or infrastructure action occurred.
