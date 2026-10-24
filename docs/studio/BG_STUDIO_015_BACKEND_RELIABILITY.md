# BG-STUDIO-015-BE — Backend reliability, isolation and integration handover

24 October 2026. **Three bounded corrections implemented and locally verified; staging remains RED / NO-GO.** This report is engineering evidence for the sole Google Sheets Mission Control, not a competing register, founder acceptance or launch certification. No shared SQL/migrations, deployments, production/staging writes, IAM/secrets changes, flag activation, live Stripe/provider calls or paid generation occurred. Existing DDL was exercised only in newly created disposable local databases.

## A. Material improvement and scope

1. Bootstrap can no longer recreate revoked owner membership or missing business identity inside an existing tenant. Previously reproduced over real PostgreSQL; now fail-closed without changing valid first creation/reuse semantics.
2. Customer and customer-checkout responses receive private/no-store and Authorization variance before CORS/parsing, covering success, refusal, malformed input and unavailable services. Public health behaviour is unchanged.
3. Browser preflight permits PATCH for the existing campaign update route, while retaining exact origin/header restrictions and route authorization.

The new branch is `bg-studio-015-backend-reliability`, based on #214; no changes were pushed to #213/#214. Customer roles, billing/refund/entitlement/pricing policy, onboarding v1 and PUT replacement semantics are preserved. New tests reject five controlled mutations. Full Node22/disposable-PG17 suite: **713 passed, zero failed/skipped**.

## B. Canonical inputs and access limits

| Input verified by native fetch/remote refs | Exact head |
|---|---|
| Backend main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| Backend #213 | `120a874dfa02313a8c28dad82ddb6582f0065469` |
| Backend #214 | `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` |
| Frontend #48 | `52c51261f9763e15faed2adc601e50cc788903f4` |
| Frontend #49 | `9749254b80aaa128c7d2af27f12124478d9f9ea4` |

#213 is an ancestor of #214; current frontend #48 is an ancestor of #49. Dependency chain for this work: main → #213 → #214 → BG-STUDIO-015. Draft/merge/review metadata cannot be independently read here. Supplied founder/ChatGPT evidence says earlier implementation CI [40114467939](https://github.com/shirrie01/bizgenie-api/actions/runs/40114467939) and #214 documentation-head CI [40115133054](https://github.com/shirrie01/bizgenie-api/actions/runs/40115133054) succeeded; these do not establish CI for new work.

API attempts for [#213](https://github.com/shirrie01/bizgenie-api/pull/213), [#214](https://github.com/shirrie01/bizgenie-api/pull/214) and Issues [#128](https://github.com/shirrie01/bizgenie-api/issues/128), [#191](https://github.com/shirrie01/bizgenie-api/issues/191), [#197](https://github.com/shirrie01/bizgenie-api/issues/197) returned GraphQL Forbidden. Latest comments and live Mission Control were unavailable; no claim they were read. Native immutable source and checkpoints were used as authorized fallback, including `BG_STUDIO_014_FE_CONTRACT_Q1_Q8.md`, current frontend acceptance pack/brain client, and BG-STUDIO-013 at `284877c791273b30bd338e0c232c3d18bb03020b`. No broader credentials sought.

DEC-015 keeps Mission Control canonical; supplied DEC-020/LOCK-018 selects Architecture A; DEC-021/LOCK-019 and DEC-022/LOCK-020 restrict authoritative identity to verified owners, including admin-key-only denial. DEC-014's full text was unavailable and was not inferred: no pricing/financial policy changes were made. Existing security debt/blocker IDs remain the reconciliation targets; no substitute operational tasks were created.

## C. Findings, reproductions and dispositions

| Priority | Confirmed finding / evidence | Disposition |
|---|---|---|
| P1 security | After normal bootstrap, delete membership locally, then call bootstrap: old code reinserts owner and returns a workspace. Two new PG tests failed with “Missing expected rejection” before fix. A demoted member could also recreate a missing default Brain through the same insertion path. | Fixed: ownership/project/Brain initialization only when INSERT actually creates the tenant. Existing tenants must retain authorization and identity records; otherwise existing503 is returned and transaction rolls back. |
| P1 privacy | Successful workspace/Brain reads and customer errors lacked explicit no-store/Authorization cache variance outside onboarding. New privacy tests fail before middleware. | Fixed across `/customer` and `/billing/stripe/checkout`, before CORS/parser; no shared-cache safety claim for unmanaged external proxies. |
| P2 integration | Allowed-origin PATCH preflight returned403 although campaign router exposes PATCH. New regression fails204 assertion before fix. | Fixed by including PATCH in existing method allowlist; no DELETE or admin-header expansion. |
| P1 provider reliability | Two distinct orchestrators sharing the same synthetic billing service/job invoked the mock operation twice; ledger still contained one reservation and one debit. | **Unresolved:** in-process promise coalescing is not cross-instance execution exclusivity. Requires reviewed durable claim/lease/fencing and provider idempotency/reconciliation design; do not claim financial idempotency makes paid execution exactly once. No new schema/financial policy implemented. |
| P1 billing recovery | A durable Stripe event claim left `processing` returns503 `STRIPE_EVENT_IN_PROGRESS` to a fresh repository instance. No automatic expiry/takeover exists in current beginStripeEvent. | **Unresolved:** safe crash recovery needs lease/fencing/effect reconciliation and operator rules. Never reset processing events blindly: side effects may already have committed. Approval needed before any schema/operational recovery change. |
| P1 dependency review | `npm audit --omit=dev --json` reported11 production dependency findings:2 critical,2 high,7 moderate, including inherited counts. | **Unresolved:** registry findings, not demonstrated exploits. Separate controlled dependency patch/reachability review required; no blind audit-fix or lockfile changes here. See §H. |
| P2 scale | Campaign list performs full per-campaign hydration, no pagination; measured56 queries at4 campaigns,160 at12. Calendar uses the same list. | **Unresolved:** batch relational loading while preserving repeatable-read/projection semantics; pagination needs explicit API/FE contract. No speculative optimization or response truncation implemented. |
| P1/P2 contract | Campaign creation captures a historical Brain snapshot, but generation separately resolves the current approved Brain; sequential stale owner/client writes have no client CAS. | Source-confirmed semantics/decision gap, not a new cross-tenant exploit. Decide which Brain version authorizes generation and how to expose source version/provenance before changing frozen contracts. Preserve existing snapshot evidence. |
| P1 product/operations | No customer cancellation/deletion API in inspected billing routers; Stripe lifecycle webhooks handle cancellation. Account/project deletion encounters restrictive attribution/scope FKs. | Do not claim self-service cancellation/account erasure complete. Product/support workflow, retention and recovery decisions needed; no new routes or cascades. |

No new P0 incident or actual credential compromise is asserted. Previously founder-verified infrastructure risks remain external blockers, not re-audited away by local tests.

## D. Commits and changes

| Commit | Files / rationale |
|---|---|
| `8fe130a394a29db82baa3e1a175a3049e111075c` | `src/customer-workspace/{postgresRepository,repository}.js`, `test/customer-workspace.test.js`, new `test/customer-workspace-reliability.integration.test.js`: first-creation-only grants, memory adapter retains tenant existence independently of membership,8 new PostgreSQL fault/concurrency tests and HTTP revocation test |
| `7c11adcf0a4dcbfe1c6e04dae4597d625315b374` | `index.js`, new `src/authentication/privateResponse.js`, new `test/customer-response-privacy.test.js`: consistent private responses while preserving Vary Origin |
| `fc9214f95b639092c2630805f7f98cd8588eb205` | `src/activation/cors.js`, new `test/customer-campaign-cors.test.js`: existing PATCH route browser compatibility |

**Tested code SHA:** `fc9214f95b639092c2630805f7f98cd8588eb205`. Later handover/evidence additions are documentation only. No migrations, package/lockfile, CI workflow, provider implementations or deployment files changed.

Contract effects: normal bootstrap201/reuse and session-refresh body unchanged. A revoked/corrupt existing default workspace now fails closed with existing503 `WORKSPACE_PROVISIONING_UNAVAILABLE` instead of silently restoring authority. This is not a retryable owner regrant: UI must not loop bootstrap to recover revoked access. No new error codes/body fields. Cache headers are additive; campaign PATCH is an already-defined API. Brand Brain Q1–Q8 remains as documented, including exact403/409 distinction and absence of client CAS.

## E. Actual customer journey trace

All “implemented” below means repository code plus local tests, not deployed proof. Auth boundary is verified Supabase bearer identity/scope in production composition; local HTTP tests substitute deterministic verifiers. Typical repository errors are safely mapped to503; unauthorized resources often use404 to conceal existence. These codes are route-specific, not interchangeable with onboarding403.

| Lifecycle / actual route | Authority, validation and ownership | Persistence / transaction / retry / dependencies |
|---|---|---|
| 1 Authentication: customer middleware / `tokenVerifier.js` | Supabase getClaims, configured HTTPS issuer, audience, expiry; scope from app_metadata, not user body. Identity-only discovery remains distinct. | Depends on correct project/key configuration and auth availability.401 invalid identity;503 boundary failures. Real refresh/issuer deployment unverified. |
| 2 Discovery: GET `/customer/workspace` | Identity token; DB joins current membership/tenant/project/Brain; multiple workspaces require explicit choice. | Read only; no-workspace versus selection_required are real distinct states.400 validation/401/503. No cache persistence after fix. |
| 3 Selection: POST `/customer/workspace/select` | Strict three IDs checked against current authorized approved workspace. | DB read then external auth-admin app_metadata update; no distributed transaction/CAS across Supabase and PG. Failure503 may follow partial external processing. Refresh and verify actual three claims before scoped loads; never infer successful switch. |
| 4 Bootstrap: POST `/customer/workspace/bootstrap` | Verified auth user, bounded business inputs; default IDs server-derived. Initial tenant creation establishes owner. | One PG transaction plus per-user advisory lock; create once, reuse existing workspace without name overwrite. New revocation correction above.201 also on reuse; multiple workspaces201 selection_required. Provisioning occurs afterward; retry reconciles existing workspace but is not a generic idempotency-key contract. |
| 5 Additional workspace: POST `/customer/workspace/brands` | Current owner of specified tenant; owner row locked through insert/commit after #214. | Transactional project+Brain creation; unique random IDs. **No request idempotency key:** uncertain response/retry can create another workspace.503 is not proof of no commit. No automatic retry guarantee. |
| 6 Roles: workspace repository / authorization service | Owner/member actions server-owned. Members read; existing member generation:create remains approved policy. Brand Brain unrelated member corrections remain allowed, not globally owner-only. | Write guards for onboarding, Brain and campaigns recheck/lock authority. Selection, discovery and generation prechecks have different boundaries; no blanket revocation guarantee across remote provider execution. |
| 7 Draft creation: PUT `/customer/workspace/onboarding` | Scoped bearer, owner; strict enums/lengths, expected_version and idempotency_key. Tenant/project/brand from trusted scope only. | Separate workspace profile, not Brain. CAS insert on first version; transaction locks authority/Brain facts; schema preflight fails closed503. |
| 8 Save/reload: same PUT and GET | Member reads; owner writes; version conflict409 and reused-key/different-payload conflict409. Customer provenance cannot be overwritten by inferred data. | Current same-key/body replay recovers lost acknowledgement without double version. Latest-receipt model, not unlimited historical-key replay. Save+exit before workspace creation remains absent. |
| 9 Confirmation: onboarding PUT `complete:true` | Explicit owner confirmation; real name, non-seeded/non-URL description, sector and channels;422 missing paths. | Revalidates current business facts, no entitlement/provider grant. Earlier completed status is not immutable proof current Brain remains complete. `complete:false` reopens under existing contract. |
| 10 Brain: GET/PUT `/customer/workspace/brand-brain` | Trusted scope/current membership; owners alone change name/identity.description; members may change unrelated fields; admin-key-only creates/identity changes denied on separate `/_admin/brand-brains/:id`. | Locked current Brain+membership comparison and atomic rejection; server version increment.403 BRAND_BRAIN_WRITE_FORBIDDEN;409 BRAND_BRAIN_VERSION_CONFLICT. PUT replaces optional sections. No client CAS or safe automatic retry after uncertain503. |
| 11 Campaign create: POST `/customer/campaigns` | Owner project/brand authority, strict body, server snapshot of approved Brain. | Transactional command/event/projection/receipt, idempotency_key.201; conflicting intent409. External generation not required. |
| 12 Campaign persistence: PATCH `/customer/campaigns/:id`, POST content/revision actions | Scoped tenant/project, current owner transaction guard, expected_campaign_version and strict nested content. | PG row/advisory locks; immutable evidence, deferred guards, receipt and rollback. Same-key replay after lost commit is supported by receipt; foreign reads404. List/detail use repeatable-read snapshots. |
| 13 Review/calendar: POST variant review/preview-renders/preview-acknowledgements/approval/schedule; GET `/:id/calendar` | Revision/profile/receipt/version and same-actor binding; owner transitions; approval revocation invalidates schedule/preview. | Evidence is preserved in transaction. Unsupported profile409; no bypass. Manual publication is attested workflow, not a live publisher. Publishing unapproved work is rejected by projection/DB guards. |
| 14 Eligibility/generation: POST `/customer/generate-script`, `/generate-image`, `/generate-video`; campaign variant `/generate` | Current membership action, project/optional approved brand, immutable generation job before provider. Customer IDs overridden from authorization. | Durable job uniqueness+fingerprint, billing reserve before operation, mocked provider tests. Campaign strategy/evidence/sections/originality validated before save_revision. Process-local execution coalescing is the unresolved cross-instance risk. |
| 15 Billing: GET `/customer/billing/subscription`, POST `/billing/stripe/checkout`, POST `/billing/stripe/webhook` | Owner checkout authorization; subscription reads authorized tenant; webhook raw-byte signature, environment/version/event allowlist. Plans/policies mapped server-side; balances hidden for foreign resources. | Immutable credit ledger, account locks, positive safe amounts, unique financial effects, related tenant/project/job binding. Replay same intent safe; different intent conflicts. Stripe is mocked locally; no charges. Event-claim crash gap above remains. |
| 16 Cancellation/recovery | Subscription deleted/updated and invoice events reconcile mapped customer/subscription with terminal/out-of-order rules. | No customer cancellation or deletion endpoint found in these routers. Existing application grant/release/debit replay is not cancellation support. External support/Stripe cancellation procedure and retention/restore remain operational requirements. |

Primary source files: `index.js`; `src/authentication/*Boundary.js`, `tokenVerifier.js`, `customerScopeProvisioner.js`; `src/customer-workspace/{router,service,postgresRepository}.js`; `src/workspace-onboarding/{router,service,postgresRepository,preflight}.js`; `src/campaigns/{router,repository,postgresRepository,generation}.js`; `src/generation-jobs/{service,postgresRepository}.js`; `src/generation-billing/service.js`; `src/billing/{service,postgresRepository,customerRouter}.js` and `stripe/{router,service}.js`.

## F. Security, financial correctness and generation reliability

Isolation evidence: existing authorization tests reject forged/cross-project/tenant actors; Brain/onboarding tests cover role demotion, revocation lock ordering, full-payload removal and member unrelated edits; campaign tests enforce tenant/project row predicates, immutable revision/approval bindings and retry receipts. New bootstrap test covers revoked ownership regrant overlooked by the existing suite. Cache/CORS tests cover allowed and foreign origins, forbidden headers and malformed/error paths. No new authorization roles were added.

Financial invariants locally verified: current entitlements/policies/execution costs, safe integer amounts, insufficient-credit refusal before provider, account-lock serialized spending, immutable ledger, duplicate reserve/debit/release/refund effects, same-key/different-intent rejection, one debit-or-release winner, and restart/lost-ack settlement. Stripe synthetic tests cover signatures, replay, metadata/customer mapping, API-version/environment mismatches, subscription lifecycle/out-of-order handling and invoice grants. These do not prove webhook delivery, real merchant config or orphan-claim recovery. Automatic refund qualification remains existing server policy; no pricing/past-due/refund changes.

Campaign correctness locally verified: request fingerprint binds job, strategy source anchors are bounded to supplied goal/approved context; final draft validates required sections, selected-strategy fidelity and originality before persistence. Tests span industries without paid calls. This cannot establish creative quality, sales performance or provider truthfulness. Source declarations are not engagement metrics. A provider call can finish after client timeout/disconnect: cancellation/settlement and a durable distributed execution fence need explicit design before paying-customer scale.

In-flight revocation means authorization serialization, not recall; generation remote work cannot be atomically coupled to DB membership. The code must reauthorize downstream commits, but provider cost incurred after a stale precheck cannot be undone. Frozen/historical campaign snapshots must not be silently rewritten to match a new Brain. Existing Brain version provenance and Learning Brain attribution are incomplete; no new source of truth created.

Security/config limitations: default JSON parser is bounded around100KiB; checkout32KiB, webhook1MiB, paid-beta capture owns its bounded parser/abuse check. No general authenticated generation request throttling, durable queue/backpressure or measured aggregate egress cap was established. Generation orchestrator state Map is unbounded and retains outcomes/promises; blindly evicting it would weaken retry coalescing. Text Vertex call has no explicit application AbortSignal/deadline in the inspected function; image/video transports have timeouts. Admin authority still uses an environment key, not a per-operator audit identity. Existing logger redaction/structured errors are not a complete audit/PII-retention policy. No untrusted input was sent to real providers.

## G. Local measurements and practical next engineering

One bounded localhost run, synthetic fixtures, PostgreSQL17 pool max5,8 workers,128 workspace reads: **52.98ms total, p50 2.09ms, p95 7.32ms, max25.72ms**, pool waitingCount0 afterward. This is neither deployed latency nor a capacity/SLA benchmark. No staging/production load or cloud resources used.

Campaign full list:4 campaigns →56 SQL round trips /23.76ms;12 →160 /60.28ms. Current implementation is4 fixed transaction/authority/list queries plus13 per campaign, and hydrates full history/maps. Existing parent indexes help individual reads but do not eliminate N+1 or unbounded history. Prefer batched scoped reads under the same repeatable-read transaction; separately agree pagination/detail boundaries with frontend. Do not introduce silent LIMIT truncation.

Long-lived write transactions hold authority/Brain/account locks; injected real lock timeout (`55P03`) now has a bootstrap regression proving no orphaned membership and a clean retry. Runtime lock/statement timeout values, instance count × pool budgets and overload policies require target measurements and operator approval, not guessed production settings. Additional-workspace create and Brain PUT lack exactly-once retry; user interfaces must reconcile uncertain outcomes rather than retry storm.

## H. Verification and evidence

[Sanitized machine-readable evidence](evidence/BG_STUDIO_015_LOCAL_EVIDENCE.json) includes measured values, audit advisories, mutation hashes and artifact limitations. Local logs retained under `/workspace/.onboarding/bg015-*`.

| Check | Actual result |
|---|---|
| Before-fix PG bootstrap regressions |2 failing revocation cases,4 other cases passing; source regranted owner |
| Before-fix privacy and PATCH probes |Missing no-store headers; PATCH preflight403 instead of204 |
| Final focused new work |22 passed,0 failed/skipped |
| Entire Node22.23.3 + disposable PostgreSQL17 suite |713 passed,0 failed/skipped/cancelled; independently rerun against a fresh PG17 cluster without pre-created fixture roles:713 passed,0 failed/skipped/cancelled |
| Explicit billing/campaign/onboarding/Brain PostgreSQL regressions |72 passed,0 failed/skipped (24 billing,22 campaign,19 onboarding,7 Brain) |
| Syntax |index.js and all src/test JavaScript passed node --check |
| Whitespace / unintended changes |git diff --check passed; no migration/package/workflow/deployment file changes |
| Mutation tests |5/5 detected: bootstrap conditional bypass, owner check removal, project-tenant predicate removal, privacy header removal, PATCH removal. Every mutation restored with byte-hash check before final suite. |
| Offline container |Current source overlay built over cached Node22.23.4 image with matching package-lock SHA256; health200/admin403/synthetic-admin200/empty-generation400 smoke passed against disposable PostgreSQL16. No paid endpoint execution. |
| Fresh Dockerfile / Buildpack |Not verified locally. Node22-slim base unavailable locally; pack absent. Offline overlay is **not** proof of reproducible fresh dependency install or Google Buildpack success. Docker default cache initially read-only; approved local build retry succeeded. |
| GitHub CI / deployed E2E |New-head CI unavailable pending API access; no connected deployed test. Baseline CI is separately supplied authority, not new-head proof. |

Production dependency audit exited1 with11 findings. Local versions: express4.22.2, body-parser1.20.6, proxy-addr2.0.7, qs6.15.3, zod4.4.3, Vertex SDK1.12.0. Notable registry advisories: [proxy-addr IP trust spoofing](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [body-parser compressed-body DoS](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Zod collection-memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), plus qs/uuid inheritance. Counts include parent dependency propagation, not11 distinct demonstrated exploits. Express trust-proxy is not enabled by inspected app source, reducing that specific trust-subnet path; actual platform middleware/config and advisory reachability still require review. No compatible blanket auto-fix was established. Before release, reproduce applicable bounded adversarial cases and review/pin compatible patches in a dedicated dependency change; preserve raw Stripe bytes and schema behaviour. Do not infer security from a green functional suite.

Standalone synthetic evidence probes (not new production APIs): `/workspace/.onboarding/bg015-generation-probe.js` uses existing synthetic billing fixture and two orchestrators; `bg015-local-measure.js` creates/drops a loopback-only database, measures reads/list SQL counts and models an interrupted Stripe processing claim. No live Stripe/provider calls or claim resets. These are diagnostic demonstrations, not regression tests promising the unresolved behaviour is correct.

## I. Frontend reconciliation

Current frontend #49 contains #48's identity enforcement, member read-only identity controls, unchanged protected values during unrelated saves,403/409 recovery and uncertain-save503 wording in `src/premium/brainClient.js` and Premium handlers. Legacy flag-off raw editor retains generic errors by explicit scope. Backend Q1–Q8 is already published in #214 files; no duplicate approval request or contract invention.

Q7 remains: onboarding rechecks current business facts for completed-profile writes;422 business_name/description paths unchanged. Owner edits can still invalidate previously complete facts; member restriction is not a permanent freeze. This work preserves those semantics and version/provenance checks. The new revoked-bootstrap503 must not trigger a client loop to recreate old ownership: re-discover authorized workspaces, retain honest unavailable/access guidance, and use separately approved support recovery. Browser role hints remain stale-capable; server authorization is final.

A no-network integration probe loaded the **actual #49 `src/premium/brainClient.js` module** and called real backend HTTP handlers through Supertest (fake identity and memory persistence). **5/5 cases passed:** member unrelated edit, owner identity edit, stale-member403, overlapping server-snapshot409 and503 mapped to unconfirmed. This is stronger than comparing documented shapes but is not real Supabase/browser/PostgreSQL staging E2E. Probe retained at `/workspace/.onboarding/bg015-frontend-contract-probe.js`; sanitized results are in the evidence JSON.

No new frontend request fields, response DTO versions or feature flags are required by these fixes. Existing campaign PATCH now works through allowed-origin CORS. A real frontend/backend authenticated session integration remains unverified; mocked UI passes do not resolve staging gates.

## J. Implementation-ready staging approval package — do not execute

Proposed backend **tested code `fc9214f95b639092c2630805f7f98cd8588eb205`** plus report-only head; frontend **#49 `9749254b80aaa128c7d2af27f12124478d9f9ea4`**, containing #48. Reverify refs/checks before any action. Keep #213 → #214 → new dependent draft order explicit; no merge authorized.

1. **Security isolation gate (RED):** attach current operator evidence to existing BG-STUDIO-013/BLK-STUDIO-06/07 and TD-STUDIO-SEC-001/002 as appropriate, with actual canonical scopes checked by ChatGPT. Do not duplicate tasks. Shared Supabase key binding and production runtime least privilege require approved resource-specific changes, separate key provenance and consumer/rollback inventory. Provider/billing flags are now **reported enabled by founder work order**; confirm exact names/effective values and paid-call exposure read-only. No blanket flag-off or IAM change authorized here.
2. **Schema gate (RED until target evidence):** operator supplies actual staging PG version, migration ledger, parent unique keys, effective role/RLS/lock privileges, data-violation counts, TLS/CA validation. Hardened preflight remains strict. Pending order is `20261023100000_create_workspace_onboarding_profiles.sql` then `20261024090000_harden_workspace_onboarding_profiles.sql`. SHA256 respectively `f6d73ea72dd7f127bdb678400058ec8ffaf96099d35e8060602847a47f6aa5b2` and `feee6c2b4763d9e906133cd0d6f77f319fcba17b29d0067bdf368b467bc244f9`. No application to shared DB authorized.
3. **Recovery gate (RED):** observed backup timestamps are founder-reported, not a verified restore. Name operator, prove target-specific backup access/retention/RPO/RTO and approved isolated restore. Retain compatible artifacts and isolated credential bindings; rollback must not restore excessive IAM/shared keys/member-write bypass or drop private records/RLS. On failure stop test writes; approved UI/traffic rollback or forward correction, preserve DB evidence. Any restore/cutover needs explicit authority.
4. **Auth/fixtures gate (AMBER):** separate staging auth issuer, frontend/backend origins and existing provisioner; real refresh after explicit selection must carry selected three IDs. Approve synthetic owner O with two distinct authorized workspaces, member M, foreign tenant/user X, unique Brain/onboarding markers. Include revoke/demote, two-tab races, lost-ack reconciliation and no cross-scope flashes. No real data or connected writes in this task.
5. **Cost/activation gate (RED):** no numeric estimate supported by live account data. Compute incremental Cloud Run requests × CPU/memory active time plus min-instance baseline, Supabase capacity/backup/restore plan costs, logging/egress/auth usage using current account tariffs and measured test volume. Founder sets maximum duration/cost, monitoring and stop operator. Keep paid providers/publishing inaccessible during onboarding acceptance; changing reported flags itself requires separate approval. `VITE_PREMIUM_STUDIO_ENABLED` is build-time; no new backend activation flag introduced.
6. **Explicit founder approvals before execution:** exact target/fixture writes; migration files/order/window/timeouts/backup/restore plan; deployment artifacts/revisions/traffic; staging-only flag/config changes; runtime budget/time ceiling and rollback operator. DEC-020/021/022 authorize architecture/policy, not these operational changes. Current full test results do not authorize them.

Abort on production-resource/data binding, wrong auth issuer/scope, missing restore proof, unverified artifact CI, schema drift or role/preflight failure, unexpected paid-provider/Stripe operation, duplicate execution, lost access isolation, uncontrolled costs or any denied required safeguard. No bypass to “get staging green.”

Assessment: **GREEN** for the three bounded fixes' local regression evidence; **AMBER** for contract/product and performance proposals needing review; **RED** for connected staging/first-paying-customer execution until security, dependency, recovery, CI and operational gates are resolved.

## K. Next three actions, ranked

1. Obtain review/exact-head CI of this dependent draft and clear applicable dependency advisories with compatible patches; retain revoked-owner regression. This closes an actual authorization bypass rather than relying on mocked acceptance.
2. Approve the durable generation-execution/Stripe crash-recovery design (schema/fencing/lease ownership and reconciliation where needed) and corresponding restart/multi-instance tests. One credit debit is not proof of one provider invocation; do not enable chargeable multi-instance generation on that assumption.
3. Finish existing infrastructure isolation/least-privilege and restore gates through authorized operators, then separately approve pinned two-workspace onboarding staging acceptance. Measure list batching/pagination and pool/concurrency budgets before scaling; do not conflate these plans with authorization to deploy.

## Publication checkpoint / maintainer action

Native git published `bg-studio-015-backend-reliability`. Draft creation with base `bg-studio-014-identity-write-policy` returned GraphQL **Forbidden**; exact-code-SHA Actions lookup returned REST **Forbidden**. No PR number or new CI success is asserted. Local prepared body: `/workspace/.onboarding/bg015-pr-body.md`. Once authorized GitHub access is available, checkout this branch and create the single dependent draft (first check that none already exists):

```bash
gh pr create --repo shirrie01/bizgenie-api --draft \
  --base bg-studio-014-identity-write-policy \
  --head bg-studio-015-backend-reliability \
  --title 'BG-STUDIO-015: prevent revoked bootstrap ownership and repair customer HTTP boundaries' \
  --body-file docs/studio/BG_STUDIO_015_BACKEND_RELIABILITY.md
```

Verify final draft-head Node22/PostgreSQL and container jobs to completion; do not infer CI from the local713 tests or prior #214 checks. The same authorization restriction prevents a GitHub tracker-comment update; this branch report is the crosslinked evidence for ChatGPT to reconcile into existing Mission Control rows. No duplicate task or live register update was made.

Additional repository-level hardening proposal: root Dockerfile uses broad `COPY . .` without a checked-in `.dockerignore`; this audit's build used a strict allowlisted temporary context (public package files, index.js, src), never credential files or workspace metadata. A reviewed build-context exclusion policy and reproducible clean dependency build are needed before release; do not claim secrets were found in an artifact. Express default handling of unrecognized parser failures and effective NODE_ENV/proxy settings also need bounded ingress tests before exposing full production traffic. No deployment configuration was changed here.
