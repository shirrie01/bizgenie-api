const errors = require("./errors");
const schema = require("./schema");
const repository = require("./repository");
const postgres = require("./postgresRepository");
const previewRegistry = require("./previewRegistry");
const goalRecommendation = require("./goalRecommendation");
const router = require("./router");

module.exports = { ...errors, ...schema, ...repository, ...postgres, ...previewRegistry, ...goalRecommendation, ...router };
