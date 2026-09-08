const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const {
  CampaignPersistenceError,
  CampaignResourceError,
  CampaignTransitionError,
  CampaignValidationError,
} = require("./errors");
const { hashIntent, identifier, previewReceipt, uuid } = require("./schema");

const clone = (value) => structuredClone(value);
const iso = (value) => new Date(value).toISOString();

const DEFAULT_PROFILES = Object.freeze([
  { profile_id: "instagram.feed.text", platform: "instagram", placement: "feed", format: "text" },
  { profile_id: "instagram.feed.image", platform: "instagram", placement: "feed", format: "image" },
  { profile_id: "facebook.feed.text", platform: "facebook", placement: "feed", format: "text" },
  { profile_id: "linkedin.feed.text", platform: "linkedin", placement: "feed", format: "text" },
  { profile_id: "tiktok.feed.video", platform: "tiktok", placement: "feed", format: "video" },
  { profile_id: "youtube.shorts.video", platform: "youtube", placement: "shorts", format: "video" },
  { profile_id: "email.message.text", platform: "email", placement: "message", format: "text" },
].map((profile) => ({
  ...profile,
  profile_version: 1,
  renderer_version: "bizgenie-preview-renderer.v1",
  status: "active",
})));

function profileHash(profile) {
  return hashIntent({
    profile_id: profile.profile_id,
    profile_version: profile.profile_version,
    platform: profile.platform,
    placement: profile.placement,
    format: profile.format,
    renderer_version: profile.renderer_version,
  });
}

function findVariant(campaign, variantId) {
  for (const item of campaign.items.values()) {
    const variant = item.variants.get(variantId);
    if (variant) return { item, variant };
  }
  throw new CampaignResourceError();
}

function validateScope(context, campaign) {
  if (
    context.tenant_id !== campaign.tenant_id ||
    context.project_id !== campaign.project_id ||
    context.actor?.kind !== "customer"
  ) {
    throw new CampaignResourceError();
  }
}

function safeReceipt(receipt) {
  return {
    render_receipt_id: receipt.render_receipt_id,
    variant_id: receipt.variant_id,
    revision_id: receipt.revision_id,
    profile_id: receipt.profile_id,
    profile_version: receipt.profile_version,
    platform: receipt.platform,
    placement: receipt.placement,
    format: receipt.format,
    renderer_version: receipt.renderer_version,
    preview_digest: receipt.preview_digest,
    rendered_at: receipt.rendered_at,
  };
}

function parseUuid(value) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new CampaignValidationError();
  return parsed.data;
}

class InMemoryPreviewRegistry {
  constructor({ now = () => new Date(), idFactory = randomUUID, profiles = DEFAULT_PROFILES } = {}) {
    this.now = now;
    this.idFactory = idFactory;
    this.profiles = new Map();
    this.receipts = new Map();
    this.receiptKeys = new Map();
    for (const profile of profiles) this.registerProfile(profile);
  }

  registerProfile(profile) {
    const parsed = identifier.safeParse(profile.profile_id);
    if (!parsed.success) throw new CampaignPersistenceError();
    const stored = {
      ...clone(profile),
      profile_hash: profile.profile_hash || profileHash(profile),
    };
    this.profiles.set(`${stored.profile_id}:${stored.profile_version}`, stored);
  }

  activeProfile({ platform, placement, format }) {
    return [...this.profiles.values()].find(
      (profile) =>
        profile.status === "active" &&
        profile.platform === platform &&
        profile.placement === placement &&
        profile.format === format
    );
  }

  async renderPreview(context, campaign, { variant_id, revision_id, idempotency_key }) {
    validateScope(context, campaign);
    const variantId = parseUuid(variant_id);
    const revisionId = parseUuid(revision_id);
    const { item, variant } = findVariant(campaign, variantId);
    if (variant.workflow !== "review" || variant.current_revision_id !== revisionId) {
      throw new CampaignTransitionError("PREVIEW_REQUIRED");
    }
    const revision = variant.revisions.get(revisionId);
    const profile = this.activeProfile({ platform: variant.platform, placement: variant.placement, format: item.format });
    if (!profile) throw new CampaignTransitionError("PREVIEW_VERSION_UNAVAILABLE");
    const key = [
      context.tenant_id,
      context.project_id,
      context.actor.auth_user_id,
      campaign.campaign_id,
      variantId,
      revisionId,
      idempotency_key,
    ].join("\u0000");
    const existing = this.receiptKeys.get(key);
    if (existing) return safeReceipt(this.receipts.get(existing));
    const renderedAt = iso(this.now());
    const renderInput = {
      tenant_id: campaign.tenant_id,
      project_id: campaign.project_id,
      campaign_id: campaign.campaign_id,
      variant_id: variantId,
      revision_id: revisionId,
      revision_content_hash: revision.content_hash,
      profile_id: profile.profile_id,
      profile_version: profile.profile_version,
      profile_hash: profile.profile_hash,
      platform: variant.platform,
      placement: variant.placement,
      format: item.format,
      content: revision.content,
      rendered_at: renderedAt,
    };
    const receipt = {
      render_receipt_id: this.idFactory(),
      tenant_id: campaign.tenant_id,
      project_id: campaign.project_id,
      campaign_id: campaign.campaign_id,
      variant_id: variantId,
      revision_id: revisionId,
      revision_content_hash: revision.content_hash,
      profile_id: profile.profile_id,
      profile_version: profile.profile_version,
      profile_hash: profile.profile_hash,
      platform: variant.platform,
      placement: variant.placement,
      format: item.format,
      renderer_version: profile.renderer_version,
      render_input_hash: hashIntent(renderInput),
      preview_digest: hashIntent({ renderer_version: profile.renderer_version, renderInput }),
      rendered_at: renderedAt,
    };
    this.receipts.set(receipt.render_receipt_id, receipt);
    this.receiptKeys.set(key, receipt.render_receipt_id);
    return safeReceipt(receipt);
  }

  async resolvePreviewReceipt(context, payload) {
    const receipt = this.receipts.get(payload.render_receipt_id);
    if (!receipt || receipt.tenant_id !== context.tenant_id || receipt.project_id !== context.project_id) {
      return null;
    }
    return previewReceipt.parse({
      render_receipt_id: receipt.render_receipt_id,
      variant_id: receipt.variant_id,
      revision_id: receipt.revision_id,
      revision_content_hash: receipt.revision_content_hash,
      profile_id: receipt.profile_id,
      profile_version: receipt.profile_version,
      profile_hash: receipt.profile_hash,
      platform: receipt.platform,
      placement: receipt.placement,
      format: receipt.format,
      renderer_version: receipt.renderer_version,
      render_input_hash: receipt.render_input_hash,
      preview_digest: receipt.preview_digest,
      rendered_at: receipt.rendered_at,
    });
  }

  async validatePreview(_context, preview) {
    const profile = this.profiles.get(`${preview.profile_id}:${preview.profile_version}`);
    return Boolean(profile && profile.status === "active" && profile.profile_hash === preview.profile_hash);
  }
}

function createDefaultPreviewRegistry(options = {}) {
  return new InMemoryPreviewRegistry(options);
}

function databaseError(error) {
  if (
    error instanceof CampaignPersistenceError ||
    error instanceof CampaignResourceError ||
    error instanceof CampaignTransitionError ||
    error instanceof CampaignValidationError
  ) {
    return error;
  }
  return new CampaignPersistenceError();
}

class PostgresPreviewRegistry {
  constructor({ pool, now = () => new Date(), idFactory = randomUUID } = {}) {
    if (!pool || typeof pool.connect !== "function") throw new CampaignPersistenceError();
    this.pool = pool;
    this.now = now;
    this.idFactory = idFactory;
  }

  async initialize() {
    try {
      const relations = ["campaign_preview_profiles", "campaign_preview_render_receipts"];
      const result = await this.pool.query(`
        select c.relname, c.relrowsecurity,
               coalesce(has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger'), false) anon_access,
               coalesce(has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate,references,trigger'), false) authenticated_access,
               coalesce(has_table_privilege('service_role', c.oid, 'select,insert,update,delete,truncate,references,trigger'), false) service_access
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = any($1::text[])`, [relations]);
      if (result.rows.length !== relations.length || result.rows.some((row) => !row.relrowsecurity || row.anon_access || row.authenticated_access || row.service_access)) {
        throw new Error("unsafe preview registry persistence");
      }
    } catch {
      throw new CampaignPersistenceError();
    }
  }

  async activeProfile(client, { platform, placement, format }) {
    const result = await client.query(`
      select * from public.campaign_preview_profiles
       where platform = $1 and placement = $2 and format = $3 and status = 'active'
       order by profile_version desc
       limit 1`, [platform, placement, format]);
    return result.rows[0] || null;
  }

  async renderPreview(context, campaign, { variant_id, revision_id, idempotency_key }) {
    validateScope(context, campaign);
    const variantId = parseUuid(variant_id);
    const revisionId = parseUuid(revision_id);
    const { item, variant } = findVariant(campaign, variantId);
    if (variant.workflow !== "review" || variant.current_revision_id !== revisionId) {
      throw new CampaignTransitionError("PREVIEW_REQUIRED");
    }
    const revision = variant.revisions.get(revisionId);
    let client;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      const existing = await client.query(`
        select * from public.campaign_preview_render_receipts
         where tenant_id = $1 and project_id = $2 and rendered_by = $3 and campaign_id = $4
           and variant_id = $5 and revision_id = $6 and idempotency_key = $7
         limit 1`,
        [context.tenant_id, context.project_id, context.actor.auth_user_id, campaign.campaign_id, variantId, revisionId, idempotency_key]);
      if (existing.rowCount) {
        await client.query("commit");
        return safeReceipt(existing.rows[0]);
      }
      const profile = await this.activeProfile(client, {
        platform: variant.platform,
        placement: variant.placement,
        format: item.format,
      });
      if (!profile) throw new CampaignTransitionError("PREVIEW_VERSION_UNAVAILABLE");
      const renderedAt = iso(this.now());
      const renderInput = {
        tenant_id: campaign.tenant_id,
        project_id: campaign.project_id,
        campaign_id: campaign.campaign_id,
        variant_id: variantId,
        revision_id: revisionId,
        revision_content_hash: revision.content_hash,
        profile_id: profile.profile_id,
        profile_version: profile.profile_version,
        profile_hash: profile.profile_hash,
        platform: variant.platform,
        placement: variant.placement,
        format: item.format,
        content: revision.content,
        rendered_at: renderedAt,
      };
      const receipt = {
        render_receipt_id: this.idFactory(),
        tenant_id: campaign.tenant_id,
        project_id: campaign.project_id,
        brand_id: campaign.brand_id,
        campaign_id: campaign.campaign_id,
        content_item_id: item.content_item_id,
        variant_id: variantId,
        revision_id: revisionId,
        revision_content_hash: revision.content_hash,
        profile_id: profile.profile_id,
        profile_version: profile.profile_version,
        profile_hash: profile.profile_hash,
        platform: variant.platform,
        placement: variant.placement,
        format: item.format,
        renderer_version: profile.renderer_version,
        render_input_hash: hashIntent(renderInput),
        preview_digest: hashIntent({ renderer_version: profile.renderer_version, renderInput }),
        rendered_at: renderedAt,
        rendered_by: context.actor.auth_user_id,
        idempotency_key,
      };
      const columns = Object.keys(receipt);
      await client.query(
        `insert into public.campaign_preview_render_receipts (${columns.map((key) => `"${key}"`).join(",")})
         values (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
        columns.map((key) => receipt[key]),
      );
      await client.query("commit");
      return safeReceipt(receipt);
    } catch (error) {
      try { await client?.query("rollback"); } catch {}
      throw databaseError(error);
    } finally {
      client?.release();
    }
  }

  async resolvePreviewReceipt(context, payload) {
    try {
      const result = await this.pool.query(`
        select render_receipt_id, variant_id, revision_id, revision_content_hash,
               profile_id, profile_version, profile_hash, platform, placement, format,
               renderer_version, render_input_hash, preview_digest, rendered_at
          from public.campaign_preview_render_receipts
         where render_receipt_id = $1 and tenant_id = $2 and project_id = $3
         limit 1`, [payload.render_receipt_id, context.tenant_id, context.project_id]);
      if (!result.rowCount) return null;
      return previewReceipt.parse(projectionTime(result.rows[0]));
    } catch (error) {
      throw databaseError(error);
    }
  }

  async validatePreview(_context, preview) {
    try {
      const result = await this.pool.query(`
        select 1 from public.campaign_preview_profiles
         where profile_id = $1 and profile_version = $2 and profile_hash = $3 and status = 'active'
         limit 1`, [preview.profile_id, preview.profile_version, preview.profile_hash]);
      return Boolean(result.rowCount);
    } catch {
      return false;
    }
  }
}

function projectionTime(row) {
  return {
    ...row,
    rendered_at: iso(row.rendered_at),
  };
}

function createPostgresPreviewRegistryFromEnv({ env = process.env, ...options } = {}) {
  if (!env.CAMPAIGN_DATABASE_URL) throw new CampaignPersistenceError();
  return new PostgresPreviewRegistry({
    pool: new Pool({ connectionString: env.CAMPAIGN_DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }),
    ...options,
  });
}

module.exports = {
  DEFAULT_PREVIEW_PROFILES: DEFAULT_PROFILES,
  InMemoryPreviewRegistry,
  PostgresPreviewRegistry,
  createDefaultPreviewRegistry,
  createPostgresPreviewRegistryFromEnv,
  safeReceipt,
};
