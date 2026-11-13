// BG-LAUNCH-002: versioned platform media requirements, Veo output rules and the preview-render suitability gate.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProfiles, assess, validateGeneratedVideo } = require("../src/media/platformMediaProfiles");
const { PostgresPreviewRegistry } = require("../src/campaigns/previewRegistry");

const profiles = loadProfiles();
const video = { media_kind: "video", mime_type: "video/mp4", width: 720, height: 1280, duration_seconds: 4, byte_size: 1e6, container: "mp4", video_codec: "h264", audio_tracks: 0 };

test("every launch platform has an image and video profile (TikTok video for preview compatibility only)", () => {
  for (const id of ["instagram", "facebook", "linkedin"]) for (const f of ["image", "video"]) assert.ok(profiles.get(`${id}.feed.${f}`), `${id} ${f}`);
  assert.ok(profiles.get("tiktok.feed.video")); assert.equal(profiles.get("tiktok.feed.image"), undefined);
  for (const p of profiles.values()) assert.equal(p.requirements_status, "operator_configured_unverified"); // never presented as platform-verified
});

test("suitability is per platform and reports customer-presentable reasons", () => {
  assert.equal(assess(profiles.get("instagram.feed.video"), video).suitable, true);
  const wide = { ...video, width: 1920, height: 540 }; // 3.5:1
  assert.deepEqual(assess(profiles.get("instagram.feed.video"), wide).reasons.map((r) => r.code), ["ASPECT_RATIO_UNSUPPORTED"]);
  assert.equal(assess(profiles.get("linkedin.feed.video"), { ...video, width: 1280, height: 720 }).suitable, true);
  const bad = assess(profiles.get("facebook.feed.video"), { ...video, duration_seconds: 120, byte_size: 99e6, audio_tracks: 1, video_codec: "vp9" });
  assert.deepEqual(bad.reasons.map((r) => r.code).sort(), ["AUDIO_UNSUPPORTED", "DURATION_UNSUPPORTED", "FILE_TOO_LARGE", "VIDEO_CODEC_UNSUPPORTED"]);
  assert.equal(assess(profiles.get("instagram.feed.image"), { media_kind: "image", mime_type: "image/png", width: 1, height: 1, byte_size: 70 }).reasons[0].code, "DIMENSIONS_TOO_SMALL");
  assert.equal(assess(profiles.get("instagram.feed.image"), video).reasons[0].code, "MEDIA_KIND_MISMATCH");
  assert.equal(assess(profiles.get("instagram.feed.video"), { media_kind: "video" }).suitable, false); // unknown facts are never "suitable"
});

test("requirements are configurable but only by raising the profile version", () => {
  const next = loadProfiles({ "linkedin.feed.video": { version: 2, constraints: { max_duration_seconds: 30 } } }).get("linkedin.feed.video");
  assert.equal(next.version, 2); assert.equal(assess(next, { ...video, duration_seconds: 45 }).suitable, false);
  assert.throws(() => loadProfiles({ "linkedin.feed.video": { version: 1, constraints: {} } }), /raise version/);
  assert.throws(() => loadProfiles({ "nope.feed.video": { version: 2 } }), /unknown profile/);
  assert.equal(profiles.get("linkedin.feed.video").version, 1); // defaults are frozen and unaffected
});

test("generated video rules compare real measurements with what was requested", () => {
  const m = (over = {}) => ({ status: "measured", container: "mp4", byte_size: 1e6, audio: [], video: { codec: "h264", width: 720, height: 1280, duration_seconds: 4, sample_aspect_ratio: { numerator: 1, denominator: 1 }, rotation_degrees: 0, display_transform: "none" }, ...over });
  const want = { aspect_ratio: "9:16", duration_seconds: 4 };
  assert.deepEqual(validateGeneratedVideo(m(), want), []);
  assert.deepEqual(validateGeneratedVideo({ status: "invalid" }, want), ["NOT_MEASURED"]);
  assert.deepEqual(validateGeneratedVideo(m({ audio: [{}] }), want), ["AUDIO_UNSUPPORTED"]);
  assert.deepEqual(validateGeneratedVideo(m({ byte_size: 40e6 }), want), ["FILE_TOO_LARGE"]);
  assert.ok(validateGeneratedVideo(m({ video: { ...m().video, width: 1280, height: 720 } }), want).includes("ASPECT_RATIO_MISMATCH"));
});

test("no platform preview, so no approval or schedule, for media that is missing or unsuitable", async () => {
  const registry = new PostgresPreviewRegistry({ pool: { connect: async () => { throw new Error("unused"); } } });
  const campaign = { tenant_id: "t", project_id: "p" };
  const item = { format: "video" }, variant = { platform: "instagram", placement: "feed" };
  const client = (row) => ({ query: async () => ({ rows: row ? [row] : [] }) });
  const run = (row, refs = [{ asset_id: "a" }]) => registry.requireSuitableMedia(client(row), campaign, item, variant, { content: { asset_refs: refs } });
  await assert.rejects(run(null, []), { code: "CONTENT_INCOMPLETE" });
  await assert.rejects(run(null), { code: "MEDIA_NOT_SUITABLE" });
  await assert.rejects(run({ media_kind: "video", mime_type: "video/mp4", width: 1, height: 1, duration_seconds: "4", byte_size: "9", status: "active" }), { code: "MEDIA_NOT_SUITABLE" });
  await assert.rejects(run({ media_kind: "video", mime_type: "video/mp4", width: 720, height: 1280, duration_seconds: "4", byte_size: "9", status: "quarantined" }), { code: "MEDIA_NOT_SUITABLE" });
  for (const patch of [{byte_size:null},{mime_type:null}]) await assert.rejects(run({ media_kind:"video",mime_type:"video/mp4",width:720,height:1280,duration_seconds:"4",byte_size:"900000",status:"active",...patch }),{code:"MEDIA_NOT_SUITABLE"});
  await run({ media_kind: "video", mime_type: "video/mp4", width: 720, height: 1280, duration_seconds: "4.000", byte_size: "900000", status: "active" });
  await registry.requireSuitableMedia(client(null), campaign, { format: "text" }, variant, { content: { asset_refs: [] } }); // text needs no media
});

// BG-API-INTEGRATION-BATCH-03: incomplete persisted/measured facts must not pass a safety gate.
test("missing MIME or invalid byte size is never reported as suitable", () => {
  const profile=profiles.get("instagram.feed.video");
  for(const byte_size of [undefined,null,NaN,0,-1,"1000000"]){
    const r=assess(profile,{...video,byte_size});assert.equal(r.suitable,false,String(byte_size));assert.ok(r.reasons.some(x=>x.code==="FILE_SIZE_UNKNOWN"));
  }
  for(const mime_type of [undefined,null,""]){const r=assess(profile,{...video,mime_type});assert.equal(r.suitable,false);assert.ok(r.reasons.some(x=>x.code==="MIME_TYPE_UNKNOWN"));}
});
test("measured status alone cannot validate a generated video with missing size or geometry", () => {
  const good={status:"measured",container:"mp4",byte_size:1000000,audio:[],video:{codec:"h264",width:720,height:1280,duration_seconds:4}};
  for(const byte_size of [undefined,null,NaN,0,-1,"1000000"])assert.ok(validateGeneratedVideo({...good,byte_size},{aspect_ratio:"9:16",duration_seconds:4}).includes("FILE_SIZE_UNKNOWN"));
  for(const patch of [{width:undefined},{height:undefined},{width:NaN},{height:2.5}])assert.ok(validateGeneratedVideo({...good,video:{...good.video,...patch}},{aspect_ratio:"9:16",duration_seconds:4}).includes("DIMENSIONS_UNSUPPORTED"));
  assert.deepEqual(validateGeneratedVideo(good,{aspect_ratio:"9:16",duration_seconds:4}),[]);
});
