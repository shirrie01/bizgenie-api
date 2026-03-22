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

Return only the finished content script body as plain text.
Do not include JSON.
Do not include commentary about the prompt.
Do not mention internal model names.
Do not mention BizGenie unless the prompt requires it.
Do not add markdown code fences.
Make the output directly usable by a brand creating social content.
If the prompt implies short-form video, include:
- Hook
- Concept
- Script
- CTA
- Caption
- Hashtags
- Filming instructions
If the prompt implies static/image content, include:
- Hook
- Concept
- Caption
- CTA
- Hashtags
Keep the output commercially useful, clear, and concise.
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
      compiled_prompt,
    } = req.body;

    if (!execution_id || !user_id || !project_id || !compiled_prompt) {
      return res.status(400).json({
        status: "failed",
        error: "Missing required fields",
      });
    }

    const script_body = await generateScriptWithVertex(compiled_prompt);

    return res.status(200).json({
      status: "completed",
      execution_id,
      script_body,
    });
  } catch (err) {
    console.error("generate-script error:", {
      message: err.message,
      stack: err.stack,
      execution_id: req.body?.execution_id || null,
    });

    return res.status(500).json({
      status: "failed",
      error: "Internal execution error",
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Listening on", port);
});
