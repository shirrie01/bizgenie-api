# BizGenie Mission Control v1.0

## Current paid-activation authority

BG-ACT-001 is in **review** with its final evidence reconciled. The canonical
pack is
[`docs/activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md`](../activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md).

| Control | Current state |
| --- | --- |
| Canonical `main` | `5df5b470a4472c479907a900754f2ab352b36826` (tree `82a5cd092bcdbbca69b09ae170a1b547068df2a9`) |
| Complete / pass | Dedicated staging, migrations/RLS, Auth/service boundary, Billing, media, Image, Video, Stripe test lifecycle, Tenant A Golden Journey, 15 Tenant B behaviours, failure drills, restart/recovery and rollback readiness |
| Partial | Public frontend integration; the authenticated staging API and Stripe lifecycle passed, while public launch integration remains in Issue #51 |
| Unrecovered | Original `B-ISO-01`/`B-ISO-02` specimen labels and identifiers only; underlying isolation requirements are covered |
| Production | Untouched, disabled and unauthorised |
| Proposed verdict | `STAGING GOLDEN JOURNEY PASSED — READY FOR CONTROLLED PAID-BETA DECISION` |
| Exact restart point | Human review of the BG-ACT-001L evidence PR against Issue #39; do not merge, close the issue or activate production without explicit next authority |

Issue #51 / BG-LAUNCH-002 remains a separate parallel launch-preparation
programme. It cannot alter BG-ACT-001 technical authority or authorise
production. Historical activation summaries are retained as evidence but are
superseded when they conflict with the final pack.

## Purpose

Mission Control is the operating layer for planning, building, verifying and continuously improving BizGenie. It exists to prevent architectural drift, uncontrolled scope, unverified completion and loss of strategic knowledge.

## Core principles

1. One authoritative task ledger.
2. Every build task is atomic, testable and traceable.
3. No task is complete without evidence.
4. Canonical architecture cannot be changed silently.
5. Codex receives bounded implementation contracts, not broad product requests.
6. Red-team findings become tracked decisions, not disposable chat output.
7. Automated recommendations never change production, pricing, legal terms or customer data rules without approval.

## Operating loop

```text
Evidence and current system state
        ↓
Prioritised atomic BG task
        ↓
Codex implementation branch
        ↓
Tests and implementation evidence
        ↓
Architecture Guardian review
        ↓
Human approval
        ↓
Merge and deployment
        ↓
Operational measurement
        ↓
Strategic Red Team review
        ↓
New findings and validated improvements
```

## Mission Control modules

- Task Contract
- Codex Contract
- Architecture Guardian
- Acceptance Gate
- Red Team Findings Ledger
- Evidence Pack Generator
- Decision and Lock Register
- Technical Debt Register
- Cost and model-performance monitoring

## Initial implementation order

1. Define contracts and schemas.
2. Create repository templates and validation rules.
3. Add task and findings ledger storage.
4. Build evidence-pack generator.
5. Add scheduled review orchestration.
6. Add multi-model adapters behind a provider interface.
7. Add consensus, contradiction and duplicate-finding analysis.
8. Add human approval and roadmap update workflow.

## Non-goals for v1

- Autonomous production changes.
- Autonomous pricing changes.
- Autonomous legal or privacy decisions.
- Continuous expensive multi-model calls.
- Customer-facing strategic recommendations.

Mission Control is internal-first. Customer-facing intelligence is considered only after the internal system has produced reliable evidence.
