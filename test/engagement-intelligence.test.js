"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateEngagement, DECISIONS } = require("../src/campaigns/engagementIntelligence");
const scope = { tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", objective: "retailer_leads" };
function sample({ actions = 0, exposures = 200, platform = "instagram", n = 3 } = {}) {
  return Array.from({ length: n }, (_, i) => [
    { ...scope, campaign_id: "campaign-" + i, publication_id: "post-" + i, platform, metric: "reach", value: exposures, evidence_kind: "customer_attestation", observed_at: "2026-10-20T12:00:00Z", measurement_id: "reach-" + i },
    { ...scope, campaign_id: "campaign-" + i, publication_id: "post-" + i, platform, metric: "leads", value: actions, evidence_kind: "customer_attestation", observed_at: "2026-10-20T12:00:00Z", measurement_id: "lead-" + i },
  ]).flat();
}
test("missing evidence does not invent performance", () => {
  assert.equal(evaluateEngagement({ ...scope }).decision, DECISIONS.INSUFFICIENT_DATA);
});
test("seven posts without measurable exposure cannot justify cadence changes", () => {
  const posts = Array.from({ length: 7 }, (_, i) => ({ ...scope, platform: "instagram", creative_family: "same", id: i }));
  assert.equal(evaluateEngagement({ ...scope, posts }).decision, DECISIONS.INSUFFICIENT_DATA);
});
test("repeated creative and comparable zero lead observations recommends reduction not volume", () => {
  const posts = Array.from({ length: 7 }, (_, i) => ({ ...scope, platform: "instagram", creative_family: "same", id: i }));
  const result = evaluateEngagement({ ...scope, observations: sample(), posts });
  assert.equal(result.decision, DECISIONS.REDUCE_FREQUENCY);
  assert.equal(result.requires_customer_review, true);
});
test("strong qualified action still recommends controlled experiment", () => {
  assert.equal(evaluateEngagement({ ...scope, observations: sample({ actions: 4 }) }).decision, DECISIONS.EXPERIMENT);
});
test("zero reach is insufficient, not a failed campaign", () => {
  assert.equal(evaluateEngagement({ ...scope, observations: sample({ exposures: 0 }) }).decision, DECISIONS.INSUFFICIENT_DATA);
});
test("low exposure is insufficient", () => {
  assert.equal(evaluateEngagement({ ...scope, observations: sample({ exposures: 3 }) }).decision, DECISIONS.INSUFFICIENT_DATA);
});
test("mixed tenant evidence is rejected entirely", () => {
  const observations = sample(); observations[0].tenant_id = "tenant-b";
  assert.deepEqual(evaluateEngagement({ ...scope, observations }).reason_codes, ["SCOPE_MISMATCH"]);
});
test("unverified simulations cannot influence recommendations", () => {
  const observations = sample().map(x => ({ ...x, evidence_kind: "simulation" }));
  assert.equal(evaluateEngagement({ ...scope, observations }).decision, DECISIONS.INSUFFICIENT_DATA);
});
test("cross-platform metrics are not directly compared", () => {
  const observations = sample(); observations[0].platform = "facebook"; observations[1].platform = "facebook";
  assert.equal(evaluateEngagement({ ...scope, observations }).decision, DECISIONS.INSUFFICIENT_DATA);
});
test("missing outcomes cannot be silently interpreted as zero", () => {
  const observations = sample().filter(x => x.metric === "reach");
  assert.deepEqual(evaluateEngagement({ ...scope, observations }).reason_codes, ["MISSING_BUSINESS_OUTCOMES"]);
});
