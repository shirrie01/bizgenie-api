# BG-LAUNCH-FINAL-API-01 — customer golden journey

15 November2026. Base accepted main ed680727e067532518bdfce8a3e12fbbb483147f. New regression `test/customer-golden-journey.postgres.integration.test.js`: **3/3 LOCAL PASS** with real Express application handlers, authorization/workspace/Brain/onboarding/campaign/recommendation repositories and disposable PostgreSQL17.11. No production application code changed. Existing individual tests are retained; this closes the missing persisted join across those boundaries.

## Reproduce

In existing Node22.23.3/dependency environment, set TEST_DATABASE_URL to the existing disposable loopback PostgreSQL server ONLY, then:

```
node --test test/customer-golden-journey.postgres.integration.test.js
```

The fixture creates a unique UUID-named local database, applies existing accepted migrations there, inserts synthetic Auth identities, and creates all workspace/business/campaign data through actual HTTP handlers. Cleanup drains sockets, ordinary-drops only its owned database and closes admin. No shared migrations or provider/network calls. If TEST_DATABASE_URL is absent it uses the repository's explicit integration-suite skip convention; PostgreSQL-enabled evidence is required and was obtained here with zero skips. Never point this test at staging/shared/production.

## Exact scope / assertions

1. No token workspace discovery401, synthetic verified account initially missing_workspace200. Signup/signature verification/Auth-admin external service are test doubles, not hosted sign-in proof.
2. POST/bootstrap201 creates one synthetic Fonzo-style lab, real tenant/project/brand references. Repeat reuses same brand and does not rename/create another tenant. No real Fonzo business data used.
3. PUT/onboarding saves customer provenance, sector/channels/goal/step/version. Explicit completion before a real saved Brain description returns422; draft data never silently becomes confirmed Brain identity.
4. A freshly constructed application/repository set and a second synthetic session token read the saved step/answers. Same-key save replays once; changed key with stale version409.
5. Existing owner Brain PUT persists synthetic description. Explicit confirmation completes onboarding through the existing contract.
6. POST/recommendations uses the actual deterministic durable registry, preserves saved goal, explicitly reports insufficient performance evidence, and replays the same key. No LLM or invented engagement signal.
7. Its existing create_campaign_payload is passed to POST/campaigns; same key produces the same campaign. A suggested text item is saved using the existing content-items API, not provider generation. Same key keeps its variant reference.
8. Fresh app/session retrieves identical persisted current_content. Workspace calendar exposes the same variant/campaign as unscheduled, with no schedule or publication. Workspace/Brain/onboarding data survive refresh of application objects.
9. Invalid onboarding400, stale content409, unrelated tenant campaign/calendar/creation404 and isolated Brain read remain intact.
10. Deleting only the fixture's membership makes old-session reads/writes deny and bootstrap replay503 without resurrecting ownership.

This is actual local persistence/handler coverage, **not** a real Supabase login/refresh, runtime-role/RLS deployment proof, hosted browser test, live campaign scheduling or paid generation. The fixture uses a disposable administrator pool; separate runtime evidence is required. Real JWT verification tests and membership-race/revocation suites remain in the existing full suite.

## Accepted WEB alignment / deployment gap

WEB reference81e1014e8e16ea8b7ea6186061936fe686e17b71 uses GET/workspace, POST/bootstrap and existing PUT/onboarding/Brain, goal recommendation payload→campaign/content-items, current_content and explicit calendar windows. No replacement route/envelope/step numbering introduced. Six panels still group seven stored stages; old saved current_step remains meaningful. Initial new-test access used the wrong current_revision field; corrected to the existing documented current_content contract, without changing API or WEB behavior.

Direct API fixture intentionally does NOT enable bridge write flags. Current founder bridge profile admits only three persistence writes: recommendations/campaign/calendar writes require separate scoped authority. WEB compatibility manifest is empty; unverified capabilities stay OFF. Thus this source test cannot be represented as a Fonzo browser or hosted campaign-handoff PASS. The staging packet details operator evidence and approval gates; do not widen broad/draft/paid flags or change Claude's interface to force success.

Final focused/full counts, exact new branch/SHA and hosted CI/review are in the publication checkpoint. No real account, OAuth, Stripe, publishing, paid call or deployment occurred. Launch remains NO-GO.
