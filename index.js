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
