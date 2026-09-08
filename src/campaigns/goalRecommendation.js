const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { z } = require("zod");
const {
  CampaignIdempotencyError,
  CampaignPersistenceError,
  CampaignValidationError,
} = require("./errors");
const { hashIntent, identifier } = require("./schema");

const clone = (value) => structuredClone(value);
const iso = (value) => new Date(value).toISOString();
const goalText = z.string().refine((value) => value.isWellFormed()).transform((value) => value.normalize("NFC").trim()).refine((value) => value.length > 0 && value.length <= 2000);
const timezone = z.string().min(1).max(255).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } });

const recommendationRequest = z.object({
  tenant_id: identifier,
  project_id: identifier,
  brand_id: identifier,
  goal: goalText,
  display_timezone: timezone.default("Europe/London"),
  idempotency_key: identifier,
}).strict();

const FORBIDDEN_RECOMMENDATION_FIELDS = Object.freeze([
  "events",
  "command_id",
  "auth_user_id",
  "profile_hash",
  "render_input_hash",
  "brand_snapshot",
  "private_positioning",
  "active_approval_id",
  "active_schedule_id",
  "pending_attempt_id",
  "publication_id",
]);

function parseRecommendationRequest(value) {
  const parsed = recommendationRequest.safeParse(value);
  if (!parsed.success) throw new CampaignValidationError();
  return parsed.data;
}

function goalKind(goal) {
  const value = goal.toLowerCase();
  if (/\b(event|opening|launch|grand opening|new)\b/.test(value)) return "launch";
  if (/\b(offer|sale|discount|deal|promo)\b/.test(value)) return "offer";
  if (/\b(book|appointment|enquiry|lead|quote)\b/.test(value)) return "lead";
  return "awareness";
}

function titleCase(value) {
  return value.split(/\s+/).filter(Boolean).slice(0, 5).map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function itemSet(kind) {
  const fallback = "because it is grounded in the goal you entered and BizGenie does not have enough performance history yet";
  if (kind === "offer") {
    return [
      { name: "Offer announcement", format: "text", platform: "instagram", placement: "feed", destination_label: "Instagram", reason: "Recommended because the goal mentions an offer and needs one clear public message first." },
      { name: "Facebook reminder", format: "text", platform: "facebook", placement: "feed", destination_label: "Facebook", reason: `Recommended ${fallback}.` },
      { name: "Customer email", format: "text", platform: "email", placement: "message", destination_label: "Email", reason: "Recommended because email gives existing customers the same offer without adding a publishing dependency." },
    ];
  }
  if (kind === "lead") {
    return [
      { name: "Enquiry post", format: "text", platform: "facebook", placement: "feed", destination_label: "Facebook", reason: "Recommended because the goal is to create enquiries and needs one simple action for customers to take." },
      { name: "LinkedIn credibility post", format: "text", platform: "linkedin", placement: "feed", destination_label: "LinkedIn", reason: "Recommended because lead goals benefit from a short trust-building post before a direct ask." },
      { name: "Follow-up email", format: "text", platform: "email", placement: "message", destination_label: "Email", reason: "Recommended because a direct email can ask for replies without any social account connection." },
    ];
  }
  if (kind === "launch") {
    return [
      { name: "Launch announcement", format: "text", platform: "instagram", placement: "feed", destination_label: "Instagram", reason: "Recommended because launch goals need one clear public announcement before supporting reminders." },
      { name: "Facebook launch post", format: "text", platform: "facebook", placement: "feed", destination_label: "Facebook", reason: `Recommended ${fallback}.` },
      { name: "Launch email", format: "text", platform: "email", placement: "message", destination_label: "Email", reason: "Recommended because email gives the launch a direct owner-controlled channel." },
    ];
  }
  return [
    { name: "Brand awareness post", format: "text", platform: "instagram", placement: "feed", destination_label: "Instagram", reason: `Recommended ${fallback}.` },
    { name: "Facebook story post", format: "text", platform: "facebook", placement: "feed", destination_label: "Facebook", reason: "Recommended because a second familiar channel helps repeat the message without asking you to choose from every platform." },
    { name: "Simple email update", format: "text", platform: "email", placement: "message", destination_label: "Email", reason: "Recommended because email keeps the campaign useful even before social connectors exist." },
  ];
}

function buildRecommendation({ context, request, now, idFactory }) {
  const kind = goalKind(request.goal);
  const generatedAt = iso(now());
  const campaignName = `${titleCase(request.goal)} Campaign`;
  const suggestedItems = itemSet(kind);
  const record = {
    recommendation_id: idFactory(),
    tenant_id: context.tenant_id,
    project_id: context.project_id,
    brand_id: request.brand_id,
    goal: request.goal,
    display_timezone: request.display_timezone,
    campaign_name: campaignName,
    recommendation_kind: kind,
    summary: "Start with one clear campaign and three reviewable items. You can edit everything before anything is scheduled or published.",
    not_enough_data_yet: true,
    explanation: "Recommended because this is the first safe campaign shape for the stated goal; BizGenie does not have enough performance history yet to claim a stronger signal.",
    next_action: { code: "create_campaign", label: "Create campaign" },
    create_campaign_payload: {
      tenant_id: context.tenant_id,
      project_id: context.project_id,
      brand_id: request.brand_id,
      name: campaignName,
      goal: request.goal,
      display_timezone: request.display_timezone,
    },
    suggested_items: suggestedItems,
    generated_at: generatedAt,
  };
  return {
    ...record,
    recommendation_hash: hashIntent({
      tenant_id: record.tenant_id,
      project_id: record.project_id,
      brand_id: record.brand_id,
      goal: record.goal,
      display_timezone: record.display_timezone,
      recommendation_kind: record.recommendation_kind,
      suggested_items: record.suggested_items,
    }),
  };
}

function safeRecommendation(record) {
  return {
    recommendation_id: record.recommendation_id,
    tenant_id: record.tenant_id,
    project_id: record.project_id,
    brand_id: record.brand_id,
    goal: record.goal,
    display_timezone: record.display_timezone,
    campaign_name: record.campaign_name,
    recommendation_kind: record.recommendation_kind,
    summary: record.summary,
    not_enough_data_yet: record.not_enough_data_yet,
    explanation: record.explanation,
    next_action: clone(record.next_action),
    create_campaign_payload: clone(record.create_campaign_payload),
    suggested_items: clone(record.suggested_items),
    generated_at: iso(record.generated_at),
  };
}

function validateScope(context, request) {
  if (context.actor?.kind !== "customer" || context.tenant_id !== request.tenant_id || context.project_id !== request.project_id) {
    throw new CampaignValidationError();
  }
}

function keyFor(context, request) {
  return [context.tenant_id, context.project_id, context.actor.auth_user_id, request.brand_id, request.idempotency_key].join("\u0000");
}

class InMemoryGoalRecommendationRegistry {
  constructor({ now = () => new Date(), idFactory = randomUUID } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.records = new Map();
    this.keys = new Map();
  }

  async recommend(context, request) {
    const parsed = parseRecommendationRequest(request);
    validateScope(context, parsed);
    const next = buildRecommendation({ context, request: parsed, now: this.now, idFactory: this.idFactory });
    const existingId = this.keys.get(keyFor(context, parsed));
    const existing = existingId ? this.records.get(existingId) : null;
    if (existing) {
      if (existing.recommendation_hash !== next.recommendation_hash) throw new CampaignIdempotencyError();
      return safeRecommendation(existing);
    }
    const stored = { ...next, requested_by: context.actor.auth_user_id, idempotency_key: parsed.idempotency_key };
    this.records.set(stored.recommendation_id, stored);
    this.keys.set(keyFor(context, parsed), stored.recommendation_id);
    return safeRecommendation(stored);
  }
}

function projectionTime(row) {
  return { ...row, generated_at: iso(row.generated_at) };
}

function parseJsonColumn(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function rowRecord(row) {
  return projectionTime({
    ...row,
    next_action: parseJsonColumn(row.next_action),
    create_campaign_payload: parseJsonColumn(row.create_campaign_payload),
    suggested_items: parseJsonColumn(row.suggested_items),
  });
}

function databaseError(error) {
  if (error instanceof CampaignIdempotencyError || error instanceof CampaignPersistenceError || error instanceof CampaignValidationError) return error;
  return new CampaignPersistenceError();
}

class PostgresGoalRecommendationRegistry {
  constructor({ pool, now = () => new Date(), idFactory = randomUUID } = {}) {
    if (!pool || typeof pool.connect !== "function") throw new CampaignPersistenceError();
    this.pool = pool;
    this.now = now;
    this.idFactory = idFactory;
  }

  async initialize() {
    try {
      const result = await this.pool.query(`
        select c.relname, c.relrowsecurity,
               coalesce(has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger'), false) anon_access,
               coalesce(has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'), false) authenticated_access,
               coalesce(has_table_privilege('service_role', c.oid, 'select,insert,update,delete,truncate,references,trigger'), false) service_access
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'campaign_goal_recommendations'`);
      if (result.rows.length !== 1 || !result.rows[0].relrowsecurity || result.rows[0].anon_access || result.rows[0].authenticated_access || result.rows[0].service_access) {
        throw new Error("unsafe goal recommendation persistence");
      }
    } catch {
      throw new CampaignPersistenceError();
    }
  }

  async recommend(context, request) {
    const parsed = parseRecommendationRequest(request);
    validateScope(context, parsed);
    const record = {
      ...buildRecommendation({ context, request: parsed, now: this.now, idFactory: this.idFactory }),
      requested_by: context.actor.auth_user_id,
      idempotency_key: parsed.idempotency_key,
    };
    const columns = Object.keys(record);
    let client;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      const result = await client.query(
        `insert into public.campaign_goal_recommendations (${columns.map((key) => `"${key}"`).join(",")})
         values (${columns.map((_, index) => `$${index + 1}`).join(",")})
         on conflict on constraint campaign_goal_recommendations_identity_unique
         do update set recommendation_id = campaign_goal_recommendations.recommendation_id
         returning *`,
        columns.map((key) => Array.isArray(record[key]) || (record[key] && typeof record[key] === "object") ? JSON.stringify(record[key]) : record[key]),
      );
      const stored = rowRecord(result.rows[0]);
      if (stored.recommendation_hash !== record.recommendation_hash) throw new CampaignIdempotencyError();
      await client.query("commit");
      return safeRecommendation(stored);
    } catch (error) {
      try { await client?.query("rollback"); } catch {}
      throw databaseError(error);
    } finally {
      client?.release();
    }
  }
}

function createDefaultGoalRecommendationRegistry(options = {}) {
  return new InMemoryGoalRecommendationRegistry(options);
}

function createPostgresGoalRecommendationRegistryFromEnv({ env = process.env, ...options } = {}) {
  if (!env.CAMPAIGN_DATABASE_URL) throw new CampaignPersistenceError();
  return new PostgresGoalRecommendationRegistry({
    pool: new Pool({ connectionString: env.CAMPAIGN_DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }),
    ...options,
  });
}

module.exports = {
  FORBIDDEN_RECOMMENDATION_FIELDS,
  InMemoryGoalRecommendationRegistry,
  PostgresGoalRecommendationRegistry,
  createDefaultGoalRecommendationRegistry,
  createPostgresGoalRecommendationRegistryFromEnv,
  parseRecommendationRequest,
  safeRecommendation,
};
