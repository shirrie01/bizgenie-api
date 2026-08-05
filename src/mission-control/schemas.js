const { z } = require("zod");

const identifier = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const nonEmptyText = z.string().trim().min(1);

const reviewTypes = ["event", "daily", "weekly", "monthly", "quarterly"];
const reviewStatuses = ["draft", "ready", "running", "completed", "failed"];

const ReviewSchema = z
  .object({
    review_id: identifier,
    review_type: z.enum(reviewTypes),
    status: z.enum(reviewStatuses),
    created_at: timestamp,
    evidence_pack_id: identifier,
  })
  .strict();

const CreateReviewSchema = ReviewSchema.extend({
  review_id: identifier.optional(),
  created_at: timestamp.optional(),
});

const EvidencePackSchema = z
  .object({
    evidence_pack_id: identifier,
    created_at: timestamp,
    source_refs: z.array(identifier),
    snapshot_version: nonEmptyText,
    checksum: nonEmptyText,
  })
  .strict();

const confidence = z.union([
  z.number().finite().min(0).max(1),
  nonEmptyText,
]);

const FindingSchema = z
  .object({
    finding_id: identifier,
    review_id: identifier,
    created_at: timestamp,
    reviewer_role: nonEmptyText,
    provider: nonEmptyText,
    title: nonEmptyText,
    description: nonEmptyText,
    evidence_refs: z.array(identifier).optional(),
    severity: nonEmptyText,
    confidence,
    affected_modules: z.array(nonEmptyText).optional(),
    previous_finding_ids: z.array(identifier).optional(),
    is_new: z.boolean().optional(),
    consensus_count: z.number().int().nonnegative().optional(),
    contradicting_finding_ids: z.array(identifier).optional(),
    recommended_action: nonEmptyText.optional(),
    expected_benefit: nonEmptyText.optional(),
    estimated_cost_or_complexity: nonEmptyText.optional(),
    decision: nonEmptyText.optional(),
    decision_rationale: nonEmptyText.optional(),
    owner: nonEmptyText.optional(),
    validation_metric: nonEmptyText.optional(),
    target_date: nonEmptyText.optional(),
    status: nonEmptyText,
    post_change_result: nonEmptyText.optional(),
    false_positive: z.boolean().optional(),
  })
  .strict();

const CreateFindingSchema = FindingSchema.extend({
  finding_id: identifier.optional(),
  review_id: identifier.optional(),
  created_at: timestamp.optional(),
});

module.exports = {
  CreateFindingSchema,
  CreateReviewSchema,
  EvidencePackSchema,
  FindingSchema,
  ReviewSchema,
  reviewStatuses,
  reviewTypes,
};
