# BG-LAUNCH-002I-C preview registry evidence

**Status:** trusted preview registry and customer preview flow accepted and
merged through PR #59.

**Base:** merged `main` at `e112b5d0d28758579ede2fde88751d043b2c3aa0`.

## Implemented surface

- `POST /customer/campaigns/:campaignId/variants/:variantId/review`
- `POST /customer/campaigns/:campaignId/variants/:variantId/preview-renders`
- `POST /customer/campaigns/:campaignId/variants/:variantId/preview-acknowledgements`
- `POST /customer/campaigns/:campaignId/variants/:variantId/approval`

The preview registry owns versioned profile references and server-attested render
receipts. A rendered receipt binds tenant, project, brand, campaign, content item,
variant, revision, revision content hash, platform, placement, format, profile
version, renderer version, render input hash and preview digest. Customers receive
only a bounded preview response; raw profile hash, render input hash, ownership
columns, internal events and campaign command identity remain server-side.

Acknowledgement copies the trusted receipt into campaign preview evidence through
the existing `campaign-spine.v1` command. Approval continues to require the same
actor's acknowledged preview for the current revision and an active matching profile.

Production composition uses the durable PostgreSQL preview registry against the
same database pool as campaign persistence. The local test composition uses the
in-memory registry with the same public contract.

## Verification

- `node --test test/campaign-preview-registry.test.js test/customer-campaigns.test.js test/campaign-preview-registry-migration.test.js test/campaign-spine-repository.test.js`: 22/22 passed.
- `npm test`: 448/448 passed.
- `npm run test:campaign:postgres`: skipped because `TEST_DATABASE_URL` is unset in this environment.

Exact-head CI passed on the merged PR before owner merge. Disposable PostgreSQL
integration still requires `TEST_DATABASE_URL` for local reruns.

## Out of scope

I-C in this branch does not implement external platform API rendering, publishing,
connector dispatch, billing, pricing, real export/download transport, calendar UI,
goal recommendation or field-sales onboarding. Production/staging deployment is not
authorized by this work.

Preview profile administration remains a separate review point before staging
activation. This branch seeds the locked v1 profile set and does not expose admin
CRUD for profile changes.
