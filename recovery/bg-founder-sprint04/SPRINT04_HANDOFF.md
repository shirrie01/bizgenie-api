# BG-FOUNDER-SPRINT-04 — one read-only preparation diagnostic

## Preserved authority

Pinned funding transfer d4c2f5aa9992eed2044c79e87b457a325f513df6; funding CLI SHA2563567b59a3e5b563488bb07e2400f8d978e701ece4c882e32c01d3f1b57c1e570 unchanged. Approved application source20951d143bcbcb140bb160f5b81f4e86f329345b unchanged. Founder binding approval #191/7118635015 and finance read-only preparation approval #191/7118457557 are founder-supplied verified records; executor API read of7118635015 returned Forbidden. No new ownership/authentication investigation, installation or private-config edit.

## Confirmed findings (offline evidence, not the live cause)

The original CLI catch emits e.safeCode or one generic fallback. DNS/SQL/TLS and filesystem errors usually lack safeCode. Billing initializer validation errors use code BILLING_NOT_CONFIGURED, also masked. Underlying driver errors inside initialize are wrapped by repository.read(); the stage and driver category can be lost. An exception from pool.end() in finally can replace the first connection/query failure. Offline VM tests execute the exact pinned original prepare code against synthetic modules/clients/filesystems and reproduce DNS, schema and plan-save failures with the same generic HOLD; a later cleanup error replaces the earlier DNS error. No original asset was patched or executed against a database.

These are confirmed diagnostic deficiencies, not proof of the current staging fault. Remaining possible causes include connection/TLS/CA path, authorised role, schema/constraint/privilege/price compatibility, or local plan-path/storage failure. The existing generic result cannot distinguish them. Do not claim a live root cause before a safe-stage result.

## Read-only proof

Source inspection plus mocks confirm createPostgresBrandBrainRepositoryFromEnv and repository constructors issue no SQL. The funding prepare path begins READ ONLY before role/schema/policy/account queries. PostgresBillingRepository.initialize executes exactly five pinned catalog SELECT/WITH-SELECT queries; it does not seed, migrate, insert or initialise records. The original Brand Brain initialize method is not invoked by this operator script; even it only performs a LIMIT0 SELECT. No database writes are attempted in original prepare mode.

New diagnose-founder-prepare.cjs has no funding/compensation mode, never imports BillingService, never runs the original funding CLI, and never creates a plan/result file. It uses the already-loaded private credential, existing config and pool factory. It checks configured CA-file existence without reading/exporting CA contents and never changes TLS verification. An exact SQL digest allowlist includes the five pinned initializer statements plus fixed original preparation SELECTs and READ ONLY/timeout/ROLLBACK controls; any other statement is refused before the native client. It neither retrieves credentials nor changes grants/roles/configuration.

One connection attempt only; bounded metadata calls, connection/query/overall deadlines, transaction-local limits, rollback/release/discard and bounded pool shutdown. First failure is retained even if wrapping/cleanup also fails. Output contains only fixed stage IDs, PASS/HOLD, allowlisted error categories and capability flags; no SQL, parameters, connection URL, raw errors/stack, private identifiers, approval payloads or scope values. This is an operator connection observation, not proof of the serving API's existing in-memory pool.

## Offline verification

17/17 tests PASS, zero skips, Node22.23.3; CLI supports the already-installed Node22.23.5. Tests cover actual pinned billing initializer with synthetic clients; all five schema-validation stages; DNS/TCP/auth/TLS categories; underlying driver-error preservation; missing-password and CA references; role/policy/account/reservation conditions; SQL mutation/unknown-query refusal; timeout/discard/cleanup; constructor no-SQL; unsafe category keys; private-file/CLI guards; complete pinned original prepare failure reproductions. No real cloud, database, credential retrieval or provider call. No application regression rerun required because application/funding logic was not changed.

## One explicit invocation

Retrieve only the new diagnostic from the existing private GitHub transfer branch at the exact published commit in the accompanying checkpoint, without switching the source checkout. Verify its published checksum. Existing funding assets/config/Node22/dependencies remain untouched.

Use the existing selected Node22 environment and already-approved loaded BRAND_BRAIN_DATABASE_URL. If unavailable, STOP; do not retrieve it again automatically or repeat installation. Run exactly:

NODE_NO_WARNINGS=1 node "$HOME/bizgenie-r1/diagnose-founder-prepare.cjs" "$HOME/bizgenie-r1/founder-funding.private.json"

The only CLI argument is the existing private config path. No values need re-entry. Suppress raw stderr at the operator wrapper; the utility emits sanitised JSON to stdout. A HOLD exits1; preserve that single redacted JSON. Do not retry the original prepare script or invoke execute/compensate.

Expected outcome: HOLD with failure.stage/category for the FIRST failure, plus completed safe-stage records; or READ_ONLY_DIAGNOSTIC_PASS with planCreated=false, fundingExecuted=false and planFileCreation=NOT_TESTED_READ_ONLY. A PASS does not mean the original prepare succeeded or prove a filesystem file-create can succeed under disk quota/races; it narrows any remaining issue to original local persistence/conditions not observable without file creation. Existing plan/result presence stops rather than overwrites them.

## Decision and continuation

Current live cause UNCONFIRMED. One explicit read-only diagnostic observation is the next step, not an automatic retry. Expected operator execution1–2minutes. A missing CA/permission/local path or schema result yields a single scoped corrective proposal; do not relax TLS, migrate, grant IAM or change prices automatically. No finance-logic correction is currently justified by evidence. If source correction becomes necessary, produce a separate diff/checksum/review; the pinned funding asset remains untouched.

Do not fund, deploy, enable diagnostics, create Cloud Run Jobs, write SQL, install software, change IAM/secrets/flags or call providers. After the diagnosed cause is resolved and original read-only prepare independently accepted, exact funding-plan approval remains required, followed by BG-017C and live founder acceptance. No previous PASS downgraded.
