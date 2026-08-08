const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { BrandBrainSchema } = require("../src/brand-brain");

const metadata = Object.freeze({
  version: 1,
  status: "approved",
  created_at: "2026-08-08T09:00:00.000Z",
  updated_at: "2026-08-08T09:00:00.000Z",
});

function partialBrand(overrides = {}) {
  return {
    brand_id: "brand_001",
    project_id: "project_001",
    name: "BizGenie",
    metadata,
    ...overrides,
  };
}

describe("Brand Brain schema", () => {
  it("accepts a valid partial Brand Brain", () => {
    const value = partialBrand({
      identity: { positioning: "An AI Brand Operating System." },
    });
    assert.deepEqual(BrandBrainSchema.parse(value), value);
  });

  it("accepts the complete V1 structure", () => {
    const value = partialBrand({
      identity: {
        description: "Persistent brand intelligence for growing businesses.",
        mission: "Make excellent brand execution accessible.",
        vision: "Every growing company operates with a trusted Company Brain.",
        values: ["Clarity", "Commercial usefulness"],
        positioning: "AI Brand Operating System for ambitious businesses.",
      },
      voice: {
        tone: "Confident and intelligent.",
        writing_style: "Clear, concise British English.",
        personality: "Commercially sharp and helpful.",
        preferred_terms: ["Brand Brain"],
        prohibited_terms: ["magic button"],
      },
      audience: {
        summary: "Founder-led ecommerce businesses.",
        pain_points: ["Inconsistent content"],
        goals: ["Publish confidently"],
        objections: ["AI sounds generic"],
        buying_triggers: ["A launch deadline"],
      },
      commercial: {
        differentiators: ["Persistent approved context"],
        primary_cta: "Build your Brand Brain.",
        approved_claims: ["Uses approved brand context"],
        prohibited_claims: ["Guaranteed revenue"],
      },
      competitors: {
        names: ["Example competitor"],
        notes: "Do not make unsupported comparative claims.",
      },
      visual: {
        colours: ["Midnight blue"],
        fonts: ["Inter"],
        photography_style: "Natural founder-led workplace photography.",
      },
    });

    assert.deepEqual(BrandBrainSchema.parse(value), value);
  });

  it("rejects invalid identifiers and metadata", () => {
    assert.equal(
      BrandBrainSchema.safeParse(partialBrand({ brand_id: "bad id" })).success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(
        partialBrand({ metadata: { ...metadata, version: 0 } })
      ).success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(
        partialBrand({ metadata: { ...metadata, status: "published" } })
      ).success,
      false
    );
  });

  it("rejects invalid or unknown structures", () => {
    assert.equal(
      BrandBrainSchema.safeParse(partialBrand({ voice: [] })).success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(
        partialBrand({ audience: { summary: ["not text"] } })
      ).success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(partialBrand({ arbitrary: true })).success,
      false
    );
  });

  it("rejects oversized names, arrays, prose, and governance items", () => {
    assert.equal(
      BrandBrainSchema.safeParse(partialBrand({ name: "x".repeat(201) }))
        .success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(
        partialBrand({ identity: { description: "x".repeat(2001) } })
      ).success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(
        partialBrand({ identity: { values: Array(21).fill("value") } })
      ).success,
      false
    );
    assert.equal(
      BrandBrainSchema.safeParse(
        partialBrand({ voice: { prohibited_terms: ["x".repeat(201)] } })
      ).success,
      false
    );
  });
});
