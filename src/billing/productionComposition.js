const { GenerationBillingOrchestrator, UnconfiguredGenerationBillingOrchestrator } = require("../generation-billing");
const { BillingConfigurationError } = require("./errors");
const { PostgresBillingRepository } = require("./postgresRepository");
const { qualifiesForBoundedPostDebitRefund } = require("./refundPolicy");
const { executionClass, identifier } = require("./schema");
const { BillingService } = require("./service");

function configuredList(env, name, schema) {
  const raw = env[name];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new BillingConfigurationError(`${name} is required`);
  }
  const values = [...new Set(raw.split(",").map((value) => value.trim()))];
  if (values.some((value) => !value)) {
    throw new BillingConfigurationError(`${name} is invalid`);
  }
  try {
    return values.map((value) => schema.parse(value));
  } catch {
    throw new BillingConfigurationError(`${name} is invalid`);
  }
}

async function createPostgresBillingProductionComposition({
  pool,
  env = process.env,
  now = () => new Date(),
  logger = console,
} = {}) {
  const activation = env.BILLING_DURABLE_ENABLED;
  if (activation === undefined || activation === "" || activation === "false") {
    return Object.freeze({
      enabled: false,
      billingRepository: null,
      billingService: null,
      generationBillingOrchestrator:
        new UnconfiguredGenerationBillingOrchestrator(),
    });
  }
  if (activation !== "true") {
    throw new BillingConfigurationError(
      "BILLING_DURABLE_ENABLED must be true or false"
    );
  }

  const approvedPolicyIds = configuredList(
    env,
    "BILLING_APPROVED_POLICY_IDS",
    identifier
  );
  const requiredExecutionClasses = configuredList(
    env,
    "BILLING_APPROVED_EXECUTION_CLASSES",
    executionClass
  );
  const billingRepository = new PostgresBillingRepository({ pool, now });
  await billingRepository.initialize({
    approvedPolicyIds,
    requiredExecutionClasses,
  });
  const billingService = new BillingService({
    repository: billingRepository,
    now,
  });
  const generationBillingOrchestrator = new GenerationBillingOrchestrator({
    billingService,
    qualifiesForRefund: qualifiesForBoundedPostDebitRefund,
    logger,
  });
  return Object.freeze({
    enabled: true,
    billingRepository,
    billingService,
    generationBillingOrchestrator,
  });
}

module.exports = { createPostgresBillingProductionComposition };
