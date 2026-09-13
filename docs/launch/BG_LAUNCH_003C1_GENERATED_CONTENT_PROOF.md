# BG-LAUNCH-003C1 — Generated Content Proof

## Objective
Prove the first real campaign content-generation loop using the already-persisted Fonzo launch campaign, without weakening the campaign spine or making publishing claims.

## Canonical specimen
Campaign: `Launch Fonzo Into The Uk Campaign`

First proof item: `Launch announcement` → Instagram feed.

The founder's supplied campaign goal is the authority for launch intent. Brand Brain is the authority for approved brand facts. Missing facts must remain missing; generation must not invent product, health, commercial, availability, customer-result, or distribution claims.

## Required flow
1. Authorize the customer for the trusted tenant/project/brand and `generation:create` boundary.
2. Load the target campaign, content item and variant from durable campaign state.
3. Load the approved/current Brand Brain context for that brand.
4. Compile a bounded generation input using campaign goal + item/platform/placement + Brand Brain facts.
5. Create an idempotent durable generation job through the existing GenerationJobService. Provider/model selection remains server-side.
6. Execute text generation through the existing generation boundary.
7. Convert successful output into campaign content fields suitable for the destination. Do not expose provider machinery in the customer contract.
8. Persist the output as a new campaign `save_revision` command, preserving expected campaign version, event history and projection integrity.
9. Return/display the new draft revision for founder review. Nothing is approved, scheduled or published by generation.

## First-proof acceptance
- one founder action can generate the existing Fonzo Instagram launch announcement;
- generated copy is grounded in the campaign goal and approved Brand Brain context;
- output is platform-appropriate and reviewable, not generic placeholder copy;
- the generated revision persists durably and becomes the variant's `current_revision_id`;
- retry is idempotent and does not double-charge or create duplicate logical work;
- customer-facing response does not reveal provider/model/token/cost internals;
- generation failure leaves the existing draft revision intact;
- no approval, scheduling or publication state is changed;
- tests cover authorization/scope, idempotency, Brand Brain grounding, safe failure and campaign-version conflict;
- existing campaign, billing and generation tests remain green.

## Quality gate
HTTP success alone is not acceptance. Founder review must judge the generated Fonzo launch copy for brand fit, usefulness, channel fit, claims safety and desirability. Quality gaps become bounded follow-up issues; they do not justify redesigning the proven campaign persistence spine.

## Follow-on sequence
After the Instagram proof passes, extend the same path to the existing Facebook launch post and launch email. Then repeat the real-product proof for Fairway and BizGenie under Issue #77.

## Guardrails
- Keep the current stable production traffic untouched during implementation/proof.
- Candidate remains isolated/0%-traffic until separately authorized.
- No production DDL unless a proven schema defect requires a reviewed forward migration.
- No direct provider selection from browser input.
- No secrets, customer JWTs, provider credentials or internal cost data in generation payloads or logs.
- No fabricated claims and no statement that content has been scheduled or published.