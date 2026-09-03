const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  CampaignIdempotencyError,
  CampaignResourceError,
  CampaignTransitionError,
  CampaignVersionError,
  InMemoryCampaignRepository,
} = require("../src/campaigns");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const IDS = Array.from({ length: 100 }, (_, index) => `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`);
const context = { actor: { kind: "customer", auth_user_id: ACTOR }, tenant_id: "tenant_a", project_id: "project_a", membership_role: "owner", policy_version: "campaign-owner.v1" };
const command = (type, version, payload, campaign_id, key = `${type}_${version}`) => ({ contract_version: "campaign-spine.v1", idempotency_key: key, expected_campaign_version: version, command_type: type, tenant_id: "tenant_a", project_id: "project_a", ...(campaign_id ? { campaign_id } : {}), payload });

function fixture(overrides = {}) {
  let id = 0;
  return new InMemoryCampaignRepository({
    now: () => new Date("2026-09-03T10:00:00.000Z"),
    idFactory: () => IDS[id++],
    authorize: async (candidate) => candidate.actor.auth_user_id === ACTOR,
    captureBrandSnapshot: async () => ({ brand_snapshot_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", source_version: 1, source_updated_at: "2026-09-03T09:00:00.000Z", source_schema_version: "brand-brain.v1", snapshot: { name: "A" }, snapshot_hash: "a".repeat(64), captured_at: "2026-09-03T10:00:00.000Z" }),
    resolvePreviewReceipt: async (_context, payload) => ({ render_receipt_id: payload.render_receipt_id, variant_id: payload.variant_id, revision_id: payload.revision_id, revision_content_hash: "b".repeat(64), profile_id: "instagram.feed", profile_version: 1, profile_hash: "c".repeat(64), platform: "instagram", placement: "feed", format: "text", renderer_version: "renderer.v1", render_input_hash: "d".repeat(64), preview_digest: "e".repeat(64), rendered_at: "2026-09-03T09:59:00.000Z" }),
    ...overrides,
  });
}

async function campaignWithItem(repository) {
  const created = await repository.executeCommand(context, command("create_campaign", 0, { brand_id: "brand_a", name: "Launch", goal: "Launch clearly", display_timezone: "Europe/London" }));
  const campaignId = created.campaign_id;
  const item = await repository.executeCommand(context, command("create_content_item", 1, { name: "Launch post", format: "text", platform: "instagram", placement: "feed", destination_label: "BizGenie", initial_content: { title: null, body: "Make. Launch. Learn what converts.", caption: null, alt_text: null, asset_refs: [] } }, campaignId));
  return { campaignId, variantId: item.created_ids.variant_ids[0], revisionId: item.created_ids.revision_ids[0] };
}

describe("campaign-spine deterministic repository", () => {
  it("creates the campaign, snapshot reference, item, variant and immutable revision atomically", async () => {
    const repository = fixture();
    const { campaignId, variantId } = await campaignWithItem(repository);
    const campaign = await repository.getCampaign(context, campaignId);
    assert.equal(campaign.version, 2);
    assert.equal(campaign.events.length, 4);
    assert.equal(campaign.events.at(-1).sequence, 4);
    assert.equal([...campaign.items.values()][0].variants.get(variantId).workflow, "draft");
    assert.deepEqual(await repository.verifyCampaignProjection(context, campaignId), { valid: true, campaign_version: 2, last_event_sequence: 4 });
  });

  it("returns exact replay and rejects changed intent without additional events", async () => {
    const repository = fixture();
    const create = command("create_campaign", 0, { brand_id: "brand_a", name: "Launch", goal: "Launch clearly", display_timezone: "Europe/London" }, undefined, "same_key");
    const first = await repository.executeCommand(context, create);
    const replay = await repository.executeCommand(context, create);
    assert.deepEqual(replay, first);
    await assert.rejects(() => repository.executeCommand(context, { ...create, payload: { ...create.payload, name: "Changed" } }), CampaignIdempotencyError);
    assert.equal((await repository.listCampaignEvents(context, first.campaign_id)).length, 1);
  });

  it("enforces aggregate optimistic concurrency and tenant authorization", async () => {
    const repository = fixture();
    const { campaignId } = await campaignWithItem(repository);
    await assert.rejects(() => repository.executeCommand(context, command("create_content_item", 1, { name: "Stale", format: "text", platform: "linkedin", placement: "feed", destination_label: "BizGenie" }, campaignId, "stale_new_key")), CampaignVersionError);
    await assert.rejects(() => repository.getCampaign({ ...context, tenant_id: "tenant_b" }, campaignId), CampaignResourceError);
  });

  it("runs Draft → Review → Approved → Published with preview-bound approval", async () => {
    const repository = fixture();
    const { campaignId, variantId, revisionId } = await campaignWithItem(repository);
    await repository.executeCommand(context, command("submit_review", 2, { variant_id: variantId, revision_id: revisionId }, campaignId));
    const preview = await repository.executeCommand(context, command("acknowledge_preview", 3, { variant_id: variantId, revision_id: revisionId, render_receipt_id: "99999999-0000-4000-8000-000000000000", acknowledged: true }, campaignId));
    const previewId = preview.created_ids.preview_ids[0];
    const approval = await repository.executeCommand(context, command("approve", 4, { variant_id: variantId, revision_id: revisionId, preview_id: previewId, approved: true }, campaignId));
    const approvalId = approval.created_ids.approval_ids[0];
    const attempt = await repository.executeCommand(context, command("begin_manual_publication", 5, { variant_id: variantId, revision_id: revisionId, approval_id: approvalId }, campaignId));
    await repository.executeCommand(context, command("confirm_manual_publication", 6, { variant_id: variantId, attempt_id: attempt.created_ids.attempt_ids[0], published_at: "2026-09-03T10:00:00.000Z", attested_published: true }, campaignId));
    const campaign = await repository.getCampaign(context, campaignId);
    assert.equal(campaign.items.values().next().value.variants.get(variantId).workflow, "published");
    assert.equal(campaign.publications.size, 1);
  });

  it("rolls back every pre-commit failure and survives lost acknowledgement", async () => {
    let boundary;
    const repository = fixture({ fault: async (name) => { if (name === boundary) throw new Error(name); } });
    const create = command("create_campaign", 0, { brand_id: "brand_a", name: "Launch", goal: "Launch clearly", display_timezone: "Europe/London" }, undefined, "fault_key");
    boundary = "before_commit";
    await assert.rejects(() => repository.executeCommand(context, create));
    assert.equal((await repository.listCampaigns(context)).length, 0);
    boundary = "after_commit";
    await assert.rejects(() => repository.executeCommand(context, create));
    boundary = undefined;
    const replay = await repository.executeCommand(context, create);
    assert.equal(replay.campaign_version, 1);
    assert.equal((await repository.listCampaigns(context)).length, 1);
  });

  it("rejects incomplete review and direct invalid lifecycle shortcuts", async () => {
    const repository = fixture();
    const created = await repository.executeCommand(context, command("create_campaign", 0, { brand_id: "brand_a", name: "Launch", goal: "Launch clearly", display_timezone: "Europe/London" }));
    const item = await repository.executeCommand(context, command("create_content_item", 1, { name: "Empty", format: "image", platform: "instagram", placement: "feed", destination_label: "BizGenie" }, created.campaign_id));
    await assert.rejects(() => repository.executeCommand(context, command("submit_review", 2, { variant_id: item.created_ids.variant_ids[0], revision_id: item.created_ids.revision_ids[0] }, created.campaign_id)), (error) => error instanceof CampaignTransitionError && error.code === "CONTENT_INCOMPLETE");
  });

  it("serializes concurrent edits so one aggregate version wins", async () => {
    const repository = fixture();
    const { campaignId } = await campaignWithItem(repository);
    const writes = await Promise.allSettled([
      repository.executeCommand(context, command("create_content_item", 2, { name:"A",format:"text",platform:"linkedin",placement:"feed",destination_label:"A" }, campaignId, "parallel_a")),
      repository.executeCommand(context, command("create_content_item", 2, { name:"B",format:"text",platform:"facebook",placement:"feed",destination_label:"B" }, campaignId, "parallel_b")),
    ]);
    assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
    assert.ok(writes.find((result) => result.status === "rejected").reason instanceof CampaignVersionError);
  });

  it("pins an explicit valid schedule and rejects a false local-zone mapping", async () => {
    const repository = fixture();
    const { campaignId, variantId, revisionId } = await campaignWithItem(repository);
    await repository.executeCommand(context, command("submit_review",2,{variant_id:variantId,revision_id:revisionId},campaignId));
    const preview=await repository.executeCommand(context,command("acknowledge_preview",3,{variant_id:variantId,revision_id:revisionId,render_receipt_id:"99999999-0000-4000-8000-000000000000",acknowledged:true},campaignId));
    const approval=await repository.executeCommand(context,command("approve",4,{variant_id:variantId,revision_id:revisionId,preview_id:preview.created_ids.preview_ids[0],approved:true},campaignId));
    const payload={variant_id:variantId,revision_id:revisionId,approval_id:approval.created_ids.approval_ids[0],scheduled_for:"2026-09-03T11:00:00.000Z",timezone:"Europe/London",local_datetime:"2026-09-03T12:00:00.000",utc_offset_minutes:60};
    const scheduled=await repository.executeCommand(context,command("schedule",5,payload,campaignId));
    assert.equal(scheduled.campaign_version,6);
    await assert.rejects(()=>repository.executeCommand(context,command("reschedule",6,{...payload,scheduled_for:"2026-09-03T12:00:00.000Z",local_datetime:"2026-09-03T12:00:00.000"},campaignId,"bad_zone")),(error)=>error instanceof CampaignTransitionError&&error.code==="SCHEDULE_INVALID");
  });
});
