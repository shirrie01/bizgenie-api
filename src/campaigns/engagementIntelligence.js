"use strict";

// Pure, conservative policy. No external provider calls, database writes or posting.
const DECISIONS = Object.freeze({
  CONTINUE: "CONTINUE",
  EXPERIMENT: "EXPERIMENT",
  REDUCE_FREQUENCY: "REDUCE_FREQUENCY",
  PAUSE: "PAUSE",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});
const ALLOWED_SOURCES = new Set(["customer_attestation", "platform_verified"]);
const VALID_METRICS = new Set(["reach", "impressions", "clicks", "enquiries", "leads", "conversions", "sales"]);
const BUSINESS_METRICS = new Set(["enquiries", "leads", "conversions", "sales"]);
const OBJECTIVE_METRIC = Object.freeze({ retailer_leads: "leads", qualified_retailer_enquiries: "enquiries", wholesale_enquiries: "enquiries", bookings: "conversions", sales: "sales", awareness: "reach" });

function evaluateEngagement({ tenant_id, project_id, brand_id, objective, observations = [], posts = [] } = {}) {
  const fail = (reason_codes, evidence_ids = []) => ({
    decision: DECISIONS.INSUFFICIENT_DATA, objective: objective || "unspecified",
    reason_codes, evidence_ids, coverage: { status: "incomplete" },
    recommended_test: "Gather comparable exposure and outcome observations before changing cadence.",
    requires_customer_review: true,
  });
  if (![tenant_id, project_id, brand_id].every(x => typeof x === "string" && x.length)) return fail(["MISSING_SCOPE"]);
  if (!Array.isArray(observations) || !Array.isArray(posts)) return fail(["INVALID_INPUT"]);
  // Strict fail-closed scope: mixed-tenant input must never contribute evidence.
  if (observations.some(x => !x || x.tenant_id !== tenant_id || x.project_id !== project_id || x.brand_id !== brand_id)) return fail(["SCOPE_MISMATCH"]);
  if (posts.some(x => !x || x.tenant_id !== tenant_id || x.project_id !== project_id || x.brand_id !== brand_id)) return fail(["SCOPE_MISMATCH"]);
  const expectedMetric = OBJECTIVE_METRIC[objective];
  // Until objective-to-outcome mapping is verified, refuse a cadence conclusion.
  if (!expectedMetric || expectedMetric === "reach") return fail(["UNSUPPORTED_OBJECTIVE"]);
  const valid = observations.filter(x => ALLOWED_SOURCES.has(x.evidence_kind) && VALID_METRICS.has(x.metric) &&
    Number.isFinite(x.value) && x.value >= 0 && typeof x.campaign_id === "string" &&
    typeof x.platform === "string" && typeof x.observed_at === "string" &&
    !Number.isNaN(Date.parse(x.observed_at)) && typeof x.measurement_id === "string");
  const byPost = new Map();
  for (const x of valid) {
    const key = [x.campaign_id, x.platform, x.publication_id || x.content_item_id || ""].join("|");
    if (!byPost.has(key)) byPost.set(key, []);
    byPost.get(key).push(x);
  }
  const comparable = [];
  for (const [key, rows] of byPost) {
    // Never sum snapshot metrics: latest observations may be cumulative.
    const latest = new Map();
    for (const row of rows) {
      const prior = latest.get(row.metric);
      if (!prior || Date.parse(row.observed_at) > Date.parse(prior.observed_at)) latest.set(row.metric, row);
    }
    const exposure = latest.get("reach") || latest.get("impressions");
    if (!exposure || exposure.value <= 0) continue;
    const outcomes = [...latest.values()].filter(x => x.metric === expectedMetric);
    comparable.push({ key, exposure: exposure.value, outcomes, ids: [...latest.values()].map(x => x.measurement_id), platform: rows[0].platform });
  }
  const evidence_ids = [...new Set(comparable.flatMap(x => x.ids))];
  if (comparable.length < 3) return fail(["LOW_SAMPLE", "MISSING_COMPARABLE_EXPOSURE"], evidence_ids);
  const platforms = new Set(comparable.map(x => x.platform));
  if (platforms.size !== 1) return fail(["MIXED_PLATFORM_DEFINITIONS"], evidence_ids);
  const withOutcomes = comparable.filter(x => x.outcomes.length > 0);
  if (withOutcomes.length < 3) return fail(["MISSING_BUSINESS_OUTCOMES"], evidence_ids);
  // Minimum observed exposure is a guardrail, not a statistical significance claim.
  if (comparable.reduce((sum, x) => sum + x.exposure, 0) < 300) return fail(["LOW_EXPOSURE"], evidence_ids);
  const totalActions = withOutcomes.reduce((sum, x) => sum + x.outcomes.reduce((n, y) => n + y.value, 0), 0);
  const recentPosts = posts.filter(x => x.platform === [...platforms][0] && typeof x.creative_family === "string");
  const repeated = recentPosts.length >= 5 && new Set(recentPosts.slice(-5).map(x => x.creative_family)).size === 1;
  const decision = totalActions > 0 ? DECISIONS.EXPERIMENT : repeated ? DECISIONS.REDUCE_FREQUENCY : DECISIONS.EXPERIMENT;
  return {
    decision, objective: objective || "unspecified",
    reason_codes: totalActions > 0 ? ["QUALIFIED_ACTIONS_REPORTED", "TEST_BEFORE_SCALING"] :
      repeated ? ["NO_REPORTED_BUSINESS_ACTIONS", "REPETITIVE_CREATIVE"] : ["NO_REPORTED_BUSINESS_ACTIONS"],
    evidence_ids, coverage: { status: "limited", comparable_posts: comparable.length, platform: [...platforms][0] },
    recommended_test: totalActions > 0 ? "Test a distinct follow-up concept and measure qualified actions." :
      "Test a different hook, offer or audience before adding calendar slots.",
    requires_customer_review: true,
  };
}

module.exports = { DECISIONS, evaluateEngagement };
