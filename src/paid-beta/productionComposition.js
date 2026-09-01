const { loadPaidBetaCaptureConfig } = require("./config");
const { PostgresPaidBetaRepository } = require("./postgresRepository");
const { PaidBetaCaptureService } = require("./service");

async function createPaidBetaProductionComposition({
  pool,
  env = process.env,
  now = () => new Date(),
} = {}) {
  const config = loadPaidBetaCaptureConfig({ env });
  if (!config.enabled) {
    return Object.freeze({ enabled: false, repository: null, service: null });
  }
  const repository = new PostgresPaidBetaRepository({ pool });
  await repository.initialize();
  return Object.freeze({
    enabled: true,
    config,
    repository,
    service: new PaidBetaCaptureService({ repository, config, now }),
  });
}

module.exports = { createPaidBetaProductionComposition };
