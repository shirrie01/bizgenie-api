const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  BOUNDED_POST_DEBIT_REFUND_REASONS,
  qualifiesForBoundedPostDebitRefund,
} = require("../src/billing");

const job = Object.freeze({
  job_id: "job_refund_policy_001",
  tenant_id: "tenant_a",
});

const debit = Object.freeze({
  ledger_entry_id: "ledger_debit_001",
  entry_type: "debit",
  tenant_id: "tenant_a",
  generation_id: "job_refund_policy_001",
});

describe("bounded post-debit refund policy", () => {
  it("qualifies only the approved durable-output post-debit failure", () => {
    assert.deepEqual(BOUNDED_POST_DEBIT_REFUND_REASONS, [
      "durable_output_unavailable_after_debit",
    ]);
    assert.equal(
      qualifiesForBoundedPostDebitRefund({
        job,
        debit,
        reason: "durable_output_unavailable_after_debit",
      }),
      true
    );
  });

  it("fails closed for non-qualifying, malformed, or missing reasons", () => {
    for (const reason of [
      "provider_failure_before_debit",
      "reservation_release_failure",
      "customer_requested_refund",
      "",
      null,
      undefined,
    ]) {
      assert.equal(qualifiesForBoundedPostDebitRefund({ job, debit, reason }), false);
    }
  });

  it("fails closed when immutable debit/job authority does not match", () => {
    assert.equal(
      qualifiesForBoundedPostDebitRefund({
        job,
        debit: { ...debit, generation_id: "different_job" },
        reason: "durable_output_unavailable_after_debit",
      }),
      false
    );
    assert.equal(
      qualifiesForBoundedPostDebitRefund({
        job,
        debit: { ...debit, tenant_id: "tenant_b" },
        reason: "durable_output_unavailable_after_debit",
      }),
      false
    );
    assert.equal(
      qualifiesForBoundedPostDebitRefund({
        job,
        debit: { ...debit, entry_type: "reservation_release" },
        reason: "durable_output_unavailable_after_debit",
      }),
      false
    );
  });
});
