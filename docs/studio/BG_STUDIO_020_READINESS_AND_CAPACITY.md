# BG-STUDIO-020 — capacity, cost and operational approval boundaries

26 October 2026. Planning model, not production benchmark. Staging RED / launch NO-GO. No real credentials, resources or traffic were inspected/modified in this task.

## Verified local evidence

Existing campaign batching regression:16 SQL commands at6 and14 campaigns, with exact aggregate parity; new calendar uses one scoped projection query under2-second statement timeout, window<=93days and<=100 rows. This is not constant scanned work or evidence of large-tenant latency. Legacy campaign list still hydrates full history and has unbounded campaign count/memory; pagination/summary-query migration remains open. No performance index was applied or production query plan measured.

Quote/confirm reserves through the existing account row lock and unique immutable ledger. Two service instances, same/different quote keys, insufficient funds, expiry/profile/policy/version changes, cancellation, uncertain provider outcomes and restart reconciliation are tested locally. Fenced Stripe recovery checks each financial transaction, not an external exactly-once guarantee. Mixed old/unfenced workers remain a rollout blocker.

Local media transfer:4 concurrent previews **per storage object/process**,8MiB maximum video transfer/request, pinned storage generation, cancellation/timeout and exact byte limits. Existing storage allows larger source objects; frontend32MiB ceiling is not a global backend object limit or multi-instance egress cap. Candidate Instagram profile32MiB constraint is not provisioned. Local browser H.264 playback is not evidence of every device/codec or Meta acceptance. Aggregate egress, tenant-wide rate limits and global concurrency remain unbounded across instances.

## First-customer workload scenario — assumptions only

For budgeting, assume20 customers ×10 creative operations/day =200 operations/day, not an entitlement or a proposed plan allowance. Quote+confirm each adds a database transaction; each successful worker adds claim/start/finalize, roughly1000 transactions/day before polling/retries/reads. Six status reads/job would add1200 reads/day. These counts are workload arithmetic, not a throughput/RPS guarantee or Cloud Run instance-size recommendation. Actual pool size, CPU/memory, query plans, cold starts, provider latency and retry patterns must be measured in an approved isolated environment.

If each operation causes one8MiB video transfer:200×8MiB=1.5625GiB/day,46.875GiB/30days. If instead one complete32MiB object is viewed per operation:6.25GiB/day,187.5GiB/30days. Extra playback/seeks/retries multiply traffic. These are bounds on the stated scenario only, not enforced daily limits. Retention and source/output copies multiply storage. A stream cap alone is not a spending cap.

Cost model: `active runtime + database + storage GB-month + egress GB × actual regional tariff + API/operation charges + provider executions × approved provider/profile rate + inspection CPU + logging/backups`. Current regional tariffs, deployment topology, provider unit rates, locked customer prices/credit allowances, VAT and FX are **UNKNOWN** in available authority. No grounded total GBP/customer can be quoted. Do not substitute synthetic test credits or old public plan figures for monetary cost. Before any paid/infrastructure test, founder must approve workload, exact provider profile/rate, maximum cash exposure and hard controls; alerts alone are not hard caps.

S1 alone retains the separately proposed **£1/30-day** Secret Manager ceiling, unapproved. It excludes runtime/provider/test-clock/egress/restore spending. See separate staging documentation branch; no new security budget is implied by this model.

## Required controls and acceptance evidence

1. Authenticate/scope requests; rate-limit quote creation, confirmations, invoice/status polling, upload intake and preview ranges per principal/tenant, including across instances. Limit outstanding jobs/holds with reviewed policy. No unapproved quotas or pricing were silently installed here.
2. Pin the approved server provider/model/profile and prohibit automatic resubmission after uncertain acceptance. Persist provider references and reconcile, with audited operator handling when the provider cannot resolve ambiguity. Do not release held funds based only on timeout or revocation after a possible external call.
3. Drain old Stripe workers before recovery activation. Test signed callbacks/test clocks only with explicit approval, canonical commercial policies and owner mappings. Financial mutation endpoints stay unmounted; invoice draft stays disabled and test-mode-only.
4. Review all pending SQL, schema drift/RLS/backend role/function grants, FK deletion/retention effects, operational history retention and backup/RPO/RTO. New financial FK RESTRICT history must not be silently purged for account deletion. Legal retention/anonymization/backup rules remain founder/privacy decisions.
5. Verify real staging credential isolation/effective IAM/consumers, reviewer sign-off, rollback owner/window and explicit budget. Run references/traffic/current backup inventory remain UNKNOWN here. Separate each shared migration, deployment, feature gate, provider and publishing approval.
6. Approved staged performance rehearsal must cap users/jobs/requests/bytes/time and abort on permission leakage, uncontrolled retries, stale acceptance, financial inconsistency, unexpected provider calls or budget breach. Capture query plans/buffers, p95/p99, peak RSS, pool wait, queue lag, cancellation and tenant egress. No uncontrolled load against staging/production authorized.

## Rollback

Keep all paid/provider/Stripe/media/social gates off during review. Roll back application composition first; preserve new quote/job/fence/reservation/event/result records, existing ledger, media lineage and receipts. Never delete a recovery-required operation or automatically retry it to restore availability. Do not down-migrate a sector CHECK with professional_services rows, drop financial history, revoke shared keys or change traffic as a code rollback. Any operational rollback is separately approved and must account for cached secrets, old workers and in-flight external outcomes.
