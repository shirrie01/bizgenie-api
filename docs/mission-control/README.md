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
| BG-LAUNCH-002I-B | Accepted and merged through PR #55 at `8e71467ce23fb18867fbd0f0f08110a7272ad2c`; failed publication returns Approved, expires schedule, preserves approval, and requires explicit rescheduling |
| BG-LAUNCH-002I-D | Accepted and merged through PR #57 at `511933dd7b44faeb7770f1f2039721d46b6e800d`; customer generation requires an approved Brand Brain scoped to the authenticated tenant and project. Draft/archived/missing/cross-tenant brands fail closed. No staging or billing change |
| BG-LAUNCH-002I-F | Accepted and merged through PR #58 at `e112b5d0d28758579ede2fde88751d043b2c3aa0`; customer campaign create/list/read/detail-update/item-create/archive/restore API surface is available without publishing, billing or deployment scope |
| BG-LAUNCH-002I-C | Accepted and merged through PR #59 at `1ccb94a496b1afd7180ae9e2dc9f1ba70841b1ca`; customer preview submit/render/acknowledge/approve flow is available through a trusted preview registry without external platform rendering, publishing, billing or deployment scope |
| BG-LAUNCH-002I-E | In progress on branch `bg-launch-002i-e-goal-recommendation`; authenticated goal recommendation receipts are being added after the merged I-C baseline, without launch surfaces, billing, publishing, staging/production deployment or field-sales scope |
| Contract and evidence | [Canonical campaign spine](../launch/CAMPAIGN_SPINE_CONTRACT.md), [acceptance and handoff](../launch/CAMPAIGN_SPINE_ACCEPTANCE.md), [I-A evidence](../launch/CAMPAIGN_SPINE_EVIDENCE.md), [I-B evidence](../launch/CAMPAIGN_SPINE_PERSISTENCE_EVIDENCE.md), [I-F evidence](../launch/CAMPAIGN_CUSTOMER_API_EVIDENCE.md), [I-C evidence](../launch/CAMPAIGN_PREVIEW_REGISTRY_EVIDENCE.md), [I-E evidence](../launch/CAMPAIGN_GOAL_RECOMMENDATION_EVIDENCE.md) |
| Exact restart point | Continue BG-LAUNCH-002I-E from merged main `1ccb94a496b1afd7180ae9e2dc9f1ba70841b1ca`. Verify authenticated persisted recommendation receipts, idempotency, DTO safety and PostgreSQL migration/security before any review/merge decision. No shared staging deployment, publishing connector or billing action is authorized by this checkpoint |

Review baseline on 2026-09-07: canonical main remains
`3b7ded9dc16dbeec5b9a13b27b2b8bc6814db727`; one open PR (#55). The reviewed
implementation head is `891a5fa512888e78e2c44e219033365bafbeca66`.
That head is the historical review baseline; the latest remediation head/CI is
recorded in Issue #51. The failure-policy conflict is resolved by the founder's
[authoritative v1.1 clarification](../launch/IMPLEMENTATION_CONTRACT_AMENDMENT_V1_1.md).
Canonical names: I-B Additive Persistence; I-C Preview Registry; I-D Customer
Brand-context Boundary; I-E Goal Recommendation; I-F Customer Campaign APIs.
Proposed order for founder confirmation: **I-B → I-D → I-F → I-C → I-E → launch
surfaces → field-sales pilot**. I-D establishes approved customer Brand ownership
before customer APIs consume that context. No downstream implementation is authorised
by this checkpoint; I-F preview-dependent behavior remains gated until I-C.

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
