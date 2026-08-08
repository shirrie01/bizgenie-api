const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");
const {
  InMemoryBrandBrainRepository,
} = require("../src/brand-brain");
const { generateScriptWithVertex } = require("../src/generation");
const { createApp } = require("../index");

const ADMIN_KEY = "brand-brain-generation-test-key";
const COMPLETE_OUTPUT = [
  "Hook: Stop scrolling and make planning work for you.",
  "Concept: Show a simple plan becoming a finished post.",
  "Script: Start with one clear goal, choose the next action, and publish consistently.",
  "CTA: Try the planning workflow today.",
  "Caption: A practical plan turns ideas into progress.",
  "Hashtags: #Planning #Content #SmallBusiness",
  "Filming instructions:",
  "- Open on a close-up of the written plan.",
].join("\n");

function record() {
  return {
    brand_id: "brand_001",
    project_id: "project_001",
    name: "Sensitive Brand Name",
    identity: {
      positioning: "A confidential market position.",
    },
    voice: {
      tone: "Confident and precise.",
      prohibited_terms: ["magic button"],
    },
    commercial: {
      prohibited_claims: ["Guaranteed revenue"],
    },
    metadata: {
      version: 1,
      status: "approved",
      created_at: "2026-08-08T09:00:00.000Z",
      updated_at: "2026-08-08T09:00:00.000Z",
    },
  };
}

function validRequest(overrides = {}) {
  return {
    execution_id: "execution_001",
    user_id: "user_001",
    project_id: "project_001",
    compiled_prompt: "Explain how a planning workflow saves time.",
    ...overrides,
  };
}

function providerResponse() {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: COMPLETE_OUTPUT }] },
      },
    ],
  };
}

function appWithCapturedPrompt(repository, capture, logger) {
  class FakeVertexAI {
    getGenerativeModel() {
      return {
        async generateContent(body) {
          capture.value = body.contents[0].parts[0].text;
          return { response: providerResponse() };
        },
      };
    }
  }

  return createApp({
    brandBrainRepository: repository,
    scriptGenerator: (userContext, options) =>
      generateScriptWithVertex(userContext, {
        ...options,
        projectId: "test-project",
        modelName: "gemini-test",
        VertexAIClient: FakeVertexAI,
      }),
    logger,
  });
}

function admin(client) {
  return client.set("x-admin-key", ADMIN_KEY);
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("Brand Brain generation integration", () => {
  it("preserves the existing prompt when brand_id is absent", async () => {
    const capture = {};
    const response = await admin(
      request(
        appWithCapturedPrompt(
          new InMemoryBrandBrainRepository(),
          capture,
          { info() {}, warn() {}, error() {} }
        )
      )
        .post("/generate-script")
        .send(validRequest())
    );

    assert.equal(response.status, 200);
    assert.match(capture.value, /\[BRAND CONTEXT\]/);
    assert.doesNotMatch(capture.value, /\[BRAND BRAIN\]/);
  });

  it("preserves existing behaviour for an unknown brand_id", async () => {
    const capture = {};
    const response = await admin(
      request(
        appWithCapturedPrompt(
          new InMemoryBrandBrainRepository(),
          capture,
          { info() {}, warn() {}, error() {} }
        )
      )
        .post("/generate-script")
        .send(validRequest({ brand_id: "brand_missing" }))
    );

    assert.equal(response.status, 200);
    assert.match(capture.value, /\[BRAND CONTEXT\]/);
    assert.doesNotMatch(capture.value, /Sensitive Brand Name/);
  });

  it("injects the owning approved brand alongside every structured module and user prompt", async () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    const capture = {};
    const response = await admin(
      request(
        appWithCapturedPrompt(repository, capture, {
          info() {},
          warn() {},
          error() {},
        })
      )
        .post("/generate-script")
        .send(
          validRequest({
            brand_id: "brand_001",
            platform: "LinkedIn",
            script_type: "Problem Solution",
            audience: "B2B",
            intent_stage: "Cold",
            voice_style: "Professional",
          })
        )
    );

    assert.equal(response.status, 200);
    const labels = [
      "[PLATFORM RULES]",
      "[SCRIPT TYPE RULES]",
      "[AUDIENCE RULES]",
      "[INTENT RULES]",
      "[VOICE RULES]",
      "[BRAND BRAIN]",
      "[USER CONTEXT]",
    ];
    const positions = labels.map((label) => capture.value.indexOf(label));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    assert.match(capture.value, /Sensitive Brand Name/);
    assert.match(capture.value, /Explain how a planning workflow saves time\./);
  });

  it("does not inject a Brand Brain across project boundaries", async () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    const capture = {};
    const response = await admin(
      request(
        appWithCapturedPrompt(repository, capture, {
          info() {},
          warn() {},
          error() {},
        })
      )
        .post("/generate-script")
        .send(
          validRequest({
            project_id: "project_002",
            brand_id: "brand_001",
          })
        )
    );

    assert.equal(response.status, 200);
    assert.doesNotMatch(capture.value, /Sensitive Brand Name/);
    assert.doesNotMatch(capture.value, /confidential market position/);
  });

  it("does not write Brand Brain content to completion or error logs", async () => {
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert(record());
    const events = [];
    const logger = {
      info(message, details) {
        events.push({ message, details });
      },
      warn(message, details) {
        events.push({ message, details });
      },
      error(message, details) {
        events.push({ message, details });
      },
    };
    const capture = {};

    await admin(
      request(appWithCapturedPrompt(repository, capture, logger))
        .post("/generate-script")
        .send(validRequest({ brand_id: "brand_001" }))
    );

    const failingApp = createApp({
      brandBrainRepository: repository,
      scriptGenerator: async () => {
        throw new Error("provider failure");
      },
      logger,
    });
    await admin(
      request(failingApp)
        .post("/generate-script")
        .send(validRequest({ brand_id: "brand_001" }))
    );

    const logs = JSON.stringify(events);
    assert.doesNotMatch(logs, /Sensitive Brand Name/);
    assert.doesNotMatch(logs, /confidential market position/);
    assert.doesNotMatch(logs, /magic button|Guaranteed revenue/);
    assert.doesNotMatch(logs, /Explain how a planning workflow saves time/);
  });
});
