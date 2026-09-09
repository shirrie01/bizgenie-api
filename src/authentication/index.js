const boundary = require("./customerGenerationBoundary");
const billingTenantResolver = require("./customerBillingTenantResolver");
const scopeProvisioner = require("./customerScopeProvisioner");
const videoStatusBoundary = require("./customerVideoStatusBoundary");
const tokenVerifier = require("./tokenVerifier");

module.exports = {
  ...boundary,
  ...billingTenantResolver,
  ...scopeProvisioner,
  ...videoStatusBoundary,
  ...tokenVerifier,
};
