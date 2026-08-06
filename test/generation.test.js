const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");
const { brandingConfig } = require("../src/config/branding");
const { compilePrompt } = require("../src/prompts/compiler");
const {
  GENERATION_CONFIG,
  GENERATION_INCOMPLETE_MESSAGE,
  GenerationIncompleteError,
  REQUIRED_SECTIONS,
  generateScriptWithVertex,
  validateGenerationResponse,
} = require("../src/generation");
const { createApp } = require("../index");

const ADMIN_KEY = "generation-completion-test-key";

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

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

function providerResponse({
  text = COMPLETE_OUTPUT,
  parts,
  finishReason = "STOP",
  usageMetadata = {
    promptTokenCount: 800,
    candidatesTokenCount: 220,
    totalTokenCount: 1020,
  },
} = {}) {
  return {
    candidates: [
      {
        index: 0,
        finishReason,
        content: {
          role: "model",
          parts: parts || [{ text }],
        },
      },
    ],
    usageMetadata,
  };
}

function validRequest(compiledPrompt = "Create a concise video script") {
  return {
    execution_id: "execution_001",
    user_id: "user_001",
    project_id: "project_001",
    compiled_prompt: compiledPrompt,
  };
}

function admin(client) {
  return client.set("x-admin-key", ADMIN_KEY);
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("generation response completion validation", () => {
  it("accepts a complete response and normalises safe completion metadata", () => {
    const result = validateGenerationResponse(providerResponse(), {
      model: "gemini-test",
    });

    assert.equal(result.text, COMPLETE_OUTPUT);
    assert.deepEqual(result.metadata, {
      provider: "vertex-ai",
      model: "gemini-test",
      finish_reason: "STOP",
      prompt_block_reason: null,
      prompt_token_count: 800,
      output_token_count: 220,
      total_token_count: 1020,
      required_sections_complete: true,
      incomplete_reason: null,
    });
  });

  it("rejects a max-token stop even when every required section is present", () => {
    assert.throws(
      () =>
        validateGenerationResponse(
          providerResponse({ finishReason: "MAX_TOKENS" })
        ),
      (error) => {
        assert.ok(error instanceof GenerationIncompleteError);
        assert.deepEqual(error.details, {
          finish_reason: "MAX_TOKENS",
          missing_sections: [],
          retryable: true,
        });
        assert.equal(error.metadata.incomplete_reason, "TOKEN_EXHAUSTION");
        return true;
      }
    );
  });

  it("rejects output that is missing required sections", () => {
    const partial = [
      "Hook: Make planning simpler.",
      "Concept: Demonstrate one useful workflow.",
      "Script: We connect planning",
    ].join("\n");

    assert.throws(
      () => validateGenerationResponse(providerResponse({ text: partial })),
      (error) => {
        assert.deepEqual(error.details.missing_sections, [
          "CTA",
          "Caption",
          "Hashtags",
          "Filming instructions",
        ]);
        assert.equal(error.metadata.incomplete_reason, "MISSING_SECTIONS");
        return true;
      }
    );
  });

  it("rejects an empty candidate list and empty candidate text", async (t) => {
    await t.test("empty candidate list", () => {
      assert.throws(
        () => validateGenerationResponse({ candidates: [] }),
        (error) => {
          assert.equal(error.details.finish_reason, null);
          assert.deepEqual(error.details.missing_sections, REQUIRED_SECTIONS);
          assert.equal(error.metadata.incomplete_reason, "EMPTY_OUTPUT");
          return true;
        }
      );
    });

    await t.test("empty candidate text", () => {
      assert.throws(
        () => validateGenerationResponse(providerResponse({ text: "" })),
        (error) => {
          assert.deepEqual(error.details.missing_sections, REQUIRED_SECTIONS);
          assert.equal(error.metadata.incomplete_reason, "EMPTY_OUTPUT");
          return true;
        }
      );
    });
  });

  it("assembles every text part in the selected candidate", () => {
    const splitAt = COMPLETE_OUTPUT.indexOf("Script:") + 12;
    const result = validateGenerationResponse(
      providerResponse({
        parts: [
          { text: COMPLETE_OUTPUT.slice(0, splitAt) },
          { text: COMPLETE_OUTPUT.slice(splitAt) },
        ],
      })
    );

    assert.equal(result.text, COMPLETE_OUTPUT);
  });
});

describe("Vertex generation configuration", () => {
  it("uses the bounded generation settings and validates the mocked response", async () => {
    let clientOptions;
    let modelOptions;
    let requestBody;

    class FakeVertexAI {
      constructor(options) {
        clientOptions = options;
      }

      getGenerativeModel(options) {
        modelOptions = options;
        return {
          async generateContent(body) {
            requestBody = body;
            return { response: providerResponse() };
          },
        };
      }
    }

    const result = await generateScriptWithVertex("enriched prompt", {
      branding: brandingConfig,
      projectId: "test-project",
      location: "europe-west1",
      modelName: "gemini-test",
      VertexAIClient: FakeVertexAI,
    });

    assert.deepEqual(clientOptions, {
      project: "test-project",
      location: "europe-west1",
    });
    assert.deepEqual(modelOptions.generationConfig, GENERATION_CONFIG);
    assert.equal(modelOptions.model, "gemini-test");
    assert.equal(
      modelOptions.systemInstruction.parts[0].text,
      "You are BizGenie Phase 1 script generation engine."
    );
    const expectedPrompt = compilePrompt({
      appName: brandingConfig.appName,
      userContext: "enriched prompt",
    });
    assert.deepEqual(requestBody, {
      contents: [
        {
          role: "user",
          parts: [{ text: expectedPrompt }],
        },
      ],
    });
    assert.equal(result.text, COMPLETE_OUTPUT);
  });
});

describe("generate-script completion contract", () => {
  it("preserves authentication and validation before invoking the provider", async () => {
    let calls = 0;
    const app = createApp({
      scriptGenerator: async () => {
        calls += 1;
        throw new Error("provider should not be called");
      },
      logger: silentLogger,
    });

    const unauthorised = await request(app)
      .post("/generate-script")
      .send(validRequest());
    assert.equal(unauthorised.status, 403);
    assert.deepEqual(unauthorised.body, { error: "Forbidden" });

    const invalid = await admin(
      request(app).post("/generate-script").send({})
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body, {
      status: "failed",
      error: "Missing required fields",
      script_body: "",
    });
    assert.equal(calls, 0);
  });

  it("handles a long enriched prompt with a deterministic mocked output", async () => {
    const longPrompt = "Detailed audience and business context. ".repeat(500);
    let receivedPrompt;
    const app = createApp({
      scriptGenerator: async (compiledPrompt) => {
        receivedPrompt = compiledPrompt;
        return validateGenerationResponse(providerResponse());
      },
      logger: silentLogger,
    });

    const response = await admin(
      request(app).post("/generate-script").send(validRequest(longPrompt))
    );

    assert.equal(response.status, 200);
    assert.equal(receivedPrompt, longPrompt);
    assert.deepEqual(response.body, {
      status: "completed",
      execution_id: "execution_001",
      script_body: COMPLETE_OUTPUT,
    });
  });

  it("returns the stable incomplete error and never returns partial text as success", async () => {
    const partial = [
      "Hook: Make planning simpler.",
      "Concept: Demonstrate one useful workflow.",
      "Script: We connect planning",
    ].join("\n");
    const app = createApp({
      scriptGenerator: async () =>
        validateGenerationResponse(
          providerResponse({ text: partial, finishReason: "MAX_TOKENS" })
        ),
      logger: silentLogger,
    });

    const response = await admin(
      request(app).post("/generate-script").send(validRequest())
    );

    assert.equal(response.status, 502);
    assert.deepEqual(response.body, {
      status: "failed",
      error: {
        code: "GENERATION_INCOMPLETE",
        message: GENERATION_INCOMPLETE_MESSAGE,
        details: {
          finish_reason: "MAX_TOKENS",
          missing_sections: [
            "CTA",
            "Caption",
            "Hashtags",
            "Filming instructions",
          ],
          retryable: true,
        },
      },
      script_body: "",
    });
    assert.doesNotMatch(JSON.stringify(response.body), /We connect planning/);
  });
});
