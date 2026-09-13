# Codex prompt — BG-LAUNCH-003C1

Repository: `shirrie01/bizgenie-api`
Branch: `bg-launch-003c1`

Implement BG-LAUNCH-003C1 on this branch.

Mandatory first action: read `docs/launch/BG_LAUNCH_003C1_GENERATED_CONTENT_PROOF.md` and `docs/launch/BG_LAUNCH_003C1_IMPLEMENTATION_TASK.md`, then inspect the current campaign, Brand Brain, generation-job, generation/billing and provider-generation implementations before editing.

Goal: make one existing persisted campaign draft variant generate real Brand-Brain-grounded text through the existing generation machinery and persist the successful result through the existing campaign `save_revision` command. The first live specimen is the Fonzo Instagram `Launch announcement` draft.

Do not redesign or bypass the campaign spine. Do not create a second generation ledger, billing authority, Brand Brain authority, provider selector or persistence model. Do not allow browser-controlled provider/model/cost/token authority. Do not add scheduling or publishing behavior.

Use trusted server-side tenant/project/brand authorization, durable idempotent generation jobs, existing execution/generation boundaries and existing campaign revision integrity. A generation failure must leave the current draft untouched. A successful generation must create a durable new draft revision and expose reviewable content without claiming approval/scheduling/publication.

Add focused regression/integration tests for authorization, trusted scope, Brand Brain grounding, input sanitization, idempotency, version conflicts, safe failure, durable revision persistence and absence of workflow side effects. Run the relevant suites and full CI-equivalent tests available in the repository.

When complete, report: files changed, exact customer endpoint/action contract, how Brand Brain is loaded, how generation/billing/idempotency are preserved, how output maps to campaign content, tests run/results, and any remaining live-environment dependency. Do not deploy or change production traffic.