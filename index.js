console.log("🚀 BizGenie API booting");

const express = require("express");
const { VertexAI } = require("@google-cloud/vertexai");

const app = express();
app.use(express.json());

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT;

const LOCATION = process.env.VERTEX_LOCATION || "europe-west1";
const MODEL_NAME = process.env.VERTEX_MODEL || "gemini-2.5-flash";

if (!PROJECT_ID) {
  console.warn("⚠️ GOOGLE_CLOUD_PROJECT is not set");
}

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  const providedKey = req.header("x-admin-key");

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

app.get("/", (_req, res) => {
  res.send("BizGenie Cloud Run is up");
});

app.get("/_admin/ping", requireAdmin, (_req, res) => {
  res.json({ status: "ok" });
});

function buildSystemInstruction() {
  return `
You are BizGenie Phase 1 script generation engine.

You MUST return a COMPLETE structured output.

STRICT RULES:
- Do NOT stop early
- ALL sections must be included
- If any section is missing, the response is invalid

Return ONLY plain text. No JSON. No markdown.

FOR SHORT-FORM VIDEO OUTPUT:
You MUST include ALL sections below:

Hook (1 sentence)
Concept (1-2 sentences)
Script (MAX 120 words)
CTA (1 line)
Caption (MAX 2 lines)
Hashtags (MAX 8 hashtags)
Filming instructions (bullet points, MAX 6 bullets)

Each section must be clearly labeled.

Keep everything concise and complete.

Do not exceed limits.
Do not truncate sections.
`.trim();
}

async function generateScriptWithVertex(compiledPrompt) {
  if (!PROJECT_ID) {
    throw new Error("Missing GOOGLE_CLOUD_PROJECT environment variable");
  }

  const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
  });

  const model = vertexAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: {
      role: "system",
      parts: [{ text: buildSystemInstruction() }],
    },
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7,
      topP: 0.9,
    },
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: compiledPrompt }],
      },
    ],
  });

  const response = result.response;
  const text = response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Vertex returned empty output");
  }

  return text;
}

app.post("/generate-script", requireAdmin, async (req, res) => {
  try {
    const {
      execution_id,
      user_id,
      project_id,
      compiled_prompt
    } = req.body;

    if (!execution_id || !user_id || !project_id || !compiled_prompt) {
      return res.status(400).json({
        status: "failed",
        error: "Missing required fields",
        script_body: ""
      });
    }

    const text = await generateScriptWithVertex(compiled_prompt);

    return res.json({
      status: "completed",
      execution_id,
      script_body: text
    });

  } catch (err) {
    console.error("generate-script error:", err);

    return res.status(500).json({
      status: "failed",
      error: "Internal execution error",
      script_body: ""
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Listening on", port);
});
