# Real creative preview: local validation and review evidence

Scope: additive read-only backend response for existing persisted creative. Parent #191, launch #128, Studio #197; dependency web draft PR #34. [Mission Control](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains canonical governance. No founder acceptance is asserted.

Base: verified main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`. Separate branch `bg-studio-real-creative-preview`. Engagement Intelligence PR #204 remains separate at `3e9d65605d08e52bbecd2dcf42e74ea0363b8d63`; none of its commits are included. Main was not checked out or changed.

## Implementation

- `src/campaigns/creativePreview.js`: bounded DTO containing exact persisted copy, identities, revision/version, source provenance, explicit availability, current requesting actor's acknowledgement status and recorded approval state. No placeholder assets, guessed URLs or inferred text-generation provenance.
- `src/campaigns/router.js`: authenticated GET creative-preview route requiring exact revision and campaign version; private/no-store caching policy and authorization Vary.
- `repository.js` and `postgresRepository.js`: authorised read path. PostgreSQL uses its existing repeatable-read/read-only transaction and scoped immutable generation-media join, without row locks on the new read path. Existing mutation locks are preserved.
- `test/campaign-creative-preview.test.js`: 12 new HTTP/repository tests.
- `test/postgres-campaign.integration.test.js`: one new real PostgreSQL read-only/version/scope test; existing media integration test additionally checks private references and revocation on reads.
- [API contract and Claude integration requirements](REAL_CREATIVE_PREVIEW_CONTRACT.md): exact endpoint, source inspection, status meanings, stale/retry handling, frontend state keys and remaining media boundary.

## Executed validation

Node v22.23.3; PostgreSQL 17 in an existing disposable local test service. No external AI/social/storage requests or production credentials used.

- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres node --test test/campaign-creative-preview.test.js test/postgres-campaign.integration.test.js`: 35 passed, 0 failed/skipped/cancelled.
- `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test`: 640 passed, 0 failed/skipped/cancelled.
- `node --check index.js` and every JavaScript file under `src`/`test`: passed.
- `git diff --check`: passed.

Tests verify real saved copy, empty/missing creative, image and video reference status, missing/revoked/foreign/wrong-brand/rights-denied media, changed manifests/generation bindings, sanitised media-resolution failure and successful retry, no mutation/no new receipts, no admin-key fallback, unauthenticated and cross-tenant/project requests, strict revision/version validation and stale errors, unchanged receipt replay/acknowledgement/approval flow, old-revision approval rejection and retired-profile acknowledgement handling. The PostgreSQL media test would fail if the new path attempted the previous `FOR SHARE` query inside a read-only transaction.

Frontend PR #34 source was inspected via its allowed Git pull-request ref at `4074dfa5e7a806bb37d2de8a7b6c393d2af07845`; no frontend build/browser/screenshots are claimed. GitHub PR/issue API reads returned `Forbidden`. Local test results are not GitHub CI evidence. Draft PR creation and exact-head CI must be verified independently when the existing access permits.

## Limitations and review gates

Actual text can be displayed now by consuming the new endpoint. Image/video bytes and platform visual artifacts remain unavailable, with null URLs and explicit reasons. A separate approved private-media delivery contract is required before claiming full visual media previews. Existing text revisions do not reliably distinguish AI-generated from manual copy; stored provenance is preserved instead of guessed. GET creates no authority to acknowledge or approve and does not alter the existing approval API.

No migration files, dependency or environment-variable changes. Existing integration tests initialise disposable fixtures only. No merge, deployment, traffic, pricing, infrastructure, paid generation or live publishing changes. Full Docker/Buildpack artifact CI and frontend integration QA were not executed locally. Confidence is high for the tested additive backend read behaviour; premium visual-media completion and launch readiness remain unproven.
