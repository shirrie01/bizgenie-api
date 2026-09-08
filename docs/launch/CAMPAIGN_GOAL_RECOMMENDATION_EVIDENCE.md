# BG-LAUNCH-002I-E goal recommendation evidence

**Status:** authenticated goal recommendation registry implemented on branch
`bg-launch-002i-e-goal-recommendation`.

**Base:** merged `main` at `1ccb94a496b1afd7180ae9e2dc9f1ba70841b1ca`.

## Implemented surface

- `POST /customer/campaign-recommendations`

The endpoint accepts one customer goal, tenant/project/brand scope,
display timezone and idempotency key. It uses the existing customer Bearer-token
authentication and approved Brand Brain authorization boundary, then returns a
single explained recommendation with a safe `create_campaign_payload` for the
next user action.

Recommendation receipts are persisted server-side by tenant, project, requester,
brand and idempotency key. Replaying the same key returns the original receipt;
using the same key for changed goal intent fails with `IDEMPOTENCY_KEY_CONFLICT`.
The PostgreSQL path uses `ON CONFLICT ... DO UPDATE ... RETURNING *` so duplicate
concurrent requests converge on the stored recommendation instead of surfacing a
unique-constraint error.

Customer DTOs omit auth UUIDs, command IDs, raw Brand snapshots, profile/input
hashes, lifecycle internals, provider fields, publishing data and financial data.
Every suggested item includes a plain-language `reason`. When no usage-history
signal exists, the response says `not_enough_data_yet: true` and uses that
explicit fallback rather than fabricating performance evidence.

## Verification

- `node --test test/customer-goal-recommendations.test.js test/campaign-goal-recommendation-registry.test.js test/campaign-goal-recommendation-migration.test.js`: 8/8 passed.
- `node --check src/campaigns/goalRecommendation.js && node --check src/campaigns/router.js && node --check index.js`: passed.
- `npm test`: 457/457 passed.
- `npm run test:campaign:postgres`: skipped because `TEST_DATABASE_URL` is unset in this environment.

Disposable PostgreSQL and exact-head CI evidence must be recorded after the
branch is pushed.

## Out of scope

I-E in this branch does not implement the first-run frontend screen, account
creation deferral UI, generated month calendar, unscheduled ideas tray,
per-item regeneration, external platform rendering, publishing, billing, pricing,
staging/production deployment or field-sales onboarding.
