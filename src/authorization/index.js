const errors = require("./errors");
const policy = require("./policy");
const repositories = require("./repository");
const schemas = require("./schema");
const { PostgresAuthorizationRepository } = require("./postgresRepository");
const { AuthorizationService } = require("./service");

module.exports = {
  AuthorizationService,
  PostgresAuthorizationRepository,
  ...errors,
  ...policy,
  ...repositories,
  ...schemas,
};
