# BG-STUDIO-021 — durable evidence and customer-approved learning

26 October 2026. Dependent on the isolated BG021 social branch; original PR217 unchanged. **INTEGRATED LOCAL / synthetic evidence only**. No real analytics connector is registered or enabled. Staging RED, launch NO-GO. Mission Control remains sole operational authority; no duplicate register created.

## Implemented boundary

`DurableLearningService` persists explicit versioned owner-selected campaign objectives/metric, publication-bound observations, immutable historical snapshots, bounded noncausal recommendations and append-only customer decisions. Ingestion is server-only: a configured connector must verify the account/source/record, scopes and active connection against a durable **platform-confirmed** publication. Manual attestations cannot create authoritative analytics. Organic/paid attribution, reporting interval, unit and publication time are required; absent data stays unavailable. Provider record duplicates replay only identical normalized evidence; conflicting data is rejected. Corrections/retractions require the current same-source period predecessor.

Snapshots cap at 1,000 rows and fail closed on overflow. Comparisons require matching objective/platform/metric/unit/attribution and equal nonoverlapping intervals. These are observed differences, not causal attribution or a general optimization model. Evidence freshness is an explicit server policy, not an invented platform guarantee. Connection revocation/expiry, objective version changes, supersession, retraction and age invalidate subsequent recommendation use. Evidence/connection rows are share-locked during validity checks. Feedback uses owner checks, CAS, idempotency and immutable history. Accepted current recommendations can enter future same-brand/objective strategy context (max five, 2,000 characters); they never write Brand Brain. Quote/confirm/worker-start recheck the frozen context, so a withdrawn recommendation cannot silently influence a later paid call.

`/customer/insights`: POST objectives, snapshots, recommendations, feedback; GET recommendations. Requests require tenant_id/project_id/brand_id and customer bearer auth. Reads retain member access; writes owner-only. Optional composition defaults to 503 LEARNING_UNAVAILABLE, private/no-store. Recommendation history read is capped at 50; history pagination is still required for launch-scale discovery. No customer metrics-ingestion route exists.

## Financial recovery addition

A known validation failure while the exact owned worker claim is **still claimed**, before the durable calling boundary, atomically cancels/fences the claim and releases its reservation exactly once. Safe error_code is observable. Calling/unknown outcomes never use this compensation: they retain funds and require authoritative reconciliation. Stale workers cannot release a newer claim. A queued job whose owner was revoked before claim still needs controlled unstarted-job cancellation/recovery; it is not automatically refunded on an ambiguous database failure.

## Disposable proof

Node22 / PostgreSQL17 focused suite: **31/31**, no skips. Synthetic published post → source-verified mock metrics → snapshot → recommendation → accepted feedback → future campaign prompt → unchanged complete Brand Brain row. Retraction invalidates recommendation/context and pending quote confirmation. Dedicated pre-call stale-context and revoked-membership cases prove zero provider calls, one release, fenced replay. Existing ambiguous-call and failed-settlement cases retain reservations. New migration is a proposal applied only to unique disposable databases. No credentials, shared SQL, provider calls or activation.

## Remaining dependencies

Real provider measurement definitions, pagination/cursors, source verification/credentials/scopes, reporting/freshness policy and interval semantics; production ingestion queue/rate limits; retention/legal review; privileged-role/schema-drift preflight and full restore proof; frontend adoption and independent review. Read-committed checks do not revoke an already started external call, nor retract a prompt already consumed. No staging or hosted-CI success is claimed.
