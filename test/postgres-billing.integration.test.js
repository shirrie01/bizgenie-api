const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { after, before, beforeEach, describe, it } = require("node:test");
const { Pool } = require("pg");
const {
  BillingPersistenceError,
  BillingService,
  DuplicateFinancialEffectError,
  FinancialResourceUnavailableError,
  IdempotencyConflictError,
  InsufficientCreditsError,
  PostgresBillingRepository,
  StripeBillingConflictError,
  StripeBillingResourceUnavailableError,
} = require("../src/billing");
const {
  GenerationBillingOrchestrator,
  GenerationBillingUnavailableError,
} = require("../src/generation-billing");
const {
  PostgresMediaAssetRepository,
  objectKey,
} = require("../src/media");

const ADMIN_DATABASE_URL = process.env.TEST_DATABASE_URL;
const postgresDescribe = ADMIN_DATABASE_URL ? describe : describe.skip;
const NOW = "2026-08-23T12:00:00.000Z";
const PERIOD_START = "2026-08-01T00:00:00.000Z";
const PERIOD_END = "2026-09-01T00:00:00.000Z";
const AUTH_A = "11111111-1111-4111-8111-111111111111";
const AUTH_B = "22222222-2222-4222-8222-222222222222";

const JOBS = Object.freeze([
  ["job_reserve_a", "tenant_a", "project_a", "video.normal", "corr_reserve_a", AUTH_A],
  ["job_reserve_b", "tenant_a", "project_a", "video.normal", "corr_reserve_b", AUTH_A],
  ["job_same", "tenant_a", "project_a", "video.normal", "corr_same", AUTH_A],
  ["job_debit", "tenant_a", "project_a", "video.normal", "corr_debit", AUTH_A],
  ["job_release", "tenant_a", "project_a", "video.normal", "corr_release", AUTH_A],
  ["job_refund", "tenant_a", "project_a", "video.normal", "corr_refund", AUTH_A],
  ["job_old", "tenant_a", "project_a", "video.normal", "corr_old", AUTH_A],
  ["job_text", "tenant_a", "project_a", "text.standard", "corr_text", AUTH_A],
  ["job_image", "tenant_a", "project_a", "image.normal", "corr_image", AUTH_A],
  ["job_video", "tenant_a", "project_a", "video.normal", "corr_video", AUTH_A],
  ["job_tenant_b", "tenant_b", "project_b", "video.normal", "corr_tenant_b", AUTH_B],
]);

function databaseUrl(databaseName) {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function reservationInput(jobId, {
  tenantId = "tenant_a",
  projectId = "project_a",
  amount = 6,
  idempotencyKey = `reserve_${jobId}`,
} = {}) {
  const job = JOBS.find(([candidate]) => candidate === jobId);
  return {
    tenant_id: tenantId,
    amount,
    project_id: projectId,
    generation_id: jobId,
    execution_id: job[4],
    transaction_correlation_id: job[4],
    idempotency_key: idempotencyKey,
  };
}

function jobObject(jobId) {
  const [job_id, tenant_id, project_id, execution_class, correlation, authUserId] =
    JOBS.find(([candidate]) => candidate === jobId);
  return {
    job_id,
    tenant_id,
    project_id,
    execution_class,
    actor_correlation: { kind: "customer", auth_user_id: authUserId },
    request_correlation_id: correlation,
    idempotency_key: `job_request_${jobId}`,
    created_at: NOW,
    allowed_scopes: ["generation:execute"],
  };
}

class FailBeforeCommitRepository extends PostgresBillingRepository {
  constructor(options) {
    super(options);
    this.failNext = false;
  }

  async beforeCommit() {
    if (!this.failNext) return;
    this.failNext = false;
    throw new Error("fixture failure before commit");
  }
}

class FailAfterCommitRepository extends PostgresBillingRepository {
  constructor(options) {
    super(options);
    this.failNext = false;
  }

  async afterCommit() {
    if (!this.failNext) return;
    this.failNext = false;
    throw new Error("fixture acknowledgement lost after commit");
  }
}

postgresDescribe("PostgresBillingRepository real PostgreSQL adversarial proof", {
  concurrency: 1,
}, () => {
  let adminPool;
  let pool;
  let testDatabase;
  let repository;
  let service;

  async function resetFixture() {
    await pool.query(`
      TRUNCATE TABLE
        public.media_assets,
        public.stripe_bolt_on_payment_evidence,
        public.stripe_webhook_events,
        public.stripe_subscription_mappings,
        public.stripe_customer_mappings,
        public.credit_ledger,
        public.generation_jobs,
        public.credit_accounts,
        public.tenant_entitlements,
        public.commercial_execution_prices,
        public.commercial_policies,
        public.brand_brains,
        public.projects,
        public.tenant_memberships,
        public.tenants,
        public.customer_profiles,
        auth.users
      RESTART IDENTITY CASCADE
    `);
    await pool.query(
      `INSERT INTO auth.users (id) VALUES ($1), ($2)`,
      [AUTH_A, AUTH_B]
    );
    await pool.query(
      `INSERT INTO public.customer_profiles (auth_user_id, display_name)
       VALUES ($1, 'Tenant A owner'), ($2, 'Tenant B owner')`,
      [AUTH_A, AUTH_B]
    );
    await pool.query(
      `INSERT INTO public.tenants (tenant_id, name, created_by)
       VALUES ('tenant_a', 'Tenant A', $1), ('tenant_b', 'Tenant B', $2)`,
      [AUTH_A, AUTH_B]
    );
    await pool.query(`
      INSERT INTO public.projects (project_id, tenant_id, name)
      VALUES ('project_a', 'tenant_a', 'Project A'),
             ('project_b', 'tenant_b', 'Project B')
    `);
    await pool.query(`
      INSERT INTO public.commercial_policies
        (policy_id, plan_code, policy_version, status,
         included_monthly_credits, bolt_on_eligible, effective_from)
      VALUES ('policy_standard_v1', 'standard', 1, 'draft', 10, true,
              '2026-01-01T00:00:00.000Z')
    `);
    await pool.query(`
      INSERT INTO public.commercial_execution_prices
        (policy_id, execution_class, credit_cost)
      VALUES
        ('policy_standard_v1', 'text.standard', 1),
        ('policy_standard_v1', 'image.normal', 2),
        ('policy_standard_v1', 'image.premium', 4),
        ('policy_standard_v1', 'video.normal', 6),
        ('policy_standard_v1', 'video.premium', 9)
    `);
    await pool.query(`
      UPDATE public.commercial_policies SET status = 'active'
      WHERE policy_id = 'policy_standard_v1'
    `);
    await pool.query(
      `INSERT INTO public.tenant_entitlements
        (entitlement_id, tenant_id, policy_id, plan_code, status, starts_at,
         reference_period_start, reference_period_end,
         included_monthly_credit_grant)
       VALUES
        ('entitlement_a', 'tenant_a', 'policy_standard_v1', 'standard',
         'active', '2026-01-01T00:00:00.000Z', $1, $2, 10),
        ('entitlement_b', 'tenant_b', 'policy_standard_v1', 'standard',
         'active', '2026-01-01T00:00:00.000Z', $1, $2, 10)`,
      [PERIOD_START, PERIOD_END]
    );
    await pool.query(`
      INSERT INTO public.credit_accounts (account_id, tenant_id)
      VALUES ('account_a', 'tenant_a'), ('account_b', 'tenant_b')
    `);
    for (const [jobId, tenantId, projectId, executionClass, correlation, authUserId] of JOBS) {
      await pool.query(
        `INSERT INTO public.generation_jobs
          (job_id, tenant_id, project_id, execution_class, auth_user_id,
           request_correlation_id, idempotency_key, allowed_scopes,
           execution_content, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'["generation:execute"]'::jsonb,
                 '{}'::jsonb,$8)`,
        [
          jobId,
          tenantId,
          projectId,
          executionClass,
          authUserId,
          correlation,
          `job_request_${jobId}`,
          NOW,
        ]
      );
    }
    repository = new PostgresBillingRepository({
      pool,
      now: () => new Date(NOW),
    });
    service = new BillingService({
      repository,
      now: () => new Date(NOW),
    });
  }

  async function fund(tenantId = "tenant_a", amount = 10, suffix = tenantId) {
    return service.adjustCredits({
      tenantId,
      amount,
      direction: "credit",
      transactionCorrelationId: `fund_${suffix}`,
      idempotencyKey: `fund_${suffix}`,
    });
  }

  async function reserve(jobId, options = {}) {
    const job = JOBS.find(([candidate]) => candidate === jobId);
    return service.createReservation({
      tenantId: options.tenantId || job[1],
      projectId: options.projectId || job[2],
      generationId: jobId,
      executionId: job[4],
      transactionCorrelationId: job[4],
      executionClass: job[3],
      idempotencyKey: options.idempotencyKey || `reserve_${jobId}`,
    });
  }

  async function waitForTestDatabaseDisconnect() {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const connections = await adminPool.query(
        `SELECT count(*)::integer AS count
           FROM pg_stat_activity
          WHERE datname = $1`,
        [testDatabase]
      );
      if (connections.rows[0].count === 0) return;
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for PostgreSQL clients to disconnect from ${testDatabase}`
        );
      }
      await delay(10);
    }
  }

  before(async () => {
    adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 4 });
    testDatabase = `bizgenie_billing_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END;
      $$
    `);
    await adminPool.query(`CREATE DATABASE ${testDatabase}`);
    pool = new Pool({ connectionString: databaseUrl(testDatabase), max: 24 });
    await pool.query(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      SET search_path = ''
      AS 'SELECT NULL::uuid';
    `);
    const migrationsDirectory = path.join(__dirname, "..", "supabase", "migrations");
    const migrations = fs.readdirSync(migrationsDirectory)
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    for (const filename of migrations) {
      try {
        await pool.query(
          fs.readFileSync(path.join(migrationsDirectory, filename), "utf8")
        );
      } catch (error) {
        error.message = `${filename}: ${error.message}`;
        throw error;
      }
    }
  });

  after(async () => {
    await pool?.end();
    if (adminPool && testDatabase) {
      await waitForTestDatabaseDisconnect();
      await adminPool.query(`DROP DATABASE IF EXISTS ${testDatabase}`);
    }
    await adminPool?.end();
  });

  beforeEach(resetFixture);

  it("runs against a real server with every durable authority guard initialized", async () => {
    const version = await pool.query("SHOW server_version");
    assert.match(version.rows[0].server_version, /^1[7-9]\./);
    assert.equal(
      await repository.initialize({
        approvedPolicyIds: ["policy_standard_v1"],
        requiredExecutionClasses: [
          "text.standard",
          "image.normal",
          "video.normal",
        ],
      }),
      true
    );
  });

  it("keeps Stripe mappings, webhook evidence, and bolt-on evidence tenant-bound", async () => {
    const mapping = await repository.createStripeCustomerMapping({
      tenant_id: "tenant_a",
      stripe_customer_id: "cus_tenantA",
      livemode: false,
    });
    assert.equal(mapping.tenant_id, "tenant_a");
    await assert.rejects(
      repository.createStripeCustomerMapping({
        tenant_id: "tenant_b",
        stripe_customer_id: "cus_tenantA",
        livemode: false,
      }),
      StripeBillingConflictError
    );

    const subscription = await repository.applyStripeSubscriptionState({
      tenant_id: "tenant_a",
      stripe_subscription_id: "sub_tenantA",
      stripe_customer_id: "cus_tenantA",
      policy_id: "policy_standard_v1",
      plan_code: "standard",
      stripe_price_id: "price_standardTest",
      stripe_status: "active",
      entitlement_status: "active",
      livemode: false,
      event_created: NOW,
      event_id: "evt_subscriptionTenantA",
      starts_at: "2026-01-01T00:00:00.000Z",
      reference_period_start: PERIOD_START,
      reference_period_end: PERIOD_END,
      included_monthly_credit_grant: 10,
    });
    assert.equal(subscription.mapping.tenant_id, "tenant_a");
    await assert.rejects(
      repository.applyStripeSubscriptionState({
        tenant_id: "tenant_b",
        stripe_subscription_id: "sub_tenantA",
        stripe_customer_id: "cus_tenantA",
        policy_id: "policy_standard_v1",
        plan_code: "standard",
        stripe_price_id: "price_standardTest",
        stripe_status: "active",
        entitlement_status: "active",
        livemode: false,
        event_created: "2026-08-23T12:00:01.000Z",
        event_id: "evt_subscriptionCrossTenant",
        starts_at: "2026-01-01T00:00:00.000Z",
        reference_period_start: PERIOD_START,
        reference_period_end: PERIOD_END,
        included_monthly_credit_grant: 10,
      }),
      StripeBillingResourceUnavailableError
    );

    assert.deepEqual(
      await repository.beginStripeEvent({
        event_id: "evt_webhookTenantA",
        event_type: "invoice.paid",
        livemode: false,
        intent_hash: "a".repeat(64),
      }),
      { replay: false }
    );
    await repository.completeStripeEvent({
      event_id: "evt_webhookTenantA",
      result: { tenant_id: "tenant_a", applied: true },
    });
    const webhookReplay = await repository.beginStripeEvent({
      event_id: "evt_webhookTenantA",
      event_type: "invoice.paid",
      livemode: false,
      intent_hash: "a".repeat(64),
    });
    assert.equal(webhookReplay.replay, true);
    assert.equal(webhookReplay.result.tenant_id, "tenant_a");

    await assert.rejects(
      repository.recordBoltOnPaymentEvidence({
        payment_reference: "pi_cross_tenant",
        stripe_event_id: "evt_boltCrossTenant",
        tenant_id: "tenant_b",
        stripe_customer_id: "cus_tenantA",
        stripe_price_id: "price_boltTest",
        credits: 5,
      }),
      StripeBillingResourceUnavailableError
    );
    await repository.beginStripeEvent({
      event_id: "evt_boltTenantA",
      event_type: "checkout.session.completed",
      livemode: false,
      intent_hash: "b".repeat(64),
    });
    await repository.recordBoltOnPaymentEvidence({
      payment_reference: "pi_tenant_a",
      stripe_event_id: "evt_boltTenantA",
      tenant_id: "tenant_a",
      stripe_customer_id: "cus_tenantA",
      stripe_price_id: "price_boltTest",
      credits: 5,
    });
    const boltOn = await service.grantBoltOnCredits({
      tenantId: "tenant_a",
      amount: 5,
      paymentReference: "pi_tenant_a",
      stripeEventReference: "evt_boltTenantA",
      idempotencyKey: "bolt_tenant_a",
    });
    assert.equal(boltOn.balance_delta, 5);
  });

  it("serializes two insufficient-balance reservations on one tenant account", async () => {
    await fund();
    const results = await Promise.allSettled([
      reserve("job_reserve_a"),
      reserve("job_reserve_b"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected.reason instanceof InsufficientCreditsError);
    const balance = await service.readBalance({ tenantId: "tenant_a" });
    assert.equal(balance.available_balance, 4);
    assert.equal(balance.reserved_balance, 6);
  });

  it("converges concurrent delivery of the same job on one reservation", async () => {
    await fund();
    const [first, second] = await Promise.all([
      reserve("job_same"),
      reserve("job_same"),
    ]);
    assert.equal(first.ledger_entry_id, second.ledger_entry_id);
    const entries = await repository.listLedger("tenant_a");
    assert.equal(entries.filter((entry) => entry.entry_type === "reservation").length, 1);
  });

  it("fails closed for concurrent global idempotency reuse across immutable authority", async () => {
    await fund("tenant_a", 10, "a");
    await fund("tenant_b", 10, "b");
    const results = await Promise.allSettled([
      repository.createReservation(
        reservationInput("job_reserve_a", { idempotencyKey: "global_identity" })
      ),
      repository.createReservation(
        reservationInput("job_tenant_b", {
          tenantId: "tenant_b",
          projectId: "project_b",
          idempotencyKey: "global_identity",
        })
      ),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(
      results.find((result) => result.status === "rejected").reason instanceof
        IdempotencyConflictError
    );
    const count = await pool.query(
      "SELECT count(*)::integer AS count FROM public.credit_ledger WHERE idempotency_key = 'global_identity'"
    );
    assert.equal(count.rows[0].count, 1);
  });

  it("settles concurrent debit and release deliveries exactly once", async () => {
    await fund();
    const debitReservation = await reserve("job_debit");
    const debitInput = {
      tenantId: "tenant_a",
      reservationEntryId: debitReservation.ledger_entry_id,
      idempotencyKey: "debit_job_debit",
    };
    const debits = await Promise.all([
      service.finalizeDebit(debitInput),
      service.finalizeDebit(debitInput),
    ]);
    assert.equal(debits[0].ledger_entry_id, debits[1].ledger_entry_id);

    await fund("tenant_a", 10, "second_fund");
    const releaseReservation = await reserve("job_release");
    const releaseInput = {
      tenantId: "tenant_a",
      reservationEntryId: releaseReservation.ledger_entry_id,
      idempotencyKey: "release_job_release",
    };
    const releases = await Promise.all([
      service.releaseReservation(releaseInput),
      service.releaseReservation(releaseInput),
    ]);
    assert.equal(releases[0].ledger_entry_id, releases[1].ledger_entry_id);
    const entries = await repository.listLedger("tenant_a");
    assert.equal(entries.filter((entry) => entry.entry_type === "debit").length, 1);
    assert.equal(
      entries.filter((entry) => entry.entry_type === "reservation_release").length,
      1
    );
  });

  it("lets only debit or release win a concurrent settlement race", async () => {
    await fund();
    const reservation = await reserve("job_same");
    const results = await Promise.allSettled([
      service.finalizeDebit({
        tenantId: "tenant_a",
        reservationEntryId: reservation.ledger_entry_id,
        idempotencyKey: "race_debit",
      }),
      service.releaseReservation({
        tenantId: "tenant_a",
        reservationEntryId: reservation.ledger_entry_id,
        idempotencyKey: "race_release",
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(
      results.find((result) => result.status === "rejected").reason instanceof
        DuplicateFinancialEffectError
    );
    const entries = await repository.listLedger("tenant_a");
    assert.equal(
      entries.filter((entry) =>
        ["debit", "reservation_release"].includes(entry.entry_type)
      ).length,
      1
    );
  });

  it("refunds the original tenant-bound debit once under concurrency", async () => {
    await fund();
    const reservation = await reserve("job_refund");
    const debit = await service.finalizeDebit({
      tenantId: "tenant_a",
      reservationEntryId: reservation.ledger_entry_id,
      idempotencyKey: "debit_for_refund",
    });
    const input = {
      tenantId: "tenant_a",
      debitEntryId: debit.ledger_entry_id,
      idempotencyKey: "refund_job_refund",
    };
    const refunds = await Promise.all([service.refund(input), service.refund(input)]);
    assert.equal(refunds[0].ledger_entry_id, refunds[1].ledger_entry_id);
    await assert.rejects(
      service.refund({ ...input, tenantId: "tenant_b" }),
      FinancialResourceUnavailableError
    );
    assert.equal(
      (await repository.listLedger("tenant_a")).filter(
        (entry) => entry.entry_type === "refund"
      ).length,
      1
    );
  });

  it("grants one monthly effect under concurrency and replay", async () => {
    const input = {
      tenantId: "tenant_a",
      idempotencyKey: "monthly_entitlement_a_2026_08",
      stripeEventReference: "in_test_monthly_event",
    };
    const [first, second] = await Promise.all([
      service.grantMonthlyCredits(input),
      service.grantMonthlyCredits(input),
    ]);
    const replay = await service.grantMonthlyCredits(input);
    assert.equal(first.ledger_entry_id, second.ledger_entry_id);
    assert.equal(first.ledger_entry_id, replay.ledger_entry_id);
    assert.equal((await service.readBalance({ tenantId: "tenant_a" })).ledger_balance, 10);
  });

  it("rolls back an inserted entry when failure occurs before COMMIT", async () => {
    const failing = new FailBeforeCommitRepository({
      pool,
      now: () => new Date(NOW),
    });
    const failingService = new BillingService({ repository: failing, now: () => new Date(NOW) });
    failing.failNext = true;
    const input = {
      tenantId: "tenant_a",
      amount: 10,
      direction: "credit",
      transactionCorrelationId: "rollback_fund",
      idempotencyKey: "rollback_fund",
    };
    await assert.rejects(failingService.adjustCredits(input), BillingPersistenceError);
    assert.equal((await failing.listLedger("tenant_a")).length, 0);
    await failingService.adjustCredits(input);
    assert.equal((await failing.listLedger("tenant_a")).length, 1);
  });

  it("recovers every committed-but-unacknowledged financial effect", async () => {
    const lostAck = new FailAfterCommitRepository({
      pool,
      now: () => new Date(NOW),
    });
    const lostAckService = new BillingService({ repository: lostAck, now: () => new Date(NOW) });
    await fund("tenant_a", 100, "lost_ack_fund");

    lostAck.failNext = true;
    await assert.rejects(
      lostAck.createReservation(reservationInput("job_same")),
      BillingPersistenceError
    );
    const reservation = await lostAck.createReservation(reservationInput("job_same"));

    lostAck.failNext = true;
    await assert.rejects(
      lostAckService.finalizeDebit({
        tenantId: "tenant_a",
        reservationEntryId: reservation.ledger_entry_id,
        idempotencyKey: "lost_ack_debit",
      }),
      BillingPersistenceError
    );
    const debit = await lostAckService.finalizeDebit({
      tenantId: "tenant_a",
      reservationEntryId: reservation.ledger_entry_id,
      idempotencyKey: "lost_ack_debit",
    });

    const releaseReservation = await lostAck.createReservation(
      reservationInput("job_release")
    );
    lostAck.failNext = true;
    await assert.rejects(
      lostAckService.releaseReservation({
        tenantId: "tenant_a",
        reservationEntryId: releaseReservation.ledger_entry_id,
        idempotencyKey: "lost_ack_release",
      }),
      BillingPersistenceError
    );
    await lostAckService.releaseReservation({
      tenantId: "tenant_a",
      reservationEntryId: releaseReservation.ledger_entry_id,
      idempotencyKey: "lost_ack_release",
    });

    lostAck.failNext = true;
    await assert.rejects(
      lostAckService.refund({
        tenantId: "tenant_a",
        debitEntryId: debit.ledger_entry_id,
        idempotencyKey: "lost_ack_refund",
      }),
      BillingPersistenceError
    );
    await lostAckService.refund({
      tenantId: "tenant_a",
      debitEntryId: debit.ledger_entry_id,
      idempotencyKey: "lost_ack_refund",
    });

    lostAck.failNext = true;
    const monthlyInput = {
      tenantId: "tenant_a",
      idempotencyKey: "lost_ack_monthly",
      stripeEventReference: "lost_ack_invoice",
    };
    await assert.rejects(
      lostAckService.grantMonthlyCredits(monthlyInput),
      BillingPersistenceError
    );
    await lostAckService.grantMonthlyCredits(monthlyInput);

    const entries = await lostAck.listLedger("tenant_a");
    for (const type of [
      "debit",
      "reservation_release",
      "refund",
      "monthly_grant",
    ]) {
      assert.equal(entries.filter((entry) => entry.entry_type === type).length, 1);
    }
  });

  it("does not rerun provider execution when a committed debit acknowledgement is lost", async () => {
    const lostAck = new FailAfterCommitRepository({
      pool,
      now: () => new Date(NOW),
    });
    const billingService = new BillingService({ repository: lostAck, now: () => new Date(NOW) });
    const orchestrator = new GenerationBillingOrchestrator({
      billingService,
      logger: { error() {} },
    });
    await fund();
    let providerCalls = 0;
    const input = {
      job: jobObject("job_text"),
      expectedExecutionClass: "text.standard",
      operation: async () => {
        providerCalls += 1;
        lostAck.failNext = true;
        return { text: "durable result" };
      },
    };
    await assert.rejects(orchestrator.execute(input), GenerationBillingUnavailableError);
    const result = await orchestrator.execute(input);
    assert.deepEqual(result, { text: "durable result" });
    assert.equal(providerCalls, 1);
    assert.equal(
      (await lostAck.listLedger("tenant_a")).filter(
        (entry) => entry.entry_type === "debit"
      ).length,
      1
    );
  });

  it("survives repository reconstruction and prevents cross-tenant settlement", async () => {
    await fund("tenant_a", 10, "durable_a");
    await fund("tenant_b", 10, "durable_b");
    const reservation = await reserve("job_debit");
    await assert.rejects(
      service.finalizeDebit({
        tenantId: "tenant_b",
        reservationEntryId: reservation.ledger_entry_id,
        idempotencyKey: "cross_tenant_debit",
      }),
      FinancialResourceUnavailableError
    );
    await assert.rejects(
      reserve("job_reserve_b", { projectId: "project_b" }),
      FinancialResourceUnavailableError
    );
    const reconstructed = new PostgresBillingRepository({
      pool,
      now: () => new Date(NOW),
    });
    assert.equal((await reconstructed.readBalance("tenant_a")).reserved_balance, 6);
    assert.equal((await reconstructed.readBalance("tenant_b")).available_balance, 10);
  });

  it("rejects authoritative ledger mutation by customer-facing database roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        await assert.rejects(
          client.query(`
            INSERT INTO public.credit_ledger
              (ledger_entry_id, account_id, tenant_id, entry_type, amount,
               balance_delta, reserved_delta, idempotency_key, intent_hash,
               transaction_correlation_id, occurred_at)
            VALUES
              ('unauthorized_entry', 'account_a', 'tenant_a',
               'admin_adjustment', 1, 1, 0, 'unauthorized_key',
               repeat('a', 64), 'unauthorized', now())
          `),
          (error) => error.code === "42501"
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
  });

  it("persists tenant/project media authority and denies cross-boundary lookup", async () => {
    const media = new PostgresMediaAssetRepository({ pool });
    await media.initialize();
    const assetId = "33333333-3333-4333-8333-333333333333";
    await media.create({
      asset_id: assetId,
      tenant_id: "tenant_a",
      project_id: "project_a",
      generation_job_id: "job_image",
      generation_id: "generation_image_001",
      source_kind: "generated",
      media_kind: "image",
      storage_bucket: "bizgenie-staging-media",
      storage_key: objectKey({
        tenantId: "tenant_a",
        projectId: "project_a",
        mediaKind: "image",
        assetId,
        extension: "png",
      }),
      mime_type: "image/png",
      width: 1024,
      height: 1024,
      byte_size: 1024,
      allowed_uses: ["image.generate.reference"],
      status: "active",
      created_at: NOW,
    });
    assert.ok(await media.findAuthorizedReference({
      assetId,
      tenantId: "tenant_a",
      projectId: "project_a",
      requiredRight: "image.generate.reference",
    }));
    assert.equal(await media.findAuthorizedReference({
      assetId,
      tenantId: "tenant_b",
      projectId: "project_b",
      requiredRight: "image.generate.reference",
    }), null);
  });

  it("reports old unfinished reservations without mutating them", async () => {
    await fund();
    const reservation = await reserve("job_old");
    const report = await repository.reconcile({
      olderThan: "2026-08-24T00:00:00.000Z",
      limit: 20,
    });
    assert.ok(
      report.stale_reservations.some(
        (entry) => entry.ledger_entry_id === reservation.ledger_entry_id
      )
    );
    assert.deepEqual(report.invalid_settlements, []);
    assert.deepEqual(report.orphan_refunds, []);
    assert.deepEqual(report.duplicate_effects, []);
    assert.equal(
      (await repository.listLedger("tenant_a")).filter(
        (entry) => entry.entry_type === "reservation"
      ).length,
      1
    );
  });

  it("preserves Text, Image, and Video accounting through the durable adapter", async () => {
    await fund();
    const orchestrator = new GenerationBillingOrchestrator({
      billingService: service,
      logger: { error() {} },
    });
    await orchestrator.execute({
      job: jobObject("job_text"),
      expectedExecutionClass: "text.standard",
      operation: async () => "text",
    });
    await orchestrator.execute({
      job: jobObject("job_image"),
      expectedExecutionClass: "image.normal",
      operation: async () => "image",
    });
    await orchestrator.beginExecution({
      job: jobObject("job_video"),
      expectedExecutionClass: "video.normal",
      operation: async () => "video",
    });
    await orchestrator.settleSuccessfulExecution({ job: jobObject("job_video") });
    const entries = await repository.listLedger("tenant_a");
    assert.deepEqual(
      entries
        .filter((entry) => entry.entry_type === "debit")
        .map((entry) => entry.amount)
        .sort((left, right) => left - right),
      [1, 2, 6]
    );
    assert.equal((await service.readBalance({ tenantId: "tenant_a" })).available_balance, 1);
  });
});

