const express = require("express");
const { VertexAI } = require("@google-cloud/vertexai");

const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
  location: "europe-west1"
});

const model = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash"
});

const executionLogs = [];

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("BizGenie Cloud Run is up");
});

app.post("/generate", async (req, res) => {
  try {
    const {
      user_id,
      platform,
      content_type,
      topic,
      tone,
      constraints
    } = req.body;

    if (!user_id || !platform || !content_type || !topic) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const prompt = `
Platform: ${platform}
Content type: ${content_type}
Topic: ${topic}
Tone: ${tone || "neutral"}

Write a natural, human-sounding spoken script.
Open with a strong hook.
Short sentences.
No emojis.
No hashtags.
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
      status: "success",
      created_at: new Date().toISOString()
    });

    return res.json({
      execution_id,
      output: { script },
      meta: {
        platform,
        content_type
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
});

app.get("/_admin/logs", (_req, res) => {
  res.json(executionLogs);
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Listening on", port);
});
