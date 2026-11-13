const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } = require("./storage");
const MAX_VIDEO_TRANSFER_BYTES = 8 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_PREVIEWS = 4;
const activePreviews = new WeakMap();
class PreviewDeliveryError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const unavailable = () => new PreviewDeliveryError(503, "MEDIA_PREVIEW_UNAVAILABLE", "Media preview is temporarily unavailable");
function rangeFor(header, size, video) {
  const invalid = () => { throw new PreviewDeliveryError(416, "MEDIA_RANGE_NOT_SATISFIABLE", "Request a single bounded video byte range"); };
  if (header === undefined) { if (video && size > MAX_VIDEO_TRANSFER_BYTES) invalid(); return { start: 0, end: size - 1, partial: false }; }
  if (!video || typeof header !== "string" || header.length > 100) invalid();
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) invalid();
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix < 1) invalid();
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) invalid();
    end = Math.min(end, size - 1);
  }
  if (start >= size || end - start + 1 > MAX_VIDEO_TRANSFER_BYTES) invalid();
  return { start, end, partial: true };
}
function cancelBody(response) {
  try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {}
}
function abortable(operation, signal, onLateValue) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", abort); reject(unavailable());
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw unavailable();
      return operation();
    }).then(value => {
      if (settled) { onLateValue?.(value); return; }
      settled = true; signal.removeEventListener("abort", abort); resolve(value);
    }, error => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", abort); reject(error);
    });
  });
}
async function deliverPreview(req, res, asset, storage, { timeoutMs = PREVIEW_TIMEOUT_MS } = {}) {
  if (req.aborted || res.destroyed) return;
  if (!storage || storage.bucket !== asset.bucket) throw unavailable();
  if (req.header("if-range") !== undefined) throw new PreviewDeliveryError(400, "MEDIA_CONDITIONAL_REQUEST_UNSUPPORTED", "Conditional media ranges are not supported");
  const active = activePreviews.get(storage) || 0;
  if (active >= MAX_CONCURRENT_PREVIEWS) throw new PreviewDeliveryError(429, "MEDIA_PREVIEW_BUSY", "Too many media previews; retry later");
  activePreviews.set(storage, active + 1);
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableFinished) controller.abort(); };
  req.once("aborted", disconnect); res.once("close", disconnect);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    if(asset.reserveDelivery)await abortable(()=>asset.reserveDelivery({method:req.method}),controller.signal);
    const stat = await abortable(() => storage.statPreview({ key: asset.key, signal: controller.signal }), controller.signal);
    const max = asset.mediaKind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if ((asset.expectedGeneration && asset.expectedGeneration !== stat.generation) || !Number.isSafeInteger(stat.size) || stat.size <= 0 || stat.mimeType !== asset.mimeType ||
        (asset.byteSize != null && Number(asset.byteSize) !== stat.size) || !/^[0-9]+$/.test(stat.generation)) throw unavailable();
    if (stat.size > max) throw new PreviewDeliveryError(413, "MEDIA_PREVIEW_TOO_LARGE", "This media exceeds the preview size limit");
    let range;
    try { range = req.method === "HEAD" ? { start: 0, end: stat.size - 1, partial: false } : rangeFor(req.header("range"), stat.size, asset.mediaKind === "video"); }
    catch (error) { if (error.status === 416) res.set("Content-Range", `bytes */${stat.size}`); throw error; }
    const length = range.end - range.start + 1;
    if (req.method !== "HEAD") {
      response = await abortable(() => storage.openPreview({ key: asset.key, generation: stat.generation, range, signal: controller.signal }), controller.signal, cancelBody);
      const h = response.headers;
      if (response.status !== (range.partial ? 206 : 200) || h.get("content-length") !== String(length) ||
          h.get("content-type") !== asset.mimeType || (h.get("content-encoding") && h.get("content-encoding") !== "identity") ||
          (range.partial && h.get("content-range") !== `bytes ${range.start}-${range.end}/${stat.size}`) ||
          (!range.partial && h.get("content-range")) || !response.body) throw unavailable();
    }
    res.status(range.partial ? 206 : 200).set({
      "Content-Type": asset.mimeType, "Content-Length": String(length),
      "Accept-Ranges": asset.mediaKind === "video" ? "bytes" : "none",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
      "Content-Disposition": `inline; filename="preview.${{ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" }[asset.mimeType]}"`,
    });
    if (range.partial) res.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
    if (req.method === "HEAD") return res.end();
    let bytes = 0;
    const bound = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length; if (bytes > length) return callback(unavailable()); callback(null, chunk);
    }, flush(callback) { callback(bytes === length ? null : unavailable()); } });
    await pipeline(Readable.fromWeb(response.body), bound, res, { signal: controller.signal });
  } catch (error) {
    cancelBody(response);
    if (res.headersSent || res.destroyed) { res.destroy(); return; }
    for (const header of ["Content-Length", "Content-Type", "Content-Disposition", "Accept-Ranges"]) res.removeHeader(header);
    if (error instanceof PreviewDeliveryError) throw error;
    if(['DISTRIBUTED_BUDGET_EXHAUSTED','RUNTIME_POLICY_CONFLICT','PRIVATE_SCHEMA_UNAVAILABLE'].includes(error.code))throw new PreviewDeliveryError(error.status||503,error.code,'Media delivery budget unavailable');
    throw unavailable();
  } finally {
    clearTimeout(timer); req.off("aborted", disconnect); res.off("close", disconnect); controller.abort();
    activePreviews.set(storage, activePreviews.get(storage) - 1);
  }
}
module.exports = { deliverPreview, rangeFor, PreviewDeliveryError, MAX_VIDEO_TRANSFER_BYTES, PREVIEW_TIMEOUT_MS };
