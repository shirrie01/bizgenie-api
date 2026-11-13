// Background worker entrypoint (BG-LAUNCH-001): `node worker.js`. Builds the same production composition as the API (so it sees the same configuration and flags) and runs the
// generation and social loops. It does nothing unless a premium capability is explicitly enabled (see src/activation/premiumComposition.js). SIGTERM/SIGINT finish the
// current tick, then exit. Several instances may run at once.
const { createProductionApp } = require("./index");
const { GenerationLoop, SocialLoop } = require("./src/worker/loops");
const { WorkerRunner } = require("./src/worker/runner");

async function startWorker({ env = process.env, logger = console } = {}) {
  const production = await createProductionApp({ env, logger });
  const premium = production.premium;
  if (!premium.enabled) { logger.log?.("Worker idle: no premium capability is enabled"); return { runner: null, premium }; }
  const loops = [];
  if (premium.generationWorker) loops.push(new GenerationLoop({ quoteService: premium.generationQuoteService, worker: premium.generationWorker, logger, limit: Number(env.WORKER_BATCH_SIZE) || 5 }));
  if (premium.socialPublishingService) loops.push(new SocialLoop({ socialService: premium.socialPublishingService, logger, limit: Number(env.WORKER_BATCH_SIZE) || 5 }));
  const runner = new WorkerRunner({ loops, intervalMs: Number(env.WORKER_INTERVAL_MS) || 2000, logger });
  runner.start();
  const stop = async () => { await runner.stop(); process.exit(0); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  return { runner, premium };
}

module.exports = { startWorker };
if (require.main === module) startWorker().catch((error) => { console.error("Worker startup failed", error?.code || error?.name, error?.message); process.exitCode = 1; });
