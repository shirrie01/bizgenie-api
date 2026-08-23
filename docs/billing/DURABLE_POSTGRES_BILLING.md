# Durable PostgreSQL billing authority

BG-BILL-002D keeps the existing commercial policy, entitlement, credit account,
immutable `credit_ledger`, Stripe evidence, and generation-job tables as the
only financial model. `PostgresBillingRepository` implements the established
Billing repository contract over the application's existing PostgreSQL pool.

## Transaction and balance model

Each financial mutation uses an explicit, short transaction. The repository
locks only the tenant's `credit_accounts` row with `SELECT ... FOR UPDATE`, then
derives posted and reserved balances by summing the immutable ledger. Requests
for different accounts therefore proceed independently; requests for the same
account serialize before checking available credit and appending an effect.
There is no mutable balance projection to reconcile.

Global idempotency-key uniqueness prevents the same durable identity from being
reused across accounts or tenants. On retry, the repository compares the full
immutable intent hash and authority before returning the committed row. Logical
effect indexes independently enforce one reservation per generation, one
settlement per reservation, one refund per debit, one monthly grant per
entitlement period, and one bolt-on grant per verified payment. A settlement
transaction locks the original reservation and derives its amount, tenant,
project, generation, execution, and correlation values from that row. A refund
does the same from the original debit.

Because the effect row and all dependent checks commit in one database
transaction, a failure before commit leaves no effect. If the commit succeeds
but acknowledgement is lost, the same idempotent request discovers and returns
the committed effect. Generation orchestration checks durable settlement state
before provider execution, so a recovered debit does not rerun the provider.

## Database enforcement and access

Migration `20260823001722_durable_billing_authority.sql` is additive. It adds
global idempotency uniqueness, a tenant/project-bound generation-job reference,
validated lifecycle checks, and a private insert trigger that verifies
reservation pricing and generation authority, exact settlement lineage,
refund lineage, monthly entitlement references, and bolt-on payment evidence.
The immutable ledger remains the balance source of truth.

Financial tables retain RLS, direct authority remains revoked from `anon`,
`authenticated`, and `service_role`, private functions use an empty
`search_path`, and deletion remains prohibited. The application connection is
the trusted financial writer; customers cannot supply arbitrary database
mutation authority.

## Reconciliation

`repository.reconcile({ olderThan, limit })` opens a read-only,
repeatable-read transaction and returns a bounded report of:

- old reservations without debit or release;
- reservations with invalid or duplicate settlement state;
- refunds without their original debit;
- duplicate logical effects;
- monthly grants whose entitlement/period/amount no longer agrees with
  canonical data, plus active entitlements missing the current-period grant.

The seam reports evidence only. It performs no automatic repair.

## Production activation gate

Production composition defaults to the unconfigured, fail-closed generation
billing orchestrator. Activation requires all of the following:

- `BILLING_DURABLE_ENABLED=true`;
- `BILLING_APPROVED_POLICY_IDS` containing the explicitly approved policy IDs;
- `BILLING_APPROVED_EXECUTION_CLASSES` containing every approved execution
  class;
- the additive migration applied through a separately authorized process;
- all required relations and validated constraints present;
- each approved policy active and each approved execution class carrying a
  positive database-configured credit price.

Initialization fails closed if any requirement is absent. This change neither
applies the migration nor sets these variables, calls Stripe/providers, or
activates production billing.

## Verification

CI supplies PostgreSQL 17 and runs the real-database suite explicitly. That
suite applies the version-controlled migrations to a disposable database and
proves concurrent reservation, settlement, refund and monthly-grant behavior;
authority mismatch rejection; rollback and lost-ack recovery; reconstruction;
tenant isolation; customer-role denial; Stripe evidence isolation;
reconciliation; and Text/Image/Video accounting.
