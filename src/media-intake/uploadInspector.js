// Real inspector for customer uploads (BG-LAUNCH-003), matching the contract the intake service calls:
//   inspect({ bytes, sha256, content_type, max_bytes, signal }) -> { sha256, content_type, clean, engine, policy_version, width, height, duration_seconds }
// Structural validation is REAL: the format is decided from the bytes, images are measured from their headers and walked for truncation/corruption, videos are measured with
// the hardened ffprobe inspector and fully decoded. It is NOT a malware scan. `malwareScanner` is a separate, required collaborator: without one the factory refuses to build
// (unless a caller explicitly accepts `allowUnscanned`, which production composition never does), so "clean" can never silently mean "virus-free".
const { createHash } = require("node:crypto");
const { inspectImage } = require("../media/imageInspection");

const POLICY = "upload-structural.v1";
const VIDEO_LIMITS = Object.freeze({ max_seconds: 60, codecs: ["h264"] });

function createUploadInspector({ videoInspector, videoDecode, malwareScanner = null, allowUnscanned = false } = {}) {
  if (typeof videoInspector !== "function" || typeof videoDecode !== "function") throw new TypeError("Upload inspection needs a video inspector and a decode check");
  if (!malwareScanner && !allowUnscanned) throw new TypeError("Upload inspection needs a malware scanner (or an explicit allowUnscanned for isolated staging)");
  if (malwareScanner && typeof malwareScanner.scan !== "function") throw new TypeError("Invalid malware scanner");
  const engineName = (scanned) => `structural-ffprobe-ffmpeg${malwareScanner ? `+${String(scanned || malwareScanner.engine || "scanner").slice(0, 60)}` : "+UNSCANNED"}`;

  return Object.freeze({
    async inspect({ bytes, sha256, content_type: contentType, max_bytes: maxBytes, signal } = {}) {
      if (!Buffer.isBuffer(bytes) || createHash("sha256").update(bytes).digest("hex") !== sha256) return null; // never vouch for bytes that are not the pinned ones
      if (Number.isFinite(maxBytes) && bytes.length > maxBytes) return null;
      let engine = engineName();
      const verdict = (clean, extra = {}) => ({ sha256, content_type: contentType, clean, engine, policy_version: POLICY, ...extra });
      let facts;
      if (contentType.startsWith("image/")) {
        const m = inspectImage(bytes);
        if (m.status !== "measured" || m.mime_type !== contentType) return verdict(false);
        facts = { width: m.width, height: m.height };
      } else if (contentType === "video/mp4") {
        const m = await videoInspector(bytes, { signal });
        if (m.status === "unavailable") return null;
        if (m.status !== "measured" || !VIDEO_LIMITS.codecs.includes(m.video.codec) || m.video.duration_seconds > VIDEO_LIMITS.max_seconds) return verdict(false);
        const d = await videoDecode(bytes, { signal });
        if (d.status === "unavailable") return null;
        if (d.status !== "decoded") return verdict(false);
        facts = { width: m.video.width, height: m.video.height, duration_seconds: m.video.duration_seconds };
      } else return verdict(false);
      if (malwareScanner) {
        let scan; try { scan = await malwareScanner.scan({ bytes, sha256, content_type: contentType, signal }); } catch { return null; }
        if (!scan || typeof scan.clean !== "boolean") return null;
        engine = engineName(scan.engine);
        if (!scan.clean) return verdict(false);
      }
      return verdict(true, facts);
    },
  });
}

module.exports = { createUploadInspector, POLICY };
