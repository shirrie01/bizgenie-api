const { randomUUID } = require("node:crypto");
const {
  CampaignIdempotencyError,
  CampaignResourceError,
  CampaignTransitionError,
  CampaignValidationError,
  CampaignVersionError,
} = require("./errors");
const { content: contentSchema, emptyContent, hashIntent, parseCommand } = require("./schema");

const clone = (value) => structuredClone(value);
const iso = (value) => new Date(value).toISOString();

class CampaignRepository {
  async executeCommand() { throw new Error("Not implemented"); }
  async getCampaign() { throw new Error("Not implemented"); }
  async listCampaigns() { throw new Error("Not implemented"); }
  async listCalendarEntries() { throw new Error("Not implemented"); }
  async listCampaignEvents() { throw new Error("Not implemented"); }
  async verifyCampaignProjection() { throw new Error("Not implemented"); }
}

function receiptKey(context, command) {
  return ["campaign-spine.v1", context.tenant_id, context.project_id,
    context.actor.auth_user_id, command.idempotency_key].join("\u0000");
}

function validateOwner(context, command) {
  if (!context || context.membership_role !== "owner" || context.policy_version !== "campaign-owner.v1" ||
      context.actor?.kind !== "customer" || context.tenant_id !== command.tenant_id ||
      context.project_id !== command.project_id) throw new CampaignResourceError();
}

function requireFields(payload, allowed, required = allowed) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CampaignValidationError();
  if (Object.keys(payload).some((key) => !allowed.includes(key)) || required.some((key) => !(key in payload))) {
    throw new CampaignValidationError();
  }
}

function contentComplete(format, value) {
  const primary = value.asset_refs.filter((asset) => asset.role === "primary").length;
  if (format === "text") return Boolean(value.body || value.caption) && primary === 0;
  return primary === 1;
}

function parseContent(value) {
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) throw new CampaignValidationError();
  return parsed.data;
}

function rollup(campaign, item) {
  const items = item ? [item] : [...campaign.items.values()].filter((candidate) => !candidate.archived_at);
  const variants = items.flatMap((candidate) => [...candidate.variants.values()]);
  const order = ["draft","review","approved","scheduled","published"];
  const counts = Object.fromEntries(order.map((state) => [state, variants.filter((variant) => variant.workflow === state).length]));
  return { status: variants.length ? order.find((state) => counts[state]) : "draft", counts };
}

function validSchedule(payload, now) {
  const instant = new Date(payload.scheduled_for);
  if (!Number.isFinite(instant.getTime()) || instant <= new Date(now) || !Number.isInteger(payload.utc_offset_minutes) || payload.utc_offset_minutes < -840 || payload.utc_offset_minutes > 840) return false;
  const shifted = new Date(instant.getTime() + payload.utc_offset_minutes * 60000).toISOString().slice(0, 23);
  if (shifted !== payload.local_datetime) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: payload.timezone, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",fractionalSecondDigits:3 }).formatToParts(instant);
    const part = (type) => parts.find((candidate) => candidate.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}.${part("fractionalSecond")}` === payload.local_datetime;
  } catch { return false; }
}

function validPublicationUrl(value) {
  if (value == null) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
}

class InMemoryCampaignRepository extends CampaignRepository {
  constructor({
    now = () => new Date(), idFactory = randomUUID,
    authorize = async () => true,
    captureBrandSnapshot,
    resolvePreviewReceipt,
    fault = async () => {},
  } = {}) {
    super();
    this.now = now;
    this.idFactory = idFactory;
    this.authorize = authorize;
    this.captureBrandSnapshot = captureBrandSnapshot;
    this.resolvePreviewReceipt = resolvePreviewReceipt;
    this.fault = fault;
    this.state = { campaigns: new Map(), receipts: new Map() };
    this.locks = new Map();
  }

  async _authorized(context, command) {
    validateOwner(context, command);
    if (!(await this.authorize(clone(context)))) throw new CampaignResourceError();
  }

  async executeCommand(context, input, requestId = this.idFactory()) {
    const candidate = parseCommand(input);
    const lockKey = candidate.campaign_id || receiptKey(context, candidate);
    const previous = this.locks.get(lockKey) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const chain = previous.then(() => current);
    this.locks.set(lockKey, chain);
    await previous;
    try { return await this._executeCommand(context, candidate, requestId); }
    finally { release(); if (this.locks.get(lockKey) === chain) this.locks.delete(lockKey); }
  }

  async _executeCommand(context, input, requestId) {
    const command = parseCommand(input);
    await this._authorized(context, command);
    const key = receiptKey(context, command);
    const intentHash = hashIntent({ ...command, actor: context.actor });
    const existing = this.state.receipts.get(key);
    if (existing) {
      if (existing.intent_hash !== intentHash) throw new CampaignIdempotencyError();
      await this._authorized(context, command);
      return clone(existing.result);
    }

    const draft = clone(this.state);
    const tx = new CampaignTransaction({ repository: this, state: draft, context, command, requestId });
    await tx.apply();
    await this.fault("before_receipt", clone(draft));
    const result = tx.result();
    draft.receipts.set(key, { intent_hash: intentHash, result: clone(result) });
    await this.fault("before_commit", clone(draft));
    this.state = draft;
    await this.fault("after_commit", clone(draft));
    return clone(result);
  }

  async getCampaign(context, campaignId) {
    const campaign = this.state.campaigns.get(campaignId);
    if (!campaign || campaign.tenant_id !== context.tenant_id || campaign.project_id !== context.project_id ||
        !(await this.authorize(clone(context)))) throw new CampaignResourceError();
    const result = clone(campaign);
    Object.assign(result, rollup(result));
    for (const item of result.items.values()) Object.assign(item, rollup(result, item));
    return result;
  }

  async listCampaigns(context) {
    if (!(await this.authorize(clone(context)))) throw new CampaignResourceError();
    return [...this.state.campaigns.values()]
      .filter((row) => row.tenant_id === context.tenant_id && row.project_id === context.project_id && !row.archived_at)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.campaign_id.localeCompare(b.campaign_id))
      .map(clone);
  }

  async listCalendarEntries(context, { from, to }) {
    const campaigns = await this.listCampaigns(context);
    const entries = [];
    for (const campaign of campaigns) for (const item of campaign.items.values()) {
      if (item.archived_at) continue;
      for (const variant of item.variants.values()) {
        const publication = variant.publication_id && campaign.publications.get(variant.publication_id);
        const schedule = variant.active_schedule_id && campaign.schedules.get(variant.active_schedule_id);
        const instant = publication?.published_at || schedule?.scheduled_for;
        if (instant && instant >= iso(from) && instant < iso(to)) entries.push({ campaign_id: campaign.campaign_id, content_item_id: item.content_item_id, variant_id: variant.variant_id, workflow: variant.workflow, occurrence_at: instant });
      }
    }
    return entries.sort((a, b) => a.occurrence_at.localeCompare(b.occurrence_at) || a.variant_id.localeCompare(b.variant_id));
  }

  async listCampaignEvents(context, campaignId) {
    return clone((await this.getCampaign(context, campaignId)).events);
  }

  async verifyCampaignProjection(context, campaignId) {
    const campaign = await this.getCampaign(context, campaignId);
    const sequences = campaign.events.map((event) => event.sequence);
    return { valid: sequences.every((value, index) => value === index + 1) && campaign.last_event_sequence === sequences.length && campaign.version === new Set(campaign.events.map((event) => event.campaign_version)).size, campaign_version: campaign.version, last_event_sequence: campaign.last_event_sequence };
  }
}

class CampaignTransaction {
  constructor({ repository, state, context, command, requestId }) {
    Object.assign(this, { repository, state, context, command, requestId });
    this.now = iso(repository.now());
    this.created = {};
    this.events = [];
  }
  id(type) { const id = this.repository.idFactory(); (this.created[type] ||= []).push(id); return id; }
  campaign() {
    const row = this.state.campaigns.get(this.command.campaign_id);
    if (!row || row.tenant_id !== this.context.tenant_id || row.project_id !== this.context.project_id) throw new CampaignResourceError();
    if (row.version !== this.command.expected_campaign_version) throw new CampaignVersionError();
    return row;
  }
  item(campaign, id) { const row = campaign.items.get(id); if (!row) throw new CampaignResourceError(); return row; }
  variant(campaign, id) {
    for (const item of campaign.items.values()) if (item.variants.has(id)) return [item, item.variants.get(id)];
    throw new CampaignResourceError();
  }
  event(type, payload) { this.events.push({ event_type: type, payload: clone(payload) }); }
  ensureWritable(campaign, item, variant) {
    if (campaign.archived_at || item?.archived_at) throw new CampaignTransitionError("CAMPAIGN_ARCHIVED");
    if (variant?.pending_attempt_id) throw new CampaignTransitionError("MANUAL_ATTEMPT_PENDING");
  }
  async apply() {
    if (this.command.command_type === "create_campaign") return this.createCampaign();
    const campaign = this.campaign();
    const handler = this[this.command.command_type.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())];
    if (typeof handler !== "function") throw new CampaignValidationError();
    await handler.call(this, campaign);
    campaign.version += 1;
    campaign.updated_at = this.now;
    this.appendEvents(campaign);
  }
  appendEvents(campaign) {
    const commandId = this.id("command_ids");
    const first = campaign.last_event_sequence + 1;
    this.events.forEach((event, index) => campaign.events.push({
      event_id: this.id("event_ids"), contract_version: "campaign-spine.v1", payload_version: 1,
      event_type: event.event_type, payload: event.payload, tenant_id: campaign.tenant_id,
      project_id: campaign.project_id, brand_id: campaign.brand_id, campaign_id: campaign.campaign_id,
      sequence: first + index, campaign_version: campaign.version, command_id: commandId,
      command_event_index: index + 1, request_id: this.requestId, actor: clone(this.context.actor),
      authorization_context: { policy_version: this.context.policy_version, membership_role: "owner", action: "project:write", tenant_id: campaign.tenant_id, project_id: campaign.project_id, brand_id: campaign.brand_id }, recorded_at: this.now,
    }));
    campaign.last_event_sequence += this.events.length;
    this.commandId = commandId;
    this.firstSequence = first;
    this.lastSequence = campaign.last_event_sequence;
    this.campaignId = campaign.campaign_id;
    this.campaignVersion = campaign.version;
  }
  async createCampaign() {
    requireFields(this.command.payload, ["brand_id","name","goal","display_timezone"]);
    if (this.command.expected_campaign_version !== 0 || !this.repository.captureBrandSnapshot) throw new CampaignValidationError();
    const snapshot = await this.repository.captureBrandSnapshot(clone(this.context), this.command.payload.brand_id);
    if (!snapshot) throw new CampaignTransitionError("BRAND_CONTEXT_UNAVAILABLE");
    const campaignId = this.id("campaign_ids");
    const campaign = { campaign_id: campaignId, tenant_id: this.context.tenant_id, project_id: this.context.project_id, brand_id: this.command.payload.brand_id, name: this.command.payload.name, goal: this.command.payload.goal, display_timezone: this.command.payload.display_timezone, initial_brand_snapshot_id: snapshot.brand_snapshot_id, brand_snapshots: new Map([[snapshot.brand_snapshot_id, clone(snapshot)]]), version: 1, last_event_sequence: 0, archived_at: null, created_at: this.now, updated_at: this.now, created_by: clone(this.context.actor), items: new Map(), approvals: new Map(), previews: new Map(), schedules: new Map(), attempts: new Map(), resolutions: new Map(), publications: new Map(), corrections: new Map(), events: [] };
    this.state.campaigns.set(campaignId, campaign);
    this.event("campaign.created", { campaign_id: campaignId, brand_snapshot_id: snapshot.brand_snapshot_id });
    this.appendEvents(campaign);
  }
  createContentItem(campaign) {
    requireFields(this.command.payload, ["name","format","platform","placement","destination_label","destination_key","initial_content"], ["name","format","platform","placement","destination_label"]);
    this.ensureWritable(campaign);
    if (campaign.items.size >= 500) throw new CampaignTransitionError("CAMPAIGN_LIMIT_REACHED");
    const itemId = this.id("content_item_ids"), variantId = this.id("variant_ids"), revisionId = this.id("revision_ids");
    const content = parseContent(this.command.payload.initial_content || emptyContent());
    const destinationKey = this.command.payload.destination_key || this.repository.idFactory();
    for (const existing of campaign.items.values()) for (const candidate of existing.variants.values()) if (candidate.destination_key === destinationKey && (candidate.platform !== this.command.payload.platform || candidate.destination_label !== this.command.payload.destination_label)) throw new CampaignResourceError();
    const revision = this.makeRevision(campaign, itemId, variantId, revisionId, 1, null, content, campaign.initial_brand_snapshot_id, "Initial draft");
    const variant = { variant_id: variantId, platform: this.command.payload.platform, placement: this.command.payload.placement, destination_key: destinationKey, destination_label: this.command.payload.destination_label, workflow: "draft", current_revision_id: revisionId, active_approval_id: null, active_schedule_id: null, pending_attempt_id: null, publication_id: null, created_at: this.now, updated_at: this.now, revisions: new Map([[revisionId, revision]]) };
    const item = { content_item_id: itemId, name: this.command.payload.name, format: this.command.payload.format, archived_at: null, created_at: this.now, updated_at: this.now, created_by: clone(this.context.actor), variants: new Map([[variantId, variant]]) };
    campaign.items.set(itemId, item);
    this.event("content_item.created", { content_item_id: itemId, name: item.name, format: item.format });
    this.event("variant.created", { content_item_id: itemId, variant_id: variantId, platform: variant.platform, placement: variant.placement, destination_key: destinationKey, destination_label: variant.destination_label });
    this.event("revision.created", { record: clone(revision) });
  }
  addVariant(campaign) {
    requireFields(this.command.payload, ["content_item_id","platform","placement","destination_label","destination_key","initial_content"], ["content_item_id","platform","placement","destination_label"]);
    const item = this.item(campaign, this.command.payload.content_item_id); this.ensureWritable(campaign, item);
    if (item.variants.size >= 20) throw new CampaignTransitionError("CAMPAIGN_LIMIT_REACHED");
    const destinationKey = this.command.payload.destination_key || this.repository.idFactory();
    if ([...item.variants.values()].some((v) => v.platform === this.command.payload.platform && v.placement === this.command.payload.placement && v.destination_key === destinationKey)) throw new CampaignTransitionError("VARIANT_ALREADY_EXISTS");
    const variantId = this.id("variant_ids"), revisionId = this.id("revision_ids");
    const revision = this.makeRevision(campaign, item.content_item_id, variantId, revisionId, 1, null, parseContent(this.command.payload.initial_content || emptyContent()), campaign.initial_brand_snapshot_id, "Initial draft");
    const variant = { variant_id: variantId, platform: this.command.payload.platform, placement: this.command.payload.placement, destination_key: destinationKey, destination_label: this.command.payload.destination_label, workflow: "draft", current_revision_id: revisionId, active_approval_id: null, active_schedule_id: null, pending_attempt_id: null, publication_id: null, created_at: this.now, updated_at: this.now, revisions: new Map([[revisionId, revision]]) };
    item.variants.set(variantId, variant); item.updated_at = this.now;
    this.event("variant.created", { content_item_id: item.content_item_id, variant_id: variantId, platform: variant.platform, placement: variant.placement, destination_key: destinationKey, destination_label: variant.destination_label });
    this.event("revision.created", { record: clone(revision) });
  }
  updateCampaignDetails(campaign) {
    requireFields(this.command.payload, ["name","display_timezone"]);
    this.ensureWritable(campaign);
    campaign.name = this.command.payload.name;
    campaign.display_timezone = this.command.payload.display_timezone;
    this.event("campaign.details_updated", { name: campaign.name, display_timezone: campaign.display_timezone });
  }
  renameContentItem(campaign) {
    requireFields(this.command.payload, ["content_item_id","name"]);
    const item = this.item(campaign, this.command.payload.content_item_id); this.ensureWritable(campaign, item);
    item.name = this.command.payload.name; item.updated_at = this.now;
    this.event("content_item.renamed", { content_item_id: item.content_item_id, name: item.name });
  }
  archiveContentItem(campaign) { this._itemArchive(campaign, true); }
  restoreContentItem(campaign) { this._itemArchive(campaign, false); }
  _itemArchive(campaign, archive) {
    requireFields(this.command.payload, ["content_item_id","reason"]);
    const item = this.item(campaign, this.command.payload.content_item_id);
    if (campaign.archived_at || Boolean(item.archived_at) === archive ||
        [...item.variants.values()].some((variant) => variant.pending_attempt_id || variant.active_schedule_id)) throw new CampaignTransitionError(archive ? "INVALID_TRANSITION" : "CAMPAIGN_ARCHIVED");
    item.archived_at = archive ? this.now : null; item.updated_at = this.now;
    this.event(`content_item.${archive ? "archived" : "restored"}`, { content_item_id: item.content_item_id, reason: this.command.payload.reason });
  }
  makeRevision(campaign, itemId, variantId, revisionId, number, parentId, content, snapshotId, changeReason) {
    return { revision_id: revisionId, tenant_id: campaign.tenant_id, project_id: campaign.project_id, brand_id: campaign.brand_id, campaign_id: campaign.campaign_id, content_item_id: itemId, variant_id: variantId, revision_number: number, parent_revision_id: parentId, content, brand_snapshot_id: snapshotId, source: "manual", generation_links: [], content_hash: hashIntent({ content, brand_snapshot_id: snapshotId }), change_reason: changeReason, created_at: this.now, created_by: clone(this.context.actor) };
  }
  async saveRevision(campaign) {
    requireFields(this.command.payload, ["variant_id","content","change_reason","brand_snapshot_id","capture_current_brand"], ["variant_id","content","change_reason"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    const previous = variant.revisions.get(variant.current_revision_id), revisionId = this.id("revision_ids");
    if (variant.active_schedule_id) { this.event("schedule.cancelled", { variant_id: variant.variant_id, schedule_id: variant.active_schedule_id, reason_code: "revision_changed", reason: "Revision changed" }); variant.active_schedule_id = null; }
    if (variant.active_approval_id) { const approvalId = this.id("approval_ids"); const revocation = { approval_id: approvalId, variant_id: variant.variant_id, revision_id: previous.revision_id, decision: "revoked", preview_id: null, supersedes_approval_id: variant.active_approval_id, reason: "Revision changed", created_at: this.now, created_by: clone(this.context.actor) }; campaign.approvals.set(approvalId, revocation); this.event("approval.revoked", { record: revocation }); variant.active_approval_id = null; }
    if (this.command.payload.brand_snapshot_id && this.command.payload.capture_current_brand) throw new CampaignValidationError();
    let snapshotId = this.command.payload.brand_snapshot_id || previous.brand_snapshot_id;
    if (this.command.payload.capture_current_brand) {
      if (!this.repository.captureBrandSnapshot) throw new CampaignTransitionError("BRAND_CONTEXT_UNAVAILABLE");
      const snapshot = await this.repository.captureBrandSnapshot(clone(this.context), campaign.brand_id);
      if (!snapshot) throw new CampaignTransitionError("BRAND_CONTEXT_UNAVAILABLE");
      campaign.brand_snapshots.set(snapshot.brand_snapshot_id, clone(snapshot));
      snapshotId = snapshot.brand_snapshot_id;
    }
    if (!campaign.brand_snapshots.has(snapshotId)) throw new CampaignResourceError();
    const revision = this.makeRevision(campaign, item.content_item_id, variant.variant_id, revisionId, previous.revision_number + 1, previous.revision_id, parseContent(this.command.payload.content), snapshotId, this.command.payload.change_reason);
    variant.revisions.set(revisionId, revision); variant.current_revision_id = revisionId; variant.workflow = "draft"; variant.updated_at = this.now;
    this.event("revision.created", { record: clone(revision) });
  }
  submitReview(campaign) {
    requireFields(this.command.payload, ["variant_id","revision_id"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if (variant.workflow !== "draft" || variant.current_revision_id !== this.command.payload.revision_id) throw new CampaignTransitionError();
    const revision = variant.revisions.get(variant.current_revision_id);
    if (!contentComplete(item.format, revision.content)) throw new CampaignTransitionError("CONTENT_INCOMPLETE");
    variant.workflow = "review"; variant.updated_at = this.now; this.event("review.submitted", { variant_id: variant.variant_id, revision_id: revision.revision_id });
  }
  async acknowledgePreview(campaign) {
    requireFields(this.command.payload, ["variant_id","revision_id","render_receipt_id","acknowledged"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if (variant.workflow !== "review" || variant.current_revision_id !== this.command.payload.revision_id || this.command.payload.acknowledged !== true || !this.repository.resolvePreviewReceipt) throw new CampaignTransitionError("PREVIEW_REQUIRED");
    const trusted = await this.repository.resolvePreviewReceipt(clone(this.context), clone(this.command.payload));
    if (!trusted || trusted.variant_id !== variant.variant_id || trusted.revision_id !== variant.current_revision_id) throw new CampaignResourceError();
    const { render_receipt_id: _trustedReceiptId, ...trustedPreview } = trusted;
    const preview = { ...clone(trustedPreview), preview_id: this.id("preview_ids"), observed_at: this.now, observed_by: clone(this.context.actor) };
    campaign.previews.set(preview.preview_id, preview); this.event("preview.acknowledged", { record: clone(preview) });
  }
  approve(campaign) {
    requireFields(this.command.payload, ["variant_id","revision_id","preview_id","approved"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    const preview = campaign.previews.get(this.command.payload.preview_id);
    if (variant.workflow !== "review" || this.command.payload.approved !== true || variant.current_revision_id !== this.command.payload.revision_id || !preview || preview.revision_id !== variant.current_revision_id || preview.observed_by.auth_user_id !== this.context.actor.auth_user_id) throw new CampaignTransitionError("PREVIEW_REQUIRED");
    const approval = { approval_id: this.id("approval_ids"), variant_id: variant.variant_id, revision_id: variant.current_revision_id, decision: "approved", preview_id: preview.preview_id, supersedes_approval_id: null, reason: null, created_at: this.now, created_by: clone(this.context.actor) };
    campaign.approvals.set(approval.approval_id, approval); variant.active_approval_id = approval.approval_id; variant.workflow = "approved"; variant.updated_at = this.now; this.event("approval.approved", { record: clone(approval) });
  }
  requestChanges(campaign) {
    requireFields(this.command.payload, ["variant_id","revision_id","reason"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if (variant.workflow !== "review" || variant.current_revision_id !== this.command.payload.revision_id) throw new CampaignTransitionError();
    const decision = { approval_id: this.id("approval_ids"), variant_id: variant.variant_id, revision_id: variant.current_revision_id, decision: "changes_requested", preview_id: null, supersedes_approval_id: null, reason: this.command.payload.reason, created_at: this.now, created_by: clone(this.context.actor) };
    campaign.approvals.set(decision.approval_id, decision); variant.workflow = "draft"; variant.updated_at = this.now;
    this.event("approval.changes_requested", { record: clone(decision) });
  }
  revokeApproval(campaign) {
    requireFields(this.command.payload, ["variant_id","approval_id","reason"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if (!['approved','scheduled'].includes(variant.workflow) || variant.active_approval_id !== this.command.payload.approval_id) throw new CampaignTransitionError("APPROVAL_REQUIRED");
    if (variant.active_schedule_id) { this.event("schedule.cancelled", { variant_id: variant.variant_id, schedule_id: variant.active_schedule_id, reason_code: "approval_revoked", reason: this.command.payload.reason }); variant.active_schedule_id = null; }
    const prior = campaign.approvals.get(variant.active_approval_id);
    const revocation = { approval_id: this.id("approval_ids"), variant_id: variant.variant_id, revision_id: prior.revision_id, decision: "revoked", preview_id: null, supersedes_approval_id: prior.approval_id, reason: this.command.payload.reason, created_at: this.now, created_by: clone(this.context.actor) };
    campaign.approvals.set(revocation.approval_id, revocation); variant.active_approval_id = null; variant.workflow = "draft"; variant.updated_at = this.now;
    this.event("approval.revoked", { record: clone(revocation) });
  }
  schedule(campaign) { this._schedule(campaign, false); }
  reschedule(campaign) { this._schedule(campaign, true); }
  _schedule(campaign, replace) {
    requireFields(this.command.payload, ["variant_id","revision_id","approval_id","scheduled_for","timezone","local_datetime","utc_offset_minutes"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if ((!replace && variant.workflow !== "approved") || (replace && variant.workflow !== "scheduled") || variant.current_revision_id !== this.command.payload.revision_id || variant.active_approval_id !== this.command.payload.approval_id || !validSchedule(this.command.payload, this.now)) throw new CampaignTransitionError("SCHEDULE_INVALID");
    if (replace) this.event("schedule.cancelled", { variant_id: variant.variant_id, schedule_id: variant.active_schedule_id, reason_code: "rescheduled", reason: null });
    const schedule = { schedule_id: this.id("schedule_ids"), variant_id: variant.variant_id, revision_id: variant.current_revision_id, approval_id: variant.active_approval_id, scheduled_for: iso(this.command.payload.scheduled_for), timezone: this.command.payload.timezone, local_datetime: this.command.payload.local_datetime, utc_offset_minutes: this.command.payload.utc_offset_minutes, created_at: this.now, created_by: clone(this.context.actor) };
    campaign.schedules.set(schedule.schedule_id, schedule); variant.active_schedule_id = schedule.schedule_id; variant.workflow = "scheduled"; variant.updated_at = this.now; this.event("schedule.created", { record: clone(schedule) });
  }
  unschedule(campaign) {
    requireFields(this.command.payload, ["variant_id","schedule_id"]); const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if (variant.workflow !== "scheduled" || variant.active_schedule_id !== this.command.payload.schedule_id) throw new CampaignTransitionError();
    this.event("schedule.cancelled", { variant_id: variant.variant_id, schedule_id: variant.active_schedule_id, reason_code: "unscheduled", reason: null }); variant.active_schedule_id = null; variant.workflow = "approved"; variant.updated_at = this.now;
  }
  beginManualPublication(campaign) {
    requireFields(this.command.payload, ["variant_id","revision_id","approval_id"]); const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item, variant);
    if (!['approved','scheduled'].includes(variant.workflow) || variant.current_revision_id !== this.command.payload.revision_id || variant.active_approval_id !== this.command.payload.approval_id) throw new CampaignTransitionError("APPROVAL_REQUIRED");
    const attempt = { attempt_id: this.id("attempt_ids"), variant_id: variant.variant_id, revision_id: variant.current_revision_id, approval_id: variant.active_approval_id, schedule_id: variant.active_schedule_id, method: "manual", started_at: this.now, started_by: clone(this.context.actor) };
    campaign.attempts.set(attempt.attempt_id, attempt); variant.pending_attempt_id = attempt.attempt_id; variant.updated_at = this.now; this.event("publication.attempt_started", { record: clone(attempt) });
  }
  confirmManualPublication(campaign) { this._resolve(campaign, "confirmed"); }
  failManualPublication(campaign) { this._resolve(campaign, "failed"); }
  cancelManualPublication(campaign) { this._resolve(campaign, "cancelled"); }
  _resolve(campaign, outcome) {
    const confirmed = outcome === "confirmed";
    requireFields(this.command.payload, confirmed ? ["variant_id","attempt_id","published_at","publication_url","external_reference","note","attested_published"] : ["variant_id","attempt_id","reason","not_published_attestation"], confirmed ? ["variant_id","attempt_id","published_at","attested_published"] : ["variant_id","attempt_id","reason","not_published_attestation"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item);
    const attempt = campaign.attempts.get(this.command.payload.attempt_id);
    if (!attempt || variant.pending_attempt_id !== attempt.attempt_id) throw new CampaignTransitionError();
    if ((confirmed && (this.command.payload.attested_published !== true || !validPublicationUrl(this.command.payload.publication_url))) || (!confirmed && this.command.payload.not_published_attestation !== true)) throw new CampaignTransitionError("PUBLICATION_EVIDENCE_INVALID");
    const resolution = { resolution_id: this.id("resolution_ids"), attempt_id: attempt.attempt_id, variant_id: variant.variant_id, outcome, reason: confirmed ? null : this.command.payload.reason, not_published_attestation: !confirmed, resolved_at: this.now, resolved_by: clone(this.context.actor) };
    campaign.resolutions.set(resolution.resolution_id, resolution); variant.pending_attempt_id = null;
    if (confirmed) {
      const publishedAt = iso(this.command.payload.published_at);
      if (publishedAt < attempt.started_at || publishedAt > this.now) throw new CampaignTransitionError("PUBLICATION_EVIDENCE_INVALID");
      const publication = { publication_id: this.id("publication_ids"), resolution_id: resolution.resolution_id, attempt_id: attempt.attempt_id, variant_id: variant.variant_id, revision_id: attempt.revision_id, approval_id: attempt.approval_id, method: "manual", evidence_kind: "customer_attestation", published_at: publishedAt, recorded_at: this.now, recorded_by: clone(this.context.actor), publication_url: this.command.payload.publication_url || null, external_reference: this.command.payload.external_reference || null, note: this.command.payload.note || null, attested_published: true };
      campaign.publications.set(publication.publication_id, publication); variant.publication_id = publication.publication_id; variant.active_approval_id = null; variant.active_schedule_id = null; variant.workflow = "published"; this.event("publication.confirmed", { resolution: clone(resolution), publication: clone(publication) });
    } else this.event(`publication.attempt_${outcome}`, { record: clone(resolution) });
    variant.updated_at = this.now;
  }
  correctPublication(campaign) {
    requireFields(this.command.payload, ["variant_id","publication_id","published_at","publication_url","external_reference","note","reason"]);
    const [item, variant] = this.variant(campaign, this.command.payload.variant_id); this.ensureWritable(campaign, item);
    if (variant.workflow !== "published" || variant.publication_id !== this.command.payload.publication_id) throw new CampaignTransitionError();
    const priorCorrections = [...campaign.corrections.values()].filter((row) => row.publication_id === variant.publication_id);
    const correction = { correction_id: this.id("correction_ids"), publication_id: variant.publication_id, variant_id: variant.variant_id, supersedes_correction_id: priorCorrections.at(-1)?.correction_id || null, published_at: iso(this.command.payload.published_at), publication_url: this.command.payload.publication_url, external_reference: this.command.payload.external_reference, note: this.command.payload.note, reason: this.command.payload.reason, created_at: this.now, created_by: clone(this.context.actor) };
    campaign.corrections.set(correction.correction_id, correction); variant.updated_at = this.now;
    this.event("publication.corrected", { record: clone(correction) });
  }
  archiveCampaign(campaign) { this._campaignArchive(campaign, true); }
  restoreCampaign(campaign) { this._campaignArchive(campaign, false); }
  _campaignArchive(campaign, archive) {
    requireFields(this.command.payload, ["reason"]);
    if (Boolean(campaign.archived_at) === archive || [...campaign.items.values()].some((item) => [...item.variants.values()].some((v) => v.pending_attempt_id || v.active_schedule_id))) throw new CampaignTransitionError();
    campaign.archived_at = archive ? this.now : null; this.event(`campaign.${archive ? "archived" : "restored"}`, { reason: this.command.payload.reason });
  }
  result() {
    return { command_id: this.commandId, campaign_id: this.campaignId, campaign_version: this.campaignVersion, first_sequence: this.firstSequence, last_sequence: this.lastSequence, created_ids: Object.fromEntries(Object.entries(this.created).filter(([key]) => !["command_ids","event_ids"].includes(key))) };
  }
}

module.exports = { CampaignRepository, InMemoryCampaignRepository };
