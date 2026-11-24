"use strict";
// Deterministic launch-week content plan (BG-FOUNDER-E2E-FINAL-01).
//
// Connects Brand Brain + the saved campaign to the existing content-item / quote / review / schedule contracts.
// Read-only and provider-free: no model, network, credit or ledger access. Every sentence is built from the
// caller's own Brand Brain fields; anything the Brand Brain does not supply is listed in `assumptions_to_confirm`
// instead of being invented (no product claims, testimonials, certifications, retailers or nutritional claims).
const CONTRACT = "content-plan.v1";
const PACK = "launch-week-7d.v1";

// Destinations that have an ACTIVE trusted preview profile (seed migrations 20260908100000 + 20261031120000).
// Instagram feed video is deliberately absent: it has no provisionable profile.
const PREVIEW_TUPLES = Object.freeze({
  text: ["instagram.feed", "facebook.feed", "linkedin.feed", "email.message"],
  image: ["instagram.feed", "facebook.feed", "linkedin.feed"],
  video: ["facebook.feed", "linkedin.feed", "tiktok.feed"],
});
const CLASS_BY_FORMAT = Object.freeze({ text: "text.standard", image: "image.normal", video: "video.normal" });
const LABEL = Object.freeze({ instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", email: "Email" });

// day, purpose, audience lane, destination and format. `scheduled` false = campaign asset, not a post.
const ARC = Object.freeze([
  { key: "key-visual", day: null, post: false, theme: "Campaign key visual", lane: "both", platform: "instagram", placement: "feed", format: "image", at: null },
  { key: "d1", day: 1, post: true, theme: "Meet the brand", lane: "consumer", platform: "instagram", placement: "feed", format: "image", at: "09:00" },
  { key: "d2", day: 2, post: true, theme: "Flavour in motion", lane: "consumer", platform: "tiktok", placement: "feed", format: "video", at: "12:00" },
  { key: "d3", day: 3, post: true, theme: "Retailer enquiry: stock the brand", lane: "trade", platform: "linkedin", placement: "feed", format: "image", at: "08:30" },
  { key: "d4", day: 4, post: true, theme: "Why this brand: value and positioning", lane: "both", platform: "facebook", placement: "feed", format: "video", at: "11:00" },
  { key: "d5", day: 5, post: true, theme: "Product spotlight", lane: "consumer", platform: "instagram", placement: "feed", format: "image", at: "09:00" },
  { key: "d6", day: 6, post: true, theme: "For retailers: how to enquire", lane: "trade", platform: "linkedin", placement: "feed", format: "video", at: "08:30" },
  { key: "d7", day: 7, post: true, theme: "Week recap: try it or stock it", lane: "both", platform: "facebook", placement: "feed", format: "image", at: "10:00" },
]);

function offsetMinutes(timeZone, utcMillis) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset", hour: "2-digit" }).formatToParts(new Date(utcMillis));
  const raw = (parts.find((part) => part.type === "timeZoneName") || {}).value || "GMT";
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(raw);
  if (!match) throw new Error("INVALID_TIMEZONE");
  return match[1] ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : 0;
}

// Local wall-clock -> UTC. Two-pass offset resolution is exact except inside a DST gap, where the plan is shifted one hour later.
function slot(timeZone, dateIso, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = dateIso.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, m, 0);
  let offset = offsetMinutes(timeZone, wall);
  let utc = wall - offset * 60000;
  const second = offsetMinutes(timeZone, utc);
  if (second !== offset) { offset = second; utc = wall - offset * 60000; }
  const local = new Date(wall).toISOString().slice(0, 23); // YYYY-MM-DDTHH:mm:ss.sss, the exact schedule-command contract
  return { timezone: timeZone, local_datetime: local, utc_offset_minutes: offset, scheduled_for: new Date(utc).toISOString() };
}

function addDays(dateIso, days) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const clean = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const list = (value) => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []);
const clip = (value, max) => (value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`);
const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campaign";


// Strict calendar date: the string must round-trip through a real UTC date, so 2026-02-30 or 2026-13-45 are rejected, never rolled forward.
function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function buildContentPlan({ campaign, brandBrain, startDate }) {
  if (!campaign || typeof campaign !== "object" || !campaign.campaign_id) throw new Error("PLAN_CAMPAIGN_REQUIRED");
  if (!brandBrain || typeof brandBrain !== "object" || !clean(brandBrain.name)) throw new Error("PLAN_BRAND_BRAIN_REQUIRED");
  if (!isRealDate(startDate)) throw new Error("PLAN_START_DATE_INVALID");
  const timeZone = clean(campaign.display_timezone) || "Europe/London";
  offsetMinutes(timeZone, Date.parse(`${startDate}T12:00:00Z`));

  const brand = clean(brandBrain.name);
  const identity = brandBrain.identity || {}, voice = brandBrain.voice || {}, audience = brandBrain.audience || {}, commercial = brandBrain.commercial || {}, visual = brandBrain.visual || {};
  const approvedClaims = list(commercial.approved_claims);
  const prohibited = [...list(commercial.prohibited_claims), ...list(voice.prohibited_terms)];
  const differentiators = list(commercial.differentiators);
  const description = clean(identity.description), positioning = clean(identity.positioning), audienceSummary = clean(audience.summary), tone = clean(voice.tone);
  const primaryCta = clean(commercial.primary_cta);
  const goal = clean(campaign.goal);
  const campaignSlug = slug(campaign.name || brand);

  const assumptions = [];
  if (!approvedClaims.length) assumptions.push("No approved product claims are in the Brand Brain: copy will describe the brand and format only (no flavour, price, nutrition, health or sugar claims).");
  if (!primaryCta) assumptions.push("No primary call to action is saved: default enquiry wording is used and must be confirmed.");
  if (!description) assumptions.push("No business description is saved: the brief names the brand only.");
  if (!visual.photography_style && !list(visual.colours).length) assumptions.push("No approved visual identity (colours, photography style) or brand image assets are saved: images and video use a neutral placeholder composition.");
  assumptions.push("Enquiry destination (form, email address or phone) must be supplied and verified before any post is published.");
  assumptions.push("Trade terms, delivery area, minimum order and pricing are not stated in any item.");

  const factsLine = approvedClaims.length ? `Approved facts you may state: ${approvedClaims.join("; ")}.` : "No approved product facts are supplied: do not state any product, ingredient, taste, price, nutrition, health or sourcing fact.";
  const fence = `Never state or imply: testimonials, ratings, certifications, retailer or distributor partnerships, awards, or any unapproved health, sugar-content, calorie or nutritional claim (only the approved facts above may be stated)${prohibited.length ? `; also avoid: ${prohibited.join("; ")}` : ""}.`;
  const contextLine = [description && `About: ${description}`, positioning && `Positioning: ${positioning}`, audienceSummary && `Audience: ${audienceSummary}`, tone && `Tone: ${tone}`, differentiators.length && `Differentiators: ${differentiators.join("; ")}`].filter(Boolean).join(" | ");

  const items = ARC.map((slotDef, index) => {
    const date = slotDef.day ? addDays(startDate, slotDef.day - 1) : null;
    const tuple = `${slotDef.platform}.${slotDef.placement}`;
    if (!PREVIEW_TUPLES[slotDef.format].includes(tuple)) throw new Error("PLAN_DESTINATION_UNSUPPORTED");
    const trade = slotDef.lane === "trade";
    const cta = trade
      ? { label: primaryCta || "Enquire about stocking", source: primaryCta ? "brand_brain" : "default_needs_confirmation" }
      : slotDef.lane === "consumer"
        ? { label: primaryCta || "Follow for more", source: primaryCta ? "brand_brain" : "default_needs_confirmation" }
        : { label: primaryCta || "Get in touch", source: primaryCta ? "brand_brain" : "default_needs_confirmation" };
    const shortName = `${slotDef.post ? `Day ${slotDef.day} · ` : ""}${slotDef.theme} (${LABEL[slotDef.platform]} ${slotDef.format})`;
    // Week identity: the start date is part of the saved name and of the idempotency key, so another week never collides with this one,
    // while the same week always yields the same names and keys (exact retry safety).
    const name = `Week of ${startDate} · ${shortName}`;
    // Copy for an image/video item is the draft in `initial_content` (the quote path can only generate text for text-format items;
    // it cannot attach AI text to a media item). Only the media asset is a priced generation step.
    const steps = [{ execution_class: CLASS_BY_FORMAT[slotDef.format], purpose: `${slotDef.format}_asset` }];
    const mediaBrief = [
      `${slotDef.format === "video" ? "Short vertical-safe product video" : "Single branded image"} for ${brand} on ${LABEL[slotDef.platform]}: ${slotDef.theme}.`,
      goal && `Campaign goal: ${goal}.`,
      contextLine,
      factsLine,
      "Use approved brand assets if they are supplied; otherwise a neutral placeholder composition with no invented product details.",
      fence,
    ].filter(Boolean).join(" ");
    const claimLine = approvedClaims.length ? `${approvedClaims.join(". ")}.` : "";
    const leadLine = slotDef.key === "key-visual" ? `${brand}.` : `${slotDef.theme}: ${brand}.`;
    const body = [leadLine, trade ? "For retailers, wholesalers and distributors." : "", positioning || description, claimLine, `${cta.label}.`].map((part) => clean(part)).filter(Boolean).join(" ");
    const initialContent = { title: null, body: clip(body, 4000), caption: cta.label, alt_text: clip(`Placeholder visual for ${brand}: ${slotDef.theme}`, 2000), asset_refs: [] };
    return {
      plan_item: index + 1,
      idempotency_key: `plan:${PACK}:${startDate}:${campaign.campaign_id}:${index + 1}`,
      display_name: clip(shortName, 200),
      key: slotDef.key,
      day: slotDef.day,
      is_post: slotDef.post,
      theme: slotDef.theme,
      audience_lane: slotDef.lane,
      content_item: { name: clip(name, 200), format: slotDef.format, platform: slotDef.platform, placement: slotDef.placement, destination_label: LABEL[slotDef.platform] },
      initial_content: initialContent,
      generation_steps: steps.map((step) => ({ ...step, execution_brief: clip(mediaBrief, 4000) })),
      execution_mode_options: slotDef.format === "video" ? ["ai", "hybrid"] : ["ai"],
      cta,
      schedule: slotDef.post ? slot(timeZone, date, slotDef.at) : null,
      measurement: { utm_campaign: `${campaignSlug}-wk1`, utm_source: slotDef.platform, utm_content: slotDef.post ? `day${slotDef.day}-${slotDef.format}` : "key-visual" },
    };
  });

  const countClass = (cls) => items.reduce((total, item) => total + item.generation_steps.filter((step) => step.execution_class === cls).length, 0);
  const requirements = { "text.standard": 0, "image.normal": countClass("image.normal"), "video.normal": countClass("video.normal") };
  return {
    contract_version: CONTRACT,
    pack: PACK,
    plan_id: `${PACK}:${startDate}`,
    campaign_id: campaign.campaign_id,
    start_date: startDate,
    display_timezone: timeZone,
    strategy: {
      summary: `Seven-day launch week for ${brand}`,
      goal: goal ? clip(goal, 400) : null,
      objectives: ["Generate enquiries from prospective stockists and wholesale buyers", "Build consumer awareness of the brand", "Explain what the brand offers using only approved facts"],
      week_arc: items.filter((item) => item.is_post).map((item) => ({ day: item.day, theme: item.theme, platform: item.content_item.platform, format: item.content_item.format })),
      funnel: "Awareness (days 1, 2, 5) → consideration (days 4, 7) → trade enquiry (days 3, 6, 7)",
    },
    items,
    totals: { posts: items.filter((item) => item.is_post).length, content_items: items.length, images: items.filter((item) => item.content_item.format === "image").length, videos: items.filter((item) => item.content_item.format === "video").length, text_generations: 0, copy: "template_draft_editable" },
    credit_requirements: { by_execution_class: requirements, pricing: "Prices are server-owned: multiply these counts by your plan's published execution-class prices (see credit preview). Nothing is reserved until you confirm each quote." },
    measurement_plan: {
      capture: "Customer-attested counts recorded per published post through the existing measurement route; BizGenie never invents performance.",
      metrics: [
        { metric: "impressions", use: "Awareness reach per post" },
        { metric: "clicks", use: "Click-through to the enquiry destination" },
        { metric: "enquiries", use: "Stockist or consumer enquiries received" },
        { metric: "leads", use: "Qualified trade leads after a manual check" },
        { metric: "conversions", use: "Confirmed new stockist accounts (customer-attested)" },
      ],
      attribution: "Each item carries utm_campaign/utm_source/utm_content tags; the verified enquiry destination must be supplied before publishing.",
    },
    guardrails: [fence, factsLine, "Every item starts as a draft; nothing is approved, scheduled or published until the owner reviews and confirms.", "Instagram feed video is not offered: no approved preview profile exists for it."],
    placeholders: ["Brand image assets are placeholders unless approved assets are uploaded to the Brand Brain."],
    assumptions_to_confirm: assumptions,
  };
}

module.exports = { CONTRACT, PACK, PREVIEW_TUPLES, CLASS_BY_FORMAT, buildContentPlan, isRealDate };
