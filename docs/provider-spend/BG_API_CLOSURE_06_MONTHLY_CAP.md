# BG-API-CLOSURE-06 Track B — £100 aggregate monthly provider cap

13 November 2026. Authority: Issue #234, Issue #191 comment6839471927 and Mission Control blocker BG-COMMERCIAL-12-SPEND-CAP. Source baseline main445cf24786f4d36abc7d2b4c6f49cdb15ad73daa. This source proposal does not authorize spending or runtime activation.

## Scope and dependency isolation

The #230 runtime-limits service uses per-UTC-day provider_currency consumption/max_minor_per_day and depends on generation-quotes/execution claims. It does not meet the approved monthly aggregate cap. This separate branch imports NONE of that product stack and does not replace billing, credits, Stripe or pricing. It provides a standalone internal MonthlyProviderSpend boundary, proposal-only SQL outside supabase/migrations, and disposable/unit tests. Nothing imports it in production composition, routes, workers or generation services. Existing free/mock/local tests remain functional. No real-provider operation is enabled or globally certified safe by merging this module.

## Policy and authority

Only explicit constructor enabled:true permits use; absent/false/string values deny. A usable database connection and safe RLS/grant boundary are required. Every transaction checks the three tables have enabled/FORCE RLS and a runtime role with read access, ledger write access, no policy/cohort writes and no table DELETE. Superuser/owner/overprivileged pools fail this check. No fallback to memory or daily counters.

An operator-owned single policy is default disabled, cap exactly10000 GBP pence, customer limit exactly10. Version/source, finite effective interval <=32days and current database time are required. Policy/operator cohort cannot be written by the runtime role. No policy/price rows are supplied by this PR. Unknown/missing/stale estimates, zero bounds, unsupported currencies, missing or unsafe schema, missing/disabled/expired policy, unreachable database and exhausted exposure deny before dispatch. Database lock/statement timeouts bound queries; a reviewed pool connection timeout is also a runtime prerequisite.

Estimates must be operator-approved worst-case GBP upper bounds for each operation, including all retries within the attempted operation, provider fees and applicable FX/tax exposure. Source reference/version/expiry are explicit. There is NO automatic FX lookup or guessed USD conversion. Native non-GBP estimates are rejected. No provider prices or commercial credit allowances are invented. Before activation, founder-approved documentary GBP bounds and their FX/fee assumptions must be supplied; if a reliable upper bound cannot be established, that operation stays disabled. Policy content hash binds reservations, so mutating authority under a reused version blocks dispatch.

The cohort has ten unique slots (1..10) and operator-owned stable tenant IDs. An unlisted/inactive customer, including customer11, is held. Slots must never be recycled to evade the first-ten gate; changing the cohort or increasing cap requires separate founder authority and source/schema review. The runtime cannot enroll tenants, change slots or expand the cap. The input tenant must come from the existing verified immutable job authority, not a customer-supplied override.

## Durable accounting and state machine

PostgreSQL advisory transaction lock serializes one global ledger across instances/tenants/providers. UTC calendar months derive exclusively from database clock, not host clocks or daily approximations. Reservations bind global immutable intent id, tenant, operation, estimate version, GBP, policy version/hash, original month and worst-case pence. Replays cannot reserve another exposure, change tenants or resurrect cancelled attempts. Future-month rows relative to current DB time trip a clock-safety hold.

`reserved -> dispatching -> uncertain -> settled` is the normal conservative path. Only reserved -> cancelled can release exposure, because the dispatch permit has not been issued. Cancel racing dispatch is transaction-serialized: one wins. One-shot start commits a random dispatch token before allowing a callback. It rechecks current policy/price/cohort and original month; old-month unstarted work cannot dispatch. A lost start acknowledgement leaves dispatching held, with no automatic redispatch. A lost reserve acknowledgement converges on the existing durable row.

Successful callback return is not final provider billing evidence: executePaid records uncertain and retains the full reservation. Timeouts, crashes, partial/failed jobs and ambiguous results retain exposure; no automatic refunds or retries. Restart reuses the durable identity and refuses another dispatch permit. The existing worker must retain its own provider idempotency, fence and reconciliation semantics. This module does not manufacture a provider retry after a crash. A never-used permit may strand budget; safety takes precedence over availability until independently reconciled.

Settlement requires matching tenant/id/dispatch token. Authoritative final settlement additionally requires nonnegative actual GBP pence and an operator/provider evidence reference; a customer or HTTP success is not settlement authority. Settled zero/partial bills still retain the FULL bound for the relevant month. Matching settlement replay is idempotent; conflicting evidence/amount is denied. An actual bill above the trusted bound trips a durable global breach hold even when received as a corrected late bill after prior settlement. It cannot erase its breach evidence or restore admission. An invalid upper bound can mean the real provider has already charged more than forecast: the code stops further admissions; it cannot reverse external charges or warrant a cap based on false estimates. This is an activation-blocking reconciliation incident.

## Month rollover and invariant

Admission exposure = full bound of all noncancelled current-month reservations PLUS prior-month dispatching/uncertain/breach exposure and prior-month work settled during the current month. All customers/provider groups share that sum; admission requires exposure+new bound<=10000. Outstanding uncertain jobs carry forward; they never vanish at midnight. Finalized prior-month work remains charged conservatively through its settlement month, then ages out of the next month's admission calculation. Original rows/months are retained. A late settlement does not move or erase original reservation history. This deliberately over-reserves compared with an invoice ledger and can hold generation below the advertised ceiling.

This is a conservative authorization/exposure ledger, not a replacement financial transaction or provider invoice ledger. Real invoice timing, final cost authority and the completeness of GBP upper bounds require independent acceptance before activation. No claim is made about all historical provider invoices based solely on this source test.

## Integration contract for a later reviewed worker adapter

1. Existing verified job tenant/project/brand, rights, approval, entitlement, credit reservation and generation fence remain authoritative and must pass first.
2. Resolve an approved operation/estimateVersion server-side; use the immutable generation intent/job ID for id (never a fresh ID on retry). No caller-provided cost, FX, cap or cohort override.
3. At the single real-provider dispatch boundary, call executePaid(input, dispatch) or reserve/start explicitly with the same durable intent and preserved job fence. Persist/reconcile uncertain provider outcomes through existing job machinery; never independently retry dispatch after a held permit.
4. Only verified final billing/reconciliation evidence may call settle. Cancellation releases only a reservation which never obtained a dispatch permit. Customer billing credit refund policy is untouched.
5. Real image/video/hybrid/text adapters in the unmerged #230 stack still require a separately reviewed common-boundary integration. Until then, paid activation remains blocked; a partial wrapper around one adapter is not sufficient global enforcement. No new infrastructure architecture is selected here.

## Validation and acceptance gates

Node22.23.3, disposable PostgreSQL17.11. Focused24/24 (21 real PostgreSQL regressions and three unit tests), including independent pools/two Node processes, tenant races, exact cap/exhaustion, replay/restart/lost acknowledgements, fail/timeout, cancellation race, customer11, policy/price/currency denial, role permissions, backward clocks, cross-month/late partial settlement and corrected-bill breach. Full suite868/868, zero skips/cancellations; separate billing24/24 and campaign25/25 pass (overlapping counts). Syntax/whitespace PASS. Browser rerun is not required: no browser, route or media source changed; accepted media tests run in the full suite.

The SQL file is a review proposal with no live policy values. Disposable tests alone create/apply/drop it in UUID-named local databases using UUID roles. It is not an executable migration runner and is not referenced by startup/deploy. No shared SQL, real credentials, paid calls or installations performed. CI/review must be verified on the exact pushed head; local tests do not establish hosted CI.

Outstanding gates: authenticated draft PR/hosted CI/independent review; accepted schema/preflight/grant and backup/retention plan; operator-approved cohort and cost authority; reviewed all-provider worker integration/fencing; separately approved shared SQL/runtime configuration; founder activation/launch approval. #213 pool/RLS/preflight and #231 execution HOLD persist; launch NO-GO.

## Rollback, retention and operations

Before activation: reviewed source revert; nothing live changes. After separately authorized activation: disable paid dispatch first, retain the ledger, cohort, immutable identities and uncertain exposure. Do not drop tables, truncate months, refund uncertain reservations, recycle cohort slots or remove guards while an older worker can dispatch. Reconcile pending provider outcomes using existing job evidence; preserve final billing references and audit history under the programme retention/account-deletion policy. Pseudonymous stable tenant IDs must not be deleted in a way that frees spend exposure; erasure/backup retention requires an approved accounting/privacy procedure, not a cascade. Back up and prove restore of both billing and provider-spend records together before runtime acceptance. No rollback operation or backup was executed here.
