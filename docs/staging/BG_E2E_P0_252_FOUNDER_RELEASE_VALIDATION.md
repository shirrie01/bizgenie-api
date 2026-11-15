# BG-E2E-P0-252 — founder-only release validation

14 November 2026. Founder authorises SOURCE AND TEST ONLY. Dedicated dependent branch from API250 exact head5fec887885c05d3c04f07093bf80e3436b47068c; main1858417f0fc0d21d7211795881c0eaa7732b63d0. Original worktrees and PR250 head preserved. No WEB86 modifications. This removes a source validation blocker, not any operator, independent review or deployment approval gate.

## Profile behavior

- Existing `validate-bridge-release.js` remains the all-writes-disabled validator. It now recognises optional `BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING` only when absent or exact string `false`, and optional `BG_BRIDGE_FOUNDER_AUTH_USER_ID`. Any supplied identity must pass the actual bridge's canonical lower-case UUID validation, even while OFF. Other required fields, allowed environment keys, immutable image/source/service/project/origin/upstream pins and all original gate checks are unchanged. It still rejects founder ON.
- New `validate-founder-onboarding-release.js` is the separately validated profile, following the existing workspace-only wrapper pattern. Absent/OFF delegates to read-only validation. ON must be exact string `true`, valid explicit UUID, staging only, with `founderOnboardingApproval`, `founderIdentityBindingEvidence`, `upstreamDatabasePoolEvidence`, and `upstreamAuthProvisionerEvidence` nonempty and not UNRESOLVED. No actual identity or approval is supplied by this task.
- The new profile rejects unknown top-level keys, including route/method/permission overrides. Environment fields remain strictly whitelisted. It validates an unmodified original candidate by checking a clone with founder flag OFF using the existing validator, then validates actual founder ON/UUID through the same `validateBridgeTarget` function used by the bridge. It never mutates the input. Existing broad bootstrap, general writes, draft, generation, social and checkout flags must all be false. All other evidence, public-origin and immutable artifact checks remain required.
- The existing workspace-only validator retains its approved original scope and rejects combining it with founder ON; its source did not change. It cannot be used to activate the three-route founder mode.
- No new runtime flag, route, authentication bypass, owner/tenant/RLS/CAS/rate/input policy or bridge handler change. The runtime three-route allowlist and P0-249C rate correction are inherited from250. The manifest cannot override that allowlist.

Example `scripts/staging/bridge-founder-onboarding-release.example.json` defaults founder OFF with no UUID and all other gates OFF. Unresolved operational fields are deliberate; it fails validation. Do not treat historical revision names in examples as current metadata. No usable live manifest is generated. After separate approvals, the operator must use verified values and set founder ON plus the privately-bound existing test account UUID; no actual founder ID goes in repository, browser env, logs, screenshots or public review comments.

## Offline command and output

```
node scripts/staging/validate-founder-onboarding-release.js /secure/reviewed-founder-release.json
```

OFF success: `OFFLINE_VALIDATED_NOT_DEPLOYMENT_APPROVAL`. ON success: `OFFLINE_FOUNDER_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL`. Success emits only status, sourceSha, service. Failure emits only `FOUNDER_ONBOARDING_RELEASE_NOT_READY`, exits1, no identity, file contents or stack trace. Existing generic validator status/error contracts remain unchanged. Evidence references are structural requirements, NOT verification that referenced approval exists, that the user is the founder, or that infrastructure is healthy. Independent reviewers/operators must verify them. Valid UUID syntax alone is not founder identity proof.

The profile has fixed targets: bizgenie-backend/europe-west1/bizgenie-studio-bridge-staging, existing reviewed staging identity and exact Studio Pages origin, private upstream service/tag constraints and staging Supabase project. It does not create resources, resolve credentials, contact Supabase/GCP, invoke SQL, build/publish an image or deploy. CI container-build success remains distinct from an immutable published registry image.

## Tests

Node22.23.3, existing dependencies; disposable local PostgreSQL17.11 only. Focused validators plus existing bridge config:18/18 PASS. Broader validator/bridge/workspace/onboarding/Brain/auth/tenant/PostgreSQL security checks:175/175 PASS, zero fail/skip/cancel. Full suite1334/1334 PASS, zero fail/skip/cancel; exact published SHA/CI evidence recorded in the checkpoint; no hosted result inferred from local checks.

New tests cover absent/OFF/ON, input immutability, missing/malformed UUID and flags, production/preview/unknown environment, all conflicting gates, all-gates-off rollback, prior workspace profile, unsupported route/permission/env fields, immutable target/pin/evidence rejection, actual runtime-config agreement, and CLI success/failure identity confidentiality using synthetic temporary JSON only. New source example remains fail-closed. Existing tests/assertions/skips are unchanged. No new dependencies installed.

Commands (TEST_DATABASE_URL solely the existing loopback5433 disposable server):

```
node --test test/founder-onboarding-release.test.js test/studio-bridge-release.test.js test/studio-bridge-founder.test.js
node --test --test-concurrency=2 test/founder-onboarding-release.test.js test/studio-bridge*.test.js test/customer-workspace*.test.js test/workspace-onboarding*.test.js test/customer-brand-brain-correction.test.js test/brand-brain-write-policy.integration.test.js test/customer-authentication.test.js test/authorization*.test.js
node --test --test-concurrency=2
```

Local artifacts: /workspace/recovery/bg-e2e-p0-252. No shared SQL or live write. Existing integration fixtures create/migrate/test/drop only their unique disposable local databases. There is no production-role/RLS/runtime acceptance claim from administrator test fixtures.

## Review / dependency / release boundary

Draft PR should target PR250's branch (`bg-e2e-p0-249b-founder-persistence`), because shared runtime validation depends on that contract. Do not modify or merge250 to accommodate this PR. After250 is accepted/merged, retarget this dependent PR to main, verify equivalence/conflicts and fresh required checks. If250 moves, recheck its contract before retargeting. No automatic merge authorised.

Claude independent review requested: strict OFF vs founder profile distinction, UUID confidentiality/provenance, explicit evidence, environment/route/flag rejection, actual runtime-config parity, preservation of old validator profiles and no operational side effects. Author self-review does not satisfy this gate. Exact-head hosted CI is required; if dispatch/PR creation Forbidden, preserve exact pushed branch/SHA/compare and handoff rather than assume success.

Still required before any activation: current serving Pages appSHA/deployment, bridge revision/image digest/publisher provenance/runtime principal/private upstream pins, actual gate values, configured test subject, database/provisioner and existing245 runtime acceptance evidence, real rollback identifiers and separately scoped founder artifact/deployment/configuration/controlled-customer-write approval. See existing BG-E2E-P0-251 package. No deployment, environment/IAM/secret change, Cloud Run Job, migration outside disposable fixtures, Stripe, paid provider or social operation performed. No real Fonzo acceptance; launch NO-GO. Governance updates only to existing249/191 and sole Mission Control, with SYNC PENDING if access fails; no duplicate tracker.
