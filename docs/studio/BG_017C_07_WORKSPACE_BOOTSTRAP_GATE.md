# BG-017C-07 — Exact workspace-bootstrap gate

8 November2026. Founder authorises CODE AND TEST ONLY on existing API229. User instruction explicitly supplies the scope and correct negation; referenced proposal6728069169/approval6728119238 reads returned Forbidden. No approval inferred for deployment, flag activation or customer creation. Claude owns independent security review. No frontend files changed.

## Implementation

BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP defaults OFF (only exact environment string true enables its boolean). The broad deny condition begins `!['GET','HEAD'].includes(req.method)` as required. With broad writes false, the sole exception requires ALL of: allowWorkspaceBootstrap===true, method POST, original URL exactly /customer/workspace/bootstrap. Query strings, trailing slash, prefix/suffix and other methods cannot obtain this exception. Existing allowlist validation still precedes it; invalid paths/methods remain404, other allowlisted writes403 STAGING_WRITES_DISABLED. GET/HEAD and OPTIONS remain unchanged. OPTIONS is not actual-write approval.

Bootstrap POST parser now caps decompressed request bytes at2KiB, independently of broad write flag. Over-limit413 BRIDGE_REQUEST_TOO_LARGE, including multibyte payloads; existing auth happens before parsing. Existing identity-token verification permits fresh unscoped customer JWT, but no absent/invalid token; normal IAM/server-header protections, target pins, timeout/rate/response limits and upstream membership/provisioning authority remain intact. Bridge does not own a database or service-role key.

BG_BRIDGE_ALLOW_WRITES, BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION, BG_BRIDGE_ALLOW_SOCIAL_WRITES and BG_BRIDGE_ALLOW_STRIPE_CHECKOUT remain false in both release examples. No running flags changed. Broad-write semantics for independently authorised future profiles are not silently removed.

## Separate release validation

Read-only bridge-release.example.json includes bootstrap=false and original validate-bridge-release.js rejects bootstrap=true. New bridge-workspace-write-release.example.json has bootstrap=true but deliberately unresolved approval/database/provisioner evidence. New validate-workspace-write-release.js requires explicit workspaceBootstrapApproval, upstreamDatabasePoolEvidence and upstreamAuthProvisionerEvidence, validates the same exact source/digest/project/region/service/identity/origin/upstream pins, and rejects ANY broad/paid/social flagtrue. It clones input rather than mutating it. Offline structure/reference checks do not establish actual infrastructure truth or deployment approval.

Command for independently reviewed, populated metadata file ONLY: node scripts/staging/validate-workspace-write-release.js /secure/reviewed-workspace-write-release.json. Output OFFLINE_WORKSPACE_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL is not permission to deploy. The checked-in example fails closed. No resource, secret value or live evidence was fabricated.

## Required upstream readiness — live INACCESSIBLE

Source evidence: createProductionApp constructs/initialises PostgresBrandBrainRepository from BRAND_BRAIN_DATABASE_URL and shares its pool with PostgresCustomerWorkspaceRepository; pool bounds use BRAND_BRAIN_DB_POOL_MAX/CONNECTION_TIMEOUT_MS/IDLE_TIMEOUT_MS. It constructs CustomerScopeProvisioner from SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY via server-only Supabase admin client. Both absent yields unconfigured provisioner; partial configuration fails. Bridge needs only public auth config; do NOT put service-role/database secrets in bridge.

This proves source wiring, NOT that the deployed private staging revision is configured/usable. Existing cloud discovery failed at ADC authentication before resource access; no working connected cloud tool is available, and no credential recovery/repeated cloud attempts made. Current serving revision/source, pool-binding metadata, staging Supabase project binding, service-role secret resource/version and effective runtime access are UNVERIFIED. No secret payload, database connection/query or workspace request executed.

Before any workspace-write deployment approval, an authorised read-only operator/reviewer must bind metadata to exact pinned upstream revision/source: (1) server DB configuration binding exists and targets approved staging; (2) Supabase URL is staging zrczojyxebwjgpymbmgu; (3) server-side service-role binding/resource/version exists and reviewed runtime can access it, with no production/shared-secret exposure; (4) source composition matches this service. Metadata alone cannot establish a working DB transaction or successful Auth-admin operation. Actual functional bootstrap requires a separately approved controlled staging write and is NOT RUN here. Never export values or run SQL to fill this report.

## Tests and independent review

New tests: exact authenticated bootstrap with2KiB boundary/over-limit/UTF8; query/path/method bypass denial; all35 other allowlisted write variants403 with no IAM/upstream call; unchanged GET/HEAD/OPTIONS/defaultOFF; separately validated workspace spec and broad/paid flag rejection/missing-evidence rejection. Existing tests cover origin/target/token/tenant/privilegedheader/response safety. No assertion weakened or skip added. No real database write run in this task: local full regression explicitly unsets TEST_DATABASE_URL/DATABASE_URL; database integration suites remain reported skips. Existing pre-authorised CI may run its own disposable test fixtures; no shared environment is targeted.

Claude review checklist: check negation; originalURL equality and no encoded/query bypass; auth-before-upstream;2KiB byte cap; negative35-route list vs current allowlist; all broad/paid/social gates false; release-validator separation; no credentials or DB authority in bridge; exact upstream metadata blocker; tested source equals reviewed final PR229 head.

## Rollback / activation boundary

No merge/deploy/flag/IAM/traffic change authorised. After a separately approved deployment, rollback is an approved bridge-only config change BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP=false, or restore the recorded prior bridge revision if code rollback is needed. Preserve existing API revision/traffic, all four broad/paid/social flagsfalse, existing customer records and ledger; no downSQL/reset/recreate. Re-run OPTIONS/read401 plus bootstrap403 with flagoff. Do not execute rollback or activation here.

GitHub229/191 and primary18-tab MissionControl checkpoint only when authorised writes succeed; otherwise structured NOT WRITTEN handoff. Issue1 remains recovery-only. CI/run/SHA evidence is provided by final publishing manifest; no hostedGREEN inferred from local tests or prior head.


Local evidence: focused20/20 PASS; no-database full regression943/943 PASS,0FAIL. Seven PostgreSQL suites explicitly not run because database URLs were unset (Node summary's skipped-test count is0 because these are skipped suites). No new test skip introduced. Syntax/diff checks PASS. Logs /workspace/recovery/bg-017c-07/focused.log and full-no-db.log. Prior1151/1151 PG-enabled run belongs to earlier head, not evidence for this new change. Hosted exact-head CI must be separately verified; inaccessible API is not a green result.
