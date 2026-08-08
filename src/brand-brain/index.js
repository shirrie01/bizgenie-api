const {
  DEFAULT_BRAND_CONTEXT_MAX_CHARS,
  compileBrandContext,
} = require("./contextCompiler");
const { resolveBrandBrainContext } = require("./contextResolver");
const {
  BrandBrainRepository,
  InMemoryBrandBrainRepository,
} = require("./repository");
const { createBrandBrainRouter } = require("./router");
const {
  PostgresBrandBrainRepository,
  createPostgresBrandBrainRepositoryFromEnv,
} = require("./postgresRepository");
const schemas = require("./schema");

module.exports = {
  BrandBrainRepository,
  DEFAULT_BRAND_CONTEXT_MAX_CHARS,
  InMemoryBrandBrainRepository,
  PostgresBrandBrainRepository,
  compileBrandContext,
  createBrandBrainRouter,
  createPostgresBrandBrainRepositoryFromEnv,
  resolveBrandBrainContext,
  ...schemas,
};
