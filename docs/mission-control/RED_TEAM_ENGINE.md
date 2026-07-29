# BizGenie Strategic Red Team Engine v1.0

## Objective

Continuously challenge BizGenie's product, architecture, economics and execution using current evidence. The engine recommends actions; it never changes production or canonical strategy automatically.

## Review cadence

- Event driven: critical incidents, provider changes, cost spikes, security events, material roadmap changes.
- Daily: lightweight anomaly review.
- Weekly: product, engineering and commercial red-team review.
- Monthly: full strategic committee.
- Quarterly: business-model, pricing and moat reassessment.

## Evidence pack

Every review should receive a dated immutable snapshot containing:

- Canonical product positioning and roadmap.
- Current architecture and contracts.
- Completed, partial, failed and blocked BG tasks.
- GitHub commits, pull requests, CI results and open defects.
- Technical debt and drift register.
- AI provider usage, latency, error and cost data.
- Credit consumption and gross-margin estimates.
- Customer activation, approval, publication, retention and churn signals.
- Campaign performance and attributable commercial outcomes.
- Support themes and customer feedback.
- Competitor and platform changes.
- Previous findings, decisions and validation results.

## Specialist reviewer roles

1. Product and customer advocate.
2. Technical and security architect.
3. Commercial and unit-economics reviewer.
4. AI quality and provider-dependency reviewer.
5. Legal, privacy and governance reviewer.
6. Competitive strategist.
7. Adversarial founder attempting to defeat BizGenie.

The provider and reviewer role are separate concepts. Different models may fulfil the same role over time.

## Finding schema

Each finding must include:

- `finding_id`
- `review_id`
- `created_at`
- `reviewer_role`
- `provider`
- `title`
- `description`
- `evidence_refs`
- `severity`
- `confidence`
- `affected_modules`
- `previous_finding_ids`
- `is_new`
- `consensus_count`
- `contradicting_finding_ids`
- `recommended_action`
- `expected_benefit`
- `estimated_cost_or_complexity`
- `decision`
- `decision_rationale`
- `owner`
- `validation_metric`
- `target_date`
- `status`
- `post_change_result`
- `false_positive`

## Output rules

Reviewers must:

- distinguish evidence, inference and speculation;
- identify whether a prior concern is resolved, partly resolved or unresolved;
- avoid repeating prior findings without new evidence;
- name the exact failure mode;
- propose a measurable corrective action;
- state what evidence would disprove the finding.

## Consensus engine

The system should cluster semantically equivalent findings, preserve meaningful disagreement and calculate:

- number of reviewers agreeing;
- severity distribution;
- confidence distribution;
- evidence quality;
- recurrence across review cycles;
- affected roadmap items;
- expected cost of action versus inaction.

Consensus is advisory. A majority does not automatically make a finding correct.

## Human approval gates

Approval is mandatory before:

- changing canonical architecture;
- changing prices or credit values;
- replacing a production provider;
- changing customer terms or privacy rules;
- creating or deleting customer data;
- deploying code;
- closing a critical finding.

## Learning loop

The engine should later compare findings and recommendations with observed outcomes to learn:

- which review roles identify useful issues;
- which providers make reliable predictions;
- which metrics predict churn or failure;
- which corrective actions improve outcomes;
- which findings repeatedly become false positives.

This learning affects reviewer weighting and prioritisation, not autonomous production decisions.