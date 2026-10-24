# BG-STUDIO-014-BE — Owner-only Brand Brain identity writes

2026-10-24. Implemented on isolated `bg-studio-014-identity-write-policy`, based on canonical #213 at `120a874dfa02313a8c28dad82ddb6582f0065469`. **Code SHA: `b4a22923f841f4a1ea55aece36fbe538669127fa`.** Staging remains RED; no deployment or acceptance claim.

Authority: founder-supplied DEC-021 / LOCK-019 and resolved DEC-022 / LOCK-020. [Approval comment](https://github.com/shirrie01/bizgenie-api/pull/213#issuecomment-6386570421). Reading that exact comment returned REST Forbidden; latest PR/issue content and live Google Sheets Mission Control remain inaccessible here. The founder's explicit instruction resolves the prior decision gate; no repeated approval was requested. Mission Control remains sole governance authority. No duplicate tasks/registers or original #213 changes.

## Enforcement and path coverage

- Customer `PUT /customer/workspace/brand-brain`: verified customer actor and trusted scope remain mandatory. Current membership/project authority is rechecked and locked inside the database transaction. The current Brain is locked FOR UPDATE; its effective name/description are compared to the proposed replacement. Only current owners can change either, including deleting description by omission. Members retain unrelated replacement edits if these two fields are unchanged. Unauthorized membership now returns 403 rather than the earlier customer validation400.
- Admin `PUT /_admin/brand-brains/:brandId`: admin-key-only creation and name/description mutation return403. Admin reads and unrelated corrections remain functional. Identity changes require the existing verified owner customer route; adding an owner bearer to the admin route is not a shortcut. Existing project-conflict409 is retained.
- Bootstrap creates initial owner membership/Brain in its existing transaction; ON CONFLICT DO NOTHING never overwrites an existing Brain. Additional-workspace creation now holds its owner membership row lock through insertion/commit, preventing revocation between owner check and identity creation.
- Raw repository upsert remains a trusted internal/seeding primitive, not a request-authorized customer mutation. Both correction routers now call guardedUpsert. Search of production `src` found no other Brain update callers; campaign, generation and onboarding preferences continue reading/separately persisting as before. Direct privileged database maintenance is outside application policy and is not authorized here.

Membership revocation/demotion committed before the authority lock denies the write. Revocation arriving after the lock waits for the already-authorized transaction to commit. This provides a defined ordering, not retroactive recall. Brain row serialization and exact expected-snapshot comparison reject overlapping stale server snapshots with409; an old full payload cannot restore identity through a member/admin request. Rejections are atomic, without silent field dropping or partial success.

## Affected files

| Files | Change |
|---|---|
| `src/brand-brain/writePolicy.js` | Effective protected-field comparison, forbidden creation/mutation, stale snapshot conflict |
| `src/brand-brain/{repository,postgresRepository}.js` | Guarded write interface, synchronous memory boundary, transactional PostgreSQL authorization/row locks |
| `src/brand-brain/router.js` | Admin writes use guarded path |
| `src/customer-workspace/{service,router}.js` | Customer guarded writes and structured policy errors |
| `src/customer-workspace/postgresRepository.js` | Additional-workspace authority lock |
| `test/brand-brain-admin.test.js` | Approved admin contract regressions; fixtures seeded internally rather than through prohibited admin creates |
| `test/customer-brand-brain-correction.test.js` | Owner/member HTTP, removal, revocation/nonmember and concurrent snapshot regressions |
| `test/brand-brain-write-policy.integration.test.js` | Disposable real PostgreSQL security/locking/concurrency tests |

No schemas, migration files, onboarding preferences, Brand Brain sector/channel ownership, entitlements or provider controls changed.

## Contract / frontend integration

Request and response envelope, existing PUT replacement semantics and trusted scope selection are preserved. Name remains required; optional fields omitted from PUT still replace/remove those fields. A member/admin omitting an existing description therefore receives403 rather than erasing it. Other identity fields (mission/vision/values/positioning) remain editable without ownership when protected fields are unchanged.

- `403 BRAND_BRAIN_WRITE_FORBIDDEN`: prohibited identity mutation/create or revoked/nonmember write. Frontend should keep identity controls read-only for members and explain owner authority, while retaining unrelated editing. Role-based UI is guidance; backend rechecks are authoritative.
- `409 BRAND_BRAIN_VERSION_CONFLICT`: record changed between server read and locked commit. Reload and reconcile before resubmitting; do not blindly retry a full stale document.
- Database failures continue fail closed with503; unknown commit outcomes are not proof that nothing saved.

This is not a new client-provided CAS or idempotency contract. The existing customer service does not consume a client expected-version token. Owner-authorized stale edits submitted after an earlier operation completed remain subject to existing replacement semantics; member/admin identity rollback is nevertheless denied against the current locked row. A separate broader edit-history/CAS feature was not introduced.

## Local evidence

Node **22.23.3**, PostgreSQL **17** in the existing loopback-only disposable development container. Tests create/drop new uniquely named disposable databases and exercise existing DDL only there. No connected/shared/staging database writes or migration applications occurred.

| Check | Result |
|---|---|
| Full `node --test` with disposable `TEST_DATABASE_URL` | **700 passed; zero failed/skipped/cancelled** |
| Focused customer/admin HTTP + new PostgreSQL policy tests | **23 passed; zero failed/skipped** |
| New real PostgreSQL policy suite (included above) | **7 tests**: owner/member fields, admin/nonmember/foreign scope, stale/concurrent writes, revoked additional-workspace creation, revocation/demotion-before-lock, revocation-after-lock |
| Billing/campaign/onboarding PostgreSQL regression suites | **65 passed; zero failed/skipped** |
| `node --check index.js` plus all src/test JavaScript | Passed |
| `git diff --check` | Passed |

Local logs: `/workspace/.onboarding/bg014-full-final.log`, `bg014-focused-final.log`, `bg014-regressions.log`. PostgreSQL races use controlled barriers and actual `pg_blocking_pids` observation, not an assumption from JavaScript event order. One initial test-harness error (multiple prepared statements) and missing wrapper query capability were corrected before the passing runs; no production assertions were weakened or tests skipped. The final full run includes all final functional changes.

## Publishing / CI boundary and remaining risks

Native git pushed the isolated feature branch. Draft creation was attempted with base `bg-studio-010-be-onboarding-persistence`, keeping the diff scoped to #213's approved architecture rather than duplicating its implementation. GitHub GraphQL returned **Forbidden**; **no draft PR URL was obtained**. Prepared title: `BG-STUDIO-014: owner-only Brand Brain identity writes`; prepared body retained at `/workspace/.onboarding/bg-studio-014-pr-body.md`. An authorized maintainer can create that dependent draft from the published branch; do not merge it independently of #213.

Exact-code-SHA Actions lookup also returned REST **Forbidden**. **GitHub CI is UNVERIFIED, not GREEN.** The workflow runs on PRs, not arbitrary feature pushes, so branch publication is not evidence that CI ran. Verify the eventual final draft head and required jobs before review acceptance. Documentation commits following the code SHA change no tested functional code.

Remaining risks: target PostgreSQL role must support required locks and current schema; deployed configuration is unverified; ordinary full-document replacement may remove unrelated omitted fields as before; no general client CAS/idempotency introduced; trusted maintenance primitives and DB superuser actions remain outside request enforcement. Do not roll back to the previous authorization bypass as an operational recovery plan. No migration, merge, deployment, traffic, IAM/secrets modification, feature/provider activation or paid generation is authorized or performed. Next action is authorized draft publication and exact-head CI, followed by frontend permission/error-contract review and existing staging security gates.
