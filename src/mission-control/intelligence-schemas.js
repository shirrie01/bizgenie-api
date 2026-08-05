const { z } = require("zod");

const identifier = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const nonEmptyText = z.string().trim().min(1);
const confidence = z.union([
  z.number().finite().min(0).max(1),
  nonEmptyText,
]);
const evidenceRefs = z.array(identifier).min(1);

const reviewStatuses = ["draft", "ready", "running", "completed", "failed"];

function requireUnique(items, key, context, path) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item[key])) {
      context.addIssue({
        code: "custom",
        path: [path, index, key],
        message: `${key} values must be unique`,
      });
    }
    seen.add(item[key]);
  });
}

const CompetitorReviewSchema = z
  .object({
    competitor_review_id: identifier,
    review_id: identifier,
    created_at: timestamp,
    competitor_ref: identifier,
    competitor_name: nonEmptyText,
    scope: nonEmptyText,
    summary: nonEmptyText,
    strengths: z.array(nonEmptyText),
    weaknesses: z.array(nonEmptyText),
    opportunities: z.array(nonEmptyText),
    threats: z.array(nonEmptyText),
    evidence_refs: evidenceRefs,
    status: z.enum(reviewStatuses),
  })
  .strict();

const BenchmarkMetricSchema = z
  .object({
    metric_id: identifier,
    name: nonEmptyText,
    subject_value: z.union([z.number().finite(), nonEmptyText]),
    benchmark_value: z.union([z.number().finite(), nonEmptyText]),
    unit: nonEmptyText.optional(),
    direction: z.enum([
      "higher_is_better",
      "lower_is_better",
      "target_match",
    ]),
    comparison: z.enum(["ahead", "at_par", "behind", "not_comparable"]),
    evidence_refs: evidenceRefs,
  })
  .strict();

const BenchmarkReviewSchema = z
  .object({
    benchmark_review_id: identifier,
    review_id: identifier,
    created_at: timestamp,
    subject_ref: identifier,
    benchmark_name: nonEmptyText,
    summary: nonEmptyText,
    metrics: z.array(BenchmarkMetricSchema).min(1),
    evidence_refs: evidenceRefs,
    status: z.enum(reviewStatuses),
  })
  .strict()
  .superRefine((value, context) => {
    requireUnique(value.metrics, "metric_id", context, "metrics");
  });

const LensAssessmentSchema = z
  .object({
    lens_id: identifier,
    reviewer_role: nonEmptyText,
    provider: nonEmptyText,
    conclusion: nonEmptyText,
    confidence,
    risks: z.array(nonEmptyText),
    opportunities: z.array(nonEmptyText),
    evidence_refs: evidenceRefs,
  })
  .strict();

const MultiLensReviewSchema = z
  .object({
    multi_lens_review_id: identifier,
    review_id: identifier,
    created_at: timestamp,
    subject: nonEmptyText,
    lens_assessments: z.array(LensAssessmentSchema).min(2),
    synthesis: nonEmptyText,
    disagreements: z.array(nonEmptyText),
    evidence_refs: evidenceRefs,
    status: z.enum(reviewStatuses),
  })
  .strict()
  .superRefine((value, context) => {
    requireUnique(
      value.lens_assessments,
      "lens_id",
      context,
      "lens_assessments"
    );
  });

const CustomerInsightSchema = z
  .object({
    insight_id: identifier,
    title: nonEmptyText,
    description: nonEmptyText,
    confidence,
    evidence_refs: evidenceRefs,
  })
  .strict();

const customerInterviewStatuses = ["scheduled", "completed", "cancelled"];

const CustomerInterviewSchema = z
  .object({
    customer_interview_id: identifier,
    created_at: timestamp,
    conducted_at: timestamp.optional(),
    participant_ref: identifier,
    customer_segment: nonEmptyText,
    interviewer_ref: identifier,
    objective: nonEmptyText,
    summary: nonEmptyText.optional(),
    insights: z.array(CustomerInsightSchema),
    evidence_refs: z.array(identifier),
    status: z.enum(customerInterviewStatuses),
  })
  .strict()
  .superRefine((value, context) => {
    requireUnique(value.insights, "insight_id", context, "insights");

    if (value.status === "completed") {
      if (!value.conducted_at) {
        context.addIssue({
          code: "custom",
          path: ["conducted_at"],
          message: "conducted_at is required when status is completed",
        });
      }
      if (!value.summary) {
        context.addIssue({
          code: "custom",
          path: ["summary"],
          message: "summary is required when status is completed",
        });
      }
      if (value.evidence_refs.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["evidence_refs"],
          message: "evidence_refs must contain evidence when status is completed",
        });
      }
    }
  });

const launchDecisions = ["go", "conditional_go", "no_go", "defer"];
const launchDecisionStatuses = ["draft", "approved", "rejected", "superseded"];

const LaunchDecisionSchema = z
  .object({
    launch_decision_id: identifier,
    review_id: identifier,
    created_at: timestamp,
    launch_ref: identifier,
    decision: z.enum(launchDecisions),
    rationale: nonEmptyText,
    conditions: z.array(nonEmptyText),
    approved_by: z.array(identifier),
    evidence_refs: evidenceRefs,
    status: z.enum(launchDecisionStatuses),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "conditional_go" && value.conditions.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["conditions"],
        message: "conditions are required for a conditional_go decision",
      });
    }
    if (value.status === "approved" && value.approved_by.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["approved_by"],
        message: "approved_by is required when status is approved",
      });
    }
  });

const featureEvidenceTypes = [
  "customer_interview",
  "customer_request",
  "usage",
  "experiment",
  "commercial",
  "support",
  "competitive",
  "technical",
  "other",
];
const featureEvidenceImpacts = ["supports", "neutral", "challenges"];
const featureEvidenceStatuses = ["active", "invalidated", "superseded"];

const FeatureEvidenceSchema = z
  .object({
    feature_evidence_id: identifier,
    feature_ref: identifier,
    created_at: timestamp,
    evidence_type: z.enum(featureEvidenceTypes),
    title: nonEmptyText,
    description: nonEmptyText,
    impact: z.enum(featureEvidenceImpacts),
    confidence,
    source_refs: evidenceRefs,
    status: z.enum(featureEvidenceStatuses),
  })
  .strict();

const retrospectiveActionStatuses = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

const RetrospectiveActionSchema = z
  .object({
    action_id: identifier,
    title: nonEmptyText,
    owner_ref: identifier,
    success_measure: nonEmptyText,
    target_date: timestamp.optional(),
    status: z.enum(retrospectiveActionStatuses),
  })
  .strict();

const EngineeringRetrospectiveSchema = z
  .object({
    engineering_retrospective_id: identifier,
    review_id: identifier,
    created_at: timestamp,
    period_start: timestamp,
    period_end: timestamp,
    scope: nonEmptyText,
    summary: nonEmptyText,
    went_well: z.array(nonEmptyText),
    went_poorly: z.array(nonEmptyText),
    lessons: z.array(nonEmptyText),
    actions: z.array(RetrospectiveActionSchema),
    evidence_refs: evidenceRefs,
    status: z.enum(["draft", "completed"]),
  })
  .strict()
  .superRefine((value, context) => {
    requireUnique(value.actions, "action_id", context, "actions");
    if (Date.parse(value.period_end) < Date.parse(value.period_start)) {
      context.addIssue({
        code: "custom",
        path: ["period_end"],
        message: "period_end must be on or after period_start",
      });
    }
  });

const productIntelligenceTypes = [
  "customer",
  "competitive",
  "product",
  "commercial",
  "technical",
  "risk",
  "opportunity",
];
const productIntelligenceStatuses = [
  "draft",
  "validated",
  "rejected",
  "superseded",
];

const ProductIntelligenceSchema = z
  .object({
    product_intelligence_id: identifier,
    created_at: timestamp,
    intelligence_type: z.enum(productIntelligenceTypes),
    title: nonEmptyText,
    description: nonEmptyText,
    confidence,
    implications: z.array(nonEmptyText),
    recommended_actions: z.array(nonEmptyText),
    source_refs: evidenceRefs,
    status: z.enum(productIntelligenceStatuses),
  })
  .strict();

module.exports = {
  BenchmarkMetricSchema,
  BenchmarkReviewSchema,
  CompetitorReviewSchema,
  CustomerInsightSchema,
  CustomerInterviewSchema,
  EngineeringRetrospectiveSchema,
  FeatureEvidenceSchema,
  LaunchDecisionSchema,
  LensAssessmentSchema,
  MultiLensReviewSchema,
  ProductIntelligenceSchema,
  RetrospectiveActionSchema,
  customerInterviewStatuses,
  featureEvidenceImpacts,
  featureEvidenceStatuses,
  featureEvidenceTypes,
  launchDecisionStatuses,
  launchDecisions,
  productIntelligenceStatuses,
  productIntelligenceTypes,
  retrospectiveActionStatuses,
};
