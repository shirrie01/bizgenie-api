# BG-STUDIO-020 backend/frontend contract — checkpoint 1

26 October 2026. Contract version `studio-integration.v2`. Draft/local only; staging RED, launch NO-GO. This is a source handoff, not another Mission Control register. Immutable baseline backend #216 f8d81bf07977b57496d97db0df75e984bc8c425f; frontend #52 1a84bbe8aeacf77727022557e644f355459921b9 (fetch current source head separately). Original PR branches remain unchanged. GitHub API/CI/issue comments and Sheet decisions are inaccessible (Forbidden/no connector); DEC014/020–025 authority is attributed to founder work orders.

## Immediate compatibility findings from actual frontend #52 source

* `professional_services` remains canonical; no alias `professional`.
* Calendar adapter `workspaceCalendarApiClient.js` defaults **limit200**; backend max **100**. Claude must pass/change default to100. Response fields match the adapter, including both arrays. Backend is individually consistent per page, not a frozen snapshot across writes; do not claim cursor stability under mutation. Reset on scope/window/filter/write. More than50 pages currently raises a frontend error; shorten/filter, never show a silently complete result.
* `planCatalogueClient` expects `/billing/plans` with catalogue-level VAT/support/terms and richer plan fields. Implemented backend `/customer/billing/plans` returns `commercial-catalog.v1` per-plan terms/tax/approval metadata and remains503 without canon. **Not wire-compatible.** Do not map missing public support/refund/proration/cancellation copy to invented defaults. Final public projection awaits approved canon.
* `billingManagementClient` expects `/billing/...`, `{url}` or `status:requested`; backend draft is unmounted at intended `/customer/billing/management/...`, returns hosted confirmation `{status:confirmation_required,portal_url,entitlement_confirmed:false}`. Cancellation is not completed by obtaining a hosted flow. Adapter must not discard cancellation confirmation URL or promise no duplicate charge without durable/provider evidence. Keep gate off.
* Creative adapter expects signed uploads and public HTTPS output URLs. Existing private media delivery contract must prevail: authenticated bytes with scoped immutable asset binding, not arbitrary/unrestricted signed URLs. Existing #208/#212 are separate from #216 and must be reconciled in their own draft. Keep media gate off; no speculative alias routes or URL exposure added.
* Frontend generation quote uses deterministic key from campaign/version/class/mode, omitting brief/assets and refresh nonce. New contract binds the entire normalized request and rejects changed intent under one key. Claude must include brief/assets and create a **new request nonce for a fresh quote after expiry**, reusing it only for the same network retry. Existing `/generate` does not accept quote fields; do not enable it as a binding confirmation.

## Durable quote/confirm — new draft implementation

`POST /customer/generation-quotes` — Bearer identity; current DB membership owner/member, exact tenant/project/approved brand derived from campaign. JSON:
```
{tenant_id,project_id,campaign_id,variant_id,expected_campaign_version,
 execution_class:"text.standard"|"image.normal"|"video.normal"|"video.premium",
 execution_mode:"ai"|"hybrid",execution_brief?:string<=4000,
 supplied_assets:[{asset_id:UUID,role:"primary"|"supporting"}],idempotency_key}
```
Maximum10 unique assets; hybrid needs one or more, scoped active reference assets with campaign.preview rights. Profile/model is server-owned/injected, not client input; no default provider profile is provisioned. Target format must match operation. This does not promise actual audiovisual composition. Unsupported configured combinations return422. Quote creation stores an immutable request/profile/policy/entitlement binding for60seconds; creates no generation job/reservation/debit/provider call.

201:
```
{contract_version:"generation-quote.v1",quote_id,execution_class,credits,
 kind:"fixed",max_credits,available_credits,sufficient,expires_at,
 policy_version:"policy_id:version",state:"quoted"|"confirmed"|"cancelled"}
```
Owner/member reads/writes here reflect existing generation:create permissions, not billing-management authority. Quotes are actor-bound; another member cannot confirm one. Same scoped key/intent returns same quote (including expiry/cancellation), never silently renews a request or changes its price. Fresh quote needs new key.

`POST /customer/generation-quotes/:quoteId/confirm`:
`{idempotency_key,max_credits:<exact quoted maximum>,confirmed:true}`.
202 `{status:"queued",job_id,quote_id,reserved_credits,replay}`. Locks current membership/project/brand, campaign/variant, reference rights, active entitlement/policy/price and credit account. Creates immutable generation job, existing-ledger reservation, quote decision and queued execution claim **in one transaction**. No provider call in HTTP confirmation. One quote can be confirmed only once with one key; one actor/workspace confirmation key cannot bind two different quotes; retries after lost response return same job. Distinct quote confirmations serialize on existing account lock and cannot overspend. Balance on quote is informational until reservation. No new credit prices/allowances or financial policy are invented.

`GET /customer/generation-quotes/:quoteId` ->200 `{quote_id,job_id,state,execution_class,reserved_credits,reservation_state}`. State is quote/worker state, not approval/publishing. `reserved_credits` is zero after worker success/failure; `reservation_state` is held/settled/none. Consult the authoritative account balance for total funds. Actor authorization is rechecked.

`POST /customer/generation-quotes/:quoteId/cancel` ->200 `{quote_id,status:"cancelled",charged:false}` only before confirmation; idempotent. After committed confirmation409 `CONFIRMATION_ALREADY_COMMITTED` (no false cancellation claim). Worker cancellation after confirmation is not implemented here.

Errors `{error:{code,message}}`:400 `VALIDATION_ERROR`;401 `AUTHENTICATION_REQUIRED`;404 `RESOURCE_NOT_AVAILABLE`;402 `GENERATION_CREDITS_UNAVAILABLE`;409 `VERSION_CONFLICT`, `QUOTE_EXPIRED`, `QUOTE_CHANGED`, `QUOTE_CANCELLED`, `IDEMPOTENCY_KEY_CONFLICT`, `CONFIRMATION_ALREADY_COMMITTED`;422 `OPERATION_UNSUPPORTED`;503 `GENERATION_BILLING_UNAVAILABLE`/`QUOTE_UNAVAILABLE`. Unconfigured quote service returns503, never falls through to legacy generation. All routes inherit private/no-store and Vary Authorization.

Frontend gate `VITE_GENERATION_QUOTE_API` remains off. New confirmation is queued-job semantics, not existing synchronous campaign generation response. Claude must adapt to explicit confirmation/status and cannot call a legacy provider route after it. Existing paid entrypoints are **not yet rewired** to require these quotes; activation is blocked until all paths use durable orchestration and output-to-revision integration. The draft backend has no production profiles, worker dispatch or paid activation.

## Internal execution/recovery contract

`FencedGenerationWorker` reuses the confirmed immutable generation job and existing ledger. Claim stores fence+random token durably. Only queued work (or explicit pre-call claimed recovery) can gain a new fence. Start checks membership, version and rights, then commits `calling` before provider execution. Old tokens cannot start/finalize. After calling, no lease expiry or retry resubmits: uncertain timeout/crash becomes `recovery_required`, reservation held. Restart rediscovers durable claim and calls adapter **reconcile**, never submit. Provider outcomes must be authoritative `succeeded` or `failed` with `definitive:true`; otherwise remain blocked. Final result and existing-ledger debit/release commit atomically; exact duplicate callbacks replay, conflicting results409. No new automatic refund/retry policy.

Provider adapter is injected for local deterministic tests only: `submit({idempotency_key:job_id,profile,request})`, `reconcile({idempotency_key,provider_reference,profile})`. Real provider must demonstrate reliable reconciliation/idempotency per operation; absent capability means manual reconciliation required, never guessed success/failure. A committed calling boundary is conservative even if a process crashes just before its actual provider call. Revocation is checked at the start linearization point; it cannot cancel an already in-flight external call. No customer-accessible callback/fence/token route exists.

Draft SQL `20261026100000_create_generation_quotes_and_claims.sql` is unapplied outside disposable local tests. RLS/direct-role denial and immutable decision/fence/result triggers protect new records; existing immutable policy, job and ledger remain authority. Shared schema deployment, role review, retention/deletion and non-destructive rollback require approval. Keep records/reservations for reconciliation; never drop history to roll back.

## Other contracts and gates

| Feature | Actual route / schema source | Authority / retries | Gate / evidence / dependency |
|---|---|---|---|
| Onboarding | /customer/workspace/onboarding; workspace-onboarding.v1 | owner writes, authorized reads, CAS/replay | Professional flag off until dual-manifest backend+additive CHECK verified; existing63 focused tests |
| Calendar | GET /customer/calendar; workspace-calendar.v1 | project read owner/member, UTC instants [from,to),93days,100 rows, scope-bound cursor | VITE_WORKSPACE_CALENDAR_API off; #216 PG parity/cursor/isolation; set FE limit100 |
| Catalogue | GET /customer/billing/plans; commercial-catalog.v1 | tenant read, server-only approval/policy/mode mapping, safe GET | VITE_PLAN_CATALOGUE_API off;503 without canon; FE projection mismatch above |
| Subscription | GET /customer/billing/subscription?tenant_id | tenant read, entitlement only, safe refresh | Existing ready/not_subscribed/failed envelope; refresh not proof of Stripe payment |
| Management | unmounted draft /customer/billing/management | owner only, stable request_id to hosted Stripe, no entitlement mutation | VITE_BILLING_MANAGEMENT_API off; mocks only; terms/portal/durable claims/activation required |
| Campaign operations | PATCH campaign; POST archive/restore/manual-publication/{confirm,fail,cancel}/variants/:id/unschedule | owner project:write, CAS/idempotency; manual outcomes remain attested | Existing #216 management report/payloads; stable schedule_id for unschedule;735-test baseline |
| Image/video | existing /customer/generate-image,/generate-video | immutable scoped jobs + ledger, currently legacy orchestrator | New quote flow not yet connected; no safe paid activation claim |
| Hybrid/assets | no new customer upload/compositor endpoint in this checkpoint | private rights/inspection/provenance required | VITE_CUSTOMER_MEDIA_API off; separate media integration required |
| Social/publishing | no mounted OAuth/automatic dispatch endpoint | provider scopes, secure token refs, durable per-destination identity required | Not activated; internal design/tests follow separately |
| Analytics/learning | customer attestation registry only in current base | source/period/objective/organic-paid integrity mandatory | Platform measurements never inferred from attestation; separate ingestion contract required |

Every gate requires deployed integration evidence and explicit founder approval; local mocks do not authorize activation. Checkpoint evidence:15 focused real PostgreSQL quote/worker tests before later hardening; full suite result is recorded with the published code SHA. No live credentials, provider/Stripe calls, shared migration, merge, deployment or publishing.

## Checkpoint 2 — integrated hardening and remaining adapter changes

Quotes now pin the active immutable preview profile (ID/version/hash) as well as the server provider/model/shape/duration profile. No active preview contract means409 `PREVIEW_VERSION_UNAVAILABLE` **before reservation**. Confirm and worker start recheck the profile; no provision/bypass of Instagram feed-video. Media quote requires execution_brief and a supported server profile; image.premium remains unsupported rather than advertised speculatively. The private creative adapter and full local image quote-to-approval path are documented in `BG_STUDIO_020_MEDIA_INTEGRATION.md`. Default production composition still has no quote profiles/worker activation, and legacy paid routes are not yet universally quote-gated.

Stripe recovery is opt-in and internal; see `BG_STUDIO_020_STRIPE_RECOVERY.md`. Its draft migration requires draining old unfenced workers before activation. No live mutation endpoint was mounted. `createDraftInvoiceRouter` is a new **unmounted, disabled** owner-only, test-customer invoice adapter. Intended mount `/customer/billing/invoices`; query tenant_id, optional limit1..50 (default25), cursor in_…;200 `{contract_version:billing-invoices.v1,invoices:[{invoice_id,number:null|string,issued_at,amount_minor,currency,status,hosted_invoice_url:null|https://invoice.stripe.com/…,receipt_url:null}],next_cursor}`. Missing invoice number/hosted link is not fabricated; Claude's current parser will skip those draft rows. Must add pagination before claiming all invoices. Authorization is rechecked after the mocked Stripe read;401/404/400/503 use existing error envelopes. No real receipt fetch or financial mutation.

Social/performance reference models are separate from durable production connectors; see `BG_STUDIO_020_SOCIAL_LEARNING_CONTRACTS.md`. No frontend gate should be enabled for these contracts. The S1 security package remains a separate documentation branch and unapproved operational gate.
