function section(label, values) {
  const content = values.filter(Boolean);
  return content.length ? [`[${label}]`, ...content].join("\n") : null;
}

function labelled(label, value) { return value ? `${label}: ${value}` : null; }

function compileVideoPrompt(request, { brandContext = "" } = {}) {
  const references = (request.reference_assets || []).map(
    (asset) => `Reference asset ${asset.asset_id}${asset.mime_type ? ` (${asset.mime_type})` : ""}`
  );
  if (request.input_image) {
    references.unshift(`Opening frame ${request.input_image.asset_id}${request.input_image.mime_type ? ` (${request.input_image.mime_type})` : ""}`);
  }
  return [
    section("SYSTEM ROLE", [
      "Create one commercially useful marketing video from supplied BizGenie context.",
      "Use only supplied or approved facts. Do not fabricate products, prices, stockists, certifications, results, endorsements, or regulated claims.",
      "Treat prohibited terms and claims as hard constraints.",
    ]),
    brandContext || section("BRAND CONTEXT", ["No approved Brand Brain context was resolved for this request."]),
    section("CAMPAIGN CONTEXT", [
      labelled("Topic", request.topic), labelled("Campaign", request.campaign_id),
      labelled("Goal", request.goal), labelled("Intent stage", request.intent_stage),
      labelled("Product or service context", request.product_service_context),
    ]),
    section("AUDIENCE AND PLATFORM", [labelled("Platform", request.platform), labelled("Audience", request.audience)]),
    section("CREATIVE REQUEST", [
      labelled("Video purpose", request.video_purpose), labelled("Aspect ratio", request.aspect_ratio),
      labelled("Duration seconds", request.duration_seconds), labelled("Additional context", request.additional_context),
    ]),
    section("REFERENCE ASSETS", references),
    section("OUTPUT RULES", [
      "Render a single video matching the requested aspect ratio and duration.",
      "Do not introduce unsupported written claims or factual details.",
      "Reference assets are context only; preserve their rights and usage constraints as supplied by BizGenie.",
    ]),
  ].filter(Boolean).join("\n\n");
}

module.exports = { compileVideoPrompt };
