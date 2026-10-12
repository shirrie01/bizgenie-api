const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { planRecommendation } = require("../src/campaigns/recommendationStrategy");

describe("Issue #178 cross-category recommendation strategy", () => {
  it("plans targeted Fairway retail trade acquisition without invented results", () => {
    const plan = planRecommendation("Acquire independent convenience retailers in Greater Manchester to enquire about trade accounts");
    assert.equal(plan.kind, "trade");
    assert.match(plan.summary, /independent convenience retailers in Greater Manchester/);
    assert.match(plan.explanation, /qualified trade lead.*approved account.*first order/);
    assert.match(plan.explanation, /LinkedIn.*not assumed/);
    assert.match(plan.gaps, /minimum order/);
    assert.doesNotMatch(plan.summary + plan.explanation, /guaranteed|30% conversion|£10 per lead/i);
  });
  it("keeps clinic appointment journey distinct from trade acquisition", () => {
    const plan = planRecommendation("Grow appointments for a laser aesthetics clinic and hydrofacial treatments");
    assert.equal(plan.kind, "clinic");
    assert.match(plan.summary, /appointment enquiries/);
    assert.match(plan.explanation, /suitability assessment.*confirmed booking/);
    assert.match(plan.gaps, /practitioner credentials/);
    assert.doesNotMatch(JSON.stringify(plan), /stockist|wholesale|trade account/i);
  });
  it("does not hallucinate geography or assert an offer for unspecified goals", () => {
    const plan = planRecommendation("Increase enquiries from local retailers");
    assert.equal(plan.kind, "trade");
    assert.doesNotMatch(plan.summary, /Greater Manchester|Birmingham/);
    assert.match(plan.gaps, /trade terms/);
  });
});
