# BG-STUDIO-019 — professional-services schema contract

26 October 2026. Draft/local engineering only; staging RED, launch NO-GO.

## Canonical wire value

`professional_services` is the single new value. Frontend #51 at `0c3078c5b5f4e590c00fa567acfec7a087d75596` uses it in `src/premium/sectors.js`. #50 used `professional`; the prior uncommitted backend implementation followed #50. Neither was deployed. This change follows the newer frontend source and the already published backend proposal; `professional` is not an accepted alias. Enum, additive migration, strict schema manifest and HTTP/PostgreSQL fixtures agree.

The `workspace-onboarding.v1` envelope, source provenance, explicit customer completion, owner-only transaction-scoped writes, CAS and idempotency remain unchanged. Preferences remain outside Brand Brain. No entitlements or publishing permission are granted.

## Compatibility and execution order

The backend accepts either complete reviewed schema manifest. On the old schema, all previous sectors remain writable; new-sector writes fail with the existing 503 `ONBOARDING_UNAVAILABLE` before any write. On the new schema they persist with unchanged customer/inferred provenance. Unknown schema drift fails preflight.

The new SQL file `20261025090000_add_professional_onboarding_sector.sql` accepts only the reviewed old/new validated sector CHECK. It changes that CHECK alone, is transactional and rerunnable; no historical migration is edited. Disposable PostgreSQL tests cover both schemas, owner/foreign/demoted actors, concurrent CAS, replay, stale and inferred-over-customer rejection, invalid SQL values and weakened CHECK refusal.

Review and CI first. Any shared migration, backend deployment and activation of frontend `VITE_PROFESSIONAL_SECTOR_PERSISTED` each require separate founder approval. Keep the frontend flag off until the migrated backend is verified. Old application binaries reject the new schema manifest, so do not deploy the schema before a compatible backend. An application rollback must retain the dual-schema-compatible backend. Reverting the CHECK is blocked if new-sector rows exist; never delete or silently relabel records to force rollback.

## Restore prerequisite

Parent commit `22c8642d3904a720e4bf8965f92473d57d6456e4` permits only PostgreSQL's known equivalent rendering of the idempotency CHECK after logical restore. A weakened bound still fails. No general CHECK-expression equivalence is assumed.

## Evidence boundaries

Focused Node 22 + disposable PostgreSQL: 63/63 passing after correcting a newly added fixture's client declaration/transaction handling. Full-suite result is recorded separately at the engineering checkpoint. Native git reads verify source heads; GitHub API/CI, latest issue comments and Mission Control are unavailable in this environment. DEC-020–025 authority is attributed to founder work orders rather than independently read from Sheets. No shared SQL or live credential was used.
