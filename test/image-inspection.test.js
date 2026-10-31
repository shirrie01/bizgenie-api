// BG-LAUNCH-003: byte-level image inspection and its use on generated images. Real files made with ffmpeg (no network).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { inspectImage, validateGeneratedImage } = require("../src/media/imageInspection");
const { DurableMediaAssetStore } = require("../src/media/storage");

const have = require("./helpers/media-tools").haveMediaTools();
const dir = have ? fs.mkdtempSync(path.join(os.tmpdir(), "bg-img-")) : null;
const make = (name, args) => { execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x480:rate=1", "-frames:v", "1", ...args, path.join(dir, name)]); return fs.readFileSync(path.join(dir, name)); };
const files = have ? { png: make("a.png", []), jpg: make("a.jpg", ["-q:v", "3"]), webp: (() => { try { return make("a.webp", []); } catch { return null; } })() } : {};
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
const skip = have ? false : "ffmpeg unavailable";

test("PNG, JPEG and WebP are identified and measured from their bytes", { skip }, () => {
  for (const [kind, mime] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]]) {
    if (!files[kind]) continue;
    const m = inspectImage(files[kind]); assert.deepEqual([m.status, m.mime_type, m.width, m.height, m.byte_size], ["measured", mime, 640, 480, files[kind].length], kind);
    assert.match(m.sha256, /^[a-f0-9]{64}$/);
  }
});

test("damaged, truncated, mislabelled and hostile files are rejected", { skip }, () => {
  const png = files.png, jpg = files.jpg;
  assert.equal(inspectImage(png.subarray(0, png.length - 20)).reason, "TRUNCATED");
  assert.equal(inspectImage(png.subarray(0, 60)).reason, "TRUNCATED");
  const flipped = Buffer.from(png); flipped[40] ^= 0xff; assert.equal(inspectImage(flipped).reason, "CORRUPT");
  assert.equal(inspectImage(Buffer.concat([png, Buffer.from("tail")])).reason, "TRAILING_DATA");
  assert.equal(inspectImage(jpg.subarray(0, jpg.length - 30)).reason, "TRUNCATED");
  assert.equal(inspectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>   padding padding")).reason, "UNSUPPORTED_FORMAT");
  assert.equal(inspectImage(Buffer.alloc(100, 7)).reason, "UNSUPPORTED_FORMAT");
  assert.equal(inspectImage(Buffer.alloc(4)).reason, "INVALID_BYTES");
  assert.equal(inspectImage("not bytes").reason, "INVALID_BYTES");
  // a 1x1 PNG header claiming 60000x60000 (made by rewriting IHDR and its CRC) is refused before anything decodes it
  const bomb = Buffer.from(png); bomb.writeUInt32BE(60000, 16); bomb.writeUInt32BE(60000, 20);
  const crc = require("node:zlib").crc32 ? require("node:zlib").crc32(bomb.subarray(12, 29)) : null; if (crc !== null) { bomb.writeUInt32BE(crc >>> 0, 29); assert.equal(inspectImage(bomb).reason, "DIMENSIONS_TOO_LARGE"); }
});

test("generated-image rules compare the bytes with what was declared", { skip }, () => {
  const m = inspectImage(files.png);
  assert.deepEqual(validateGeneratedImage(m, { mime_type: "image/png", width: 640, height: 480 }), []);
  assert.deepEqual(validateGeneratedImage(m, { mime_type: "image/jpeg", width: 640, height: 480 }), ["MIME_TYPE_MISMATCH"]);
  assert.deepEqual(validateGeneratedImage(m, { mime_type: "image/png", width: 1024, height: 1024 }), ["DIMENSIONS_MISMATCH"]);
  assert.deepEqual(validateGeneratedImage({ status: "invalid", reason: "TRUNCATED" }, {}), ["TRUNCATED"]);
});

test("the asset store refuses an invalid generated image before anything is stored, and records measured dimensions", { skip }, async () => {
  const stored = []; const created = [];
  const store = new DurableMediaAssetStore({ mediaKind: "image", requireImageValidation: true,
    storage: { bucket: "b", putObject: async ({ key }) => { stored.push(key); return { byteSize: 1 }; }, delete: async () => {} },
    repository: { create: async (row) => { created.push(row); return row; } } });
  const lineage = { tenant_id: "t", project_id: "p", generation_job_id: "j", generation_id: "j" };
  await assert.rejects(store.save({ data: files.png.subarray(0, 100), mime_type: "image/png", width: 640, height: 480, lineage }), { code: "MEDIA_OUTPUT_INVALID" });
  await assert.rejects(store.save({ data: files.png, mime_type: "image/png", width: 1024, height: 1024, lineage }), { code: "MEDIA_OUTPUT_INVALID" });
  assert.deepEqual([stored.length, created.length], [0, 0]);
  const ok = await store.save({ data: files.png, mime_type: "image/png", width: 640, height: 480, lineage });
  assert.deepEqual([stored.length, created.length, created[0].width, created[0].height, ok.width], [1, 1, 640, 480, 640]);
});
