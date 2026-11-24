# BG-FOUNDER-SPRINT-02 — final executable handoff, NOT execution approval

23/24 November 2026 preparation. No SQL, cloud command, funding, runtime configuration or provider operation executed here. This is a local operator asset, not an application feature, DB function, migration or HTTP route. Existing application source and diagnostic patch unchanged. Independent review and exact-plan execution approval remain required.

## Files and private inputs

Upload founder-funding.cjs and founder-funding.private.example.json into the existing Cloud Shell ~/bizgenie-r1 directory. Do not upload a private manifest into GitHub. Use existing Node22, gcloud login, repository dependencies and an already-authorised staging finance database configuration. No install, new credentials or secret retrieval is part of these instructions.

The JSON example deliberately contains nulls: they are missing inputs, not invented operator names/identifiers. Before running prepare, privately fill:
- repoPath: existing absolute repository path at approved20951d143bcbcb140bb160f5b81f4e86f329345b. Billing and pool-factory source must match it; no installation.
- bindingFile / bindingSha256 / bindingEvidenceRef: existing approved private founder manifest and genuine evidence URL. bindingFormat=diagnostic uses its founderId/tenantId/projectId/brandId/campaignId; r2-release uses its existing environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID and BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID/PROJECT_ID/BRAND_ID, plus acceptedCampaignId from existing accepted campaign evidence. Do not guess IDs or create a campaign. The old diagnostic expiresAt is not reused as funding approval.
- operatorName and operatorGoogleAccount: actual named authorised operator, matching the existing active gcloud account. No name/account is fabricated in this handoff. approvedOperatorDbRole: separately approved operator finance role, not an assumption from SQL Editor or serving application role.
- runtimeEvidenceRef: genuine accepted billing compatibility record. runtime.revision/imageDigest/serviceAccount/dbSecretVersion: exact existing founder-serving API metadata. 00030-pob/latest is the currently recorded candidate, not permission to change it; correct only from independently accepted current evidence.
- planFile/resultFile: new absolute file paths outside the repository, e.g. under the existing private ~/bizgenie-r1 directory. They must not overwrite the original binding/config. Directory must already exist.
- Leave approvedPlanSha256/executionApprovalRef null until the exact prepared plan and a separate execution approval are reviewed. Leave rollbackApprovalRef/rollbackAuditId null until separate compensation approval.

Private config, binding and prepared plan must be owned by the operator and readable only by that operator (mode600). No database URL, JWT, admin key or secret value belongs in this JSON. The script reads BRAND_BRAIN_DATABASE_URL only from the operator's already-loaded private environment, never gcloud Secret Manager. It rejects absent URL, production project, ambiguous PG defaults/overrides and wrong staging host/user/database. Do not paste credentials into commands, logs or chat.

## A. Exact commands — read-only preparation only

Run after uploading files and privately completing the fields above:

```bash
cd "$HOME/bizgenie-r1"
umask 077
# Preserve an existing private configuration; never overwrite it with the blank example.
if [ ! -e founder-funding.private.json ]; then
  cp -n founder-funding.private.example.json founder-funding.private.json
fi
chmod 600 founder-funding.private.json
${EDITOR:-vi} founder-funding.private.json
node --check founder-funding.cjs
# Stop if existing private database configuration is not loaded; do not retrieve/create credentials.
: "${BRAND_BRAIN_DATABASE_URL:?Existing authorised private finance configuration is required; stop}"
node founder-funding.cjs prepare "$HOME/bizgenie-r1/founder-funding.private.json"
```

Before prepare, set the existing bindingFile to mode600 through the operator's normal secure file controls; do not print its contents. `prepare` performs only Cloud Run/auth metadata reads and READ ONLY database transactions. It does not prove the old API's in-memory pool. It verifies the exact configured revision digest/SA/Ready status, staging database secret reference, literal billing/Supabase/policy/class settings, expected operator SQL role and the existing durable billing initializer using catalog SELECTs. Any unavailable/incompatible configuration stops; no flags or schema are repaired.

Prepare requires no serving founder entitlement and no reservations. It records the existing account (or a stable proposed account ID only if absent), stable new entitlement ID, actual server plan_code, baseline ledger/count, expiry, source and binding evidence hash. All IDs stay in a new mode600 planFile. Output contains only PREPARED_NOT_AUTHORIZED, operator MATCH, a plan checksum and baseline amounts. Reuse this plan, do not overwrite/regenerate it after any partial execution.

The operator privately reviews the generated plan, supplies its exact checksum in approvedPlanSha256, and obtains a genuine founder execution comment approving that exact plan/operator/100-credit grant and its rollback boundaries. Store that URL in executionApprovalRef. An approval URL's syntax is checked; its human authority must be independently verified, not assumed by the script. STOP HERE until final execution approval.

## B. Exact command — only AFTER final finance execution approval

```bash
cd "$HOME/bizgenie-r1"
node founder-funding.cjs execute "$HOME/bizgenie-r1/founder-funding.private.json"
```

The script rechecks operator/binding/source/runtime metadata and exact approved plan hash before mutations.

Transaction1 locks only the target tenant/account; rechecks active staging.standard.v1 at100; reuses/creates only the target account; rejects any different account/entitlement/period; appends one active entitlement with no Stripe ref. starts_at and reference_period_start come from database clock_timestamp at millisecond precision. ends_at and reference_period_end are exactly2026-11-30T23:59:00.000Z (exclusive end at that instant, not silently1December). The persisted start is reused on retry.

After transaction1 commits, a short guard transaction holds policy/entitlement shared locks, not the account lock. The EXACT existing grant call is:

```js
await service.grantMonthlyCredits({
  tenantId: scope.tenantId,
  idempotencyKey: monthlyGrantIdempotencyKey(plan.entitlementId, iso(e.reference_period_start))
});
```

Here `service` is the existing BillingService with existing PostgresBillingRepository; both use the existing configured pool factory and operator connection. No paid-beta activation function or raw ledger INSERT is used. The service takes its own account lock/transaction and preserves intent hashing, tenant/account/entitlement binding and one-monthly-grant uniqueness. Policy/entitlement shared locks avoid concurrent retirement/period changes during the call; no nested account-lock deadlock.

Then a READ ONLY verification requires one exact entitlement and one100-credit grant, baseline+100 ledger and available balance, zero reservations and exactly one extra ledger entry. It records raw financial identifiers only in the operator's mode600 resultFile, never stdout. A concurrent financial change yields HOLD instead of a fabricated success.

No automatic repeat or compensation occurs. All failures return a fixed safe HOLD code; database/SDK/connection error details are suppressed. No Stripe/provider services are instantiated and no customer campaign action is called.

## C. Lost response / partial failure: exact read-only command

```bash
cd "$HOME/bizgenie-r1"
node founder-funding.cjs verify "$HOME/bizgenie-r1/founder-funding.private.json"
```

- If FUNDED_VERIFIED, stop: never fund again. Existing resultFile makes execute refuse and directs you to verify.
- If transaction1 committed but grant is absent, verify returns GRANT_NOT_VERIFIED. Under the SAME original approval and unchanged private plan, the operator may deliberately rerun the SAME execute command. It reuses the stored start and same canonical key. It will not create another entitlement or double-grant.
- If no entitlement exists after failure, do not recreate the plan; the same execute command uses the same stable IDs and creates the first entitlement at actual execution.
- Any conflict, changed baseline, consumption/reservation, policy expiry or unknown outcome stops for readback/review. Never choose a new key, new plan, Stripe event or second entitlement to bypass failure. If a result file is present but API acceptance later fails, do not delete it to repeat funding.

Serving API acceptance is separate from operator/schema evidence: through the existing founder browser/session read GET /customer/billing/subscription with the already-approved tenant scope. Require HTTP200, expected active subscription and available_credits matching the verified ledger. Do not print the JWT or private tenant query. The script does not claim that metadata plus an operator connection observes the existing API pool; BG-017C's in-process diagnostic remains next.

## D. Rollback / compensation — separate approval required

Before transaction1 commit, the script rolls back on failure. If committed, preserve account, entitlement and ledger history.

After separately approving exact compensation/audit reference and setting rollbackApprovalRef and rollbackAuditId privately:

```bash
cd "$HOME/bizgenie-r1"
node founder-funding.cjs compensate "$HOME/bizgenie-r1/founder-funding.private.json"
```

It validates the same scope/plan/operator. If entitlement is unfunded and baseline unchanged, it deactivates only that entitlement. If funded and exactly the original grant remains unspent/unreserved, it deactivates that entitlement and invokes existing BillingService.adjustCredits with direction debit, amount100, approved audit ID and fixed rollback:<original monthly key>. A repeat must match the previous compensation exactly. No deletion, refund fabrication or other tenant/account freeze occurs. Consumed, reserved or additional financial activity blocks automatic compensation; finance reconciliation is required. Expiry does not erase credits automatically; use the approved compensation/expiry procedure before any later re-entitlement.

## Final approval and next task

Funding inputs/operator and actual runtime compatibility are not populated or confirmed in this executor. No live operation is authorised by this document or the accepted-in-principle decision. Independent review of this exact operator script and generated private plan is required before final execution approval. No application PR, migration, policy or new infrastructure is introduced.

Once funding + customer billing read are independently accepted, move directly to the already-prepared BG-017C diagnostic closure and live Fonzo founder acceptance. Paid generation/regeneration still requires exact scoped provider/spend approval and existing caps. No new workstream or completed launch gate reopened.

Local validation: Node22 syntax plus offline fail-closed checks only. No database or cloud call executed; no claim of a successful funding or runtime compatibility proof. Mission Control/GitHub sync NOT WRITTEN; retain this handoff, script checksum and later redacted results for the existing BG-017C records.
