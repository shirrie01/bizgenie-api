## Problem and behaviour

Frontend #51 cannot persist professional services, load an uncapped workspace calendar, or unschedule through the existing HTTP API. This dependent draft adds the canonical `professional_services` schema transition, a scoped paginated calendar, existing-command unschedule access, and batches campaign reads. It also adds a fail-closed server-owned commercial catalogue contract and a read-only credit preview. Billing management is a disabled, unmounted mock-tested adapter; no prices or entitlement allowances are guessed.

Base: existing draft #215 (`bg-studio-015-backend-reliability`, e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b), preserving #213/#214 and existing calendar validation. Original branches are unchanged. S1 documentation is separately published and not included in product commits.

## Validation

Node22.23.3 complete suite with disposable local PostgreSQL17:735/735 passed, zero skipped at final functional commit. Includes provider mocks, billing/idempotency, tenant/owner/revocation, old/new schema transition, cursor pagination, immutable campaign history and unschedule replay. Local pg_dump17.11/pg_restore preserves a synthetic professional-services record and passes strict preflight. Batched campaign reads:16 SQL commands at both tested sizes, exact aggregate parity. Current npm audit:2 moderate nodes remain (older Vertex auth/gaxios/uuid chain); zero high/critical in that response. No real provider/Stripe/browser/deployed E2E evidence is claimed.

Final-head local test and syntax results are provided in the execution checkpoint. Hosted exact-head GitHub CI must be independently checked; API access is currently Forbidden, so no GREEN claim is made.

## Limits and gates

New sector SQL is prepared and tested only in disposable databases. No shared migration was applied. Review compatible backend before schema, then separately approve frontend flag. No merge/deployment/activation authorized. Catalogue remains503 until founder supplies locked commercial canon; credit preview cannot authorize spending. Durable quote/confirm, cross-instance paid execution recovery, orphan Stripe claim recovery, private media stack integration and full social/analytics/learning capabilities remain mandatory launch blockers.

Claude: see `docs/studio/BG_STUDIO_019_BACKEND_HANDOFF.md` and linked exact endpoint reports. S1: separate documentation branch `bg-studio-016-staging-isolation-recovery`, `BG_STUDIO_016_S1_DEC024_FINAL_CHECKLIST.md`. Sole Mission Control remains canonical; no new register/tasks created. Staging RED, launch NO-GO.
