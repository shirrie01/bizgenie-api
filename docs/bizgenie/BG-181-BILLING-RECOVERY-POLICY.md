# BG-181 — Billing recovery and commercial charging policy (proposed; founder approval required)

## Charge boundary
A generation credit debit is earned only after a usable output has passed all mandatory strategy, completeness, and fidelity checks **and** its campaign revision has committed. A reservation is not a charge. Failed or rejected generation must release its reservation; if release fails, it remains a reconciliation incident, never an authorization to debit.

## Persisted revision / failed debit
If revision persistence succeeds but debit settlement fails, retain the original immutable generation job, committed command receipt, and outstanding reservation. Do not rerun the paid provider, create a new job, fabricate a receipt, or release the reservation. Retry settlement using the original job and original debit idempotency identity only after verifying the committed receipt, owner, campaign, variant, expected version, and original request fingerprint. Return a billing-unavailable outcome until settlement is confirmed; the saved revision is not proof of payment.

## Restart and concurrency
A fresh instance must reconstruct the reservation from durable ledger evidence. The ledger's unique financial-effect constraints must ensure at most one reservation settlement (debit or release), including simultaneous retries. A previously released reservation cannot later be debited. Unknown/missing ledger evidence fails closed and is escalated, not silently repaired with a new charge.

## Reconciliation and incident response
For each interrupted generation, compare generation job, committed revision receipt, reservation, debit/release and customer credit balance. Record correlation IDs, job ID, campaign/variant, ledger IDs, outcome and timestamps without secrets or full customer content. If a committed usable revision has an unsettled reservation, retry only the original debit; if no committed usable revision exists, verify failure and release the reservation. Conflicts, ambiguous receipts and balance discrepancies require manual investigation. Do not automatically refund, adjust balances or invoke Stripe from this reconciliation policy.

## Roll-forward / rollback
Roll-forward: isolate and fix the failing settlement path, verify exact-SHA CI and database constraints, then reconcile outstanding reservations with read-only inspection before any authorised ledger mutation. Rollback: stop new paid generation and revert application traffic only with separate approval; preserve immutable ledger and revision records, never reverse database migrations or delete audit evidence. Confirm credit balances and support messaging before reopening paid traffic.

## Evidence and outstanding gates
- Deterministic unit tests cover failed debit, restart recovery, and multiple fresh orchestrators sharing a ledger.
- **Not yet proved:** genuinely independent processes with real PostgreSQL under concurrent settlement, crash/ack-loss scenarios, release failure reconciliation, and full production-like end-to-end billing assertions.
- No production traffic, paid generation, database migration, refunds or manual financial adjustment is authorised by this document.
- This policy is **proposed** and must be approved by the founder before PR #182 is merged or any commercial launch is marked GREEN.
