# BG-R2 founder-only draft workflow — review checkpoint

19 November2026. Execution restored. Existing /workspace/bizgenie-api checkout remains clean on bg-social-002-linkedin/b400d27f7cdd516a772d45873adaa59a70f0c4b8 and was not switched/edited. Existing clean /workspace/bizgenie-r2-03 worktree used on new local bg-r2-founder-draft-workflow from verified origin/main74136ab911288a4deabfb7c9c84dc1382314bf69. Prior bg-r2-03-founder-campaign pointer preserved. Original evidence was produced during local source preparation. BG-R2-DRAFT-PR-01 now authorises committing/pushing this exact implementation and publishing a DRAFT PR only; no merge or release. No dependency installation, reset, stash, workspace recreation or runtime configuration change. Accepted R2 deployment/campaign and Step7 checkpoints unchanged, not re-audited.

## Exact proposed source delta

source.patch contains only src/studio-bridge/service.js, scripts/staging/studio-bridge.js and new test/studio-bridge-founder-draft.test.js. No application route, campaign repository, authorisation, migration, preview profile, private manifest or accepted release validator changed.

New default-OFF BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW maps to allowFounderDraftWorkflow. Explicit private BG_BRIDGE_FOUNDER_DRAFT_TENANT_ID/PROJECT_ID/BRAND_ID/CAMPAIGN_ID are required to configure a valid binding; approved private founder subject reuses BG_BRIDGE_FOUNDER_AUTH_USER_ID. No real values committed. Bad flags/UUID/scope/unknown fields/normalisation, partial binding and stale binding while OFF fail startup. Staging only. Broad writes, old broad draft workflow, bootstrap, generation confirmation, social, Stripe and founderVideo conflicts refuse startup. Existing founder onboarding/recommendations/campaign-root may remain independently enabled. When root is enabled its3scope pins must match draft scope; no root hash/key restriction is loosened.

isDraftWorkflowWrite() is reused unchanged, then narrowed to EXACT POST for the bound campaign:
- /customer/campaigns/:campaignId/content-items
- /customer/campaigns/:campaignId/variants/:variantId/{review,preview-renders,preview-acknowledgements,approval,schedule,reschedule,unschedule}

Eight routes only, no query/suffix/encoding/alternate methods. Workspace/root/recommendation writes are not admitted by this flag. Manual publication, media uploads, copy-revision save, measurements, provider quotes/confirmations/jobs, social and Stripe stay blocked. A syntactically valid variant belongs to the bound campaign only when the existing API checks it; the bridge does not invent variant/revision membership.

Initial gate only defers denial to allow authentication. Verified customer identity, per-user rate accounting, valid full trusted scope, all3trusted-to-config scope pins and exact campaign ID are checked before IAM/upstream. Existing API bodies contain tenant/project, not brand_id: both are REQUIRED to match trusted scope; any supplied foreign brand also denied. Brand authority comes from verified token scope+approved campaign binding, NOT a client-editable body value. Body parser16KiB; JSON and all existing CORS/header/time/concurrency/response limits retained. Malformed JSON/cap/identity/scope failures never request IAM. Upstream403/404/409/422/503 pass through unchanged; no retry or new provider call.

## Local evidence

Node22.23.3; existing installed dependencies reused through NODE_PATH. Focused88/88 PASS,0FAIL,0SKIP. Includes12new permission/API tests and existing bridge/founder/onboarding/recommendation/root/release/auth/customer-campaign regressions. Actual in-memory API tests show content draft/revision retention, exact replay once, stale CAS rejection, schedule only after trusted synthetic approval, no publication, and current membership revocation denial. No real SQL/PG test or connected customer write was run. No full-suite or hosted CI claim.

One initial negative test used Supertest '?', which the client normalised away. Corrected the fixture to send a literal empty-query marker via raw LOCAL HTTP; denial403/preIAM asserted. No production assertion weakened. Positive/negative fixtures use only synthetic identities/scopes/data, not founder credentials. Source/entrypoint/test syntax and git diff whitespace checks PASS.

## Security and compatibility findings

- Existing Supabase verified-claim identity/trusted app_metadata verifier unchanged; no user_metadata/header/request-ID trust added.
- Only configured campaign ID and scope can reach the unchanged upstream API mutation handlers. Actual ownership/tenant/brand association for the configured ID must reuse the accepted R2 campaign receipt before deployment; config validation is not a database ownership lookup. Bound campaign identity/FK semantics are existing persistence authority.
- Existing API project-write/owner checks and transaction authorisation/locks/CAS/idempotency, profile revocation, same-actor receipt acknowledgement/current-revision approval and calendar constraints unchanged. In-memory proof is not a substitute for runtime pool evidence.
- Schedule route calls the existing campaign calendar command, no social enqueue or provider dispatch. Preview render registry creates deterministic receipt metadata after active-profile/media checks, not AI generation. Missing/unavailable profiles remain409, missing persistence503. No profiles activated.
- Per-user rate/concurrency budgets remain existing per-process limits, not a new distributed aggregate-write guarantee. Permission bounds actor/scope/campaign, not a new content-item quota.
- Old release validators intentionally reject new env keys; no claim existing R1/R2 validator validates this new permission. Separate reviewed release-profile/config/artifact approval is a remaining gate, not bypassed here.

## Database/migration impact and remaining release prerequisites

No new schema/table/function/role/migration or privilege category introduced by this bridge permission. Reuse existing migrations20260903090000_create_campaign_spine_persistence and20260908100000_create_campaign_preview_registry; DO NOT reapply them or grant anything under this task.

IMPORTANT actual production composition in index.js createProductionApp shares brandBrainRepository.pool with auth, campaign repository and preview registry. Thus deployed BRANDBRAIN pool acceptance (BRAND_BRAIN_DATABASE_URL), not merely the optional CAMPAIGN_DATABASE_URL factory, is the relevant runtime evidence. No connection string inspected/disclosed. Use actual deployed-pool read-only evidence already accepted where applicable; only the additional draft/preview/calendar table/guard capability needs targeted proof if not established.

Before deployment, authorised operator supplies/reuses evidence of the ACTUAL runtime pool role, effective grants/row-lock capability and RLS boundaries for auth customer_profiles/tenant_memberships/projects/brand_brains, campaign relations and campaign_private guards, preview profiles and render receipts. Static repository initialization checks14existing campaign relations/RLS/browser-role isolation and9guard functions; preview registry also requires existing profile/receipt schema. Runtime principal needs existing SELECT/INSERT/UPDATE capabilities appropriate to command projections/events/receipts and profile/preview checks, no direct browser grants or RLS disabling. Do not assume current root/onboarding success alone proves all preview/scheduling privileges. No runtime SQL/DB evidence collected here, so this remains a release evidence prerequisite, not proof a migration/grant is missing.

Also required: independent source review; separately reviewed release profile supporting this exact new flag/binding; exact-source artifact and immutable digest; private binding to already accepted founder tenant/project/brand/campaign; exact-target founder deployment/config approval with preserved accepted R2/Step7 rollback; controlled browser draft/review/calendar acceptance. No new campaign/bootstrap, paid operation, provider activation, media profile provisioning or general flag enablement authorised.

Recommendation: source preparation/test PASS; deployment HOLD. Stop after this evidence packet. At the original source-preparation checkpoint no push/PR had occurred. Subsequent draft publication is separately authorised; no merge/deploy, database/IAM/secret change, source manifest update, customer/provider call or staging traffic/config modification is authorised.

## Review linkage

Related issue: https://github.com/shirrie01/bizgenie-api/issues/257 . This draft is for independent security review only. Existing R2/Step7 accepted deployment and campaign checkpoints remain preserved. Focused88/88 source evidence remains valid because the three implementation/test files are byte-identical to the recorded source patch; only these publication notes are added. Full/backend-PostgreSQL/hosted/customer checks are not newly claimed. Hosted exact-head CI is a separate publication result.
