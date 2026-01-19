const express = require("express");
const { VertexAI } = require("@google-cloud/vertexai");

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

app.get("/", (_req, res) => {
  res.send("BizGenie Cloud Run is up");
});

app.get("/_admin/ping", requireAdmin, (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/generate", async (req, res) => {
  res.json({ ok: true });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Listening on", port);
});
