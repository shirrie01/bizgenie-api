# BG-GJ-02 — Golden Journey v1

Source/test/CI only. Approval API258 comment6963482070 and Claude review6963455661 supplied by founder; GitHub reads Forbidden here. No live acceptance claim, deployment, provider, Stripe, social or WEB work. Existing Phase1 golden integration is reused unchanged; NO Phase2 chained extensions are implemented.

## One command, fail closed

`npm run test:golden-journey`

Requires TEST_DATABASE_URL for an explicitly disposable loopback PostgreSQL17 test instance and GOLDEN_JOURNEY_DISPOSABLE=true. URL must use postgres/postgresql, a literal loopback/localhost host, nonempty local test credentials, /postgres admin DB, no query/fragment/host override or known hosted-service string. No staging/prod URL or arbitrary existing customer database name. Explicit disposable attestation is required; loopback alone cannot prove a tunnel/instance is disposable, so an operator must NOT attest a forwarded/shared database. Existing CI postgres:17 service supplies this isolated instance; no new infra or installation.

The existing golden fixture creates a fresh random database, applies the existing repository test migration chain and synthetic fixtures INSIDE that disposable database, uses real API routers/repositories and fake identities/Auth admin, and tears down through existing drained-pool helpers. No SQL/migrations against connected staging/production. Existing local development PostgreSQL can be used only when confirmed disposable; do not aim the command at a customer database. Runner never discovers/downloads credentials or resources.

Preloaded no-real-network guard in every curated child process blocks non-loopback fetch/HTTP/socket/DNS and UDP plus shell/non-Node subprocess escapes. Node descendants inherit guard/database policy. Child env is whitelisted: no provider/Stripe secrets, cloud flags, proxy env or arbitrary NODE_OPTIONS. Local ephemeral Supertest listeners and the configured disposable PostgreSQL use loopback. This is an in-process regression safety guard for reviewed suites, not an OS sandbox against malicious test code replacing Node builtins. No real providers/financial calls are authorised.

## Honest stage report

Default artifacts/golden-journey/report.json + report.md (gitignored). Five stages:
1. Existing customer-golden-journey.postgres.integration.test.js:3 tests chaining bootstrap/resume/Brain/goal/recommendation/campaign/content/calendar, tenant denial and revocation.
2. Customer authentication and founder bridge/Step7 suites:27 independent contract tests.
3. Customer campaigns and copy revisions:14 independent contract tests.
4. Private media delivery:21 independent tests.
5. Customer billing state and social contracts:11 independent tests.

Observed v1 total76 PASS,0 FAIL,0 SKIP on disposable PostgreSQL. Only stage1 is the existing chained golden fixture. Other stages are independent curated suites, NOT end-to-end proof of live media/billing/social. Hosted customer browser, real OAuth, generation, Stripe and publishing remain NOT RUN; WEB leg NOT_IMPLEMENTED_V1. Report captures source SHA/dirty-tree metadata and actual stage counts. Missing/invalid DB => BLOCKED and every stage NOT_RUN; failing/skipped/missing-count/timed-out subprocess cannot yield PASS. Raw credentials and test output are not copied into reports. Report PASS is LOCAL_AUTOMATED only.

CI adds the single npm command using its existing PostgreSQL service and uploads only JSON/Markdown reports with always(). If dependency setup stops before runner execution, missing report is not a PASS. Guard/refusal/report unit tests cover unsafe targets, no tests before validation, skip/failure honesty and external-network refusal without making an external request.

No Phase2 adapters, provider calls, WEB leg, new application architecture or source/runtime flags. No new work tracker. Claude review/hosted CI remain required; overall launch NO-GO.

Local verification: runner/guard unit tests5/5 PASS; single v1 command76/76 PASS (golden3 + curated73),0 skips; full backend suite1136 PASS,1 SKIP,0 FAIL. No WEB leg or Phase2 implementation. Initial v1 execution before linking existing dependencies correctly reported FAIL for missing modules; after reusing installed node_modules (no install), verified stage counts passed. Source/dirty-tree metadata remains honest for local working-tree runs.
