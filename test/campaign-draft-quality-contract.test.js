"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../src/campaigns/generation.js"),
  "utf8"
);

test("draft instructions include section-specific originality guidance", () => {
  const draft = source.slice(
    source.indexOf('structuredMode: "strategy",'),
    source.indexOf('structuredMode: "draft",')
  );

  assert.match(draft, /Hook: open with a concrete audience situation/);
  assert.match(draft, /CTA: request one specific, realistic next action/);
  assert.match(draft, /Caption: explain why the selected strategy matters/);
  assert.match(draft, /independently original/);
  assert.match(draft, /preserving exact approved claims/);
});

test("B2B guidance prohibits unsupported commercial claims", () => {
  assert.match(source, /never invent margins, prices, distribution coverage/);
  assert.match(source, /performance figures, testimonials, or availability/);
});

test("draft contract retains one draft provider invocation", () => {
  const stageB = source.slice(
    source.indexOf("// Stage B:"),
    source.indexOf("const generation = {", source.indexOf("// Stage B:"))
  );

  assert.equal(
    (stageB.match(/await this\.scriptGenerator\(/g) || []).length,
    1
  );
  assert.match(stageB, /structuredMode: "draft"/);
});
