const { CampaignResourceError, CampaignVersionError } = require("./errors");
const { hashIntent } = require("./schema");

// Read-only projection. It never renders, acknowledges, approves, signs URLs or fetches media.
async function creativePreview({ campaign, context, variantId, revisionId, expectedVersion, resolveMedia, validatePreview }) {
  if (campaign.tenant_id !== context.tenant_id || campaign.project_id !== context.project_id) throw new CampaignResourceError();
  let item, variant;
  for (const candidate of campaign.items.values()) {
    if (candidate.variants.has(variantId)) { item = candidate; variant = candidate.variants.get(variantId); break; }
  }
  if (!variant) throw new CampaignResourceError();
  if (campaign.version !== expectedVersion || variant.current_revision_id !== revisionId) throw new CampaignVersionError();
  const revision = variant.revisions.get(revisionId);
  if (!revision) throw new CampaignResourceError();
  const media = [];
  for (const ref of revision.content.asset_refs) {
    const asset = await resolveMedia?.(context, ref.asset_id, campaign.brand_id);
    const link = revision.generation_links?.find(row => row.asset_id === ref.asset_id);
    const authorised = asset && asset.asset_id === ref.asset_id && asset.tenant_id === context.tenant_id &&
      asset.project_id === context.project_id && asset.brand_id === campaign.brand_id && asset.status === "active" &&
      asset.source_kind === "generated" && asset.media_kind === item.format && asset.allowed_uses?.includes("campaign.preview") &&
      link?.job_id === asset.job_id && link?.output_kind === asset.media_kind && link?.output_hash === hashIntent(asset.manifest);
    // The campaign already discloses these reference IDs; existence/ownership failures share one status.
    media.push(authorised ? {
      asset_id: ref.asset_id, role: ref.role, media_kind: asset.media_kind,
      mime_type: asset.manifest.mime_type,
      source_kind: "generated", status: "unavailable", reason: "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE",
      url: null,
    } : {
      asset_id: ref.asset_id, role: ref.role, media_kind: null, source_kind: null,
      status: "unavailable", reason: "ASSET_NOT_AVAILABLE", url: null,
    });
  }
  const publication = campaign.publications.get(variant.publication_id);
  const approval = campaign.approvals.get(variant.active_approval_id || publication?.approval_id);
  const approved = approval?.decision === "approved" && approval.variant_id === variantId && approval.revision_id === revisionId;
  const acknowledged = [];
  for (const preview of campaign.previews.values()) {
    if (preview.variant_id === variantId && preview.revision_id === revisionId && preview.revision_content_hash === revision.content_hash &&
        preview.platform === variant.platform && preview.placement === variant.placement && preview.format === item.format &&
        preview.observed_by?.auth_user_id === context.actor.auth_user_id && await validatePreview?.(context, preview)) acknowledged.push(preview);
  }
  const copy = Object.fromEntries(["title", "body", "caption", "alt_text"].map(field => [field, revision.content[field]]));
  const copyAvailable = Object.values(copy).some(value => typeof value === "string" && value.length > 0);
  const mediaRequired = item.format !== "text" || media.length > 0;
  return {
    contract_version: "campaign-creative-preview.v1",
    campaign_id: campaign.campaign_id, campaign_version: campaign.version,
    content_item_id: item.content_item_id, variant_id: variantId, revision_id: revisionId,
    revision_number: revision.revision_number, platform: variant.platform, placement: variant.placement,
    content_type: item.format, workflow: variant.workflow,
    content_status: mediaRequired ? "unavailable" : copyAvailable ? "available" : "unavailable",
    copy_status: copyAvailable ? "available" : "unavailable", copy, media,
    provenance: { source: "persisted_revision", revision_source: revision.source, created_at: revision.created_at },
    approval_status: approved ? "approved" : "not_approved",
    platform_preview: { status: "unrendered", artifact_url: null, reason: "NO_PERSISTED_PLATFORM_ARTIFACT" },
    acknowledgement_status: acknowledged.length ? "acknowledged" : "not_acknowledged",
    read_only: true,
  };
}

module.exports = { creativePreview };
