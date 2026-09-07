const errors = require("./errors");
const schema = require("./schema");
const repository = require("./repository");
const postgres = require("./postgresRepository");

module.exports = { ...errors, ...schema, ...repository, ...postgres };
