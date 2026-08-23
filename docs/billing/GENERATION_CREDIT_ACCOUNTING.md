# Generation credit accounting

**Task:** BG-BILL-002C

**Baseline:** canonical `main` at
`9368b54122001e611c7db3af6ddca87c4c9cd6c4` (tree
`24cc8d4d038f7208ee396ad098db84710ad634a9`)

**Status:** local integration and deterministic contract only; no migration,
database, Stripe, provider, Make, deployment, or production state was changed

## Authoritative chain

Customer Text and Image execution now use one shared server-side sequence:

```text
verified customer authorization
  -> immutable generation job
  -> tenant policy cost resolution
  -> credit reservation
  -> one coalesced execution
  -> debit on success | release on failure
```

The generation job is the only execution authority. Billing receives its
`job_id`, tenant, project, execution class, and stable request correlation.
Operation idempotency keys are derived by the server from the job identity and
operation name, then SHA-256 bounded. Request values cannot select the ledger
account, amount, settlement, refund, or ledger key.

## Execution-cost policy

BG-BILL-002A remains the one canonical policy boundary. The active tenant
entitlement selects an immutable commercial-policy version, whose
`execution_costs` map resolves:

- `text.standard`
- `image.normal`
- `image.premium`
- `video.normal`
- `video.premium`

No launch prices are seeded in source. Tests inject visibly named fixture
values only. If an entitlement, active policy, or execution-class price is
missing, reservation fails before any provider operation. Production must
remain fail-closed until approved commercial policy data is configured.

## Exactly-once behavior

`GenerationBillingOrchestrator` coalesces duplicate delivery by immutable
`job_id`. Concurrent and repeated requests share one reservation, one
execution outcome, and one settlement attempt. A transient debit failure can
be retried without repeating the provider operation. A failed execution keeps
the original Text/Image/Video error and releases its reservation idempotently.

The BG-BILL-002A ledger remains the authoritative duplicate-effect barrier:
one generation reservation, one mutually exclusive debit or release for that
reservation, and one refund for the original debit. Process-local outcome
coalescing is the deterministic adapter used by this task. Durable
multi-instance recovery and PostgreSQL transaction acceptance remain the
existing BG-BILL-002D gate; production startup does not substitute process
memory for that durable authority.

## Customer error contract

Insufficient funds return HTTP `402` with only:

```json
{
  "status": "failed",
  "error": {
    "code": "GENERATION_CREDITS_UNAVAILABLE",
    "message": "There are not enough credits to run this generation"
  }
}
```

The media-specific empty field remains `script_body`, `media`, or `video`.
Policy, entitlement, account, persistence, or settlement unavailability uses
the sanitized HTTP `503` code `GENERATION_BILLING_UNAVAILABLE`. Neither
contract includes a balance calculation, plan economics, provider cost,
provider/model selection, ledger identity, or internal error detail.

## Text, Image, and Video

- Customer Text reserves `text.standard` before Brand Brain resolution or the
  existing generator, then debits only after the existing complete response
  has qualified.
- Customer Image reserves `image.normal` before the existing image service or
  provider. The existing response and provider-neutral adapter remain intact.
- The shared Video router is billing-aware when invoked behind an immutable
  generation job and requires exact `video.normal` or `video.premium`
  agreement with the bounded quality request. Submission reserves and executes
  once but does not debit. The separate idempotent success/failure settlement
  methods debit only after a later completed asset qualifies, or release after
  a terminal failure. BG-ACT-001B now mounts that router behind canonical
  customer authorization and immutable-job recording and composes Veo/storage
  only when their explicit fail-closed activation gates pass.
- Existing `ADMIN_KEY` Text, Image, and Video routes remain operational
  internal paths and are not reinterpreted as tenant-billable customer jobs.

## Refund policy

Current execution returns a successful result only after all qualifying work
has completed and then finalizes the debit. The repository contains no proven
post-debit delivery condition that is safe to refund automatically. The
production refund qualification policy therefore defaults to **deny all**.

The internal `refundDebit` seam accepts only the exact debit already recorded
for the same immutable job, derives the tenant and refund key server-side, and
is idempotent. Tests activate a clearly labelled fixture-only qualifying
policy to prove that seam. A future reviewed task may enable one named reason
only after durable evidence proves that delivery failed after debit without
also delivering customer value.

## Service principal, Make, and Stripe

The global service principal still carries no tenant or financial authority.
The Make payload remains limited to opaque job identity, immutable execution
class, and allowlisted content. Billing fields, prices, account identity,
provider selection, and secrets are dropped.

Stripe continues to fund entitlements and monthly grants only. Generation
accounting makes no Stripe call and does not create per-generation payments.
The Stripe router and webhook lifecycle are unchanged.

## Migration and production boundary

No new migration is required. The existing immutable ledger already supports
reservation, debit, release, refund, job/request correlation, tenant/project
scope, and original reservation/debit references. Execution class is resolved
from the immutable generation job correlated by `job_id`, so duplicating it in
the ledger would create a second mutable audit claim.

`createProductionApp` deliberately has no durable Billing repository adapter
yet. Its customer execution paths therefore return sanitized Billing
unavailability before provider invocation. Activation requires approved
commercial execution-cost rows plus the existing BG-BILL-002D durable
PostgreSQL, concurrency, recovery, and deployment review. No new environment
variable is introduced here.
