# DEC-023 backend support — separate from BG-STUDIO-016 S1

25 October 2026. Founder approved professional-services support, canon-backed billing display, calendar auto-load/explicit window and customer-friendly unverified-payment wording. That product approval is not reopened here. **Staging RED; no launch authorization.** No migration, shared SQL, deployment, credentials, IAM, live Stripe/provider or publishing operation. This document is evidence for existing Mission Control/Claude work, not a new governance register.

## Exact inputs and implementation

Verified native remote heads: main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`; backend #213 `120a874dfa02313a8c28dad82ddb6582f0065469` → #214 `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` → #215 `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b`. Frontend [#50](https://github.com/shirrie01/bizgenie-web/pull/50) fetched/read at `0e13e22230d497762e91eb99443e77a736a75e25`, including `docs/studio/BG_STUDIO_017_FE_REPORT.md`. Its earlier questions are superseded by the founder's current DEC-023 direction; this does not supply missing numerical pricing data. PR API comments remain inaccessible (GraphQL Forbidden); live Mission Control/locked pricing records are not claimed read.

Product branch `dec-023-backend-contract-support` is based on #215, not on the S1 documentation branch. **Tested code SHA `f8a7dba0bb97accdc23c04bf68805990d0672c6f`**: `src/campaigns/router.js` and `test/customer-campaigns.test.js` only. No S1 infrastructure/checklist changes mixed into it. S1 identity/IAM checkpoint is separately published on the existing documentation branch at `ed336e15db708bb622ec6d4769f6fd5430519288`.

## Professional services: minimum coherent change and schema blocker

Current request validator, SQL and preflight all encode the same seven-key domain. A local source/validator probe returns400 `ONBOARDING_VALIDATION_ERROR` with sector_key path for proposed **`professional_services`**. It is **not yet supported**. DEC-023 authorizes the category; this work does not silently map it to an existing category or accept values that cannot be persisted.

Minimal implementation after schema-change work is authorized:

1. Add `professional_services` to `SECTOR_KEYS` in `src/workspace-onboarding/schema.js`; preserve the seven old values, strict unknown-key rejection and the existing v1 envelope. Proposed UI label: Professional services. Do not also add local-services or regulated-sector promises without scope authority.
2. Prepare a **new separately reviewable additive migration**, not an edit to `20261023100000...` or `20261024090000...`, extending only `workspace_onboarding_profiles_sector_key_check` to include that value. Preserve FK/RLS/privileges/source/completion invariants and all saved data. No such migration file or DDL was added/applied under this task's no-migration boundary.
3. Update `src/workspace-onboarding/schemaContract.json` from the reviewed intended disposable-PG17 definition; runtime must continue matching exact audited constraints. Do not weaken preflight, learn its expected schema from live DB, or accept arbitrary constraint changes. Old binaries expect the old fingerprint and will503 against the expanded check: coordinate a reviewed application/schema transition or an explicit, narrowly versioned old/new manifest strategy. New enum plus old DB alone is not a safe release.
4. Existing service CAS/idempotency/completion/source rules can carry the new key without a new preferences table or Brand Brain mutation. Current recommendation integration uses saved channels and does not deliver professional-sector-specific strategy merely because a new label exists; any such claim needs its own evidence.
5. Required deterministic tests: customer-selected and inferred source save/read/resume/confirmation; inference cannot overwrite customer choice; same-key replay/conflict and stale versions; current owner/foreign tenant/demotion; SQL new-key acceptance and all seven legacy keys; unknown-key rejection; no grants/RLS drift; exact seed/preflight parity on old/new target states; upgrade data preservation and safe rollback; professional customer never receives drinks-specific placeholder guidance.
6. Claude updates matching #50 enum/model/layout/read normalization and tests only when the backend+schema contract is ready. Until then do not send the new key or imply it is persisted; existing industry_text can hold customer-written details but is not a substitute for an implemented sector. Do not silently promote inference.

**Why not enum-only implementation now:** it would pass memory tests while hitting the durable CHECK or strict preflight in PostgreSQL. The explicit no-migration boundary prevents completing that chain safely. The blocker is schema preparation/rollout authority, not another decision on whether professional services is approved.

## Locked pricing canon and current authoritative API

The checked-in **`docs/product/BizGenie_Canon_v2.md`** is canonical for product philosophy/launch principles, but explicitly says it does not itself approve pricing/legal terms. Repository search of the exact stack and #50 found **no authoritative locked public price/terms schedule**. Mission Control access and latest comments are unavailable. Therefore exact money prices, currency/tax treatment, billing cadence/commitment, approved legal copy and links cannot be supplied from available evidence. No guessed price, plan reset or credit allowance was introduced.

Located implementation contracts:

- `docs/billing/STRIPE_SUBSCRIPTION_LIFECYCLE.md`, `src/billing/stripe/{config,service,router}.js`: tenant-owner-authorized POST `/billing/stripe/checkout`, request `{tenant_id,plan_code,request_id}`. Server maps plan to approved Stripe Price/policy; user cannot provide price/key/customer/return URL. Signed webhook/server state, not browser return, is authority.
- `src/billing/customerRouter.js`: GET `/customer/billing/subscription?tenant_id=...`, authorized tenant read.200 `{status:"ready",subscription,available_credits}` or `{status:"not_subscribed",subscription:null,available_credits:null}`. subscription exposes plan_code, entitlement_status, included_monthly_credit_grant, period/start/end/cancellation/grace metadata. It **does not expose public price, currency, VAT, approved terms or payment_verified**.503 means unknown availability, not no payment.
- `docs/billing/COMMERCIAL_CREDIT_LEDGER_FOUNDATION.md` and `GENERATION_CREDIT_ACCOUNTING.md`: commercial credit prices/allowances are approved immutable policy data, not inferred monetary subscription prices. A seeded special paid-beta policy is not a general locked public pricing canon. Frontend must read the actual returned grant/balance for the tenant, not hard-code a value as universal Standard entitlement.

**Required read-only handoff:** ChatGPT/founder supplies the existing locked canon link/version/decision and exact approved plan/price/currency/cadence/tax/terms/trial/cancel/refund wording, plus approved plan-policy/Stripe Price mapping evidence without keys. Link the source; do not create another pricing canon. No live Stripe lookup was made or is authorized. A public plan-catalog response would be an additive API design to review once source data is present; do not ship fabricated catalog entries or overload access DTOs with guessed prices.

Customer wording proposal for Claude (no backend payment assertion added): ready entitlement → **“Your workspace has access. Payment details aren’t available here.”** Missing active entitlement → **“We haven’t confirmed plan access for this workspace yet.”**503 → **“We can’t check your subscription right now. Please try again.”** A successful checkout redirect alone must not say paid. Founder approval covers improving wording; final legal/pricing copy must still match the actual locked canon, not this engineering proposal. No access/credit/financial policy changed.

## Calendar: bounded implemented fix and #50 integration contract

Existing GET `/customer/campaigns/:campaignId/calendar` requires `tenant_id`, `project_id`, `from` and `to`. Both dates are ISO8601 instants with offsets. Authorized project read plus campaign ownership is enforced; foreign campaign404. It returns **one campaign's** `{entries:[{campaign_id,content_item_id,variant_id,workflow,occurrence_at}]}`. Only scheduled/published occurrences, not all drafts; no month grid, title/channel enrichment or workspace-wide endpoint. Repository still loads project campaign history (known query-growth limitation); automatic loading must not create an unbounded request loop.

Reproduced defect: reversed/equal windows returned200 `{entries:[]}`, falsely appearing like a valid empty period. The new refinement requires **Date.parse(from) < Date.parse(to)**, including equivalent instants expressed with different offsets. Invalid window now uses the existing response:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed"}}
```

HTTP400, no new fields/codes/details. Valid requests/response DTOs unchanged. Existing window semantics are **from inclusive, to exclusive**, entries ordered by occurrence_at then variant ID. No new maximum-duration/default-period policy was invented.

Claude can implement approved auto-load without another backend endpoint: after verified session/workspace and campaign selection, send the explicit chosen window, label its dates/timezone clearly, show loading/empty/error separately and ignore/abort old-scope responses after switching. Existing FE period is minus30/plus90 days, but backend does not define that default; display the actual requested period rather than claiming a month view or whole-workspace coverage. Reuse reads, not schedule/publish mutations. Workspace-wide aggregation/enriched entry DTO/pagination would require a separate contract; not implemented here.

## Evidence, publishing boundary and next action

- Before fix: new HTTP calendar regression failed because200 was returned instead of400.
- Focused calendar/campaign/onboarding/billing suites: **65 passed,0 failed/skipped**.
- Full Node22.23.3/disposable PostgreSQL17 suite: **715 passed,0 failed/skipped/cancelled**. Existing DDL/test fixtures exercised only in disposable local databases; no new migration or shared/staging SQL.
- Tests cover reversed/zero/equivalent-offset instants, valid offset ordering and foreign-campaign404; existing tenant/approval/billing/onboarding regressions unchanged.
- Syntax and whitespace passed. No schema, package/lockfile, financial implementation or onboarding enum files changed. No hosted integration/new-head CI claimed. Logs: `/workspace/.onboarding/dec023-{calendar-before,focused,full}.log`.

Next safe product step: create/review the dependent calendar draft and reconcile this note with existing frontend #50. Supply the existing locked pricing canon and separately authorize the professional-services schema/manifest draft before claiming persisted sector support. Keep S1 Console IAM review, named operator and numeric ceiling on the existing S1 checkpoint; no security infrastructure execution mixed into these product commits.

Publication checkpoint: native git published `dec-023-backend-contract-support`. Creating a dependent draft against `bg-studio-015-backend-reliability` and posting this contract to frontend #50 both returned GraphQL **Forbidden**. No new PR number/comment URL is claimed. Prepared text is retained at `/workspace/.onboarding/dec023-pr-body.md` and `dec023-frontend-comment.md`. An authorized maintainer can create the single dependent draft after checking none exists:

```bash
gh pr create --repo shirrie01/bizgenie-api --draft \
  --base bg-studio-015-backend-reliability --head dec-023-backend-contract-support \
  --title 'DEC-023: validate campaign calendar windows and document backend contract gaps' \
  --body-file docs/studio/DEC_023_BACKEND_CONTRACT_SUPPORT.md
```

Verify final-head CI independently; local715 passing tests are not GitHub CI or deployed acceptance. Original backend #213/#214/#215 branches and S1 operational state remain unchanged. The read-only source evidence is available for ChatGPT/Claude through this published file even though comment access failed.
