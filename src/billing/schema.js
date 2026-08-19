const { z } = require("zod");

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid identifier");
const timestamp = z.string().datetime({ offset: true });
const credits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveCredits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const signedCredits = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const executionClass = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/,
    "Invalid execution class"
  );

const policyStatuses = ["draft", "active", "retired"];
const entitlementStatuses = [
  "active",
  "inactive",
  "grace",
  "cancel_pending",
  "cancelled",
];
const creditAccountStatuses = ["active", "frozen", "closed"];
const ledgerEntryTypes = [
  "monthly_grant",
  "bolt_on_grant",
  "reservation",
  "reservation_release",
  "debit",
  "refund",
  "admin_adjustment",
  "expiry_reset",
];

const CommercialPolicySchema = z
  .object({
    policy_id: identifier,
    plan_code: identifier,
    policy_version: z.number().int().positive(),
    status: z.enum(policyStatuses),
    included_monthly_credits: credits,
    bolt_on_eligible: z.boolean(),
    effective_from: timestamp,
    effective_to: timestamp.nullable().optional(),
    execution_costs: z.record(executionClass, positiveCredits),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (
      policy.effective_to &&
      Date.parse(policy.effective_to) <= Date.parse(policy.effective_from)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["effective_to"],
        message: "effective_to must be later than effective_from",
      });
    }
  });

const TenantEntitlementSchema = z
  .object({
    entitlement_id: identifier,
    tenant_id: identifier,
    policy_id: identifier,
    plan_code: identifier,
    status: z.enum(entitlementStatuses),
    starts_at: timestamp,
    ends_at: timestamp.nullable().optional(),
    reference_period_start: timestamp,
    reference_period_end: timestamp,
    included_monthly_credit_grant: credits,
    stripe_subscription_ref: identifier.nullable().optional(),
    cancellation_effective_at: timestamp.nullable().optional(),
    grace_ends_at: timestamp.nullable().optional(),
  })
  .strict()
  .superRefine((entitlement, ctx) => {
    if (
      Date.parse(entitlement.reference_period_end) <=
      Date.parse(entitlement.reference_period_start)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reference_period_end"],
        message: "reference period end must be later than its start",
      });
    }
    if (
      entitlement.ends_at &&
      Date.parse(entitlement.ends_at) <= Date.parse(entitlement.starts_at)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_at"],
        message: "ends_at must be later than starts_at",
      });
    }
  });

const CreditAccountSchema = z
  .object({
    account_id: identifier,
    tenant_id: identifier,
    status: z.enum(creditAccountStatuses),
    created_at: timestamp,
  })
  .strict();

const CreditLedgerEntrySchema = z
  .object({
    ledger_entry_id: identifier,
    account_id: identifier,
    tenant_id: identifier,
    entry_type: z.enum(ledgerEntryTypes),
    amount: positiveCredits,
    balance_delta: signedCredits,
    reserved_delta: signedCredits,
    idempotency_key: identifier,
    intent_hash: z.string().regex(/^[a-f0-9]{64}$/),
    project_id: identifier.optional(),
    generation_id: identifier.optional(),
    execution_id: identifier.optional(),
    transaction_correlation_id: identifier.optional(),
    entitlement_id: identifier.optional(),
    reference_period_start: timestamp.optional(),
    reference_period_end: timestamp.optional(),
    stripe_event_ref: identifier.optional(),
    payment_ref: identifier.optional(),
    provider_cost_evidence_ref: identifier.optional(),
    reservation_entry_id: identifier.optional(),
    debit_entry_id: identifier.optional(),
    occurred_at: timestamp,
    created_at: timestamp,
  })
  .strict()
  .superRefine((entry, ctx) => {
    const expected = {
      monthly_grant: [entry.amount, 0],
      bolt_on_grant: [entry.amount, 0],
      reservation: [0, entry.amount],
      reservation_release: [0, -entry.amount],
      debit: [-entry.amount, -entry.amount],
      refund: [entry.amount, 0],
      expiry_reset: [-entry.amount, 0],
    }[entry.entry_type];

    if (
      expected &&
      (entry.balance_delta !== expected[0] ||
        entry.reserved_delta !== expected[1])
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["balance_delta"],
        message: "Ledger deltas do not match the entry type",
      });
    }

    if (
      entry.entry_type === "admin_adjustment" &&
      (entry.reserved_delta !== 0 ||
        ![entry.amount, -entry.amount].includes(entry.balance_delta))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["balance_delta"],
        message: "Admin adjustment must add or remove its stated amount",
      });
    }

    if (
      ["reservation_release", "debit"].includes(entry.entry_type) !==
      Boolean(entry.reservation_entry_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reservation_entry_id"],
        message: "Reservation settlement correlation is invalid",
      });
    }

    if ((entry.entry_type === "refund") !== Boolean(entry.debit_entry_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["debit_entry_id"],
        message: "Refund debit correlation is invalid",
      });
    }

    if (
      entry.entry_type === "monthly_grant" &&
      (!entry.entitlement_id ||
        !entry.reference_period_start ||
        !entry.reference_period_end)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["entitlement_id"],
        message: "Monthly grants require entitlement and reference period",
      });
    }

    if (entry.entry_type === "bolt_on_grant" && !entry.payment_ref) {
      ctx.addIssue({
        code: "custom",
        path: ["payment_ref"],
        message: "Bolt-on grants require a payment reference",
      });
    }

    if (
      entry.entry_type === "reservation" &&
      (!entry.project_id ||
        !entry.generation_id ||
        !entry.execution_id ||
        !entry.transaction_correlation_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["generation_id"],
        message: "Reservations require project and generation correlation",
      });
    }

    if (
      entry.entry_type === "admin_adjustment" &&
      !entry.transaction_correlation_id
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["transaction_correlation_id"],
        message: "Admin adjustments require an approved correlation reference",
      });
    }

    if (
      entry.reference_period_end &&
      (!entry.reference_period_start ||
        Date.parse(entry.reference_period_end) <=
          Date.parse(entry.reference_period_start))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reference_period_end"],
        message: "Reference period end must be later than its start",
      });
    }
  });

module.exports = {
  CommercialPolicySchema,
  CreditAccountSchema,
  CreditLedgerEntrySchema,
  TenantEntitlementSchema,
  creditAccountStatuses,
  entitlementStatuses,
  executionClass,
  identifier,
  ledgerEntryTypes,
  policyStatuses,
};
