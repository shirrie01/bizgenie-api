console.log("🚀 BizGenie API booting");

const express = require("express");
const app = express();

app.use(express.json());

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  const providedKey = req.header("x-admin-key");

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

// health check
app.get("/", (_req, res) => {
  res.send("BizGenie Cloud Run is up");
});

// admin ping
app.get("/_admin/ping", requireAdmin, (_req, res) => {
  res.json({ status: "ok" });
});

// ✅ generate-script MUST come AFTER app is defined
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
        error: "Missing required fields"
      });
    }

    const script_body = `EXECUTION OK
Execution ID: ${execution_id}
User: ${user_id}
Project: ${project_id}

Prompt:
${compiled_prompt}`;

    return res.json({
      status: "completed",
      execution_id,
      script_body
    });

  } catch (err) {
    console.error("generate-script error:", err);
    return res.status(500).json({
      status: "failed",
      error: "Internal execution error"
    });
  }
});

// 🚨 listen MUST be last
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Listening on", port);
});
