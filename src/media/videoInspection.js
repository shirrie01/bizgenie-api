// Isolated local byte inspection. Not wired into routes, profile registration or approval.
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdtemp, writeFile, chmod, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const toolchain = require("../../runtime/video-inspection-toolchain.v1.json");
const candidate = require("../../docs/media/contracts/instagram-feed-video-preview.v1.proposed.json");
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT = 256 * 1024;
const measuredResults = new WeakSet();
const result = (status, reason) => Object.freeze({ status, reason });
const number = value => { const n = Number(value); return value !== undefined && value !== null && value !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
function ratio(value) {
  if (typeof value !== "string" || !/^\d{1,9}[:/]\d{1,9}$/.test(value)) return null;
  const [n, d] = value.split(/[:/]/).map(Number);
  return d > 0 ? { numerator: n, denominator: d } : null;
}
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function parseProbe(probe, bytes, expectedVersion) {
  if (expectedVersion && probe?.program_version?.version !== expectedVersion) return result("unavailable", "INSPECTION_TOOL_VERSION_UNAPPROVED");
  if (!probe || !Array.isArray(probe.streams) || probe.streams.length > 8 || !probe.format || number(probe.format.size) !== bytes.length) return result("invalid", "INVALID_CONTAINER");
  const video = probe.streams.filter(s => s.codec_type === "video");
  const audio = probe.streams.filter(s => s.codec_type === "audio");
  if (video.length !== 1 || video[0].disposition?.attached_pic || probe.streams.some(s => !["video", "audio"].includes(s.codec_type))) return result("unsupported", "UNSUPPORTED_STREAM_LAYOUT");
  const v = video[0];
  const rotations = [...(v.side_data_list || []).filter(s => s.rotation !== undefined).map(s => number(s.rotation < 0 ? s.rotation + 360 : s.rotation)), ...(v.tags?.rotate !== undefined ? [number(v.tags.rotate)] : [])];
  if (rotations.some(r => r === null) || new Set(rotations).size > 1) return result("unsupported", "AMBIGUOUS_ROTATION");
  const matrices = (v.side_data_list || []).filter(s => s.displaymatrix !== undefined).map(s => {
    if (typeof s.displaymatrix !== "string" || s.displaymatrix.length > 512) return null;
    const entries = s.displaymatrix.trim().split("\n").flatMap(row => (row.split(":")[1] || "").trim().split(/\s+/).map(Number));
    return entries.length === 9 && entries.every(n => Number.isSafeInteger(n) && Math.abs(n) <= 2147483648) ? entries : null;
  });
  if (matrices.some(m => !m) || matrices.length > 1) return result("unsupported", "AMBIGUOUS_DISPLAY_MATRIX");
  const displayTransform = matrices.length ? (JSON.stringify(matrices[0]) === JSON.stringify([65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824]) ? "identity" : "non_identity") : "none";
  const sar = ratio(v.sample_aspect_ratio);
  const frameRate = ratio(v.avg_frame_rate);
  const duration = number(v.duration);
  const width = number(v.width), height = number(v.height);
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width > 50000 || height > 50000 || !duration || !sar || !sar.numerator || !frameRate || !frameRate.numerator) return result("unsupported", "INCOMPLETE_STREAM_METADATA");
  const out = freeze({ status: "measured", source: "local_ffprobe_bytes_v1", byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    container: "mp4", mime_type: "video/mp4", metadata_basis: "demuxed_stream_headers_not_full_decode",
    video: { codec: v.codec_name || null, profile: typeof v.profile === "string" ? v.profile.slice(0, 80) : null,
      level: number(v.level), width, height, sample_aspect_ratio: sar,
      display_aspect_ratio: ratio(v.display_aspect_ratio), frame_rate: frameRate,
      duration_seconds: duration, bitrate: number(v.bit_rate), rotation_degrees: rotations[0] ?? 0,
      display_transform: displayTransform,
      pixel_format: typeof v.pix_fmt === "string" ? v.pix_fmt.slice(0, 40) : null },
    audio: audio.map(s => ({ codec: s.codec_name || null, channels: number(s.channels), sample_rate: number(s.sample_rate) })),
    format_duration_seconds: number(probe.format.duration), format_bitrate: number(probe.format.bit_rate) });
  measuredResults.add(out);
  return out;
}

// Tool path is operator configuration, never a request field; no shell is involved.
function createVideoInspector({ executable = "/usr/bin/ffprobe", timeoutMs = 5000, isolation = "local" } = {}) {
  if (!["local", "bubblewrap"].includes(isolation) || (isolation === "bubblewrap" && executable !== "/usr/bin/ffprobe") || !path.isAbsolute(executable) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new TypeError("Invalid inspection configuration");
  let active = 0, cleanupUnavailable = false;
  return async function inspectVideo(bytes, { signal } = {}) {
    if (cleanupUnavailable) return result("unavailable", "INSPECTION_CLEANUP_UNAVAILABLE");
    if (!Buffer.isBuffer(bytes) || bytes.length < 16) return result("invalid", "INVALID_BYTES");
    if (bytes.length > MAX_BYTES) return result("unsupported", "OBJECT_TOO_LARGE");
    if (signal?.aborted) return result("unavailable", "CANCELLED");
    if (active >= 2) return result("unavailable", "INSPECTION_BUSY");
    // Require a first ftyp box and ISO MP4 brand, rejecting MOV/playlist inputs before subprocess IO.
    const boxSize = bytes.readUInt32BE(0);
    if (bytes.toString("ascii", 4, 8) !== "ftyp" || boxSize < 16 || boxSize > bytes.length || boxSize > 4096) return result("invalid", "INVALID_MP4_HEADER");
    const brands = [];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(bytes.toString("ascii", offset, offset + 4));
    brands.push(bytes.toString("ascii", 8, 12));
    if (!brands.some(b => /^(isom|iso[2-9]|mp4[12]|avc1)$/.test(b))) return result("unsupported", "UNSUPPORTED_CONTAINER_BRAND");
    active++;
    let directory;
    try {
      // Snapshot the caller's buffer before any await; mutation cannot change inspected bytes or digest.
      bytes = Buffer.from(bytes);
      directory = await mkdtemp(path.join(tmpdir(), "bg-video-inspect-"));
      const filename = path.join(directory, "asset.mp4");
      await writeFile(filename, bytes, { flag: "wx", mode: 0o600 });
      // The 0700 parent remains private on the host; the isolated nobody uid gets a readonly bind of this file only.
      if (isolation === "bubblewrap") await chmod(filename, 0o444);
      if (signal?.aborted) return result("unavailable", "CANCELLED");
      const execution = await new Promise(resolve => {
        let child, chunks = [], length = 0, stopReason, diagnostic = "";
        const stop = reason => { stopReason ||= reason; child?.kill("SIGKILL"); };
        const cancel = () => stop("CANCELLED");
        const timer = setTimeout(() => stop("INSPECTION_TIMEOUT"), timeoutMs);
        try {
          const inputPath = isolation === "bubblewrap" ? "/input/asset.mp4" : filename;
          const probeArgs = ["-v", "error", "-max_alloc", "16777216", "-threads", "1",
            "-protocol_whitelist", "file", "-format_whitelist", "mov", "-enable_drefs", "0", "-use_absolute_path", "0",
            "-probesize", String(MAX_BYTES), "-analyzeduration", "5000000", "-i", inputPath,
            "-show_program_version", "-show_format", "-show_streams", "-of", "json"];
          const command = isolation === "bubblewrap" ? ["/usr/bin/bwrap", "--unshare-all", "--unshare-net", "--unshare-user", "--disable-userns", "--assert-userns-disabled", "--die-with-parent", "--new-session",
            "--cap-drop", "ALL", "--uid", "65534", "--gid", "65534", "--ro-bind", "/usr", "/usr", "--ro-bind", "/lib", "/lib",
            "--ro-bind", "/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev", "--size", "1048576", "--tmpfs", "/tmp", "--dir", "/input",
            "--ro-bind", filename, inputPath, "--chdir", "/input", "--clearenv", "--setenv", "LANG", "C", "--setenv", "LC_ALL", "C",
            "--", executable, ...probeArgs] : [executable, ...probeArgs];
          child = spawn("/usr/bin/prlimit", ["--as=1073741824", "--cpu=5", "--nofile=64", "--core=0", "--", ...command],
            { shell: false, cwd: directory, env: { LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"] });
          // Read at most a small diagnostic prefix only to distinguish sandbox setup failure; never expose it.
          child.stderr.on("data", chunk => { if (diagnostic.length < 4096) diagnostic += chunk.toString("utf8").slice(0, 4096 - diagnostic.length); });
        } catch { clearTimeout(timer); resolve({ failure: "INSPECTION_TOOL_UNAVAILABLE" }); return; }
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
        child.stdout.on("data", chunk => {
          length += chunk.length;
          if (length > MAX_OUTPUT) { chunks = []; stop("INSPECTION_OUTPUT_LIMIT"); }
          else if (!stopReason) chunks.push(chunk);
        });
        child.on("error", () => { stopReason ||= "INSPECTION_TOOL_UNAVAILABLE"; });
        child.on("close", (code, terminationSignal) => {
          if (isolation === "bubblewrap" && /(?:bwrap:|prlimit:)/.test(diagnostic)) stopReason ||= "INSPECTION_SANDBOX_UNAVAILABLE";
          clearTimeout(timer); signal?.removeEventListener("abort", cancel);
          resolve(stopReason ? { failure: stopReason } : code === 127 ? { failure: "INSPECTION_TOOL_UNAVAILABLE" } : terminationSignal ? { failure: "INSPECTION_RESOURCE_LIMIT" } : code !== 0 ? { invalid: true } : { json: Buffer.concat(chunks).toString("utf8") });
        });
      });
      if (execution.failure) return result("unavailable", execution.failure);
      if (execution.invalid) return result("invalid", "INVALID_CONTAINER");
      try { return parseProbe(JSON.parse(execution.json), bytes, isolation === "bubblewrap" ? toolchain.ffprobe_version : null); }
      catch { return result("invalid", "INVALID_INSPECTION_OUTPUT"); }
    } catch { return result("unavailable", "INSPECTION_IO_UNAVAILABLE"); }
    finally {
      let cleanupFailed = false;
      try { if (directory) await rm(directory, { recursive: true, force: true }); }
      catch { cleanupFailed = true; cleanupUnavailable = true; }
      active--;
      if (cleanupFailed) return result("unavailable", "INSPECTION_CLEANUP_UNAVAILABLE");
    }
  };
}

function assessInstagramVideoCandidate(inspection) {
  const base = { provisionable: false, platform_compliance: "unverified" };
  if (!measuredResults.has(inspection)) return freeze({ ...base, status: "unavailable", reasons: ["TRUSTED_INSPECTION_REQUIRED"] });
  const c = candidate.bizgenie_preview_constraints, v = inspection.video, reasons = [];
  if (v.codec !== "h264") reasons.push("VIDEO_CODEC_UNSUPPORTED");
  if (inspection.audio.length) reasons.push("AUDIO_UNSUPPORTED");
  if (!c.dimensions.some(d => d.width === v.width && d.height === v.height)) reasons.push("DIMENSIONS_UNSUPPORTED");
  if (v.sample_aspect_ratio.numerator !== v.sample_aspect_ratio.denominator) reasons.push("PIXEL_ASPECT_UNSUPPORTED");
  if (v.rotation_degrees !== c.rotation_degrees) reasons.push("ROTATION_UNSUPPORTED");
  if (v.display_transform === "non_identity") reasons.push("REPRESENTATION_TRANSFORM_UNSUPPORTED");
  if (!c.duration_seconds.includes(v.duration_seconds) || inspection.format_duration_seconds !== v.duration_seconds) reasons.push("DURATION_UNSUPPORTED");
  if (inspection.byte_size > c.max_object_bytes) reasons.push("OBJECT_TOO_LARGE");
  return freeze({ ...base, status: reasons.length ? "unsupported" : "candidate_constraints_met", reasons,
    unresolved: ["META_REQUIREMENTS", "FULL_DECODE_AND_BROWSER_PROOF", "RENDERER_AND_OWNER_ACCEPTANCE"] });
}
function createHardenedVideoInspector({ timeoutMs = 5000 } = {}) {
  return createVideoInspector({ timeoutMs, isolation: "bubblewrap" });
}
module.exports = { createVideoInspector, createHardenedVideoInspector, assessInstagramVideoCandidate, MAX_BYTES };
