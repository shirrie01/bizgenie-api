const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  validateFinalDraftStrategyFidelity,
} = require("../src/campaigns/generation");

const source = "Help local teams coordinate their weekly field visits and plan customer appointments.";
const context = {
  campaign: { goal: source },
  brandContext: "",
  selected_strategy: { evidence_anchors: [] },
};

function draft(hook, cta, caption) {
  return [
    `Hook: ${hook}`,
    "Concept: A practical field sales planning story.",
    "Script: Show a team planning its next route.",
    `CTA: ${cta}`,
    `Caption: ${caption}`,
    "Hashtags: #FieldSales",
    "Filming instructions: Show a team mapping customer visits.",
  ].join("\n");
}

describe("privacy-safe originality diagnostics", () => {
  const original = "Give every customer visit a clear place in tomorrow's route.";

  for (const section of ["hook", "cta", "caption"]) {
    it(`identifies copied wording in ${section}`, () => {
      const copied = source;
      const result = validateFinalDraftStrategyFidelity(
        draft(
          section === "hook" ? copied : original,
          section === "cta" ? copied : original,
          section === "caption" ? copied : original
        ),
        context
      );

      assert.equal(result.ok, false);
      assert.deepEqual(result.diagnostics.map(d => d.section), [section]);
      assert.equal(result.diagnostics[0].rule, "segment_overlap");
      assert.equal(result.diagnostics[0].overlap_ratio, 1);
      assert.ok(result.diagnostics[0].shared_trigrams >= 2);
      assert.equal(
        JSON.stringify(result.diagnostics).includes(source),
        false
      );
    });
  }

  it("does not flag original buyer-facing language", () => {
    const result = validateFinalDraftStrategyFidelity(
      draft(
        "Give field reps a clearer start to Monday.",
        "Explore a better way to organise your next route.",
        "Less time wondering where to go next."
      ),
      context
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  });
});
