# Mission Control Intelligence Schemas v1

## Purpose

These contracts define the evidence-backed intelligence records used by Mission
Control. They are deterministic data contracts only. They do not define routes,
storage, orchestration, analytics, model calls or user interfaces.

The executable Zod definitions live in
`src/mission-control/intelligence-schemas.js`.

## Shared rules

- Every object is strict: undeclared fields fail validation.
- Identifiers and human-readable text must be non-empty strings after trimming.
- Timestamps are ISO 8601 strings with a timezone offset.
- Numeric confidence is between `0` and `1`; a non-empty qualitative confidence
  statement is also accepted to remain compatible with the Finding contract.
- Completed or decision-grade intelligence requires explicit evidence references.
- References are opaque identifiers. These schemas do not resolve or fetch them.
- Customer records use `participant_ref`; the contract does not solicit names,
  contact details or raw personal data.

## Competitor Review

Records an evidence-backed assessment of one competitor within a named scope.

Required fields:

- `competitor_review_id`, `review_id`, `created_at`
- `competitor_ref`, `competitor_name`, `scope`, `summary`
- `strengths[]`, `weaknesses[]`, `opportunities[]`, `threats[]`
- `evidence_refs[]` with at least one reference
- `status`: `draft | ready | running | completed | failed`

## Benchmark Review

Compares a subject with a named benchmark using one or more explicit metrics.

Required fields:

- `benchmark_review_id`, `review_id`, `created_at`
- `subject_ref`, `benchmark_name`, `summary`
- `metrics[]`, each containing unique `metric_id`, `name`, `subject_value`,
  `benchmark_value`, optional `unit`, `direction`, `comparison` and evidence
- `evidence_refs[]` with at least one reference
- `status`: `draft | ready | running | completed | failed`

Metric `direction` is `higher_is_better | lower_is_better | target_match`.
Metric `comparison` is `ahead | at_par | behind | not_comparable`.

## Multi-Lens Review

Preserves independent assessments and disagreement before producing a synthesis.

Required fields:

- `multi_lens_review_id`, `review_id`, `created_at`, `subject`
- `lens_assessments[]` with at least two uniquely identified lenses
- Each lens contains `lens_id`, `reviewer_role`, `provider`, `conclusion`,
  `confidence`, `risks[]`, `opportunities[]` and `evidence_refs[]`
- `synthesis`, `disagreements[]`, `evidence_refs[]`
- `status`: `draft | ready | running | completed | failed`

## Customer Interview

Captures structured interview evidence without requiring direct personal data.

Required fields:

- `customer_interview_id`, `created_at`
- `participant_ref`, `customer_segment`, `interviewer_ref`, `objective`
- `insights[]`, `evidence_refs[]`
- `status`: `scheduled | completed | cancelled`

`conducted_at` and `summary` are optional until completion. A completed interview
requires both plus at least one evidence reference. Insight identifiers must be
unique within the interview.

## Launch Decision

Records a human-governed launch decision and its supporting evidence.

Required fields:

- `launch_decision_id`, `review_id`, `created_at`, `launch_ref`
- `decision`: `go | conditional_go | no_go | defer`
- `rationale`, `conditions[]`, `approved_by[]`, `evidence_refs[]`
- `status`: `draft | approved | rejected | superseded`

`conditional_go` requires at least one condition. An approved record requires at
least one approver reference. Validation does not grant approval or perform a
launch.

## Feature Evidence

Links a bounded piece of evidence to a feature without changing a roadmap.

Required fields:

- `feature_evidence_id`, `feature_ref`, `created_at`
- `evidence_type`, `title`, `description`, `impact`, `confidence`
- `source_refs[]` with at least one reference
- `status`: `active | invalidated | superseded`

Evidence type is `customer_interview | customer_request | usage | experiment |
commercial | support | competitive | technical | other`.

Impact is `supports | neutral | challenges`.

## Engineering Retrospective

Captures an evidence-backed engineering learning cycle and measurable actions.

Required fields:

- `engineering_retrospective_id`, `review_id`, `created_at`
- `period_start`, `period_end`, `scope`, `summary`
- `went_well[]`, `went_poorly[]`, `lessons[]`, `actions[]`
- `evidence_refs[]` with at least one reference
- `status`: `draft | completed`

The period cannot end before it starts. Action identifiers must be unique. Each
action contains `action_id`, `title`, `owner_ref`, `success_measure`, optional
`target_date` and status `pending | in_progress | completed | cancelled`.

## Product Intelligence

Stores a traceable synthesis that can informâ€”but cannot automatically changeâ€”a
product decision.

Required fields:

- `product_intelligence_id`, `created_at`
- `intelligence_type`, `title`, `description`, `confidence`
- `implications[]`, `recommended_actions[]`
- `source_refs[]` with at least one reference
- `status`: `draft | validated | rejected | superseded`

Intelligence type is `customer | competitive | product | commercial | technical |
risk | opportunity`.

## Explicit boundaries

These schemas do not:

- create endpoints or authentication rules;
- generate identifiers or timestamps;
- persist, query or migrate records;
- call AI providers or score records;
- collect analytics;
- approve launches or change the roadmap;
- define any UI.

