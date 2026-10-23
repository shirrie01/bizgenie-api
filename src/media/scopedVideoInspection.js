// Internal only. No route/composition import, persisted attestation or approval authority.
const { z } = require("zod");
const { createHash } = require("node:crypto");
const { identifier, uuid, hashIntent } = require("../campaigns/schema");
const { createHardenedVideoInspector, assessInstagramVideoCandidate, MAX_BYTES } = require("./videoInspection");
const TRANSFER_BYTES = 8 * 1024 * 1024;
const failureReasons = new Set(["INVALID_CONTAINER", "UNSUPPORTED_STREAM_LAYOUT", "AMBIGUOUS_ROTATION", "AMBIGUOUS_DISPLAY_MATRIX",
  "INCOMPLETE_STREAM_METADATA", "INVALID_BYTES", "OBJECT_TOO_LARGE", "CANCELLED", "INSPECTION_BUSY", "INVALID_MP4_HEADER",
  "UNSUPPORTED_CONTAINER_BRAND", "INSPECTION_TOOL_UNAVAILABLE", "INSPECTION_SANDBOX_UNAVAILABLE", "INSPECTION_RESOURCE_LIMIT",
  "INSPECTION_OUTPUT_LIMIT", "INSPECTION_TIMEOUT", "INVALID_INSPECTION_OUTPUT", "INSPECTION_IO_UNAVAILABLE",
  "INSPECTION_CLEANUP_UNAVAILABLE", "INSPECTION_TOOL_VERSION_UNAPPROVED"]);
const querySchema = z.object({ accessToken: z.string().min(1).max(16384), tenantId: identifier, projectId: identifier,
  brandId: identifier, campaignId: uuid, variantId: uuid, revisionId: uuid, assetId: uuid,
  expectedVersion: z.number().int().min(0).max(2147483647) }).strict();
const failure = reason => Object.freeze({ status: "unavailable", reason, provisionable: false });
const cancelBody = response => { try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} };
class InspectionFailure extends Error { constructor(reason) { super("Inspection unavailable"); this.reason = reason; } }
const deny = reason => { throw new InspectionFailure(reason); };

function createScopedVideoInspectionService({ repository, storage, tokenVerifier, authorizationService,
  inspect = createHardenedVideoInspector(), timeoutMs = 15000, maxRequestsPerWindow = 8,
  maxBytesPerWindow = 64 * 1024 * 1024, now = Date.now } = {}) {
  if (!repository || !storage || !tokenVerifier || !authorizationService || typeof inspect !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isInteger(maxRequestsPerWindow) || maxRequestsPerWindow < 1 || maxRequestsPerWindow > 100 ||
      !Number.isSafeInteger(maxBytesPerWindow) || maxBytesPerWindow < 1 || maxBytesPerWindow > 256 * 1024 * 1024) throw new TypeError("Invalid internal inspection configuration");
  let active = 0, windowStart = now(), requests = 0, reservedBytes = 0;
  return Object.freeze({ async inspect(input, { signal } = {}) {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) return failure("INVALID_INSPECTION_REQUEST");
    if (signal?.aborted) return failure("CANCELLED");
    if (active >= 2) return failure("INSPECTION_BUSY");
    const currentTime = now();
    // A backward clock never resets a window or restores budget.
    if (currentTime - windowStart >= 60000) { windowStart = currentTime; requests = 0; reservedBytes = 0; }
    if (requests >= maxRequestsPerWindow) return failure("INSPECTION_REQUEST_BUDGET");
    requests++; active++;
    const q = parsed.data, pending = new Set(), controller = new AbortController();
    let stopReason, reader, response;
    const stop = reason => { stopReason ||= reason; controller.abort(); };
    const cancel = () => stop("CANCELLED"); signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => stop("INSPECTION_TIMEOUT"), timeoutMs);
    function within(operation, onLate) {
      if (controller.signal.aborted) return Promise.reject(new InspectionFailure(stopReason));
      const task = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new InspectionFailure(stopReason);
        return operation();
      });
      pending.add(task); task.then(() => pending.delete(task), () => pending.delete(task));
      return new Promise((resolve, reject) => {
        let settled = false;
        const abort = () => { if (settled) return; settled = true; controller.signal.removeEventListener("abort", abort); reject(new InspectionFailure(stopReason)); };
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
        task.then(value => {
          if (settled) { onLate?.(value); return; }
          settled = true; controller.signal.removeEventListener("abort", abort); resolve(value);
        }, error => { if (settled) return; settled = true; controller.signal.removeEventListener("abort", abort); reject(error); });
      });
    }
    async function authority() {
      const actor = await within(() => tokenVerifier.verifyAccessToken(q.accessToken));
      const a = await within(() => authorizationService.authorizeProjectBrand({ actor, tenantId: q.tenantId,
        projectId: q.projectId, brandId: q.brandId, action: "project:read" }));
      const context = { actor: a.actor, tenant_id: a.tenant_id, project_id: a.project_id,
        membership_role: a.membership_role, policy_version: "campaign-owner.v1" };
      const campaign = await within(() => repository.getCampaign(context, q.campaignId));
      if (campaign.brand_id !== q.brandId) deny("MEDIA_NOT_AVAILABLE");
      return within(() => repository.getMediaPreviewAsset(context, q.campaignId, { variantId: q.variantId,
        revisionId: q.revisionId, assetId: q.assetId, expectedVersion: q.expectedVersion }));
    }
    async function stat(asset) {
      if (asset.bucket !== storage.bucket || asset.mediaKind !== "video" || asset.mimeType !== "video/mp4") deny("MEDIA_NOT_AVAILABLE");
      const s = await within(() => storage.statPreview({ key: asset.key, signal: controller.signal }));
      if (!Number.isSafeInteger(s.size) || s.size < 1 || typeof s.generation !== "string" || !/^[1-9]\d{0,29}$/.test(s.generation) ||
          s.mimeType !== asset.mimeType || (asset.byteSize != null && asset.byteSize !== s.size)) deny("MEDIA_IDENTITY_UNAVAILABLE");
      if (s.size > MAX_BYTES) deny("OBJECT_TOO_LARGE");
      return s;
    }
    try {
      const asset = await authority(), original = await stat(asset);
      if (reservedBytes + original.size > maxBytesPerWindow) deny("INSPECTION_BYTE_BUDGET");
      // Reserve before reads, never refund failures/retries; this is a local technical budget, not billing.
      reservedBytes += original.size;
      const bytes = Buffer.allocUnsafe(original.size); let offset = 0;
      for (let start = 0; start < original.size; start += TRANSFER_BYTES) {
        const current = await authority();
        if (hashIntent(current) !== hashIntent(asset)) deny("MEDIA_IDENTITY_UNAVAILABLE");
        const end = Math.min(original.size - 1, start + TRANSFER_BYTES - 1), length = end - start + 1;
        response = await within(() => storage.openPreview({ key: asset.key, generation: original.generation,
          range: { start, end, partial: true }, signal: controller.signal }), cancelBody);
        const h = response.headers;
        if (response.status !== 206 || h.get("content-type") !== "video/mp4" || h.get("content-length") !== String(length) ||
            h.get("content-range") !== `bytes ${start}-${end}/${original.size}` ||
            (h.get("content-encoding") && h.get("content-encoding") !== "identity") || !response.body) deny("MEDIA_IDENTITY_UNAVAILABLE");
        reader = response.body.getReader(); let received = 0;
        while (true) {
          const part = await within(() => reader.read()); if (part.done) break;
          received += part.value.byteLength;
          if (received > length || offset + part.value.byteLength > original.size) deny("MEDIA_LENGTH_MISMATCH");
          bytes.set(part.value, offset); offset += part.value.byteLength;
        }
        if (received !== length) deny("MEDIA_LENGTH_MISMATCH");
        reader.releaseLock(); reader = null; response = null;
      }
      if (offset !== original.size) deny("MEDIA_LENGTH_MISMATCH");
      const measurement = await within(() => inspect(bytes, { signal: controller.signal }));
      // Reauthorize even for non-measured results; never return observations after revocation/version changes.
      const current = await authority();
      if (hashIntent(current) !== hashIntent(asset)) deny("MEDIA_IDENTITY_UNAVAILABLE");
      const latest = await stat(current);
      if (latest.generation !== original.generation || latest.size !== original.size) deny("MEDIA_IDENTITY_UNAVAILABLE");
      await authority();
      if (measurement.status !== "measured") {
        if (!new Set(["invalid", "unsupported", "unavailable"]).has(measurement.status) ||
            !failureReasons.has(measurement.reason)) deny("INSPECTION_RESULT_UNTRUSTED");
        return Object.freeze({ status: measurement.status, reason: measurement.reason, provisionable: false });
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      const assessment = assessInstagramVideoCandidate(measurement);
      if (measurement.sha256 !== digest || measurement.byte_size !== original.size || assessment.status === "unavailable") deny("INSPECTION_RESULT_UNTRUSTED");
      const identity = Object.freeze({ campaign_id: q.campaignId, variant_id: q.variantId, revision_id: q.revisionId,
        asset_id: q.assetId, campaign_version: q.expectedVersion, content_sha256: digest,
        source_binding: hashIntent({ tenant: q.tenantId, project: q.projectId, brand: q.brandId, campaign: q.campaignId,
          variant: q.variantId, revision: q.revisionId, asset: q.assetId, version: q.expectedVersion,
          bucket: asset.bucket, key: asset.key, generation: original.generation, digest }) });
      return Object.freeze({ status: "measured", provisionable: false, identity, measurement, assessment });
    } catch (error) {
      if (stopReason) return failure(stopReason);
      if (error instanceof InspectionFailure) return failure(error.reason);
      if (error?.code === "VERSION_CONFLICT") return failure("VERSION_CONFLICT");
      // No raw upstream message, auth token, bucket/key or tool stderr crosses this boundary.
      return failure("MEDIA_NOT_AVAILABLE");
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); controller.abort();
      try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch {}
      try { reader?.releaseLock(); } catch {}
      cancelBody(response);
      // Noncancellable DB/auth/transport work retains its slot until it settles. No orphan-work oversubscription.
      if (pending.size) Promise.allSettled([...pending]).then(() => { active--; }); else active--;
    }
  } });
}
module.exports = { createScopedVideoInspectionService };
