const express = require("express");
const { VertexAI } = require("@google-cloud/vertexai");

const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
  location: "europe-west1"
});

const model = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash"
});

const app = express();
app.use(express.json());

const executionLogs = [];

/* ---------- PUBLIC ---------- */

app.get("/", (_req, res) => {
  res.send("BizGenie Cloud Run is up");
});

app.post("/generate", async (req, res) => {
  try {
    const { user_id, platform, content_type, topic, tone } = req.body;

    if (!user_id || !platform || !content_type || !topic) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const prompt = `
Platform: ${platform}
Content type: ${content_type}
Topic: ${topic}
Tone: ${tone || "neutral"}

Write a natural, human-sounding script.
Avoid sounding like AI.
No emojis. No hashtags.
`;

    const result = await model.generateContent(prompt);
    const script = result.response.text();

    const execution_id = `exec_${Date.now()}`;

    executionLogs.push({
      execution_id,
      user_id,
      platform,
      content_type,
      topic,
      tone,
      created_at: new Date().toISOString()
    });

    res.json({
      execution_id,
      output: { script },
      meta: { platform, content_type }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

/* ---------- ADMIN ---------- */

app.get("/_admin/ping", (_req, res) => {
  res.json({ status: "ok", service: "bizgenie-api" });
});

app.get("/_admin/logs", (_req, res) => {
  res.json(executionLogs);
});

/* ---------- START ---------- */

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
