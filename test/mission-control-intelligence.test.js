const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  BenchmarkReviewSchema,
  CompetitorReviewSchema,
  CustomerInterviewSchema,
  EngineeringRetrospectiveSchema,
  FeatureEvidenceSchema,
  LaunchDecisionSchema,
  MultiLensReviewSchema,
  ProductIntelligenceSchema,
} = require("../src/mission-control");

const createdAt = "2026-08-02T12:00:00.000Z";
const evidenceRefs = ["github:issue:6"];

describe("Mission Control intelligence schemas", () => {
  it("validates a Competitor Review", () => {
    const value = {
      competitor_review_id: "competitor_review_001",
      review_id: "review_001",
      created_at: createdAt,
      competitor_ref: "competitor_001",
      competitor_name: "Example competitor",
      scope: "Launch positioning",
      summary: "The competitor is strong in template breadth.",
      strengths: ["Template breadth"],
      weaknesses: ["Limited orchestration"],
      opportunities: ["Outcome-first workflow"],
      threats: ["Established distribution"],
      evidence_refs: evidenceRefs,
      status: "completed",
    };

    assert.deepEqual(CompetitorReviewSchema.parse(value), value);
    assert.equal(
      CompetitorReviewSchema.safeParse({ ...value, unknown: true }).success,
      false
    );
  });

  it("validates a Benchmark Review and rejects duplicate metrics", () => {
    const metric = {
      metric_id: "activation_time",
      name: "Time to first approved script",
      subject_value: 8,
      benchmark_value: 10,
      unit: "minutes",
      direction: "lower_is_better",
      comparison: "ahead",
      evidence_refs: evidenceRefs,
    };
    const value = {
      benchmark_review_id: "benchmark_review_001",
      review_id: "review_001",
      created_at: createdAt,
      subject_ref: "bizgenie:launch",
      benchmark_name: "Launch activation benchmark",
      summary: "Activation is ahead of the launch benchmark.",
      metrics: [metric],
      evidence_refs: evidenceRefs,
      status: "completed",
    };

    assert.deepEqual(BenchmarkReviewSchema.parse(value), value);
    assert.equal(
      BenchmarkReviewSchema.safeParse({ ...value, metrics: [metric, metric] })
        .success,
      false
    );
  });

  it("requires multiple unique lenses in a Multi-Lens Review", () => {
    const lens = {
      lens_id: "product",
      reviewer_role: "Product and customer advocate",
      provider: "test-provider",
      conclusion: "The launch scope addresses the primary job.",
      confidence: 0.8,
      risks: ["Onboarding clarity"],
      opportunities: ["Faster activation"],
      evidence_refs: evidenceRefs,
    };
    const value = {
      multi_lens_review_id: "multi_lens_review_001",
      review_id: "review_001",
      created_at: createdAt,
      subject: "Launch readiness",
      lens_assessments: [
        lens,
        {
          ...lens,
          lens_id: "engineering",
          reviewer_role: "Technical and security architect",
        },
      ],
      synthesis: "The launch is viable with onboarding monitoring.",
      disagreements: [],
      evidence_refs: evidenceRefs,
      status: "completed",
    };

    assert.deepEqual(MultiLensReviewSchema.parse(value), value);
    assert.equal(
      MultiLensReviewSchema.safeParse({ ...value, lens_assessments: [lens] })
        .success,
      false
    );
    assert.equal(
      MultiLensReviewSchema.safeParse({
        ...value,
        lens_assessments: [lens, lens],
      }).success,
      false
    );
  });

  it("validates Customer Interview completion evidence", () => {
    const value = {
      customer_interview_id: "customer_interview_001",
      created_at: createdAt,
      conducted_at: createdAt,
      participant_ref: "customer_ref_001",
      customer_segment: "Founder-led small business",
      interviewer_ref: "team_member_001",
      objective: "Understand script approval friction.",
      summary: "The participant needs clearer tone guidance.",
      insights: [
        {
          insight_id: "insight_001",
          title: "Tone clarity",
          description: "The desired tone is difficult to specify.",
          confidence: 0.9,
          evidence_refs: ["interview:customer_ref_001:note:4"],
        },
      ],
      evidence_refs: ["interview:customer_ref_001"],
      status: "completed",
    };

    assert.deepEqual(CustomerInterviewSchema.parse(value), value);
    assert.equal(
      CustomerInterviewSchema.safeParse({
        ...value,
        conducted_at: undefined,
      }).success,
      false
    );
  });

  it("requires approval evidence and conditional launch conditions", () => {
    const value = {
      launch_decision_id: "launch_decision_001",
      review_id: "review_001",
      created_at: createdAt,
      launch_ref: "launch:v1",
      decision: "conditional_go",
      rationale: "Core acceptance criteria pass.",
      conditions: ["Confirm deployment trigger"],
      approved_by: ["founder_001"],
      evidence_refs: evidenceRefs,
      status: "approved",
    };

    assert.deepEqual(LaunchDecisionSchema.parse(value), value);
    assert.equal(
      LaunchDecisionSchema.safeParse({ ...value, conditions: [] }).success,
      false
    );
    assert.equal(
      LaunchDecisionSchema.safeParse({ ...value, approved_by: [] }).success,
      false
    );
  });

  it("validates Feature Evidence with bounded impact and confidence", () => {
    const value = {
      feature_evidence_id: "feature_evidence_001",
      feature_ref: "feature:brand-brain",
      created_at: createdAt,
      evidence_type: "customer_interview",
      title: "Customers need persistent tone memory",
      description: "Repeated tone setup slows approval.",
      impact: "supports",
      confidence: 0.85,
      source_refs: ["customer_interview_001"],
      status: "active",
    };

    assert.deepEqual(FeatureEvidenceSchema.parse(value), value);
    assert.equal(
      FeatureEvidenceSchema.safeParse({ ...value, confidence: 1.1 }).success,
      false
    );
  });

  it("validates Engineering Retrospective chronology and action identity", () => {
    const action = {
      action_id: "action_001",
      title: "Add release checks",
      owner_ref: "engineering_001",
      success_measure: "Every pull request runs tests.",
      target_date: "2026-08-09T12:00:00.000Z",
      status: "pending",
    };
    const value = {
      engineering_retrospective_id: "engineering_retro_001",
      review_id: "review_001",
      created_at: createdAt,
      period_start: "2026-07-01T00:00:00.000Z",
      period_end: "2026-07-31T23:59:59.000Z",
      scope: "Mission Control foundation",
      summary: "The foundation shipped with deterministic validation.",
      went_well: ["Atomic scope"],
      went_poorly: ["CI arrived later"],
      lessons: ["Establish checks before parallel changes"],
      actions: [action],
      evidence_refs: evidenceRefs,
      status: "completed",
    };

    assert.deepEqual(EngineeringRetrospectiveSchema.parse(value), value);
    assert.equal(
      EngineeringRetrospectiveSchema.safeParse({
        ...value,
        period_end: "2026-06-30T23:59:59.000Z",
      }).success,
      false
    );
    assert.equal(
      EngineeringRetrospectiveSchema.safeParse({
        ...value,
        actions: [action, action],
      }).success,
      false
    );
  });

  it("validates evidence-backed Product Intelligence", () => {
    const value = {
      product_intelligence_id: "product_intelligence_001",
      created_at: createdAt,
      intelligence_type: "opportunity",
      title: "Persistent brand context reduces setup effort",
      description: "Interview and feature evidence point to reusable context.",
      confidence: 0.8,
      implications: ["Prioritise Brand Brain discovery"],
      recommended_actions: ["Validate with three further interviews"],
      source_refs: ["feature_evidence_001", "customer_interview_001"],
      status: "validated",
    };

    assert.deepEqual(ProductIntelligenceSchema.parse(value), value);
    assert.equal(
      ProductIntelligenceSchema.safeParse({ ...value, source_refs: [] }).success,
      false
    );
  });
});

