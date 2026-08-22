const { z } = require("zod");
const { DuplicateFinancialEffectError, IdempotencyConflictError } = require("../errors");
const { hashIntent } = require("../repository");
const { identifier } = require("../schema");
const { STRIPE_API_VERSION } = require("./config");
const {
  StripeBillingConflictError,
  StripeBillingResourceUnavailableError,
  StripeBillingStateError,
  StripeBillingValidationError,
  StripeEnvironmentMismatchError,
  StripeSignatureVerificationError,
} = require("./errors");

const STRIPE_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

const ALLOWED_STRIPE_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

const CheckoutRequestSchema = z.object({
  plan_code: z.enum(["standard", "pro"]),
  request_id: identifier,
}).strict();

function toTimestamp(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new StripeBillingStateError();
  return new Date(value * 1000).toISOString();
}

function stripeId(value) {
  const id = typeof value === "string" ? value : value?.id;
  try {
    return identifier.parse(id);
  } catch {
    throw new StripeBillingStateError();
  }
}

function mapStripeStatus(status, { cancelScheduled = false, deleted = false } = {}) {
  if (!STRIPE_SUBSCRIPTION_STATUSES.has(status)) throw new StripeBillingStateError();
  if (deleted || status === "canceled") return "cancelled";
  if (cancelScheduled && ["trialing", "active"].includes(status)) return "cancel_pending";
  return {
    trialing: "active",
    active: "active",
    past_due: "grace",
    unpaid: "inactive",
    incomplete: "inactive",
    incomplete_expired: "inactive",
    paused: "inactive",
  }[status];
}

function subscriptionPeriod(subscription) {
  const items = subscription?.items?.data;
  if (!Array.isArray(items) || items.length !== 1) throw new StripeBillingStateError();
  const item = items[0];
  return {
    item,
    start: toTimestamp(item.current_period_start),
    end: toTimestamp(item.current_period_end),
  };
}

function subscriptionPriceId(subscription) {
  const { item } = subscriptionPeriod(subscription);
  return stripeId(item.price);
}

function subscriptionIdFromInvoice(invoice) {
  if (invoice?.parent?.type !== "subscription_details") {
    throw new StripeBillingStateError();
  }
  return stripeId(invoice.parent.subscription_details?.subscription);
}

class StripeSubscriptionService {
  constructor({ stripe, repository, billingService, config, now = () => new Date() }) {
    if (!stripe || !repository || !billingService || !config) {
      throw new TypeError("Stripe, billing repository, billing service, and config are required");
    }
    this.stripe = stripe;
    this.repository = repository;
    this.billingService = billingService;
    this.config = config;
    this.now = now;
  }

  timestamp() {
    return this.now().toISOString();
  }

  liveMode() {
    return this.config.mode === "live";
  }

  parseCheckoutRequest(value) {
    const result = CheckoutRequestSchema.safeParse(value);
    if (!result.success) throw new StripeBillingValidationError();
    return result.data;
  }

  planByCode(planCode) {
    const plan = this.config.plans[planCode];
    if (!plan) throw new StripeBillingResourceUnavailableError();
    return { planCode, ...plan };
  }

  planByPrice(priceId) {
    const match = Object.entries(this.config.plans).find(
      ([, value]) => value.priceId === priceId
    );
    if (!match) throw new StripeBillingResourceUnavailableError();
    return { planCode: match[0], ...match[1] };
  }

  async requirePolicy(plan) {
    const policy = await this.repository.getCommercialPolicy(plan.policyId, this.timestamp());
    if (!policy || policy.plan_code !== plan.planCode) {
      throw new StripeBillingResourceUnavailableError();
    }
    return policy;
  }

  async customerForTenant(tenantId) {
    const tenant_id = identifier.parse(tenantId);
    const existing = await this.repository.getStripeCustomerByTenant(tenant_id);
    if (existing) {
      if (existing.livemode !== this.liveMode()) throw new StripeBillingConflictError();
      return existing;
    }
    const customer = await this.stripe.customers.create(
      { metadata: { bizgenie_tenant_id: tenant_id } },
      { idempotencyKey: `bizgenie:customer:${this.config.mode}:${tenant_id}` }
    );
    return this.repository.createStripeCustomerMapping({
      tenant_id,
      stripe_customer_id: stripeId(customer),
      livemode: this.liveMode(),
    });
  }

  async createCheckoutSession({ tenantAuthorization, request }) {
    const tenantId = tenantAuthorization?.tenant_id;
    if (!tenantId) throw new StripeBillingResourceUnavailableError();
    const tenant_id = identifier.parse(tenantId);
    const input = this.parseCheckoutRequest(request);
    const plan = this.planByCode(input.plan_code);
    await this.requirePolicy(plan);
    const customer = await this.customerForTenant(tenant_id);
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customer.stripe_customer_id,
        client_reference_id: tenant_id,
        line_items: [{ price: plan.priceId, quantity: 1 }],
        success_url: this.config.successUrl,
        cancel_url: this.config.cancelUrl,
        metadata: {
          bizgenie_tenant_id: tenant_id,
          bizgenie_plan_code: plan.planCode,
        },
        subscription_data: {
          billing_mode: { type: "flexible" },
          metadata: {
            bizgenie_tenant_id: tenant_id,
            bizgenie_plan_code: plan.planCode,
          },
        },
      },
      {
        idempotencyKey: `bizgenie:checkout:${tenant_id}:${plan.planCode}:${input.request_id}`,
      }
    );
    return Object.freeze({
      checkout_session_id: stripeId(session),
      url: z.string().url().parse(session.url),
    });
  }

  verifyWebhook(rawBody, signature) {
    if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !signature) {
      throw new StripeSignatureVerificationError();
    }
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.webhookSecret
      );
    } catch {
      throw new StripeSignatureVerificationError();
    }
  }

  async retrieveCurrentSubscription(deliveredSubscription) {
    const subscriptionId = stripeId(deliveredSubscription);
    const deliveredCustomerId = stripeId(deliveredSubscription.customer);
    let current;
    try {
      current = await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch {
      throw new StripeBillingResourceUnavailableError();
    }
    if (
      stripeId(current) !== subscriptionId ||
      stripeId(current.customer) !== deliveredCustomerId
    ) {
      throw new StripeBillingConflictError();
    }
    return current;
  }

  async processSubscription(subscription, event, { deleted = false } = {}) {
    const subscriptionId = stripeId(subscription);
    const customerId = stripeId(subscription.customer);
    const customer = await this.repository.getStripeCustomerById(customerId);
    if (!customer || customer.livemode !== this.liveMode()) {
      throw new StripeBillingResourceUnavailableError();
    }
    const period = subscriptionPeriod(subscription);
    const priceId = subscriptionPriceId(subscription);
    const plan = this.planByPrice(priceId);
    const policy = await this.requirePolicy(plan);
    const cancelScheduled = Boolean(subscription.cancel_at_period_end || subscription.cancel_at);
    const entitlementStatus = mapStripeStatus(subscription.status, {
      cancelScheduled,
      deleted,
    });
    const eventCreated = toTimestamp(event.created);
    const cancellationTimestamp = Number.isSafeInteger(subscription.cancel_at)
      ? toTimestamp(subscription.cancel_at)
      : subscription.cancel_at_period_end
        ? period.end
        : null;
    let endedAt = deleted || subscription.status === "canceled"
      ? toTimestamp(subscription.ended_at || subscription.canceled_at || event.created)
      : null;
    const startsAt = toTimestamp(subscription.start_date || subscription.created || period.item.current_period_start);
    if (endedAt && Date.parse(endedAt) <= Date.parse(startsAt)) {
      endedAt = new Date(Date.parse(startsAt) + 1000).toISOString();
    }
    const graceEndsAt = entitlementStatus === "grace"
      ? new Date(Date.parse(eventCreated) + this.config.pastDueGraceDays * 86400000).toISOString()
      : null;

    return this.repository.applyStripeSubscriptionState({
      tenant_id: customer.tenant_id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      stripe_status: subscription.status,
      entitlement_status: entitlementStatus,
      policy_id: policy.policy_id,
      plan_code: policy.plan_code,
      included_monthly_credit_grant: policy.included_monthly_credits,
      starts_at: startsAt,
      ends_at: endedAt,
      reference_period_start: period.start,
      reference_period_end: period.end,
      cancellation_effective_at: cancellationTimestamp,
      grace_ends_at: graceEndsAt,
      livemode: event.livemode,
      event_created: eventCreated,
      event_id: event.id,
    });
  }

  async processInvoice(event) {
    const invoice = event.data.object;
    const subscriptionId = subscriptionIdFromInvoice(invoice);
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    if (stripeId(invoice.customer) !== stripeId(subscription.customer)) {
      throw new StripeBillingConflictError();
    }
    const lifecycle = await this.processSubscription(subscription, event);
    if (event.type !== "invoice.paid") return { lifecycle, grant: null };
    if (invoice.paid !== true || invoice.status !== "paid") {
      throw new StripeBillingStateError();
    }
    if (!["subscription_create", "subscription_cycle"].includes(invoice.billing_reason)) {
      return { lifecycle, grant: null };
    }
    const period = subscriptionPeriod(subscription);
    try {
      const grant = await this.billingService.grantMonthlyCredits({
        tenantId: lifecycle.entitlement.tenant_id,
        idempotencyKey: `monthly:${subscriptionId}:${period.item.current_period_start}`,
        stripeEventReference: stripeId(invoice),
      });
      return { lifecycle, grant };
    } catch (error) {
      if (error instanceof DuplicateFinancialEffectError) {
        return { lifecycle, grant: null, duplicateGrant: true };
      }
      if (error instanceof IdempotencyConflictError) throw error;
      throw error;
    }
  }

  async processVerifiedEvent(event) {
    if (Boolean(event.livemode) !== this.liveMode()) {
      throw new StripeEnvironmentMismatchError();
    }
    if (event.api_version && event.api_version !== STRIPE_API_VERSION) {
      throw new StripeBillingStateError();
    }
    if (!ALLOWED_STRIPE_EVENTS.has(event.type)) {
      return Object.freeze({ handled: false, replay: false });
    }
    const eventId = stripeId(event);
    const eventHash = hashIntent({
      type: event.type,
      livemode: event.livemode,
      created: event.created,
      data: event.data,
    });
    const claim = await this.repository.beginStripeEvent({
      event_id: eventId,
      event_type: event.type,
      livemode: event.livemode,
      intent_hash: eventHash,
      received_at: this.timestamp(),
    });
    if (claim.replay) {
      return Object.freeze({ ...claim.result, replay: true });
    }

    try {
      let effect;
      if (event.type.startsWith("customer.subscription.")) {
        const deleted = event.type === "customer.subscription.deleted";
        const subscription = deleted
          ? event.data.object
          : await this.retrieveCurrentSubscription(event.data.object);
        effect = await this.processSubscription(subscription, event, { deleted });
      } else {
        effect = await this.processInvoice(event);
      }
      const result = Object.freeze({
        handled: true,
        replay: false,
        event_id: eventId,
        event_type: event.type,
        stale: Boolean(effect?.stale || effect?.lifecycle?.stale),
        monthly_grant_applied: Boolean(effect?.grant),
        monthly_grant_duplicate: Boolean(effect?.duplicateGrant),
      });
      await this.repository.completeStripeEvent({ event_id: eventId, result });
      return result;
    } catch (error) {
      await this.repository.abandonStripeEvent(eventId);
      throw error;
    }
  }

  async handleWebhook({ rawBody, signature }) {
    return this.processVerifiedEvent(this.verifyWebhook(rawBody, signature));
  }
}

module.exports = {
  ALLOWED_STRIPE_EVENTS,
  CheckoutRequestSchema,
  STRIPE_SUBSCRIPTION_STATUSES,
  StripeSubscriptionService,
  mapStripeStatus,
  subscriptionIdFromInvoice,
  subscriptionPeriod,
};
