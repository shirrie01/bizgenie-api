# BG-STUDIO-019 — campaign aggregate read batching

26 October 2026. Local/disposable PostgreSQL evidence, not load certification.

`PostgresCampaignRepository._list` now loads scoped roots once, each descendant relation once, and referenced brand snapshots once. Existing aggregate hydration is shared with the single-campaign reader; write locks and mutation path are unchanged. Every relation retains tenant/project/campaign scope. Snapshots additionally bind brand and exact initial/revision snapshot IDs. Missing/mismatched snapshots fail closed. Reads remain one repeatable-read, read-only transaction with current database authorization.

Regression adds four then eight campaigns (six/fourteen total including earlier fixtures). Both list calls use **16 SQL commands** including transaction/authorization work, rather than scaling per campaign. Each listed aggregate is deep-equal to its individually read counterpart; existing publication, correction, revocation, atomicity, cross-tenant and concurrent-read tests also pass. Full Node 22 + disposable PostgreSQL suite: **732/732, zero skipped**.

Limitations: the legacy campaign list still returns full aggregates and has no pagination or memory bound. This fixes N+1, not unbounded historical response size. The new `/customer/calendar` bypasses aggregate hydration entirely and has separate bounded pagination/window/statement timeout. A summary-list pagination contract remains follow-up work; do not claim load or egress readiness from query count alone. No new index, migration or database setting was applied to a shared database.
