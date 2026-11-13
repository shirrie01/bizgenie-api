// Versioned, configurable media requirements per platform placement (BG-LAUNCH-002).
// Used for (1) validating Veo output before an asset exists, and (2) telling Studio whether a stored asset suits the platform it is planned for.
//
// HONESTY: the numbers below are BizGenie's operator-configured launch values. They were NOT verified against the platforms' current developer documentation in this
// environment (the platform hosts are not reachable here), so every profile is reported with `requirements_status: "operator_configured_unverified"` and the UI must say
// "BizGenie's check - the platform makes the final decision". Requirements change: override per profile with MEDIA_PROFILE_OVERRIDES (JSON) and bump `version`.
const VERSION = "media-profiles.v1";
const R = (w, h) => w / h;
const base = (profile_id, platform, format, constraints) => ({
  profile_id, platform, placement: "feed", format, version: 1,
  requirements_status: "operator_configured_unverified", constraints,
});
const video = (platform, extra = {}) => ({
  containers: ["mp4"], video_codecs: ["h264"], audio: "forbidden", // BizGenie-generated video has no audio track by contract
  min_duration_seconds: 3, max_duration_seconds: 60, max_bytes: 32 * 1024 * 1024, min_width: 540, min_height: 540,
  aspect_ratio: { min: R(9, 16), max: R(16, 9) }, ...extra,
});
const image = (extra = {}) => ({ mime_types: ["image/jpeg", "image/png"], max_bytes: 8 * 1024 * 1024, min_width: 320, min_height: 320, aspect_ratio: { min: 0.8, max: 1.91 }, ...extra });

const DEFAULTS = Object.freeze([
  base("instagram.feed.video", "instagram", "video", video("instagram", { aspect_ratio: { min: R(9, 16), max: 1.91 } })),
  base("instagram.feed.image", "instagram", "image", image()),
  base("facebook.feed.video", "facebook", "video", video("facebook")),
  base("facebook.feed.image", "facebook", "image", image({ aspect_ratio: { min: 0.8, max: 1.91 } })),
  base("linkedin.feed.video", "linkedin", "video", video("linkedin", { aspect_ratio: { min: 1 / 2.4, max: 2.4 }, min_duration_seconds: 3, max_duration_seconds: 60 })),
  base("linkedin.feed.image", "linkedin", "image", image({ aspect_ratio: { min: 1 / 1.91, max: 1.91 } })),
  // Preview compatibility only. No TikTok OAuth or publishing lives here.
  base("tiktok.feed.video", "tiktok", "video", video("tiktok", { aspect_ratio: { min: R(9, 16), max: R(16, 9) }, min_duration_seconds: 3 })),
]);

function deepFreeze(v) { if (v && typeof v === "object") { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; }

function loadProfiles(overridesJson) {
  const profiles = new Map(DEFAULTS.map((p) => [p.profile_id, structuredClone(p)]));
  if (overridesJson) {
    let overrides;
    try { overrides = typeof overridesJson === "string" ? JSON.parse(overridesJson) : overridesJson; } catch { throw new TypeError("MEDIA_PROFILE_OVERRIDES is not valid JSON"); }
    for (const [id, patch] of Object.entries(overrides || {})) {
      const p = profiles.get(id); if (!p) throw new TypeError(`MEDIA_PROFILE_OVERRIDES names unknown profile ${id}`);
      if (!Number.isInteger(patch.version) || patch.version <= p.version) throw new TypeError(`MEDIA_PROFILE_OVERRIDES for ${id} must raise version`);
      p.version = patch.version; p.requirements_status = patch.requirements_status || "operator_configured_unverified"; p.constraints = { ...p.constraints, ...(patch.constraints || {}) };
    }
  }
  return deepFreeze(profiles);
}

// `facts` is the measured/stored description of one asset: { media_kind, mime_type, width, height, duration_seconds, byte_size, container?, video_codec?, audio_tracks? }.
// Codec/audio/container are checked only when they were measured (generated video always is). Returns a stable, customer-presentable result.
function assess(profile, facts) {
  const c = profile.constraints, reasons = [], f = facts || {};
  const add = (code, detail) => reasons.push(detail ? { code, detail } : { code });
  if (f.media_kind !== profile.format) add("MEDIA_KIND_MISMATCH", `${f.media_kind || "unknown"} asset for a ${profile.format} slot`);
  else {
    if (!Number.isFinite(f.width) || !Number.isFinite(f.height) || f.width <= 0 || f.height <= 0) add("DIMENSIONS_UNKNOWN");
    else {
      if (f.width < c.min_width || f.height < c.min_height) add("DIMENSIONS_TOO_SMALL", `${f.width}x${f.height}, minimum ${c.min_width}x${c.min_height}`);
      const ratio = f.width / f.height;
      if (ratio < c.aspect_ratio.min - 0.005 || ratio > c.aspect_ratio.max + 0.005) add("ASPECT_RATIO_UNSUPPORTED", `${f.width}:${f.height}`);
    }
    if (!Number.isSafeInteger(f.byte_size) || f.byte_size <= 0) add("FILE_SIZE_UNKNOWN");
    else if (f.byte_size > c.max_bytes) add("FILE_TOO_LARGE", `${f.byte_size} bytes, maximum ${c.max_bytes}`);
    if (profile.format === "video") {
      if (!Number.isFinite(f.duration_seconds)) add("DURATION_UNKNOWN");
      else if (f.duration_seconds < c.min_duration_seconds || f.duration_seconds > c.max_duration_seconds) add("DURATION_UNSUPPORTED", `${f.duration_seconds}s, allowed ${c.min_duration_seconds}-${c.max_duration_seconds}s`);
      if (f.container !== undefined && !c.containers.includes(f.container)) add("CONTAINER_UNSUPPORTED", String(f.container));
      if (f.video_codec !== undefined && !c.video_codecs.includes(f.video_codec)) add("VIDEO_CODEC_UNSUPPORTED", String(f.video_codec));
      if (c.audio === "forbidden" && Number(f.audio_tracks) > 0) add("AUDIO_UNSUPPORTED");
      if (!f.mime_type) add("MIME_TYPE_UNKNOWN");
      else if (f.mime_type !== "video/mp4") add("MIME_TYPE_UNSUPPORTED", f.mime_type);
    } else if (!f.mime_type) add("MIME_TYPE_UNKNOWN");
    else if (!c.mime_types.includes(f.mime_type)) add("MIME_TYPE_UNSUPPORTED", f.mime_type);
  }
  return Object.freeze({ profile_id: profile.profile_id, profile_version: profile.version, requirements_status: profile.requirements_status, suitable: reasons.length === 0, reasons: Object.freeze(reasons) });
}

// Veo (and any provider) output must satisfy the strictest launch contract before an asset row can exist: the generation request's own aspect ratio and duration, plus
// the container/codec/audio/size rules every launch platform shares. `measured` is the trusted ffprobe measurement (videoInspection.js), never provider metadata.
const GENERATED_VIDEO = Object.freeze({ containers: ["mp4"], video_codecs: ["h264"], max_bytes: 32 * 1024 * 1024, max_duration_seconds: 60, duration_tolerance_seconds: 0.5, aspect_tolerance: 0.01 });
function validateGeneratedVideo(measured, expected = {}) {
  const reasons = [], v = measured?.video;
  if (!measured || measured.status !== "measured" || !v) return ["NOT_MEASURED"];
  if (!GENERATED_VIDEO.containers.includes(measured.container)) reasons.push("CONTAINER_UNSUPPORTED");
  if (!GENERATED_VIDEO.video_codecs.includes(v.codec)) reasons.push("VIDEO_CODEC_UNSUPPORTED");
  if (measured.audio?.length && !expected.allow_audio) reasons.push("AUDIO_UNSUPPORTED");
  if (!Number.isSafeInteger(measured.byte_size) || measured.byte_size <= 0) reasons.push("FILE_SIZE_UNKNOWN");
  else if (measured.byte_size > GENERATED_VIDEO.max_bytes) reasons.push("FILE_TOO_LARGE");
  if (!(v.duration_seconds > 0) || v.duration_seconds > GENERATED_VIDEO.max_duration_seconds) reasons.push("DURATION_UNSUPPORTED");
  if (expected.duration_seconds && Math.abs(v.duration_seconds - expected.duration_seconds) > GENERATED_VIDEO.duration_tolerance_seconds) reasons.push("DURATION_MISMATCH");
  if (v.sample_aspect_ratio && v.sample_aspect_ratio.numerator !== v.sample_aspect_ratio.denominator) reasons.push("PIXEL_ASPECT_UNSUPPORTED");
  if (v.rotation_degrees || v.display_transform === "non_identity") reasons.push("ROTATION_UNSUPPORTED");
  if (expected.aspect_ratio) {
    const [a, b] = String(expected.aspect_ratio).split(":").map(Number);
    if (!(a > 0 && b > 0) || Math.abs(v.width / v.height - a / b) > GENERATED_VIDEO.aspect_tolerance) reasons.push("ASPECT_RATIO_MISMATCH");
  }
  if (!Number.isSafeInteger(v.width) || !Number.isSafeInteger(v.height) || v.width < 2 || v.height < 2) reasons.push("DIMENSIONS_UNSUPPORTED");
  return reasons;
}

module.exports = { VERSION, DEFAULTS, GENERATED_VIDEO, loadProfiles, assess, validateGeneratedVideo };
