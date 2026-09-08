# BG-LAUNCH-002I-F customer campaign API evidence

**Status:** initial customer HTTP boundary implemented on branch
`bg-launch-002i-f-customer-campaign-apis`.

**Base:** merged `main` at `511933dd7b44faeb7770f1f2039721d46b6e800d`.

## Implemented surface

- `GET /customer/campaigns`
- `POST /customer/campaigns`
- `GET /customer/campaigns/:campaignId`
- `PATCH /customer/campaigns/:campaignId`
- `POST /customer/campaigns/:campaignId/content-items`
- `POST /customer/campaigns/:campaignId/archive`
- `POST /customer/campaigns/:campaignId/restore`

The route layer uses customer Bearer-token authentication, existing tenant/project
authorization, approved Brand Brain enforcement for campaign creation, the
`campaign-spine.v1` command repository, idempotency keys and optimistic campaign
versions. Customer responses expose campaign, item, variant, current content, stage
counts and next action, while omitting events, raw Brand snapshots, command IDs,
actor UUIDs, storage keys, provider details, prompts and internal finance data.

## Verification

- `node --test test/customer-campaigns.test.js`: 6/6 passed.
- `npm test`: 444/444 passed.

Disposable PostgreSQL integration did not run in this environment because no
`TEST_DATABASE_URL` was configured; the full suite retained the existing skipped
PostgreSQL integration tests. No staging, production, billing, connector, preview
registry, publisher or deployment work was performed.

## Out of scope

I-F in this branch does not implement the I-C preview registry, real export/download
transport, platform publishing, connector wiring, calendar UI, goal recommendation or
field-sales onboarding. Those remain separate gates in the accepted dependency order:
I-B -> I-D -> I-F -> I-C -> I-E -> launch surfaces -> field-sales pilot.
