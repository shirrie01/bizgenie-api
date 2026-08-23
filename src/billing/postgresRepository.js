const { randomUUID } = require("node:crypto");
const {
  BillingConfigurationError,
  BillingError,
  BillingPersistenceError,
  CreditAccountUnavailableError,
  DuplicateFinancialEffectError,
  FinancialResourceUnavailableError,
  IdempotencyConflictError,
  InsufficientCreditsError,
  InvalidFinancialOperationError,
} = require("./errors");
const { BillingRepository, ENTITLED_STATUSES, hashIntent } = require("./repository");
const {
  CommercialPolicySchema,
  CreditAccountSchema,
  CreditLedgerEntrySchema,
  TenantEntitlementSchema,
  identifier,
} = require("./schema");
const {
  StripeBillingConflictError,
  StripeBillingError,
  StripeBillingResourceUnavailableError,
  StripeEventConflictError,
  StripeEventInProgressError,
} = require("./stripe/errors");

const GENERIC_ENTRY_TYPES = new Set([
  "monthly_grant",
  "bolt_on_grant",
  "admin_adjustment",
  "expiry_reset",
]);
const SETTLEMENT_TYPES = new Set(["reservation_release", "debit"]);
const REQUIRED_RELATIONS = Object.freeze([
  "public.commercial_policies",
  "public.commercial_execution_prices",
  "public.tenant_entitlements",
  "public.credit_accounts",
  "public.credit_ledger",
  "public.generation_jobs",
  "public.stripe_customer_mappings",
  "public.stripe_subscription_mappings",
  "public.stripe_webhook_events",
  "public.stripe_bolt_on_payment_evidence",
  "public.credit_account_balances_internal",
]);

const LEDGER_COLUMNS = Object.freeze([
  "ledger_entry_id",
  "account_id",
  "tenant_id",
  "entry_type",
  "amount",
  "balance_delta",
  "reserved_delta",
  "idempotency_key",
  "intent_hash",
  "project_id",
  "generation_id",
  "execution_id",
  "transaction_correlation_id",
  "entitlement_id",
  "reference_period_start",
  "reference_period_end",
  "stripe_event_ref",
  "payment_ref",
  "provider_cost_evidence_ref",
  "reservation_entry_id",
  "debit_entry_id",
  "occurred_at",
  "created_at",
]);

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function toSafeInteger(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new BillingPersistenceError();
  return parsed;
}

function omitNullish(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null && field !== undefined)
  );
}

function mapEntitlement(row) {
  if (!row) return null;
  return TenantEntitlementSchema.parse({
    entitlement_id: row.entitlement_id,
    tenant_id: row.tenant_id,
    policy_id: row.policy_id,
    plan_code: row.plan_code,
    status: row.status,
    starts_at: toIso(row.starts_at),
    ends_at: row.ends_at ? toIso(row.ends_at) : null,
    reference_period_start: toIso(row.reference_period_start),
    reference_period_end: toIso(row.reference_period_end),
    included_monthly_credit_grant: toSafeInteger(
      row.included_monthly_credit_grant
    ),
    stripe_subscription_ref: row.stripe_subscription_ref || null,
    cancellation_effective_at: row.cancellation_effective_at
      ? toIso(row.cancellation_effective_at)
      : null,
    grace_ends_at: row.grace_ends_at ? toIso(row.grace_ends_at) : null,
  });
}

function mapPolicy(row) {
  if (!row) return null;
  const costs = Object.fromEntries(
    Object.entries(row.execution_costs || {}).map(([key, value]) => [
      key,
      toSafeInteger(value),
    ])
  );
  return CommercialPolicySchema.parse({
    policy_id: row.policy_id,
    plan_code: row.plan_code,
    policy_version: toSafeInteger(row.policy_version),
    status: row.status,
    included_monthly_credits: toSafeInteger(row.included_monthly_credits),
    bolt_on_eligible: row.bolt_on_eligible,
    effective_from: toIso(row.effective_from),
    effective_to: row.effective_to ? toIso(row.effective_to) : null,
    execution_costs: costs,
  });
}

function mapAccount(row) {
  if (!row) return null;
  return CreditAccountSchema.parse({
    account_id: row.account_id,
    tenant_id: row.tenant_id,
    status: row.status,
    created_at: toIso(row.created_at),
  });
}

function mapLedger(row) {
  if (!row) return null;
  return CreditLedgerEntrySchema.parse(
    omitNullish({
      ...Object.fromEntries(LEDGER_COLUMNS.map((column) => [column, row[column]])),
      amount: toSafeInteger(row.amount),
      balance_delta: toSafeInteger(row.balance_delta),
      reserved_delta: toSafeInteger(row.reserved_delta),
      reference_period_start: row.reference_period_start
        ? toIso(row.reference_period_start)
        : undefined,
      reference_period_end: row.reference_period_end
        ? toIso(row.reference_period_end)
        : undefined,
      occurred_at: toIso(row.occurred_at),
      created_at: toIso(row.created_at),
    })
  );
}

function mapStripeSubscription(row) {
  if (!row) return null;
  return {
    stripe_subscription_id: row.stripe_subscription_id,
    tenant_id: row.tenant_id,
    stripe_customer_id: row.stripe_customer_id,
    entitlement_id: row.entitlement_id,
    policy_id: row.policy_id,
    plan_code: row.plan_code,
    stripe_price_id: row.stripe_price_id,
    stripe_status: row.stripe_status,
    entitlement_status: row.entitlement_status,
    livemode: row.livemode,
    last_event_created: toIso(row.last_event_created),
    last_event_id: row.last_event_id,
    updated_at: toIso(row.updated_at),
  };
}

function knownError(error) {
  return error instanceof BillingError || error instanceof StripeBillingError;
}

function databaseError(error) {
  if (knownError(error)) return error;
  if (
    error?.code === "23505" &&
    [
      "credit_ledger_idempotency_global_unique",
      "credit_ledger_account_idempotency_unique",
    ].includes(error.constraint)
  ) {
    return new IdempotencyConflictError();
  }
  if (
    error?.code === "23505" &&
    [
      "credit_ledger_monthly_grant_unique",
      "credit_ledger_bolt_on_payment_unique",
      "credit_ledger_generation_reservation_unique",
      "credit_ledger_reservation_settlement_unique",
      "credit_ledger_debit_refund_unique",
    ].includes(error.constraint)
  ) {
    return new DuplicateFinancialEffectError();
  }
  return new BillingPersistenceError();
}

function logicalEffectQuery(input) {
  switch (input.entry_type) {
    case "monthly_grant":
      return {
        sql: "entry_type = 'monthly_grant' AND entitlement_id = $2 AND reference_period_start = $3",
        values: [input.entitlement_id, input.reference_period_start],
      };
    case "bolt_on_grant":
      return {
        sql: "entry_type = 'bolt_on_grant' AND payment_ref = $2",
        values: [input.payment_ref],
      };
    case "reservation":
      return {
        sql: "entry_type = 'reservation' AND generation_id = $2",
        values: [input.generation_id],
      };
    case "reservation_release":
    case "debit":
      return {
        sql: "entry_type IN ('reservation_release', 'debit') AND reservation_entry_id = $2",
        values: [input.reservation_entry_id],
      };
    case "refund":
      return {
        sql: "entry_type = 'refund' AND debit_entry_id = $2",
        values: [input.debit_entry_id],
      };
    default:
      return null;
  }
}

class PostgresBillingRepository extends BillingRepository {
  constructor({
    pool,
    now = () => new Date(),
    idFactory = () => `ledger_${randomUUID()}`,
    entitlementIdFactory = () => `entitlement_${randomUUID()}`,
  }) {
    super();
    if (
      !pool ||
      typeof pool.query !== "function" ||
      typeof pool.connect !== "function"
    ) {
      throw new BillingConfigurationError(
        "A transactional PostgreSQL connection pool is required"
      );
    }
    this.pool = pool;
    this.now = now;
    this.idFactory = idFactory;
    this.entitlementIdFactory = entitlementIdFactory;
  }

  timestamp() {
    return this.now().toISOString();
  }

  // Overridable only for deterministic transaction-boundary tests.
  async beforeCommit() {}

  // Overridable only for deterministic lost-ack tests. This runs after COMMIT.
  async afterCommit() {}

  async withTransaction(operation, { readOnly = false, observe = true } = {}) {
    let client;
    let transactionOpen = false;
    try {
      client = await this.pool.connect();
      await client.query(
        readOnly
          ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
          : "BEGIN"
      );
      transactionOpen = true;
      const result = await operation(client);
      if (observe) await this.beforeCommit();
      await client.query("COMMIT");
      transactionOpen = false;
      if (observe) await this.afterCommit();
      return result;
    } catch (error) {
      if (client && transactionOpen) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw databaseError(error);
    } finally {
      client?.release();
    }
  }

  async read(operation) {
    try {
      return await operation();
    } catch (error) {
      throw databaseError(error);
    }
  }

  async initialize({ approvedPolicyIds = [], requiredExecutionClasses = [] } = {}) {
    if (approvedPolicyIds.length === 0 || requiredExecutionClasses.length === 0) {
      throw new BillingConfigurationError(
        "Approved policy IDs and execution classes are required"
      );
    }
    return this.read(async () => {
      const relations = await this.pool.query(
        `SELECT name, to_regclass(name) AS relation
           FROM unnest($1::text[]) AS required(name)`,
        [REQUIRED_RELATIONS]
      );
      if (relations.rows.some((row) => !row.relation)) {
        throw new BillingConfigurationError(
          "Durable billing database migrations are incomplete"
        );
      }

      const guards = await this.pool.query(
        `SELECT conname
           FROM pg_constraint
          WHERE conname IN (
            'generation_jobs_job_tenant_project_unique',
            'credit_ledger_generation_job_fkey',
            'credit_ledger_generation_authority_shape'
          )
            AND convalidated`
      );
      const guardNames = new Set(guards.rows.map((row) => row.conname));
      if (guardNames.size !== 3) {
        throw new BillingConfigurationError(
          "Durable billing authority constraints are incomplete"
        );
      }

      const infrastructure = await this.pool.query(
        `SELECT
           to_regclass('public.credit_ledger_idempotency_global_unique')
             AS idempotency_index,
           EXISTS (
             SELECT 1
               FROM pg_trigger
              WHERE tgrelid = 'public.credit_ledger'::regclass
                AND tgname = 'validate_credit_ledger_authority'
                AND tgenabled <> 'D'
           ) AS authority_trigger`
      );
      if (
        !infrastructure.rows[0]?.idempotency_index ||
        !infrastructure.rows[0]?.authority_trigger
      ) {
        throw new BillingConfigurationError(
          "Durable billing indexes or authority triggers are incomplete"
        );
      }

      const unsafePrivileges = await this.pool.query(
        `WITH financial_tables(relation) AS (
           VALUES
             ('public.commercial_policies'),
             ('public.commercial_execution_prices'),
             ('public.tenant_entitlements'),
             ('public.credit_accounts'),
             ('public.credit_ledger'),
             ('public.stripe_customer_mappings'),
             ('public.stripe_subscription_mappings'),
             ('public.stripe_webhook_events'),
             ('public.stripe_bolt_on_payment_evidence')
         ), customer_roles(role_name) AS (
           VALUES ('anon'), ('authenticated'), ('service_role')
         )
         SELECT role_name, relation
           FROM financial_tables CROSS JOIN customer_roles
          WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name)
            AND has_table_privilege(
              role_name,
              relation,
              'INSERT,UPDATE,DELETE'
            )`
      );
      if (unsafePrivileges.rowCount !== 0) {
        throw new BillingConfigurationError(
          "Customer-facing roles retain authoritative billing mutation privileges"
        );
      }

      const policies = await this.pool.query(
        `SELECT policy.policy_id, price.execution_class, price.credit_cost
           FROM public.commercial_policies AS policy
           JOIN public.commercial_execution_prices AS price
             ON price.policy_id = policy.policy_id
          WHERE policy.policy_id = ANY($1::text[])
            AND policy.status = 'active'
            AND policy.effective_from <= $2::timestamptz
            AND (policy.effective_to IS NULL OR $2::timestamptz < policy.effective_to)
            AND price.execution_class = ANY($3::text[])
            AND price.credit_cost > 0`,
        [approvedPolicyIds, this.timestamp(), requiredExecutionClasses]
      );
      const configured = new Set(
        policies.rows.map((row) => `${row.policy_id}\u0000${row.execution_class}`)
      );
      for (const policyId of approvedPolicyIds) {
        for (const executionClass of requiredExecutionClasses) {
          if (!configured.has(`${policyId}\u0000${executionClass}`)) {
            throw new BillingConfigurationError(
              "Approved execution-credit policy data is incomplete"
            );
          }
        }
      }
      return true;
    });
  }

  async getActiveEntitlement(tenantId, at) {
    const tenant_id = identifier.parse(tenantId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT entitlement_id, tenant_id, policy_id, plan_code, status,
                starts_at, ends_at, reference_period_start,
                reference_period_end, included_monthly_credit_grant,
                stripe_subscription_ref, cancellation_effective_at,
                grace_ends_at
           FROM public.tenant_entitlements
          WHERE tenant_id = $1
            AND status = ANY($2::text[])
            AND starts_at <= $3::timestamptz
            AND (ends_at IS NULL OR $3::timestamptz < ends_at)
          ORDER BY starts_at DESC
          LIMIT 2`,
        [tenant_id, [...ENTITLED_STATUSES], at]
      );
      if (result.rows.length > 1) {
        throw new InvalidFinancialOperationError(
          "Multiple serving entitlements were found for one tenant"
        );
      }
      return mapEntitlement(result.rows[0]);
    });
  }

  async getCommercialPolicy(policyId, at) {
    const policy_id = identifier.parse(policyId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT policy.policy_id, policy.plan_code, policy.policy_version,
                policy.status, policy.included_monthly_credits,
                policy.bolt_on_eligible, policy.effective_from,
                policy.effective_to,
                jsonb_object_agg(price.execution_class, price.credit_cost)
                  AS execution_costs
           FROM public.commercial_policies AS policy
           JOIN public.commercial_execution_prices AS price
             ON price.policy_id = policy.policy_id
          WHERE policy.policy_id = $1
            AND policy.status = 'active'
            AND policy.effective_from <= $2::timestamptz
            AND (policy.effective_to IS NULL OR $2::timestamptz < policy.effective_to)
          GROUP BY policy.policy_id`,
        [policy_id, at]
      );
      return mapPolicy(result.rows[0]);
    });
  }

  async getCreditAccountByTenant(tenantId) {
    const tenant_id = identifier.parse(tenantId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT account_id, tenant_id, status, created_at
           FROM public.credit_accounts
          WHERE tenant_id = $1`,
        [tenant_id]
      );
      return mapAccount(result.rows[0]);
    });
  }

  async readBalance(tenantId) {
    const tenant_id = identifier.parse(tenantId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT account_id, tenant_id, ledger_balance, reserved_balance,
                available_balance, debited_credits, refunded_credits,
                net_spent_credits
           FROM public.credit_account_balances_internal
          WHERE tenant_id = $1`,
        [tenant_id]
      );
      const row = result.rows[0];
      if (!row) throw new CreditAccountUnavailableError();
      return Object.freeze({
        tenant_id: row.tenant_id,
        account_id: row.account_id,
        available_balance: toSafeInteger(row.available_balance),
        reserved_balance: toSafeInteger(row.reserved_balance),
        ledger_balance: toSafeInteger(row.ledger_balance),
        debited_credits: toSafeInteger(row.debited_credits),
        refunded_credits: toSafeInteger(row.refunded_credits),
        net_spent_credits: toSafeInteger(row.net_spent_credits),
      });
    });
  }

  async listLedger(tenantId) {
    const tenant_id = identifier.parse(tenantId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT ${LEDGER_COLUMNS.join(", ")}
           FROM public.credit_ledger
          WHERE tenant_id = $1
          ORDER BY created_at, ledger_entry_id`,
        [tenant_id]
      );
      return result.rows.map(mapLedger);
    });
  }

  async requireLockedAccount(client, tenantId) {
    const result = await client.query(
      `SELECT account_id, tenant_id, status, created_at
         FROM public.credit_accounts
        WHERE tenant_id = $1
        FOR UPDATE`,
      [tenantId]
    );
    const account = mapAccount(result.rows[0]);
    if (!account || account.status !== "active") {
      throw new CreditAccountUnavailableError();
    }
    return account;
  }

  async findReplay(client, account, idempotencyKey, intentHash) {
    const result = await client.query(
      `SELECT ${LEDGER_COLUMNS.join(", ")}
         FROM public.credit_ledger
        WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (!result.rows[0]) return null;
    const entry = mapLedger(result.rows[0]);
    if (
      entry.account_id !== account.account_id ||
      entry.tenant_id !== account.tenant_id ||
      entry.intent_hash !== intentHash
    ) {
      throw new IdempotencyConflictError();
    }
    return entry;
  }

  async rejectDuplicateEffect(client, accountId, input) {
    const logical = logicalEffectQuery(input);
    if (!logical) return;
    const result = await client.query(
      `SELECT ledger_entry_id
         FROM public.credit_ledger
        WHERE account_id = $1 AND ${logical.sql}
        LIMIT 1`,
      [accountId, ...logical.values]
    );
    if (result.rows[0]) throw new DuplicateFinancialEffectError();
  }

  async verifyAppendAuthority(client, account, input) {
    if (input.entry_type === "reservation") {
      const job = await client.query(
        `SELECT job.execution_class, price.credit_cost
           FROM public.generation_jobs AS job
           JOIN public.tenant_entitlements AS entitlement
             ON entitlement.tenant_id = job.tenant_id
            AND entitlement.status = ANY($6::text[])
            AND entitlement.starts_at <= $7::timestamptz
            AND (entitlement.ends_at IS NULL OR $7::timestamptz < entitlement.ends_at)
           JOIN public.commercial_policies AS policy
             ON policy.policy_id = entitlement.policy_id
            AND policy.plan_code = entitlement.plan_code
            AND policy.status = 'active'
            AND policy.effective_from <= $7::timestamptz
            AND (policy.effective_to IS NULL OR $7::timestamptz < policy.effective_to)
           JOIN public.commercial_execution_prices AS price
             ON price.policy_id = policy.policy_id
            AND price.execution_class = job.execution_class
          WHERE job.job_id = $1
            AND job.tenant_id = $2
            AND job.project_id = $3
            AND job.request_correlation_id = $4
            AND job.request_correlation_id = $5`,
        [
          input.generation_id,
          account.tenant_id,
          input.project_id,
          input.execution_id,
          input.transaction_correlation_id,
          [...ENTITLED_STATUSES],
          input.occurred_at || this.timestamp(),
        ]
      );
      if (
        job.rows.length !== 1 ||
        toSafeInteger(job.rows[0].credit_cost) !== input.amount
      ) {
        throw new FinancialResourceUnavailableError();
      }
      return;
    }

    if (input.entry_type === "monthly_grant") {
      const entitlement = await client.query(
        `SELECT 1
           FROM public.tenant_entitlements
          WHERE entitlement_id = $1
            AND tenant_id = $2
            AND included_monthly_credit_grant = $3
            AND reference_period_start = $4::timestamptz
            AND reference_period_end = $5::timestamptz`,
        [
          input.entitlement_id,
          account.tenant_id,
          input.amount,
          input.reference_period_start,
          input.reference_period_end,
        ]
      );
      if (entitlement.rowCount !== 1) {
        throw new FinancialResourceUnavailableError();
      }
      return;
    }

    if (input.entry_type === "bolt_on_grant") {
      const evidence = await client.query(
        `SELECT 1
           FROM public.stripe_bolt_on_payment_evidence
          WHERE payment_reference = $1
            AND tenant_id = $2
            AND credits = $3
            AND status = 'verified'
            AND ($4::text IS NULL OR stripe_event_id = $4)`,
        [
          input.payment_ref,
          account.tenant_id,
          input.amount,
          input.stripe_event_ref || null,
        ]
      );
      if (evidence.rowCount !== 1) {
        throw new FinancialResourceUnavailableError();
      }
    }
  }

  async appendLocked(client, account, input) {
    const intentHash = hashIntent({
      ...input,
      account_id: account.account_id,
      tenant_id: account.tenant_id,
    });
    const replay = await this.findReplay(
      client,
      account,
      input.idempotency_key,
      intentHash
    );
    if (replay) return replay;

    await this.rejectDuplicateEffect(client, account.account_id, input);
    await this.verifyAppendAuthority(client, account, input);

    const occurredAt = input.occurred_at || this.timestamp();
    const candidate = CreditLedgerEntrySchema.parse({
      ...input,
      ledger_entry_id: this.idFactory(),
      account_id: account.account_id,
      tenant_id: account.tenant_id,
      intent_hash: intentHash,
      occurred_at: occurredAt,
      created_at: this.timestamp(),
    });
    const balance = await client.query(
      `SELECT COALESCE(SUM(balance_delta), 0)::bigint AS ledger_balance,
              COALESCE(SUM(reserved_delta), 0)::bigint AS reserved_balance
         FROM public.credit_ledger
        WHERE account_id = $1`,
      [account.account_id]
    );
    const projectedLedger =
      toSafeInteger(balance.rows[0].ledger_balance) + candidate.balance_delta;
    const projectedReserved =
      toSafeInteger(balance.rows[0].reserved_balance) + candidate.reserved_delta;
    if (projectedReserved < 0 || projectedLedger - projectedReserved < 0) {
      throw new InsufficientCreditsError();
    }

    const values = LEDGER_COLUMNS.map((column) => candidate[column] ?? null);
    const placeholders = LEDGER_COLUMNS.map((_, index) => `$${index + 1}`);
    const result = await client.query(
      `INSERT INTO public.credit_ledger (${LEDGER_COLUMNS.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING ${LEDGER_COLUMNS.join(", ")}`,
      values
    );
    return mapLedger(result.rows[0]);
  }

  async appendFinancialTransaction(input) {
    if (!GENERIC_ENTRY_TYPES.has(input.entry_type)) {
      throw new InvalidFinancialOperationError(
        "Reservation, debit, release, and refund require dedicated operations"
      );
    }
    return this.withTransaction(async (client) => {
      const account = await this.requireLockedAccount(client, input.tenant_id);
      return this.appendLocked(client, account, input);
    });
  }

  async createReservation(input) {
    return this.withTransaction(async (client) => {
      const account = await this.requireLockedAccount(client, input.tenant_id);
      return this.appendLocked(client, account, {
        ...input,
        entry_type: "reservation",
        balance_delta: 0,
        reserved_delta: input.amount,
      });
    });
  }

  async requireRelatedEntry(client, account, entryId, expectedType) {
    const result = await client.query(
      `SELECT ${LEDGER_COLUMNS.join(", ")}
         FROM public.credit_ledger
        WHERE ledger_entry_id = $1
          AND account_id = $2
          AND tenant_id = $3
          AND entry_type = $4`,
      [entryId, account.account_id, account.tenant_id, expectedType]
    );
    const entry = mapLedger(result.rows[0]);
    if (!entry) throw new FinancialResourceUnavailableError();
    return entry;
  }

  async settleReservation(input, entryType) {
    return this.withTransaction(async (client) => {
      const account = await this.requireLockedAccount(client, input.tenant_id);
      const reservation = await this.requireRelatedEntry(
        client,
        account,
        input.reservation_entry_id,
        "reservation"
      );
      return this.appendLocked(client, account, {
        ...input,
        amount: reservation.amount,
        project_id: reservation.project_id,
        generation_id: reservation.generation_id,
        execution_id: reservation.execution_id,
        transaction_correlation_id: reservation.transaction_correlation_id,
        entry_type: entryType,
        balance_delta: entryType === "debit" ? -reservation.amount : 0,
        reserved_delta: -reservation.amount,
      });
    });
  }

  async releaseReservation(input) {
    return this.settleReservation(input, "reservation_release");
  }

  async finalizeDebit(input) {
    return this.settleReservation(input, "debit");
  }

  async refund(input) {
    return this.withTransaction(async (client) => {
      const account = await this.requireLockedAccount(client, input.tenant_id);
      const debit = await this.requireRelatedEntry(
        client,
        account,
        input.debit_entry_id,
        "debit"
      );
      return this.appendLocked(client, account, {
        ...input,
        amount: debit.amount,
        project_id: debit.project_id,
        generation_id: debit.generation_id,
        execution_id: debit.execution_id,
        transaction_correlation_id: debit.transaction_correlation_id,
        reservation_entry_id: undefined,
        entry_type: "refund",
        balance_delta: debit.amount,
        reserved_delta: 0,
      });
    });
  }

  async getStripeCustomerByTenant(tenantId) {
    const tenant_id = identifier.parse(tenantId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT tenant_id, stripe_customer_id, livemode, created_at
           FROM public.stripe_customer_mappings
          WHERE tenant_id = $1`,
        [tenant_id]
      );
      const row = result.rows[0];
      return row ? { ...row, created_at: toIso(row.created_at) } : null;
    });
  }

  async getStripeCustomerById(stripeCustomerId) {
    const customerId = identifier.parse(stripeCustomerId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT tenant_id, stripe_customer_id, livemode, created_at
           FROM public.stripe_customer_mappings
          WHERE stripe_customer_id = $1`,
        [customerId]
      );
      const row = result.rows[0];
      return row ? { ...row, created_at: toIso(row.created_at) } : null;
    });
  }

  async createStripeCustomerMapping(input) {
    const candidate = {
      tenant_id: identifier.parse(input.tenant_id),
      stripe_customer_id: identifier.parse(input.stripe_customer_id),
      livemode: Boolean(input.livemode),
      created_at: input.created_at || this.timestamp(),
    };
    return this.withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO public.stripe_customer_mappings
           (tenant_id, stripe_customer_id, livemode, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING tenant_id, stripe_customer_id, livemode, created_at`,
        Object.values(candidate)
      );
      const row = inserted.rows[0] || (
        await client.query(
          `SELECT tenant_id, stripe_customer_id, livemode, created_at
             FROM public.stripe_customer_mappings
            WHERE tenant_id = $1 OR stripe_customer_id = $2
            FOR UPDATE`,
          [candidate.tenant_id, candidate.stripe_customer_id]
        )
      ).rows[0];
      if (
        !row ||
        row.tenant_id !== candidate.tenant_id ||
        row.stripe_customer_id !== candidate.stripe_customer_id ||
        row.livemode !== candidate.livemode
      ) {
        throw new StripeBillingConflictError();
      }
      return { ...row, created_at: toIso(row.created_at) };
    });
  }

  async getStripeSubscription(stripeSubscriptionId) {
    const subscriptionId = identifier.parse(stripeSubscriptionId);
    return this.read(async () => {
      const result = await this.pool.query(
        `SELECT * FROM public.stripe_subscription_mappings
          WHERE stripe_subscription_id = $1`,
        [subscriptionId]
      );
      return mapStripeSubscription(result.rows[0]);
    });
  }

  async applyStripeSubscriptionState(input) {
    const tenantId = identifier.parse(input.tenant_id);
    const subscriptionId = identifier.parse(input.stripe_subscription_id);
    const customerId = identifier.parse(input.stripe_customer_id);
    const eventId = identifier.parse(input.event_id);
    return this.withTransaction(async (client) => {
      const customer = await client.query(
        `SELECT tenant_id, stripe_customer_id, livemode
           FROM public.stripe_customer_mappings
          WHERE tenant_id = $1 AND stripe_customer_id = $2
          FOR KEY SHARE`,
        [tenantId, customerId]
      );
      if (
        customer.rowCount !== 1 ||
        customer.rows[0].livemode !== Boolean(input.livemode)
      ) {
        throw new StripeBillingResourceUnavailableError();
      }

      const mappingResult = await client.query(
        `SELECT * FROM public.stripe_subscription_mappings
          WHERE stripe_subscription_id = $1
          FOR UPDATE`,
        [subscriptionId]
      );
      const existingMapping = mapStripeSubscription(mappingResult.rows[0]);
      let existingEntitlement = null;
      if (existingMapping) {
        const entitlementResult = await client.query(
          `SELECT * FROM public.tenant_entitlements
            WHERE entitlement_id = $1 AND tenant_id = $2
            FOR UPDATE`,
          [existingMapping.entitlement_id, tenantId]
        );
        existingEntitlement = mapEntitlement(entitlementResult.rows[0]);
        for (const [field, value] of [
          ["tenant_id", tenantId],
          ["stripe_customer_id", customerId],
          ["policy_id", input.policy_id],
          ["plan_code", input.plan_code],
          ["stripe_price_id", input.stripe_price_id],
          ["livemode", Boolean(input.livemode)],
        ]) {
          if (existingMapping[field] !== value) {
            throw new StripeBillingConflictError();
          }
        }
        const stale = (reason) => Object.freeze({
          stale: true,
          stale_reason: reason,
          mapping: existingMapping,
          entitlement: existingEntitlement,
        });
        if (eventId === existingMapping.last_event_id) return stale("same_event");
        const incomingTime = Date.parse(input.event_created);
        const existingTime = Date.parse(existingMapping.last_event_created);
        if (incomingTime < existingTime) return stale("older_event");
        const existingTerminal =
          existingMapping.stripe_status === "canceled" ||
          existingEntitlement?.status === "cancelled";
        const incomingTerminal = input.entitlement_status === "cancelled";
        if (incomingTime === existingTime) {
          if (existingTerminal) return stale("terminal_state");
          if (!incomingTerminal) return stale("same_second_ambiguous");
        } else if (existingTerminal && !incomingTerminal) {
          return stale("terminal_state");
        }
      }

      let entitlement = existingEntitlement;
      if (!entitlement) {
        const candidates = await client.query(
          `SELECT * FROM public.tenant_entitlements
            WHERE tenant_id = $1
              AND policy_id = $2
              AND (stripe_subscription_ref = $3 OR stripe_subscription_ref IS NULL)
            ORDER BY (stripe_subscription_ref = $3) DESC
            FOR UPDATE`,
          [tenantId, input.policy_id, subscriptionId]
        );
        const exact = candidates.rows.filter(
          (row) => row.stripe_subscription_ref === subscriptionId
        );
        const unbound = candidates.rows.filter((row) => !row.stripe_subscription_ref);
        if (exact.length > 1 || (exact.length === 0 && unbound.length > 1)) {
          throw new StripeBillingConflictError();
        }
        entitlement = mapEntitlement(exact[0] || unbound[0]);
      }
      if (entitlement && entitlement.tenant_id !== tenantId) {
        throw new StripeBillingConflictError();
      }
      if (
        entitlement &&
        (entitlement.policy_id !== input.policy_id ||
          entitlement.plan_code !== input.plan_code)
      ) {
        throw new StripeBillingConflictError(
          "A Stripe event cannot change a historical commercial policy version"
        );
      }

      if (ENTITLED_STATUSES.has(input.entitlement_status)) {
        const other = await client.query(
          `SELECT 1 FROM public.tenant_entitlements
            WHERE tenant_id = $1
              AND entitlement_id <> $2
              AND status = ANY($3::text[])
            LIMIT 1`,
          [tenantId, entitlement?.entitlement_id || "", [...ENTITLED_STATUSES]]
        );
        if (other.rowCount) throw new StripeBillingConflictError();
      }

      const next = TenantEntitlementSchema.parse({
        entitlement_id: entitlement?.entitlement_id || this.entitlementIdFactory(),
        tenant_id: tenantId,
        policy_id: entitlement?.policy_id || input.policy_id,
        plan_code: entitlement?.plan_code || input.plan_code,
        status: input.entitlement_status,
        starts_at: entitlement?.starts_at || input.starts_at,
        ends_at: input.ends_at,
        reference_period_start: input.reference_period_start,
        reference_period_end: input.reference_period_end,
        included_monthly_credit_grant:
          entitlement?.included_monthly_credit_grant ??
          input.included_monthly_credit_grant,
        stripe_subscription_ref: subscriptionId,
        cancellation_effective_at: input.cancellation_effective_at,
        grace_ends_at: input.grace_ends_at,
      });
      if (entitlement) {
        await client.query(
          `UPDATE public.tenant_entitlements
              SET status = $2, ends_at = $3, reference_period_start = $4,
                  reference_period_end = $5, stripe_subscription_ref = $6,
                  cancellation_effective_at = $7, grace_ends_at = $8,
                  updated_at = $9
            WHERE entitlement_id = $1`,
          [
            next.entitlement_id,
            next.status,
            next.ends_at || null,
            next.reference_period_start,
            next.reference_period_end,
            subscriptionId,
            next.cancellation_effective_at || null,
            next.grace_ends_at || null,
            this.timestamp(),
          ]
        );
      } else {
        await client.query(
          `INSERT INTO public.tenant_entitlements
             (entitlement_id, tenant_id, policy_id, plan_code, status,
              starts_at, ends_at, reference_period_start, reference_period_end,
              included_monthly_credit_grant, stripe_subscription_ref,
              cancellation_effective_at, grace_ends_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            next.entitlement_id,
            next.tenant_id,
            next.policy_id,
            next.plan_code,
            next.status,
            next.starts_at,
            next.ends_at || null,
            next.reference_period_start,
            next.reference_period_end,
            next.included_monthly_credit_grant,
            subscriptionId,
            next.cancellation_effective_at || null,
            next.grace_ends_at || null,
          ]
        );
      }

      const mappingValues = [
        subscriptionId,
        tenantId,
        customerId,
        next.entitlement_id,
        next.policy_id,
        next.plan_code,
        identifier.parse(input.stripe_price_id),
        input.stripe_status,
        next.status,
        Boolean(input.livemode),
        input.event_created,
        eventId,
        this.timestamp(),
      ];
      const storedMapping = await client.query(
        `INSERT INTO public.stripe_subscription_mappings
           (stripe_subscription_id, tenant_id, stripe_customer_id,
            entitlement_id, policy_id, plan_code, stripe_price_id,
            stripe_status, entitlement_status, livemode, last_event_created,
            last_event_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
           stripe_status = EXCLUDED.stripe_status,
           entitlement_status = EXCLUDED.entitlement_status,
           last_event_created = EXCLUDED.last_event_created,
           last_event_id = EXCLUDED.last_event_id,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        mappingValues
      );
      return Object.freeze({
        stale: false,
        mapping: mapStripeSubscription(storedMapping.rows[0]),
        entitlement: next,
      });
    });
  }

  async beginStripeEvent(input) {
    const eventId = identifier.parse(input.event_id);
    return this.withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO public.stripe_webhook_events
           (stripe_event_id, event_type, livemode, intent_hash, status, received_at)
         VALUES ($1, $2, $3, $4, 'processing', $5)
         ON CONFLICT DO NOTHING
         RETURNING stripe_event_id`,
        [
          eventId,
          input.event_type,
          Boolean(input.livemode),
          input.intent_hash,
          input.received_at || this.timestamp(),
        ]
      );
      if (inserted.rowCount === 1) return Object.freeze({ replay: false });
      const existingResult = await client.query(
        `SELECT * FROM public.stripe_webhook_events
          WHERE stripe_event_id = $1
          FOR UPDATE`,
        [eventId]
      );
      const existing = existingResult.rows[0];
      if (
        !existing ||
        existing.event_type !== input.event_type ||
        existing.livemode !== Boolean(input.livemode) ||
        existing.intent_hash !== input.intent_hash
      ) {
        throw new StripeEventConflictError();
      }
      if (existing.status === "processed") {
        return Object.freeze({ replay: true, result: existing.result });
      }
      if (existing.status === "failed") {
        await client.query(
          `UPDATE public.stripe_webhook_events
              SET status = 'processing'
            WHERE stripe_event_id = $1`,
          [eventId]
        );
        return Object.freeze({ replay: false });
      }
      throw new StripeEventInProgressError();
    });
  }

  async completeStripeEvent({ event_id, result }) {
    const eventId = identifier.parse(event_id);
    return this.withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE public.stripe_webhook_events
            SET status = 'processed', result = $2::jsonb,
                processed_at = $3
          WHERE stripe_event_id = $1 AND status = 'processing'
          RETURNING *`,
        [eventId, JSON.stringify(result), this.timestamp()]
      );
      if (updated.rowCount !== 1) throw new StripeEventConflictError();
      return updated.rows[0];
    });
  }

  async abandonStripeEvent(eventId) {
    const parsed = identifier.parse(eventId);
    return this.withTransaction(async (client) => {
      await client.query(
        `UPDATE public.stripe_webhook_events
            SET status = 'failed'
          WHERE stripe_event_id = $1 AND status = 'processing'`,
        [parsed]
      );
    });
  }

  async recordBoltOnPaymentEvidence(input) {
    const candidate = {
      payment_reference: identifier.parse(input.payment_reference),
      stripe_event_id: identifier.parse(input.stripe_event_id),
      tenant_id: identifier.parse(input.tenant_id),
      stripe_customer_id: identifier.parse(input.stripe_customer_id),
      stripe_price_id: identifier.parse(input.stripe_price_id),
      credits: toSafeInteger(input.credits),
      status: "verified",
    };
    return this.withTransaction(async (client) => {
      const customer = await client.query(
        `SELECT 1 FROM public.stripe_customer_mappings
          WHERE tenant_id = $1 AND stripe_customer_id = $2`,
        [candidate.tenant_id, candidate.stripe_customer_id]
      );
      if (customer.rowCount !== 1) {
        throw new StripeBillingResourceUnavailableError();
      }
      const inserted = await client.query(
        `INSERT INTO public.stripe_bolt_on_payment_evidence
           (payment_reference, stripe_event_id, tenant_id, stripe_customer_id,
            stripe_price_id, credits, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        Object.values(candidate)
      );
      const row = inserted.rows[0] || (
        await client.query(
          `SELECT * FROM public.stripe_bolt_on_payment_evidence
            WHERE payment_reference = $1 OR stripe_event_id = $2`,
          [candidate.payment_reference, candidate.stripe_event_id]
        )
      ).rows[0];
      if (
        !row ||
        Object.entries(candidate).some(([key, value]) =>
          key === "credits"
            ? toSafeInteger(row[key]) !== value
            : row[key] !== value
        )
      ) {
        throw new StripeBillingConflictError();
      }
      return { ...candidate, created_at: toIso(row.created_at) };
    });
  }

  async reconcile({ olderThan, limit = 100 }) {
    const boundedLimit = Math.max(1, Math.min(toSafeInteger(limit), 500));
    return this.withTransaction(
      async (client) => {
        const stale = await client.query(
          `SELECT reservation.*
             FROM public.credit_ledger AS reservation
            WHERE reservation.entry_type = 'reservation'
              AND reservation.occurred_at < $1::timestamptz
              AND NOT EXISTS (
                SELECT 1 FROM public.credit_ledger AS settlement
                 WHERE settlement.account_id = reservation.account_id
                   AND settlement.reservation_entry_id = reservation.ledger_entry_id
                   AND settlement.entry_type IN ('debit', 'reservation_release')
              )
            ORDER BY reservation.occurred_at
            LIMIT $2`,
          [olderThan, boundedLimit]
        );
        const invalidSettlements = await client.query(
          `SELECT settlement.ledger_entry_id, settlement.tenant_id,
                  settlement.reservation_entry_id, settlement.entry_type,
                  'reservation_authority_mismatch' AS reason
             FROM public.credit_ledger AS settlement
             LEFT JOIN public.credit_ledger AS reservation
               ON reservation.ledger_entry_id = settlement.reservation_entry_id
              AND reservation.account_id = settlement.account_id
              AND reservation.tenant_id = settlement.tenant_id
            WHERE settlement.entry_type IN ('debit', 'reservation_release')
              AND (
                reservation.entry_type IS DISTINCT FROM 'reservation'
                OR settlement.amount IS DISTINCT FROM reservation.amount
                OR settlement.generation_id IS DISTINCT FROM reservation.generation_id
                OR settlement.project_id IS DISTINCT FROM reservation.project_id
                OR settlement.execution_id IS DISTINCT FROM reservation.execution_id
              )
            LIMIT $1`,
          [boundedLimit]
        );
        const orphanRefunds = await client.query(
          `SELECT refund.ledger_entry_id, refund.tenant_id, refund.debit_entry_id,
                  'debit_authority_mismatch' AS reason
             FROM public.credit_ledger AS refund
             LEFT JOIN public.credit_ledger AS debit
               ON debit.ledger_entry_id = refund.debit_entry_id
              AND debit.account_id = refund.account_id
              AND debit.tenant_id = refund.tenant_id
            WHERE refund.entry_type = 'refund'
              AND (
                debit.entry_type IS DISTINCT FROM 'debit'
                OR refund.amount IS DISTINCT FROM debit.amount
                OR refund.generation_id IS DISTINCT FROM debit.generation_id
              )
            LIMIT $1`,
          [boundedLimit]
        );
        const duplicates = await client.query(
          `WITH effects AS (
             SELECT account_id,
                    CASE entry_type
                      WHEN 'monthly_grant' THEN 'monthly:' || entitlement_id || ':' || reference_period_start::text
                      WHEN 'bolt_on_grant' THEN 'bolt-on:' || payment_ref
                      WHEN 'reservation' THEN 'reservation:' || generation_id
                      WHEN 'reservation_release' THEN 'settlement:' || reservation_entry_id
                      WHEN 'debit' THEN 'settlement:' || reservation_entry_id
                      WHEN 'refund' THEN 'refund:' || debit_entry_id
                    END AS logical_key,
                    ledger_entry_id
               FROM public.credit_ledger
              WHERE entry_type IN (
                'monthly_grant', 'bolt_on_grant', 'reservation',
                'reservation_release', 'debit', 'refund'
              )
           )
           SELECT account_id, logical_key,
                  array_agg(ledger_entry_id ORDER BY ledger_entry_id) AS ledger_entry_ids
             FROM effects
            GROUP BY account_id, logical_key
           HAVING count(*) > 1
            LIMIT $1`,
          [boundedLimit]
        );
        const monthly = await client.query(
          `SELECT grant_entry.ledger_entry_id, grant_entry.tenant_id,
                  grant_entry.entitlement_id,
                  'grant_authority_mismatch' AS reason
             FROM public.credit_ledger AS grant_entry
             LEFT JOIN public.tenant_entitlements AS entitlement
               ON entitlement.entitlement_id = grant_entry.entitlement_id
              AND entitlement.tenant_id = grant_entry.tenant_id
            WHERE grant_entry.entry_type = 'monthly_grant'
              AND (
                entitlement.entitlement_id IS NULL
                OR grant_entry.amount <> entitlement.included_monthly_credit_grant
                OR grant_entry.reference_period_end <= grant_entry.reference_period_start
                OR (
                  grant_entry.reference_period_start = entitlement.reference_period_start
                  AND grant_entry.reference_period_end IS DISTINCT FROM entitlement.reference_period_end
                )
              )
           UNION ALL
           SELECT NULL, entitlement.tenant_id, entitlement.entitlement_id,
                  'current_period_grant_missing'
             FROM public.tenant_entitlements AS entitlement
            WHERE entitlement.status = ANY($1::text[])
              AND NOT EXISTS (
                SELECT 1 FROM public.credit_ledger AS grant_entry
                 WHERE grant_entry.entry_type = 'monthly_grant'
                   AND grant_entry.tenant_id = entitlement.tenant_id
                   AND grant_entry.entitlement_id = entitlement.entitlement_id
                   AND grant_entry.reference_period_start = entitlement.reference_period_start
              )
            LIMIT $2`,
          [[...ENTITLED_STATUSES], boundedLimit]
        );
        return Object.freeze({
          stale_reservations: stale.rows.map(mapLedger),
          invalid_settlements: invalidSettlements.rows,
          orphan_refunds: orphanRefunds.rows,
          duplicate_effects: duplicates.rows,
          monthly_grant_mismatches: monthly.rows,
        });
      },
      { readOnly: true, observe: false }
    );
  }
}

module.exports = {
  LEDGER_COLUMNS,
  PostgresBillingRepository,
  REQUIRED_RELATIONS,
  mapLedger,
};
