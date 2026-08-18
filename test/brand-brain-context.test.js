const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  InMemoryBrandBrainRepository,
  compileBrandContext,
  resolveBrandBrainContext,
} = require("../src/brand-brain");

function record(overrides = {}) {
  return {
    brand_id: "brand_001",
    project_id: "project_001",
    name: "BizGenie",
    identity: {
      positioning: "AI Brand Operating System for ambitious businesses.",
    },
    voice: {
      tone: "Confident, intelligent, and commercially sharp.",
      preferred_terms: ["Brand Brain"],
      prohibited_terms: ["magic button"],
    },
    audience: {
      summary: "Founder-led ecommerce businesses.",
      goals: ["Publish better content consistently"],
    },
    commercial: {
      differentiators: ["Persistent approved context"],
      primary_cta: "Build your Brand Brain.",
      approved_claims: ["Uses approved brand context"],
      prohibited_claims: ["Guaranteed revenue"],
    },
    competitors: {
      names: ["Example competitor"],
      notes: "Avoid unsupported comparisons.",
    },
    visual: {
      colours: ["Midnight blue"],
      photography_style: "Natural workplace photography.",
    },
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-08-08T09:00:00.000Z",
      updated_at: "2026-08-08T09:00:00.000Z",
    },
    ...overrides,
  };
}

function position(context, label) {
  const index = context.indexOf(label);
  assert.notEqual(index, -1, `${label} should be present`);
  return index;
}

describe("Brand Brain context compiler", () => {
  it("produces byte-for-byte deterministic output and omits metadata", () => {
    const first = compileBrandContext(record());
    const second = compileBrandContext(structuredClone(record()));
    assert.equal(first, second);
    assert.doesNotMatch(first, /created_at|updated_at|version/);
  });

  it("omits empty sections and preserves meaningful ordering", () => {
    const context = compileBrandContext(
      record({
        identity: { positioning: "Clear positioning." },
        voice: undefined,
        audience: undefined,
        commercial: undefined,
        competitors: undefined,
        visual: undefined,
      })
    );

    assert.match(context, /^\[BRAND BRAIN\]/);
    assert.ok(position(context, "Brand:") < position(context, "Positioning:"));
    assert.doesNotMatch(context, /Tone:|Audience:|Approved claims:/);
  });

  it("keeps preferred, prohibited, approved, and prohibited claims distinct", () => {
    const context = compileBrandContext(record());
    const labels = [
      "Preferred terms:",
      "Do not say:",
      "Approved claims:",
      "Prohibited claims:",
    ];
    const positions = labels.map((label) => position(context, label));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  it("stays within budget by dropping low-priority sections whole", () => {
    const context = compileBrandContext(record(), { maxChars: 250 });
    assert.ok(context.length <= 250);
    assert.match(context, /Do not say:\n- magic button/);
    assert.match(context, /Prohibited claims:\n- Guaranteed revenue/);
    assert.doesNotMatch(context, /Competitor notes/);
  });

  it("includes visual context only for a relevant generation", () => {
    assert.doesNotMatch(compileBrandContext(record()), /Brand colours/);
    assert.match(
      compileBrandContext(record(), {
        generationContext: { platform: "instagram" },
      }),
      /Brand colours:\n- Midnight blue/
    );
    assert.match(
      compileBrandContext(record(), {
        generationContext: { mediaType: "image" },
      }),
      /Brand colours:\n- Midnight blue/
    );
  });
});

describe("Brand Brain context resolver", () => {
  it("returns no context for absent or unknown brand IDs", async () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    assert.equal(
      await resolveBrandBrainContext({ repository, projectId: "project_001" }),
      ""
    );
    assert.equal(
      await resolveBrandBrainContext({
        repository,
        projectId: "project_001",
        brandId: "brand_missing",
      }),
      ""
    );
  });

  it("resolves approved context only for the owning project", async () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    assert.match(
      await resolveBrandBrainContext({
        repository,
        projectId: "project_001",
        brandId: "brand_001",
      }),
      /\[BRAND BRAIN\]/
    );
    assert.equal(
      await resolveBrandBrainContext({
        repository,
        projectId: "project_002",
        brandId: "brand_001",
      }),
      ""
    );
  });

  it("does not resolve draft or archived records", async () => {
    for (const status of ["draft", "archived"]) {
      const repository = new InMemoryBrandBrainRepository();
      repository.upsert(
        record({ metadata: { ...record().metadata, status } })
      );
      assert.equal(
        await resolveBrandBrainContext({
          repository,
          projectId: "project_001",
          brandId: "brand_001",
        }),
        ""
      );
    }
  });
});
