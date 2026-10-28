const { CampaignResourceError, CampaignVersionError } = require("./errors");
const { hashIntent } = require("./schema");
const { objectKey } = require("../media/storage");
const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" };

async function mediaPreviewAsset({ context, campaign, variantId, revisionId, assetId, expectedVersion, resolveMedia }) {
  if (context.tenant_id !== campaign.tenant_id || context.project_id !== campaign.project_id) throw new CampaignResourceError();
  let item, variant;
  for (const candidate of campaign.items.values()) if (candidate.variants.has(variantId)) { item = candidate; variant = candidate.variants.get(variantId); break; }
  if (!variant) throw new CampaignResourceError();
  if (campaign.version !== expectedVersion || variant.current_revision_id !== revisionId) throw new CampaignVersionError();
  const revision = variant.revisions.get(revisionId);
  if (!revision?.content.asset_refs.some(ref => ref.asset_id === assetId)) throw new CampaignResourceError();
  const link = revision.generation_links?.find(row => row.asset_id === assetId);
  const asset = await resolveMedia?.(context, assetId, campaign.brand_id);
  if (!asset || asset.asset_id !== assetId || asset.tenant_id !== context.tenant_id || asset.project_id !== context.project_id ||
      asset.brand_id !== campaign.brand_id || asset.status !== "active" || asset.source_kind !== "generated" ||
      asset.media_kind !== item.format || !asset.allowed_uses?.includes("campaign.preview") ||
      !link || link.job_id !== asset.job_id || link.output_kind !== asset.media_kind || link.output_hash !== hashIntent(asset.manifest) ||
      !Object.hasOwn(extensions, asset.mime_type) || asset.manifest?.mime_type !== asset.mime_type ||
      (asset.media_kind === "video") !== (asset.mime_type === "video/mp4")) throw new CampaignResourceError();
  const key = objectKey({ tenantId: context.tenant_id, projectId: context.project_id, mediaKind: asset.media_kind, assetId, extension: extensions[asset.mime_type] });
  if (key !== asset.storage_key) throw new CampaignResourceError();
  // Internal result only: never serialize this storage authority to a customer.
  return { bucket: asset.storage_bucket, key, mimeType: asset.mime_type, byteSize: asset.manifest.byte_size, mediaKind: asset.media_kind };
}
module.exports = { mediaPreviewAsset };
