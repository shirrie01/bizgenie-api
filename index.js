const express = require("express");

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

    // Basic validation (v1, minimal)
    if (!user_id || !platform || !content_type || !topic) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // TEMP: eligibility stub (always true for now)
    const eligible = true;
    if (!eligible) {
      return res.status(403).json({ error: "Action not permitted" });
    }

    // TEMP: fake AI output (we replace this next)
    const script = `Here is a ${platform} script about ${topic}, written in a ${tone || "neutral"} tone.`;

    // TEMP: execution ID
    const execution_id = `exec_${Date.now()}`;

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

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Listening on", port);
});
