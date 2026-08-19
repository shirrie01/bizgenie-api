# Commercial policy, entitlement, and credit ledger foundation

**Task:** BG-BILL-002A

**Baseline:** remote `main` at `f3f22759bf2b2dd78ddc43b9220ff5cd6c80abe3`

**Status:** local foundation only; no production migration, Stripe resource, provider activation, route wiring, or deployment

## Authority and evidence boundary

BG-AUTH-002A supplies the canonical ownership graph. Financial authority is the
tenant, with project correlation where a generation belongs to a project.
Request `user_id` remains metadata and can never select or debit a credit
account.

No BG-BILL-001 artifact was present on the pinned branch or discoverable in the
repository's issues, pull requests, or code search on 2026-08-19. This
foundation therefore implements the findings restated in the approved
BG-BILL-002A task contract and records the missing audit artifact as a review
evidence gap rather than inventing additional rules.

## Commercial policy

`commercial_policies` versions the plan code, lifecycle status, included
monthly credits, bolt-on eligibility, and effective window.
`commercial_execution_prices` maps a policy to extensible BizGenie execution
classes such as:

- `text.standard`
- `image.normal`
- `image.premium`
- `video.normal`
- `video.premium`

The policy contains no provider model, provider token, raw API cost, margin, or
routing field. Replacing an Image or Video provider does not change the
customer's execution class. Launch allowances and costs are data, not adapter
constants, and no production prices or plan identifiers are seeded by this
task.

An existing policy's identity, plan code/version, included credits, bolt-on
eligibility, effective window, creation time, and execution-class prices are
immutable. Price rows may only be added while their policy is `draft`; after a
price exists it cannot be updated or deleted, and policy-version rows cannot be
deleted. Commercial changes therefore require a new policy version. Lifecycle
movement is monotonic: `draft` may become `active` or `retired`, `active` may
become `retired`, and `retired` cannot be reopened.

## Tenant entitlement

An entitlement belongs to `tenant_id` and references one versioned commercial
policy. It carries its serving period and the included-credit grant snapshot.
`active`, `grace`, and `cancel_pending` are serving states; `inactive` and
`cancelled` are not. Nullable Stripe subscription, cancellation, and grace
references preserve the BG-BILL-002B extension point without implementing
Stripe.

The schema allows only one serving entitlement per tenant. The application
still validates the effective start/end window and fails closed when the
entitlement or its referenced active policy is unavailable.

Ledger correlation uses the composite `(entitlement_id, tenant_id)` key, so a
Tenant A journal entry cannot reference Tenant B's entitlement. Entitlement
identity, tenant ownership, and creation time cannot be changed after insert.

## Account and accounting convention

Each tenant has exactly one `credit_accounts` row. It stores identity and
status only; it never stores a mutable balance.

Every `credit_ledger` row contains a positive `amount` plus two signed journal
deltas:

| Entry | `balance_delta` | `reserved_delta` |
| --- | ---: | ---: |
| Monthly or bolt-on grant | `+amount` | `0` |
| Reservation | `0` | `+amount` |
| Reservation release | `0` | `-amount` |
| Final debit | `-amount` | `-amount` |
| Refund | `+amount` | `0` |
| Admin credit/debit | `+amount` / `-amount` | `0` |
| Expiry/reset | `-amount` | `0` |

Authoritative projections are:

```text
ledger balance    = SUM(balance_delta)
reserved balance  = SUM(reserved_delta)
available balance = ledger balance - reserved balance
net spent credits = SUM(debit.amount) - SUM(refund.amount)
```

Reservations do not spend credits. Final debit moves the reserved amount out
of both the ledger balance and reserved bucket, leaving availability unchanged
at finalization. Release removes only the hold. A refund adds the finalized
amount back to availability.

Ledger rows are append-only. PostgreSQL triggers reject updates and deletes,
and the in-memory implementation returns defensive copies so callers cannot
mutate stored history.

An insert-time PostgreSQL trigger also verifies settlement types: releases and
debits must reference a `reservation`, while refunds must reference a `debit`.
The existing composite foreign keys separately prove that each referenced row
belongs to the same account and tenant. This cross-row rule is deliberately not
implemented as a `CHECK` constraint.

## Idempotency and logical-event uniqueness

Every financial write has an account-scoped idempotency key and SHA-256 intent
hash. Repeating the same key and intent returns the original entry. Reusing the
key for different intent fails with `IDEMPOTENCY_KEY_CONFLICT`.

Recommended keys are stable business identifiers, for example:

```text
monthly:{entitlement_id}:{period_start}
bolt-on:{payment_or_checkout_reference}
reserve:{generation_id}
debit:{generation_id}
release:{generation_id}
refund:{generation_id}:{debit_entry_id}
admin:{approved_adjustment_reference}
```

Database uniqueness also prevents duplicate monthly grants, bolt-on payments,
generation reservations, reservation settlement, and debit refunds even when
a caller accidentally changes its idempotency key. A reservation can have one
settlement: release or debit, never both. This foundation implements full
refund of one debit; partial or repeated refunds require a later approved
commercial rule.

## Concurrency model

The deterministic repository serializes writes per credit account. A 10-credit
account receiving two simultaneous 6-credit reservation requests permits one
reservation and rejects the other.

A future PostgreSQL repository must use the same short transaction:

1. Begin.
2. Select the tenant's `credit_accounts` row `FOR UPDATE`.
3. Resolve an idempotent replay or fail a conflicting key.
4. Derive available and reserved values from `credit_ledger` inside the lock.
5. Reject a negative projected value.
6. Insert exactly one ledger row.
7. Commit.

Account locks are always acquired in account-ID order if an approved future
operation spans accounts. Stripe and provider calls happen outside the lock.
The unique indexes remain the final duplicate-effect barrier. BG-BILL-002D must
prove this against real concurrent PostgreSQL sessions before paid launch.

## Tenant isolation and safe exposure

Account and ledger rows carry `tenant_id`. Ledger account references use the
composite `(account_id, tenant_id)` key. Project correlation uses the composite
`(project_id, tenant_id)` key, preventing a Tenant A financial event from
claiming a Tenant B project. Reservation settlement and refund references are
also account-and-tenant scoped. Entitlement references use
`(entitlement_id, tenant_id)` for the same reason.

All billing tables have RLS enabled and Data API privileges revoked from
`anon`, `authenticated`, and `service_role`. No customer policy or route is
created. `credit_account_balances_internal` is a `security_invoker` internal
projection with the same revoked access. A future customer-safe entitlement
and balance view must be separately reviewed and must not expose provider cost
evidence, internal finance references, other tenants, or raw database errors.

## Sheets and Make migration principle

The backend ledger is the only production financial authority. Existing
Google Sheets and Make behavior remains useful as integration semantics:

- one event per logical debit or refund;
- debit when the generation attempt starts;
- refund a qualifying failed attempt;
- display a derived customer balance.

Sheets and Make may receive idempotent projections or events from the backend.
They must never calculate, overwrite, approve, or reconcile the authoritative
balance independently.

```text
backend authoritative ledger -> projection/event -> Sheets or Make
```

The reverse direction cannot create financial truth except through a future
authenticated, authorized, idempotent backend command.

## Repository boundary and remaining program

`src/billing/` exports provider-neutral schemas, errors, `BillingRepository`,
`BillingService`, and the deterministic `InMemoryBillingRepository`. No route
or generation service is wired in BG-BILL-002A.

- **BG-BILL-002B:** Stripe subscription lifecycle, Checkout, webhook
  verification, product/price mapping, bolt-on payment evidence, cancellation,
  and grace transitions.
- **BG-BILL-002C:** authenticated generation integration using reserve before
  provider attempt, final debit on attempt, and one qualifying refund on
  failure across Text, Image, and Video.
- **BG-BILL-002D:** real PostgreSQL concurrency, RLS, idempotency, recovery,
  reconciliation, and adversarial financial acceptance.

The production PostgreSQL repository, authenticated customer-safe views,
monthly-grant scheduler, expiry policy, partial-refund policy, and provider
cost-evidence store remain intentionally unimplemented.
