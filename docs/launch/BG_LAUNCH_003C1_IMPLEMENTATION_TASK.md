# Implementation task — BG-LAUNCH-003C1

Implement the smallest production-safe adapter from an existing campaign draft variant to the existing BizGenie generation machinery and back into a durable campaign revision.

## Read before editing
- `docs/launch/BG_LAUNCH_003C1_GENERATED_CONTENT_PROOF.md`
- `src/campaigns/schema.js`
- `src/campaigns/router.js`
- `src/campaigns/postgresRepository.js`
- `src/generation-jobs/service.js`
- `src/generation-jobs/executionInput.js`
- `src/generation.js`
- Brand Brain repository/service used by production composition
- production app composition and existing generation/billing middleware

## Constraints
Reuse existing authorization, Brand Brain, generation-job, generation/billing, provider-generation and campaign `save_revision` primitives. Do not create a parallel campaign store, generation ledger, provider selector or billing authority.

The browser should identify the campaign/variant and request generation; trusted ownership and brand scope must be resolved server-side. Provider/model/cost/token fields must not become customer-controlled inputs.

Prefer a narrow customer endpoint/action whose orchestration is testable independently. Preserve the current generic/safe error contracts and existing draft if generation fails.

For the first Instagram text proof, map the generated response into the campaign content schema without losing useful copy. Keep `asset_refs: []` for this text-only slice. The saved revision must remain `draft` until the existing review/approval workflow advances it.

## Required tests
- owner/trusted-scope success;
- wrong tenant/project/brand or non-owner fails closed;
- target campaign/variant must belong to authorized scope;
- Brand Brain context is used and caller cannot override it;
- generation job idempotency/retry behavior;
- provider/model fields cannot be injected;
- successful generation calls campaign `save_revision` at the expected version;
- persistence/version conflict is safe and does not silently overwrite newer work;
- generation failure does not mutate campaign revision/workflow;
- no scheduling/publishing side effects;
- existing suites remain green.

## Live acceptance after CI
Build exact merged `main`, deploy only to the isolated tagged 0%-traffic candidate, then use the existing Fonzo campaign and Instagram `Launch announcement` item. Founder must see actual persisted generated copy before this slice is marked passed.