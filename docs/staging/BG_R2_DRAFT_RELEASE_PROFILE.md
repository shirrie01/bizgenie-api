# BG-R2 founder-only draft release profile — local review proposal

Base: `59d9b36a1fb42309563ceda821b19b55faa52c0a` (PR #261). This proposal adds a separate validator, example and tests. It changes no runtime permission logic, accepted validator or private manifest. No deployment is authorised by validation.

## Contract and security boundary

`scripts/staging/validate-founder-draft-release.js` delegates to the unchanged founder-campaign validator after removing only this profile's fields. Existing staging, upstream, founder, root-body-hash and disabled-gate checks still apply. It also invokes the runtime's `validateBridgeTarget()` for configuration parity.

The new permission defaults OFF. Enabling it requires:

- `BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW=true` and all three existing founder onboarding, recommendation and campaign-root permissions preserved as true.
- Four private `BG_BRIDGE_FOUNDER_DRAFT_` pins: `TENANT_ID`, `PROJECT_ID`, `BRAND_ID`, `CAMPAIGN_ID`, plus the existing verified `BG_BRIDGE_FOUNDER_AUTH_USER_ID`.
- An exact five-field `founderDraftCampaignBinding` record (`auth_user_id`, `tenant_id`, `project_id`, `brand_id`, `campaign_id`) matching those pins; the first three scope pins must also match the accepted campaign-root scope.
- Genuine `founderDraftWorkflowApproval`, `founderDraftCampaignBindingEvidence`, `draftWorkflowDatabasePoolEvidence` and `founderDraftRollbackEvidence` references. Empty or unresolved evidence fails.
- General writes, broad workspace bootstrap, broad draft workflow, generation confirmation, social writes and Stripe checkout all disabled.

Equality checks do not independently prove account ownership or database authority. The binding evidence must link the existing authenticated founder and accepted campaign receipt to the private tuple. Evidence references require independent review; an offline validator cannot authenticate their contents.

The example is deliberately unresolved and OFF, not a runnable release candidate. Stale draft pins/binding are rejected when OFF. To validate a legacy OFF configuration, omit the draft pins and binding and use the existing accepted profile. Never copy private values into tracked files.

Runtime route admission remains the reviewed eight exact POST routes (content-items plus seven variant actions), with verified identity, scope checks, rate limits and 16 KiB body cap. Query bypasses, alternate methods and unrelated writes remain denied by the existing runtime tests. This proposal does not expand that route list.

## Release checklist — HOLD until separately approved

1. Independently review this four-file source delta. Obtain accepted source SHA and exact-head CI before any build decision. No push, commit or PR creation is part of this preparation.
2. Privately bind the actual founder and already-created campaign using authenticated acceptance evidence. Preserve existing root body hash and all upstream pins. Do not invent a campaign or use synthetic test identities in a release candidate.
3. Obtain read-only evidence from the actual deployed application database pool for campaign, preview/receipt and scheduling relations: effective role, grants, RLS context and schema compatibility. Production composition uses the Brand Brain repository pool from `BRAND_BRAIN_DATABASE_URL`; a separate optional campaign factory configuration is not proof of the deployed pool. Accepted root creation alone does not prove every draft/preview/calendar operation. No new migration or grant is introduced by this profile; missing runtime permissions remain a release blocker, not authority to change them.
4. Retain the accepted R2 immutable image `sha256:5f4519afba18377726460273d668cad1b3f961222a357cf16c1fe9e5b33e8c9c`. Obtain the exact accepted R2 revision and its image association from operator evidence; that revision is unresolved locally. Record both under `founderDraftRollback.acceptedR2`.
5. Preserve Step 7 fallback revision `bizgenie-studio-bridge-staging-step7-c023184c` and image `sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18` under `founderDraftRollback.step7`. Both images use `europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@` followed by the digest. The validator pins these recorded images; it does not query traffic or registry state.
6. A future separately approved build needs a distinct immutable image containing the reviewed draft implementation and validator, source provenance and independent registry readback. The accepted R2 image is a rollback target, not evidence that it includes the extension. No image was built here.
7. Complete a separate private candidate with genuine approvals and evidence, then run the new offline validator. A PASS means only `OFFLINE_FOUNDER_DRAFT_VALIDATED_NOT_DEPLOYMENT_APPROVAL`.
8. Obtain Claude's independent review and exact-target founder deployment/configuration approval. Preserve existing R2/Step 7 revisions and rollback evidence. No activation follows automatically.
9. After separately approved deployment, controlled founder browser acceptance must prove draft save/reload, review and calendar persistence, with other identities denied and paid operations still disabled. On boundary failure, stop writes and use the previously approved rollback procedure; do not improvise IAM, schema or traffic changes.

## Local verification

Node 22.23.3: six focused suites, 34/34 PASS, zero failures/cancellations/skips. Includes the new validator tests, all four existing release-validator suites and founder-draft runtime tests. New tests cover missing/mismatched bindings, conflicting gates, unresolved evidence, production configuration, rollback drift, legacy delegation, input immutability and redacted CLI output. Syntax and whitespace checks accompany the review artifact.

Only synthetic local fixtures were validated. No real private candidate, cloud call, database operation, customer mutation, build, deployment or provider call occurred. Deployment recommendation: HOLD pending the checklist above.
