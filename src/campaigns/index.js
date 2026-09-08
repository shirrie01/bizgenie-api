const errors = require("./errors");
const schema = require("./schema");
const repository = require("./repository");
const postgres = require("./postgresRepository");
const router = require("./router");

module.exports = { ...errors, ...schema, ...repository, ...postgres, ...router };
