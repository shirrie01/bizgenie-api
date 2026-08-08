const { compileBrandContext } = require("./contextCompiler");

function resolveBrandBrainContext({
  repository,
  projectId,
  brandId,
  generationContext = {},
  maxChars,
}) {
  if (
    !repository ||
    typeof projectId !== "string" ||
    typeof brandId !== "string" ||
    !brandId.trim()
  ) {
    return "";
  }

  const record = repository.getByProjectAndBrand(projectId, brandId);
  if (!record || record.metadata.status !== "approved") {
    return "";
  }

  return compileBrandContext(record, { generationContext, maxChars });
}

module.exports = {
  resolveBrandBrainContext,
};
