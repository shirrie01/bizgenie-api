const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  BRAND_CONTEXT_PLACEHOLDER,
  compilePrompt,
} = require("../src/prompts/compiler");

const ALL_OPTIONS = Object.freeze({
  appName: "BizGenie",
  platform: "instagram",
  scriptType: "problemSolution",
  audience: "b2b",
  intent: "cold",
  voice: "professional",
  userContext: "Explain how a planning workflow saves time.",
});

function position(prompt, label) {
  const index = prompt.indexOf("[" + label + "]");
  assert.notEqual(index, -1, label + " should be present");
  return index;
}

describe("prompt compiler", () => {
  it("assembles sections in the required order", () => {
    const prompt = compilePrompt(ALL_OPTIONS);
    const labels = [
      "SYSTEM ROLE",
      "PLATFORM RULES",
      "SCRIPT TYPE RULES",
      "AUDIENCE RULES",
      "INTENT RULES",
      "VOICE RULES",
      "BRAND CONTEXT",
      "USER CONTEXT",
      "QUALITY RULES",
      "OUTPUT CONTRACT",
    ];

    const positions = labels.map((label) => position(prompt, label));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  it("selects every supported platform", () => {
    assert.match(compilePrompt({ platform: "instagram" }), /Instagram Reels/);
    assert.match(compilePrompt({ platform: "LinkedIn" }), /LinkedIn feed/);
    assert.match(compilePrompt({ platform: "tiktok" }), /native TikTok/);
  });

  it("selects every supported script type", () => {
    assert.match(
      compilePrompt({ scriptType: "problem_solution" }),
      /recognisable problem/
    );
    assert.match(compilePrompt({ scriptType: "comparison" }), /alternatives/);
    assert.match(compilePrompt({ scriptType: "ugc" }), /first-person creator/);
  });

  it("selects every supported audience", () => {
    assert.match(compilePrompt({ audience: "B2B" }), /business outcome/);
    assert.match(compilePrompt({ audience: "consumer" }), /individual/);
  });

  it("selects every supported voice", () => {
    assert.match(compilePrompt({ voice: "professional" }), /polished/);
    assert.match(compilePrompt({ voice: "bold" }), /decisive/);
    assert.match(compilePrompt({ voice: "friendly" }), /warm/);
  });

  it("selects every supported intent", () => {
    assert.match(compilePrompt({ intent: "cold" }), /no prior relationship/);
    assert.match(compilePrompt({ intent: "awareness" }), /recognition/);
    assert.match(compilePrompt({ intent: "customer" }), /existing customer/);
    assert.match(compilePrompt({ intent: "loyalty" }), /engaged customer/);
  });

  it("omits unselected optional rule sections", () => {
    const prompt = compilePrompt({ userContext: "Keep this context." });

    assert.doesNotMatch(prompt, /\[PLATFORM RULES\]/);
    assert.doesNotMatch(prompt, /\[SCRIPT TYPE RULES\]/);
    assert.doesNotMatch(prompt, /\[AUDIENCE RULES\]/);
    assert.doesNotMatch(prompt, /\[INTENT RULES\]/);
    assert.doesNotMatch(prompt, /\[VOICE RULES\]/);
    assert.match(prompt, /Keep this context\./);
  });

  it("ignores unknown option values without injecting unsupported rules", () => {
    const prompt = compilePrompt({
      platform: "unknown-platform",
      scriptType: "unknown-script",
      audience: "unknown-audience",
      intent: "unknown-intent",
      voice: "unknown-voice",
    });

    assert.doesNotMatch(prompt, /\[PLATFORM RULES\]/);
    assert.doesNotMatch(prompt, /\[SCRIPT TYPE RULES\]/);
    assert.doesNotMatch(prompt, /\[AUDIENCE RULES\]/);
    assert.doesNotMatch(prompt, /\[INTENT RULES\]/);
    assert.doesNotMatch(prompt, /\[VOICE RULES\]/);
    assert.doesNotMatch(prompt, /unknown-/);
  });

  it("keeps Brand Brain as a documented placeholder only", () => {
    const prompt = compilePrompt(ALL_OPTIONS);
    for (const line of BRAND_CONTEXT_PLACEHOLDER) {
      assert.match(prompt, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("replaces the placeholder with resolved Brand Brain context", () => {
    const brandContext = [
      "[BRAND BRAIN]",
      "",
      "Brand:\nBizGenie",
    ].join("\n");
    const prompt = compilePrompt({ ...ALL_OPTIONS, brandContext });

    assert.match(prompt, /\[BRAND BRAIN\]\n\nBrand:\nBizGenie/);
    assert.doesNotMatch(prompt, /Brand context is not available/);
    assert.ok(
      position(prompt, "VOICE RULES") < position(prompt, "BRAND BRAIN")
    );
    assert.ok(
      position(prompt, "BRAND BRAIN") < position(prompt, "USER CONTEXT")
    );
  });

  it("returns byte-for-byte deterministic output", () => {
    assert.equal(compilePrompt(ALL_OPTIONS), compilePrompt({ ...ALL_OPTIONS }));
  });
});
