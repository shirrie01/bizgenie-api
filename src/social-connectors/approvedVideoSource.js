// The media authority TikTok's draft upload reads from (BG-LAUNCH-005). It is the join between the social connector (Codex) and the media/campaign work (#223/#225): it hands the
// connector bytes ONLY for an asset that is, right now, (1) this tenant/project/brand's own generated video, (2) allowed for campaign.publish (only validated Veo output gets that
// right), (3) referenced by the exact approved revision the dispatch was created for, (4) still suitable for TikTok when its real bytes are re-measured. No URL is ever created: bytes
// are read from private storage at a pinned object generation and stay in memory.
//   loadApprovedVideo({ binding, payload, dispatch, signal }) -> { assetId, bytes, mimeType: "video/mp4", generation, sha256 }
//   revalidate(source, { binding, dispatch }) -> void | throws   (rights, approval and object generation re-checked; called before every chunk)
const { createHash } = require("node:crypto");
const { QuoteError } = require("../generation-quotes/service");
const { uuid } = require("../campaigns/schema");
const { loadProfiles, assess, validateGeneratedVideo } = require("../media/platformMediaProfiles");

const MAX_BYTES = 32 * 1024 * 1024;
const gone = () => new QuoteError("RESOURCE_NOT_AVAILABLE", 404);

function createApprovedVideoSource({ pool, storage, videoInspector, profiles = loadProfiles(process.env.MEDIA_PROFILE_OVERRIDES), now = () => new Date() } = {}) {
  if (!pool || typeof pool.query !== "function" || !storage || typeof storage.statPreview !== "function" || typeof storage.openPreview !== "function" || typeof videoInspector !== "function") {
    throw new TypeError("An approved video source needs the database pool, private media storage and a video inspector");
  }
  const profile = profiles.get("tiktok.feed.video");
  if (!profile) throw new TypeError("No tiktok.feed.video media profile");

  async function authority(binding, dispatch, assetId) {
    if (!uuid.safeParse(assetId).success || !dispatch || ["tenant_id", "project_id", "brand_id"].some((k) => dispatch[k] !== binding[k])) throw gone();
    // The dispatch must still be a live TikTok draft upload for exactly this approved revision.
    const d = (await pool.query("select state, operation_kind, revision_id, approval_id, variant_id, campaign_id, payload from public.social_dispatches where dispatch_id=$1 and tenant_id=$2 and project_id=$3 and brand_id=$4", [dispatch.dispatch_id, binding.tenant_id, binding.project_id, binding.brand_id])).rows[0];
    if (!d || d.operation_kind !== "draft_upload" || !["claimed", "sending", "reconciliation_required"].includes(d.state) ||
        d.revision_id !== dispatch.revision_id || d.approval_id !== dispatch.approval_id || d.variant_id !== dispatch.variant_id || d.campaign_id !== dispatch.campaign_id) throw gone();
    // The approved revision must reference this asset, and nothing else (one video per draft).
    const rev = (await pool.query("select content from public.campaign_revisions where revision_id=$1 and tenant_id=$2 and project_id=$3 and brand_id=$4 and variant_id=$5", [dispatch.revision_id, binding.tenant_id, binding.project_id, binding.brand_id, dispatch.variant_id])).rows[0];
    const refs = rev?.content?.asset_refs;
    if (!Array.isArray(refs) || refs.length !== 1 || refs[0].asset_id !== assetId) throw gone();
    const a = (await pool.query("select a.asset_id, a.media_kind, a.mime_type, a.source_kind, a.status, a.allowed_uses, a.storage_key, a.width, a.height, a.duration_seconds, a.byte_size, j.brand_id from public.media_assets a join public.generation_jobs j on j.job_id=a.generation_job_id and j.tenant_id=a.tenant_id and j.project_id=a.project_id where a.asset_id=$1 and a.tenant_id=$2 and a.project_id=$3", [assetId, binding.tenant_id, binding.project_id])).rows[0];
    if (!a || a.brand_id !== binding.brand_id || a.status !== "active" || a.media_kind !== "video" || a.mime_type !== "video/mp4" || a.source_kind !== "generated" || !a.allowed_uses.includes("campaign.publish")) throw gone();
    return a;
  }

  async function stat(a, signal) {
    const s = await storage.statPreview({ key: a.storage_key, signal });
    if (!s || !/^\d+$/.test(String(s.generation)) || s.mimeType !== "video/mp4" || !Number.isSafeInteger(s.size) || s.size < 1 || s.size > MAX_BYTES || (a.byte_size != null && Number(a.byte_size) !== s.size)) throw gone();
    return s;
  }

  return Object.freeze({
    async loadApprovedVideo({ binding, payload, dispatch, signal }) {
      const refs = payload?.content?.asset_refs;
      if (!Array.isArray(refs) || refs.length !== 1) throw gone();
      const a = await authority(binding, dispatch, refs[0].asset_id);
      const s = await stat(a, signal);
      const response = await storage.openPreview({ key: a.storage_key, generation: String(s.generation), range: { start: 0, end: s.size - 1, partial: false }, signal });
      const chunks = []; let total = 0;
      try {
        if (response.status !== 200) throw gone();
        const reader = response.body.getReader();
        for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > s.size) throw gone(); chunks.push(Buffer.from(part.value)); }
      } catch (error) { await response.body?.cancel().catch(() => {}); throw error instanceof QuoteError ? error : gone(); }
      if (total !== s.size) throw gone();
      const bytes = Buffer.concat(chunks);
      // Re-measure the real bytes now: they must still be the validated video the database describes, and still suit TikTok.
      const measured = await videoInspector(bytes, { signal });
      if (measured.status !== "measured") throw new QuoteError("TIKTOK_MEDIA_UNAVAILABLE", 503);
      const expected = { aspect_ratio: `${a.width}:${a.height}`, ...(a.duration_seconds != null ? { duration_seconds: Number(a.duration_seconds) } : {}) };
      if (validateGeneratedVideo(measured, expected).length) throw gone();
      const fit = assess(profile, { media_kind: "video", mime_type: "video/mp4", width: measured.video.width, height: measured.video.height, duration_seconds: measured.video.duration_seconds, byte_size: bytes.length, container: measured.container, video_codec: measured.video.codec, audio_tracks: measured.audio.length });
      if (!fit.suitable) throw gone();
      return { assetId: a.asset_id, bytes, mimeType: "video/mp4", generation: String(s.generation), sha256: createHash("sha256").update(bytes).digest("hex") };
    },

    async revalidate(source, { binding, dispatch }) {
      if (!source || !Buffer.isBuffer(source.bytes)) throw gone();
      const a = await authority(binding, dispatch, source.assetId);
      const s = await stat(a, undefined);
      if (String(s.generation) !== source.generation || s.size !== source.bytes.length) throw gone(); // the object changed since it was read
    },
  });
}

module.exports = { createApprovedVideoSource };
