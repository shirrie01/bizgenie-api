// Byte-level image inspection (BG-LAUNCH-003). Pure JavaScript, no subprocess, no external tool: the format is decided from the BYTES (never from a filename, header or declared
// MIME type), the dimensions are read from the file's own headers, and structurally damaged or truncated files are rejected. It does not decode pixels; the platform's
// own decode happens later. `status` is "measured" or "invalid"; there is no "unavailable" because nothing external is involved.
const { createHash } = require("node:crypto");

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SIDE = 16384;
const MAX_PIXELS = 100 * 1000 * 1000; // decompression-bomb guard
const invalid = (reason) => Object.freeze({ status: "invalid", reason });

let crcTable;
function crc32(buf) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}

function png(b) {
  if (b.length < 45) return invalid("TRUNCATED");
  let offset = 8, width = 0, height = 0, sawIhdr = false, sawIdat = false, sawIend = false;
  while (offset + 12 <= b.length) {
    const length = b.readUInt32BE(offset); const type = b.toString("latin1", offset + 4, offset + 8);
    if (length > 0x7fffffff || offset + 12 + length > b.length) return invalid("TRUNCATED");
    const data = b.subarray(offset + 8, offset + 8 + length);
    if (b.readUInt32BE(offset + 8 + length) !== crc32(b.subarray(offset + 4, offset + 8 + length))) return invalid("CORRUPT");
    if (!sawIhdr) {
      if (type !== "IHDR" || length !== 13) return invalid("CORRUPT");
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); sawIhdr = true;
      const depth = data[8], colour = data[9];
      if (!{ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[colour]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) return invalid("CORRUPT");
    } else if (type === "IDAT") sawIdat = true;
    else if (type === "IEND") { sawIend = true; offset += 12 + length; break; }
    offset += 12 + length;
  }
  if (!sawIhdr || !sawIdat || !sawIend) return invalid("TRUNCATED");
  if (offset !== b.length) return invalid("TRAILING_DATA");
  return { mime_type: "image/png", width, height };
}

function jpeg(b) {
  if (b.length < 125) return invalid("TRUNCATED");
  let i = 2, width = 0, height = 0, frame = false, scan = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return invalid("CORRUPT");
    while (b[i] === 0xff) i += 1;
    const marker = b[i]; i += 1;
    if (marker === 0xd9) break; // EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (i + 2 > b.length) return invalid("TRUNCATED");
    const length = b.readUInt16BE(i); if (length < 2 || i + length > b.length) return invalid("TRUNCATED");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) { if (length < 8) return invalid("CORRUPT"); height = b.readUInt16BE(i + 3); width = b.readUInt16BE(i + 5); frame = true; }
    else if ([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return invalid("UNSUPPORTED_ENCODING");
    i += length;
    if (marker === 0xda) { // entropy-coded data follows: find the next real marker
      scan = true;
      while (i + 1 < b.length && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i += 1;
    }
  }
  if (!frame || !scan) return invalid("CORRUPT");
  let end = b.length; while (end > 0 && b[end - 1] === 0x00) end -= 1; // tolerate zero padding after EOI
  if (!(b[end - 2] === 0xff && b[end - 1] === 0xd9)) return invalid("TRUNCATED");
  return { mime_type: "image/jpeg", width, height };
}

function webp(b) {
  if (b.length < 30) return invalid("TRUNCATED");
  if (b.readUInt32LE(4) + 8 !== b.length) return invalid("TRUNCATED");
  const kind = b.toString("latin1", 12, 16); let width, height;
  if (kind === "VP8X") { width = 1 + b.readUIntLE(24, 3); height = 1 + b.readUIntLE(27, 3); }
  else if (kind === "VP8L") { if (b[20] !== 0x2f) return invalid("CORRUPT"); const v = b.readUInt32LE(21); width = 1 + (v & 0x3fff); height = 1 + ((v >>> 14) & 0x3fff); }
  else if (kind === "VP8 ") { if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return invalid("CORRUPT"); width = b.readUInt16LE(26) & 0x3fff; height = b.readUInt16LE(28) & 0x3fff; }
  else return invalid("UNSUPPORTED_ENCODING");
  return { mime_type: "image/webp", width, height };
}

function inspectImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) return invalid("INVALID_BYTES");
  if (bytes.length > MAX_BYTES) return invalid("FILE_TOO_LARGE");
  let found;
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) found = png(bytes);
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) found = jpeg(bytes);
  else if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") found = webp(bytes);
  else return invalid("UNSUPPORTED_FORMAT");
  if (found.status === "invalid") return found;
  if (!Number.isSafeInteger(found.width) || !Number.isSafeInteger(found.height) || found.width < 1 || found.height < 1) return invalid("DIMENSIONS_UNKNOWN");
  if (found.width > MAX_SIDE || found.height > MAX_SIDE || found.width * found.height > MAX_PIXELS) return invalid("DIMENSIONS_TOO_LARGE");
  return Object.freeze({ status: "measured", source: "byte_headers_v1", mime_type: found.mime_type, width: found.width, height: found.height, byte_size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}

// Rules for an image BizGenie will store as generated output: the bytes must be the declared type, whole, and the size the provider was asked for (when declared).
function validateGeneratedImage(measured, declared = {}) {
  if (!measured || measured.status !== "measured") return [measured?.reason || "NOT_MEASURED"];
  const reasons = [];
  if (declared.mime_type && declared.mime_type !== measured.mime_type) reasons.push("MIME_TYPE_MISMATCH");
  if (Number.isInteger(declared.width) && declared.width !== measured.width) reasons.push("DIMENSIONS_MISMATCH");
  if (Number.isInteger(declared.height) && declared.height !== measured.height) reasons.push("DIMENSIONS_MISMATCH");
  return [...new Set(reasons)];
}

module.exports = { inspectImage, validateGeneratedImage, MAX_BYTES, MAX_SIDE };
