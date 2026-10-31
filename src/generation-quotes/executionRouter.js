// Routes a claimed, confirmed generation to the ONE existing adapter that owns its execution class. Composition only: it adds no behaviour of its own.
//   text.standard           -> ExistingTextGenerationAdapter  (single call; it has no stable provider identity, so an interrupted text job stays in recovery with its credits held)
//   image.* / video.* (ai)  -> ExistingCreativeServicesAdapter (image: stored result found by job id; video: submit then poll by provider operation)
//   hybrid                  -> HybridCompositionAdapter only if a real compositor was composed; otherwise OPERATION_UNSUPPORTED (nothing is called, nothing is charged)
// It exposes the execution policy the worker requires of a provider (worker.js refuses a provider that does not share it).
const { QuoteError } = require("./service");

class QuotedExecutionRouter {
  constructor({ jobs, executionPolicy, text = null, creative = null, hybrid = null }) {
    if (!jobs || typeof jobs.getById !== "function") throw new TypeError("Quoted execution router requires the generation job repository");
    if (!executionPolicy || executionPolicy.mode !== "quoted_v1") throw new TypeError("Quoted execution router requires a quoted_v1 execution policy");
    Object.assign(this, { jobs, executionPolicy, text, creative, hybrid });
  }

  adapterFor(executionClass, request) {
    if (request?.execution_mode === "hybrid") return this.hybrid;
    if (executionClass === "text.standard") return this.text;
    if (/^(image|video)\./.test(executionClass || "")) return this.creative;
    return null;
  }

  async submit(args) {
    const adapter = this.adapterFor(args?.request?.execution_class, args?.request);
    if (!adapter) throw new QuoteError("OPERATION_UNSUPPORTED", 422);
    return adapter.submit(args);
  }

  async reconcile(args) {
    const job = await this.jobs.getById(args?.idempotency_key);
    if (!job) return { status: "unknown" };
    const stored = await this.jobs.getExecutionContent(args.idempotency_key); // the frozen request decides (a hybrid video is not an AI video)
    const adapter = this.adapterFor(job.execution_class, stored?.request);
    if (!adapter || typeof adapter.reconcile !== "function") return { status: "unknown" };
    return adapter.reconcile(args);
  }
}

module.exports = { QuotedExecutionRouter };
