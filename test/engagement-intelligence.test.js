"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateEngagement, DECISIONS } = require("../src/campaigns/engagementIntelligence");
const scope = { tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", objective: "retailer_leads" };
function sample({ actions = 0, exposures = 200, n = 3 } = {}) {
  const posts = Array.from({ length: n }, (_, i) => ({
    ...scope, campaign_id: "campaign-" + i, content_item_id: "item-" + i, variant_id: "variant-" + i,
    publication_id: "post-" + i, revision_id: "revision-" + i, approval_id: "approval-" + i, platform: "instagram", placement: "feed",
    destination_key: "destination-a", published_at: `2026-10-19T0${i}:00:00Z`,
    evidence_kind: "customer_attestation", attested_published: true, creative_family: "same", traffic_kind: "organic",
  }));
  const observations = posts.flatMap(post => ["reach", "leads"].map(metric => ({
    ...post, metric, value: metric === "reach" ? exposures : actions, unit: "count",
    observed_at: "2026-10-20T12:00:00Z", recorded_at: "2026-10-20T13:00:00Z", measurement_id: metric + "-" + post.publication_id,
    period_start: "2026-10-19T00:00:00Z", period_end: "2026-10-20T11:00:00Z",
  })));
  return { ...scope, observations, posts, window: { from: "2026-10-19T00:00:00Z", to: "2026-10-22T00:00:00Z" }, as_of: "2026-10-22T00:00:00Z" };
}
function insufficient(input, reason) {
  const result = evaluateEngagement(input);
  assert.equal(result.decision, DECISIONS.INSUFFICIENT_DATA);
  assert.equal(result.requires_customer_review, true);
  if (reason) assert.ok(result.reason_codes.includes(reason), JSON.stringify(result));
  return result;
}
test("missing evidence and unmeasured posts cannot justify cadence changes", () => {
  insufficient({ ...scope });
  insufficient({ ...sample({ n: 7 }), observations: [] }, "LOW_SAMPLE");
});
test("five measured repetitive publications with zero actions recommend customer-reviewed reduction", () => {
  const result = evaluateEngagement(sample({ n: 5 }));
  assert.equal(result.decision, DECISIONS.REDUCE_FREQUENCY);
  assert.equal(result.requires_customer_review, true);
});
test("qualified actions still recommend controlled experiment, never scaling", () => {
  assert.equal(evaluateEngagement(sample({ actions: 4 })).decision, DECISIONS.EXPERIMENT);
});
test("zero and low exposure remain insufficient", () => {
  insufficient(sample({ exposures: 0 }), "LOW_SAMPLE");
  insufficient(sample({ exposures: 3 }), "LOW_EXPOSURE");
});
for (const source of ["observations", "posts"]) {
  for (const field of ["tenant_id", "project_id", "brand_id"]) {
    test(`${source} cannot cross ${field} even with identical publication IDs`, () => {
      const input = sample(); input[source][0][field] = "other";
      const result = insufficient(input, "SCOPE_MISMATCH");
      assert.deepEqual(result.evidence_ids, []);
    });
  }
}
for (const evidence_kind of ["simulation", "platform_verified", undefined]) {
  test(`source ${evidence_kind} cannot be promoted to trusted customer evidence`, () => {
    const input = sample(); input.observations[0].evidence_kind = evidence_kind;
    insufficient(input, "UNSUPPORTED_SOURCE");
  });
}
test("mixed platforms are not aggregated", () => {
  const input = sample(); input.posts[0].platform = "facebook";
  input.observations.slice(0, 2).forEach(row => { row.platform = "facebook"; });
  insufficient(input, "MIXED_PLATFORM_DEFINITIONS");
});
test("missing outcomes and vanity clicks cannot become zero qualified leads", () => {
  const input = sample(); input.observations = input.observations.filter(row => row.metric === "reach");
  insufficient(input, "MISSING_BUSINESS_OUTCOMES");
  const clicks = sample(); clicks.observations.filter(row => row.metric === "leads").forEach(row => { row.metric = "clicks"; });
  insufficient(clicks, "MISSING_BUSINESS_OUTCOMES");
});
for (const objective of ["unknown_goal", "awareness", "toString", "__proto__"]) {
  test(`unsupported objective ${objective} fails closed`, () => insufficient({ ...sample(), objective }, "UNSUPPORTED_OBJECTIVE"));
}
test("objective mismatch is rejected in observations and publication context", () => {
  for (const field of ["observations", "posts"]) {
    const input = sample(); input[field][0].objective = "sales";
    insufficient(input, "OBJECTIVE_MISMATCH");
  }
});
test("unknown objective mapping cannot be inferred from registry rows", () => {
  const input = sample(); delete input.observations[0].objective;
  insufficient(input, "OBJECTIVE_MISMATCH");
});
test("explicit ordered window and as-of are mandatory", () => {
  for (const patch of [
    { window: undefined }, { as_of: undefined },
    { window: { from: "2026-10-22T00:00:00Z", to: "2026-10-19T00:00:00Z" } },
    { as_of: "2026-10-21T00:00:00Z" },
    { window: { from: "2026-10-19", to: "2026-10-22T00:00:00Z" } },
  ]) insufficient({ ...sample(), ...patch }, "INVALID_WINDOW");
});
test("old snapshots outside the half-open window contribute no evidence", () => {
  const input = sample(); input.window.from = "2026-10-21T00:00:00Z";
  assert.deepEqual(insufficient(input, "LOW_SAMPLE").evidence_ids, []);
  const boundary = sample(); boundary.window.to = "2026-10-20T12:00:00Z";
  assert.deepEqual(insufficient(boundary, "LOW_SAMPLE").evidence_ids, []);
});
test("stale denominators cannot be paired with newer outcomes", () => {
  const input = sample(); input.observations[0].observed_at = "2026-10-20T11:00:00Z";
  insufficient(input, "STALE_SNAPSHOT");
});
test("future observations, future collections and reversed collection order fail closed", () => {
  for (const patch of [
    { observed_at: "2026-10-23T00:00:00Z" },
    { recorded_at: "2026-10-23T00:00:00Z" },
    { recorded_at: "2026-10-20T11:00:00Z" },
  ]) { const input = sample(); Object.assign(input.observations[0], patch); insufficient(input, "INVALID_OBSERVATION_TIME"); }
});
test("latest snapshots replace old counts and only selected evidence IDs are returned", () => {
  const input = sample({ n: 5 });
  const older = input.observations.map(row => ({ ...row, measurement_id: "old-" + row.measurement_id, observed_at: "2026-10-20T11:00:00Z", value: row.metric === "leads" ? 99 : 100 }));
  input.observations.push(...older);
  const result = evaluateEngagement(input);
  assert.equal(result.decision, DECISIONS.REDUCE_FREQUENCY);
  assert.equal(result.evidence_ids.length, 10);
  assert.ok(result.evidence_ids.every(id => !id.startsWith("old-")));
  assert.deepEqual(evaluateEngagement({ ...input, observations: [...input.observations].reverse(), posts: [...input.posts].reverse() }), result);
});
test("equal-time contradictory snapshots fail closed instead of selecting by input order", () => {
  const input = sample(); input.observations.push({ ...input.observations[0], measurement_id: "conflict", value: 999 });
  insufficient(input, "CONFLICTING_SNAPSHOTS");
});
test("duplicate measurement or publication IDs cannot inflate sample size", () => {
  const input = sample(); input.observations.push({ ...input.observations[0] });
  insufficient(input, "INVALID_MEASUREMENT_ID");
  const duplicate = sample(); duplicate.posts.push({ ...duplicate.posts[0] });
  insufficient(duplicate, "DUPLICATE_PUBLICATION");
});
for (const field of ["campaign_id", "content_item_id", "variant_id", "platform"]) {
  test(`publication join must match ${field}`, () => {
    const input = sample(); input.observations[0][field] = "other";
    insufficient(input, "PUBLICATION_BINDING_MISMATCH");
  });
}
test("missing publication ID never falls back to content item or campaign grouping", () => {
  const input = sample(); delete input.observations[0].publication_id;
  insufficient(input, "MISSING_PUBLICATION_DATA");
  insufficient({ ...sample(), posts: [] }, "MISSING_PUBLICATION_DATA");
});
for (const field of ["published_at", "revision_id", "approval_id", "placement", "destination_key", "attested_published"]) {
  test(`missing publication ${field} fails closed`, () => {
    const input = sample(); delete input.posts[0][field];
    insufficient(input, "INVALID_PUBLICATION_METADATA");
  });
}
test("corrected publication time after observation invalidates that evidence", () => {
  const input = sample(); input.posts[0].published_at = "2026-10-20T12:30:00Z";
  insufficient(input, "OBSERVATION_BEFORE_PUBLICATION");
});
for (const patch of [{ unit: "percent" }, { unit: undefined }, { value: "200" }, { value: -1 }, { value: NaN }, { value: 0.5 }]) {
  test(`invalid metric count ${JSON.stringify(patch)} cannot influence decisions`, () => {
    const input = sample(); Object.assign(input.observations[0], patch); insufficient(input, "INCOMPATIBLE_METRIC");
  });
}
test("reach and impression denominators cannot be combined", () => {
  const input = sample(); input.observations[0].metric = "impressions";
  insufficient(input, "INCOMPATIBLE_METRICS");
});
for (const field of ["destination_key", "placement", "traffic_kind"]) {
  test(`mixed ${field} cannot be aggregated`, () => {
    const input = sample(); input.posts[0][field] = field === "traffic_kind" ? "paid" : "different";
    if (field === "traffic_kind") input.observations.slice(0, 2).forEach(row => { row.traffic_kind = "paid"; });
    insufficient(input, "INCOMPATIBLE_METRICS");
  });
}
test("missing organic/paid provenance is unknown", () => {
  const input = sample(); delete input.observations[0].traffic_kind;
  insufficient(input, "UNKNOWN_TRAFFIC_KIND");
});
test("missing, future or mismatched measurement intervals cannot be compared", () => {
  for (const patch of [{ period_start: undefined }, { period_end: "2026-10-20T13:00:00Z" }]) {
    const input = sample(); Object.assign(input.observations[0], patch); insufficient(input, "INVALID_MEASUREMENT_PERIOD");
  }
  const input = sample(); input.observations[0].period_start = "2026-10-19T01:00:00Z";
  insufficient(input, "STALE_SNAPSHOT");
  const different = sample(); different.observations.slice(0, 2).forEach(row => { row.period_start = "2026-10-19T01:00:00Z"; });
  insufficient(different, "INCOMPATIBLE_METRICS");
});
test("unmeasured repetitive posts and missing creative classification cannot trigger reduction", () => {
  const input = sample(); input.posts.push(...sample({ n: 5 }).posts.map(post => ({ ...post, publication_id: "unmeasured-" + post.publication_id })));
  assert.equal(evaluateEngagement(input).decision, DECISIONS.EXPERIMENT);
  const missing = sample({ n: 5 }); delete missing.posts[0].creative_family;
  assert.equal(evaluateEngagement(missing).decision, DECISIONS.EXPERIMENT);
});
test("equivalent timezone offsets preserve comparisons and evaluation never mutates input", () => {
  const input = sample(); input.observations[0].observed_at = "2026-10-20T13:00:00+01:00";
  const before = structuredClone(input);
  assert.equal(evaluateEngagement(input).decision, DECISIONS.EXPERIMENT);
  assert.deepEqual(input, before);
});
test("conflicting older snapshots and equal-time period changes fail regardless of ordering", () => {
  const input = sample();
  input.observations.push(...[1, 2].map(value => ({ ...input.observations[0], measurement_id: `older-${value}`, observed_at: "2026-10-20T11:00:00Z", value })));
  insufficient(input, "CONFLICTING_SNAPSHOTS");
  insufficient({ ...input, observations: [...input.observations].reverse() }, "CONFLICTING_SNAPSHOTS");
  const period = sample(); period.observations.push({ ...period.observations[0], measurement_id: "other-period", period_start: "2026-10-19T01:00:00Z" });
  insufficient(period, "CONFLICTING_SNAPSHOTS");
});
test("invalid calendar dates cannot be normalised into valid evidence", () => {
  const input = sample(); input.observations[0].observed_at = "2026-02-30T12:00:00Z";
  insufficient(input, "INVALID_OBSERVATION_TIME");
});
test("old repetitive publications cannot justify changing current-window cadence", () => {
  const input = sample({ n: 5 }); input.posts.forEach(post => { post.published_at = "2026-10-18T00:00:00Z"; });
  assert.equal(evaluateEngagement(input).decision, DECISIONS.EXPERIMENT);
});
test("repetition uses the latest five publication times, never caller array order", () => {
  const input = sample({ n: 6 }); input.posts[0].creative_family = "older-different";
  assert.equal(evaluateEngagement(input).decision, DECISIONS.REDUCE_FREQUENCY);
  assert.deepEqual(evaluateEngagement({ ...input, posts: [...input.posts].reverse() }), evaluateEngagement(input));
  input.posts[5].creative_family = "latest-different";
  assert.equal(evaluateEngagement(input).decision, DECISIONS.EXPERIMENT);
});
