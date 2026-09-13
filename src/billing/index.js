const errors = require("./errors");
const {
  BillingRepository,
  InMemoryBillingRepository,
  hashIntent,
} = require("./repository");
const schema = require("./schema");
const stripe = require("./stripe");
const refundPolicy = require("./refundPolicy");
const { BillingService } = require("./service");
const postgres = require("./postgresRepository");
const composition = require("./productionComposition");
const paidBetaProvisioning = require("./paidBetaProvisioning");
const paidBetaLaunchProof = require("./paidBetaLaunchProofRouter");

module.exports = {
  ...errors,
  ...schema,
  ...stripe,
  ...refundPolicy,
  ...postgres,
  ...composition,
  ...paidBetaProvisioning,
  ...paidBetaLaunchProof,
  BillingRepository,
  BillingService,
  InMemoryBillingRepository,
  hashIntent,
};
