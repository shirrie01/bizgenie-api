# Stripe subscription lifecycle

**Task:** BG-BILL-002B

**Historical implementation baseline:** `5b7fafb04dda919ded0fd6eb512760b46d0980bb`

**Reconciliation baseline:** canonical `main` at
`c18cf563c6cf03e7f13fa672807fc98aac8e058d` (tree
`4d09916b0fe29dc0dab3d42e700b0234d6c386bd`)

**Status:** local implementation and migration contract only; no Stripe resource, database, webhook destination, deployment, or production environment was changed

## Official contract selected

The implementation pins official `stripe` Node SDK `22.5.0`, whose embedded API
version is `2026-07-29.dahlia`. Startup refuses an unexpected package/API pair.
The configured Stripe webhook destination must use that same API version because
Stripe event payloads retain the version with which they were created.

The implementation follows the current Stripe contracts for:

- hosted Checkout Sessions with `mode=subscription` and flexible billing mode;
- raw request-body verification with `stripe.webhooks.constructEvent`;
- asynchronous, unordered subscription webhooks;
- subscription item-level `current_period_start` and `current_period_end`;
- invoice subscription references at
  `parent.subscription_details.subscription`;
- idempotency keys on Stripe `POST` requests;
- separate test/live secret keys, webhook destinations, objects, and signing
  secrets.

Primary references:

- <https://docs.stripe.com/payments/checkout/build-subscriptions>
- <https://docs.stripe.com/webhooks?lang=node>
- <https://docs.stripe.com/billing/subscriptions/webhooks>
- <https://docs.stripe.com/api/subscriptions/object>
- <https://docs.stripe.com/api/idempotent_requests>
- <https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end>
- <https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects>
- <https://docs.stripe.com/keys>

## Configuration and environment separation

All values are server controlled:

| Environment value | Purpose |
| --- | --- |
| `STRIPE_MODE` | Exactly `test` or `live` |
| `STRIPE_SECRET_KEY` | Matching `sk_test_` or `sk_live_` server key |
| `STRIPE_WEBHOOK_SECRET` | Endpoint-specific `whsec_` signing secret |
| `STRIPE_SUCCESS_URL` | Approved Checkout success URL |
| `STRIPE_CANCEL_URL` | Approved Checkout cancel URL |
| `STRIPE_PRICE_STANDARD` | Approved Stripe recurring Price for Standard |
| `STRIPE_POLICY_STANDARD` | Existing BG-BILL-002A policy ID for Standard |
| `STRIPE_PRICE_PRO` | Approved Stripe recurring Price for Pro, if enabled |
| `STRIPE_POLICY_PRO` | Existing BG-BILL-002A policy ID for Pro, if enabled |
| `STRIPE_PAST_DUE_GRACE_DAYS` | Server-owned grace duration; defaults to seven days |

Live mode requires HTTPS return URLs. Test mode permits HTTPS or loopback HTTP.
An event whose `livemode` or API version differs from the configured environment
fails before any state change.

No request can supply a Stripe key, webhook secret, Stripe customer, Price,
Product, tenant-policy binding, success URL, or cancel URL.

## Customer and Checkout boundary

`tenant_id` remains canonical BizGenie authority. Checkout first verifies the
existing Supabase customer Bearer token, then authorises the requested tenant
through the canonical membership chain using the owner-only
`billing:checkout` action. The request `tenant_id` is only a resource selector
and is removed before the strict Checkout input accepts only:

```json
{
  "plan_code": "standard",
  "request_id": "checkout_request_001"
}
```

The strict input schema rejects additional fields. The server resolves the
policy and Price, creates or reuses the tenant's canonical customer mapping,
and supplies the mapped Customer to Checkout. Customer creation and Checkout
creation both use tenant-scoped Stripe idempotency keys.

Stripe metadata and `client_reference_id` aid reconciliation only. Webhooks do
not use either as tenant authority; they resolve the signed Stripe Customer
through the immutable server-side mapping.

The router is dependency-injected and mounts before the application's global
JSON parser so `/billing/stripe/webhook` receives the original bytes. Checkout
reuses BG-AUTH-002B's verified token and `AuthorizationService` chain; a body
`user_id` never becomes authority. `ADMIN_KEY`, service-principal credentials,
customer JWTs, and Stripe credentials remain separate.

## Subscription-to-entitlement mapping

Stripe status is evidence, not application-wide business authority:

| Stripe status | BizGenie entitlement |
| --- | --- |
| `trialing` | `active` |
| `active` | `active` |
| `trialing` or `active` with scheduled cancellation | `cancel_pending` |
| `past_due` | `grace` with a deterministic server-owned deadline |
| `unpaid` | `inactive` |
| `incomplete` | `inactive` |
| `incomplete_expired` | `inactive` |
| `paused` | `inactive` |
| `canceled` or `customer.subscription.deleted` | `cancelled` |

Launch subscriptions must contain exactly one approved recurring Price. A new
mapping snapshots the existing policy ID, plan code, included grant, and
entitlement ownership. Later events may update lifecycle and reference-period
fields but cannot change tenant, Customer, subscription, Price, entitlement,
policy ID, or plan code. A price or policy change therefore requires a future
explicit commercial transition workflow; a webhook cannot silently move an
historical entitlement to the latest policy.

Older out-of-order events are acknowledged as stale without moving state
backwards. Non-deletion subscription events are reconciled against the current
Subscription retrieved from Stripe before application, so the delivered event
snapshot is not treated as current authority. A different Event ID with the
same `event.created` second cannot replace an already-applied non-terminal
state unless it moves monotonically to terminal cancellation. Terminal state
is absorbing for a subscription ID, while a genuinely later reconciled event
can still recover a non-terminal subscription from grace or inactivity. Stripe
Event IDs are identity keys only and are never sorted to invent chronology.

## Webhook allowlist and replay behavior

The launch allowlist is:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`

Every allowed event is claimed by Stripe event ID plus a SHA-256 intent hash.
Only identity, type, mode, hash, timestamps, processing state, and a small
result summary are persisted; raw payment payloads are not. An identical replay
returns the first result. Reuse of one event ID for different content fails.
Failed processing marks the claim failed without losing its immutable identity;
a legitimate retry with the same hash can reclaim it and recover.

Stripe does not promise event ordering. Invoice handling therefore retrieves
the referenced subscription through the mocked/injected Stripe client, checks
its Customer against the canonical mapping, updates lifecycle idempotently,
and then considers a grant.

## Monthly included-credit grant

Only a verified `invoice.paid` with `paid=true`, `status=paid`, a subscription
parent, and billing reason `subscription_create` or `subscription_cycle` can
trigger the existing BG-BILL-002A ledger call. The stable key is:

```text
monthly:{stripe_subscription_id}:{subscription_item_period_start}
```

The immutable ledger's independent uniqueness on entitlement and reference
period remains the final duplicate-effect barrier. Webhook replay, redelivery,
and retry cannot create a second monthly grant.

No generation reservation, debit, release, or refund is wired here.

## Bolt-on readiness

The migration and repository contract provide immutable, tenant-and-customer
scoped evidence for a future verified bolt-on payment. The existing
`grantBoltOnCredits` ledger operation already enforces payment-reference and
idempotency uniqueness.

BG-BILL-002B intentionally does not allow a payment event yet because launch
bundle Price-to-credit configuration, refund/dispute handling, and the exact
successful-payment event contract have not been approved. A future bounded
task must add that allowlisted payment handler and call the ledger only after
evidence is verified. No partially paid or client-asserted purchase can grant
credits.

## Persistence and activation boundary

`20260820010000_create_stripe_subscription_lifecycle.sql` defines canonical
Customer and subscription mappings, processed webhook event identity, bolt-on
evidence, immutable ownership/policy triggers, RLS, and revoked Data API roles.
Canonical Customer and subscription mappings also reject deletion; lifecycle
history and payment evidence cannot be erased through ordinary table writes.
It was not applied.

The deterministic in-memory adapter and dependency-injected HTTP boundary are
used for local proof. Production activation requires the durable repository
adapter and migration/recovery/concurrency acceptance covered by
BG-BILL-002D; until then `createProductionApp` does not mount Stripe routes.

## Billing programme state

- **BG-BILL-002C:** generation reservation, debit, release, and the inactive
  debit-bound refund seam are implemented independently of Stripe. See
  `GENERATION_CREDIT_ACCOUNTING.md`.
- **BG-BILL-002D:** implement and adversarially verify the real PostgreSQL
  transaction adapter, migration, RLS, recovery, reconciliation, concurrency,
  and production activation gates.
