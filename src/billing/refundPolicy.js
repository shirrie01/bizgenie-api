const BOUNDED_POST_DEBIT_REFUND_REASONS = Object.freeze([
  "durable_output_unavailable_after_debit",
]);

const approvedReasons = new Set(BOUNDED_POST_DEBIT_REFUND_REASONS);

function qualifiesForBoundedPostDebitRefund({ job, debit, reason } = {}) {
  if (!job || !debit || typeof reason !== "string") return false;
  if (!approvedReasons.has(reason)) return false;

  return (
    typeof job.job_id === "string" &&
    typeof job.tenant_id === "string" &&
    typeof debit.ledger_entry_id === "string" &&
    debit.entry_type === "debit" &&
    debit.tenant_id === job.tenant_id &&
    debit.generation_id === job.job_id
  );
}

module.exports = {
  BOUNDED_POST_DEBIT_REFUND_REASONS,
  qualifiesForBoundedPostDebitRefund,
};
