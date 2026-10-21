"use strict";

const { time } = require("./schema");

// Pure, conservative policy. No external provider calls, database writes or posting.
const DECISIONS = Object.freeze({
  CONTINUE: "CONTINUE",
  EXPERIMENT: "EXPERIMENT",
  REDUCE_FREQUENCY: "REDUCE_FREQUENCY",
  PAUSE: "PAUSE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});
const OBJECTIVE_METRIC = Object.freeze({ retailer_leads: "leads", qualified_retailer_enquiries: "enquiries", wholesale_enquiries: "enquiries", bookings: "conversions", sales: "sales" });
const PLATFORMS = new Set(["linkedin", "instagram", "facebook", "tiktok", "youtube", "email"]);
const text = value => typeof value === "string" && value.trim().length > 0;
// Require an explicit timezone rather than accepting machine-local dates.
const instant = value => {
  const parsed = time.safeParse(value);
  return parsed.success ? Date.parse(parsed.data) : NaN;
};
const bindingFields = ["campaign_id", "content_item_id", "variant_id", "publication_id"];

function evaluateEngagement({ tenant_id, project_id, brand_id, objective, observations = [], posts = [], window, as_of } = {}) {
  const fail = (reason_codes, evidence_ids = []) => ({
    decision: DECISIONS.INSUFFICIENT_DATA, objective: objective || "unspecified",
    reason_codes, evidence_ids, coverage: { status: "incomplete" },
    recommended_test: "Gather comparable exposure and outcome observations before changing cadence.",
    requires_customer_review: true,
  });
  if (![tenant_id, project_id, brand_id].every(text)) return fail(["MISSING_SCOPE"]);
  if (!Array.isArray(observations) || !Array.isArray(posts)) return fail(["INVALID_INPUT"]);
  const scoped = row => row && row.tenant_id === tenant_id && row.project_id === project_id && row.brand_id === brand_id;
  if (!observations.every(scoped) || !posts.every(scoped)) return fail(["SCOPE_MISMATCH"]);
  const expectedMetric = Object.hasOwn(OBJECTIVE_METRIC, objective) ? OBJECTIVE_METRIC[objective] : null;
  if (!expectedMetric) return fail(["UNSUPPORTED_OBJECTIVE"]);
  const from = instant(window?.from), to = instant(window?.to), now = instant(as_of);
  // No implicit lookback, freshness threshold or current wall clock.
  if (![from, to, now].every(Number.isFinite) || from >= to || to > now) return fail(["INVALID_WINDOW"]);
  const inWindow = time => time >= from && time < to;
  const publications = new Map();
  for (const post of posts) {
    if (!bindingFields.every(field => text(post[field])) || !PLATFORMS.has(post.platform) ||
        !text(post.placement) || !text(post.destination_key) || !text(post.revision_id) || !text(post.approval_id) ||
        !Number.isFinite(instant(post.published_at)) || instant(post.published_at) > now ||
        post.evidence_kind !== "customer_attestation" || post.attested_published !== true) {
      return fail(["INVALID_PUBLICATION_METADATA"]);
    }
    if (publications.has(post.publication_id)) return fail(["DUPLICATE_PUBLICATION"]);
    publications.set(post.publication_id, post);
  }
  const byPost = new Map(), seenIds = new Set(), snapshots = new Map();
  for (const row of observations) {
    if (!text(row.measurement_id) || seenIds.has(row.measurement_id)) return fail(["INVALID_MEASUREMENT_ID"]);
    seenIds.add(row.measurement_id);
    const observed = instant(row.observed_at), recorded = instant(row.recorded_at);
    if (![observed, recorded].every(Number.isFinite) || observed > recorded || recorded > now) return fail(["INVALID_OBSERVATION_TIME"]);
    if (!inWindow(observed)) continue;
    const post = publications.get(row.publication_id);
    if (!post) return fail(["MISSING_PUBLICATION_DATA"]);
    if (!bindingFields.every(field => row[field] === post[field]) || row.platform !== post.platform) return fail(["PUBLICATION_BINDING_MISMATCH"]);
    if (observed < instant(post.published_at)) return fail(["OBSERVATION_BEFORE_PUBLICATION"]);
    // A label alone cannot promote customer evidence into platform verification.
    if (row.evidence_kind !== "customer_attestation") return fail(["UNSUPPORTED_SOURCE"]);
    if (row.objective !== objective || post.objective !== objective) return fail(["OBJECTIVE_MISMATCH"]);
    if (!["organic", "paid"].includes(row.traffic_kind) || row.traffic_kind !== post.traffic_kind) return fail(["UNKNOWN_TRAFFIC_KIND"]);
    if (!["reach", "impressions", expectedMetric].includes(row.metric)) continue;
    const periodStart = instant(row.period_start), periodEnd = instant(row.period_end);
    if (![periodStart, periodEnd].every(Number.isFinite) || periodStart < from || periodEnd > to ||
        periodStart >= periodEnd || periodEnd > observed) return fail(["INVALID_MEASUREMENT_PERIOD"]);
    if (row.unit !== "count" || !Number.isSafeInteger(row.value) || row.value < 0 || row.value > 1e15) return fail(["INCOMPATIBLE_METRIC"]);
    const snapshotKey = JSON.stringify([post.publication_id, row.metric, observed]);
    const snapshotValue = JSON.stringify([row.value, periodStart, periodEnd]);
    if (snapshots.has(snapshotKey) && snapshots.get(snapshotKey) !== snapshotValue) return fail(["CONFLICTING_SNAPSHOTS"]);
    snapshots.set(snapshotKey, snapshotValue);
    if (!byPost.has(post.publication_id)) byPost.set(post.publication_id, { post, latest: new Map() });
    const latest = byPost.get(post.publication_id).latest;
    const prior = latest.get(row.metric);
    // Snapshot counters are cumulative; never sum observations or depend on input order.
    if (!prior || observed > instant(prior.observed_at) ||
        (observed === instant(prior.observed_at) && row.measurement_id < prior.measurement_id)) latest.set(row.metric, row);
  }
  const comparable = [];
  for (const { post, latest } of byPost.values()) {
    const exposure = latest.get("reach") || latest.get("impressions");
    if (!exposure || exposure.value <= 0) continue;
    const outcome = latest.get(expectedMetric);
    if (!outcome) return fail(["MISSING_BUSINESS_OUTCOMES"]);
    if (instant(exposure.observed_at) !== instant(outcome.observed_at) ||
        instant(exposure.period_start) !== instant(outcome.period_start) || instant(exposure.period_end) !== instant(outcome.period_end)) return fail(["STALE_SNAPSHOT"]);
    comparable.push({ post, exposure, outcome });
  }
  const evidence_ids = comparable.flatMap(row => [row.exposure.measurement_id, row.outcome.measurement_id]).sort();
  if (comparable.length < 3) return fail(["LOW_SAMPLE", "MISSING_COMPARABLE_EXPOSURE"], evidence_ids);
  const platform = comparable[0].post.platform;
  if (comparable.some(row => row.post.platform !== platform)) return fail(["MIXED_PLATFORM_DEFINITIONS"], evidence_ids);
  const definition = row => JSON.stringify([row.exposure.metric, row.post.placement, row.post.destination_key, row.post.traffic_kind, instant(row.exposure.period_start), instant(row.exposure.period_end)]);
  if (new Set(comparable.map(definition)).size !== 1) return fail(["INCOMPATIBLE_METRICS"], evidence_ids);
  if (comparable.reduce((sum, row) => sum + row.exposure.value, 0) < 300) return fail(["LOW_EXPOSURE"], evidence_ids);
  const totalActions = comparable.reduce((sum, row) => sum + row.outcome.value, 0);
  // Cadence uses only measured publications inside this window, in publication order.
  const recentPosts = comparable.map(row => row.post).filter(post => inWindow(instant(post.published_at)))
    .sort((a, b) => instant(a.published_at) - instant(b.published_at) || a.publication_id.localeCompare(b.publication_id)).slice(-5);
  const repeated = recentPosts.length === 5 && recentPosts.every(post => text(post.creative_family)) &&
    new Set(recentPosts.map(post => post.creative_family)).size === 1;
  return {
    decision: totalActions === 0 && repeated ? DECISIONS.REDUCE_FREQUENCY : DECISIONS.EXPERIMENT,
    objective,
    reason_codes: totalActions > 0 ? ["QUALIFIED_ACTIONS_REPORTED", "TEST_BEFORE_SCALING"] :
      repeated ? ["NO_REPORTED_BUSINESS_ACTIONS", "REPETITIVE_CREATIVE"] : ["NO_REPORTED_BUSINESS_ACTIONS"],
    evidence_ids, coverage: { status: "limited", comparable_posts: comparable.length, platform },
    recommended_test: totalActions > 0 ? "Test a distinct follow-up concept and measure qualified actions." :
      "Test a different hook, offer or audience before adding calendar slots.",
    requires_customer_review: true,
  };
}

module.exports = { DECISIONS, evaluateEngagement };
