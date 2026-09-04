# BizGenie Mission Control v1.0

## Current campaign and paid-activation authority

BG-ACT-001 / Issue #39 is **closed as completed**, following the
[human acceptance and closure](https://github.com/shirrie01/bizgenie-api/issues/39#issuecomment-5497361809).
The accepted historical pack is
[`docs/activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md`](../activation/BG-ACT-001_FINAL_EVIDENCE_PACK.md).

| Control | Current state |
| --- | --- |
| Verified `main` at I-B task start, 2026-09-03 | `3b7ded9dc16dbeec5b9a13b27b2b8bc6814db727` (tree `dbc7d815195f4643d4a55899d34ebb9393ec5223`); PR #54/I-A merged and 0 open PRs before I-B |
| Complete / pass | Dedicated staging, migrations/RLS, Auth/service boundary, Billing, media, Image, Video, Stripe test lifecycle, Tenant A Golden Journey, 15 Tenant B behaviours, failure drills, restart/recovery and rollback readiness |
| Partial | Public frontend integration; the authenticated staging API and Stripe lifecycle passed, while public launch integration remains in Issue #51 |
| Unrecovered | Original `B-ISO-01`/`B-ISO-02` specimen labels and identifiers only; underlying isolation requirements are covered |
| Production | Untouched, disabled and unauthorised |
| Accepted Issue #39 verdict | `STAGING GOLDEN JOURNEY PASSED — READY FOR CONTROLLED PAID-BETA DECISION` |
| Campaign/calendar customer journey | GAP; not implemented/proven by the staging-generation verdict or the I-A contract |
| BG-LAUNCH-002I-A | Accepted and merged through PR #54; its contract remains normative |
| BG-LAUNCH-002I-B | Additive persistence implementation candidate in draft PR #55; unmerged, undeployed and not yet human-accepted |
| Contract and evidence | [Canonical campaign spine](../launch/CAMPAIGN_SPINE_CONTRACT.md), [acceptance and handoff](../launch/CAMPAIGN_SPINE_ACCEPTANCE.md), [I-A evidence](../launch/CAMPAIGN_SPINE_EVIDENCE.md), [I-B evidence](../launch/CAMPAIGN_SPINE_PERSISTENCE_EVIDENCE.md) |
| Exact restart point | Reconcile draft PR #55 and exact-head CI; complete human/architecture review and merge only with separate explicit authority. Then reverify main/Issue #51/open PRs before I-C; do not apply the migration to staging without separate authority |

Issue #51 / BG-LAUNCH-002 remains a separate parallel launch-preparation
programme. It cannot alter BG-ACT-001 technical authority or authorise
production. Historical activation summaries are retained as evidence but are
superseded when they conflict with the final pack and its subsequent human closure.
The pack's original open-issue/review restart text is historical, not current authority.

The current launch product authority is Issue #51 checkpoints
[5508119002](https://github.com/shirrie01/bizgenie-api/issues/51#issuecomment-5508119002)
and [5508588187](https://github.com/shirrie01/bizgenie-api/issues/51#issuecomment-5508588187).
They lock the campaign-first manual-publication MVP and accepted experience target.
I-A preserves verified Text/Image/Video, Auth, Billing, Brand Brain and durable storage;
it supplies ownership, lifecycle, revisions, approval, publication, attribution,
idempotency/concurrency and persistence contracts without implementing them.
Paid-beta capture is merged but disabled/unstaged per the current checkpoint.
Staging and production are untouched by I-A. Migrations, customer APIs, preview registry,
connectors, W4B complete-journey proof and activation remain subsequent bounded work.

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
