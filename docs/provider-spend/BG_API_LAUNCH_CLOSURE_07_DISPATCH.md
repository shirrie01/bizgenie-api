# BG-COST-001 / BG-API-LAUNCH-CLOSURE-07 — provider dispatch integration

13 November 2026; source-only work under Issue #234 and master #191. Base accepted main16f363e93425e204d744ec5cb6d38391295f2346 includes #236's durable monthly boundary. No schema, policy, live worker or provider activated.

## Paid call inventory and enforcement

| Concrete paid boundary | Guard and operation identity |
| --- | --- |
| Text SDK `src/generation.js` model.generateContent | `vertex.text.<model>`; bound must cover all permitted input/output/structured modes |
| OpenAI image `fetchAttempt` (generate/edit and retries) | `openai.image.<model>.<quality>.<size>.<format>.<generate/edit>` |
| Veo REST transport POST | `vertex.video.<model>.<submit/reconcile>.<duration/status>.<resolution/status>.<audio>` |

These are the concrete generation network boundaries in current accepted source. Existing image/video services and later quote/hybrid adapters reuse them; abstract fake providers and local compositors are not paid endpoints. No whole #230 product stack imported. Storage retrieval/rights, OAuth/social APIs and Stripe are different operations and were not misclassified as generation charges. A future new provider must explicitly use this authority and receive review; tests do not prove arbitrary future code safe.

Every default real boundary calls one AsyncLocalStorage admission authority. No scope, unapproved operation, stale/revoked membership/fence, unknown price/currency, unsafe ledger policy/RLS/role or customer11 denies before the SDK/fetch call. Injecting a fake HTTP client alone does not bypass the guard. Direct image request/attempt and direct video REST calls are covered, not only high-level generation services. Synthetic fixture constructors now explicitly inject a callback that invokes only their fake transport; that callback is a server-owned test seam, never an environment/client request field. Production factories do not expose a browser-controlled bypass.

No automatic runtime environment flag establishes a spend scope. `withProviderJob` requires an operator/server-owned monthly spend instance, immutable job identity (job/tenant/project/brand, token/fence), current authority resolver and approved operation/estimate map. Identity is cloned and scoped to the async job; tenant contexts do not bleed into concurrent jobs. Durable admission ID is computed from immutable job ID + operation, not a caller-supplied retry UUID. Existing credit/entitlement/approval/cancellation fences must already pass.

Submission requires live calling state. Explicitly priced video status observations may use recovery_required; this does not authorize resubmission. Authority resolves before reservation and again inside the one-shot permit immediately before provider dispatch. Resolver errors are sanitized. MonthlyProviderSpend preserves worst-case exposure on every ambiguous result, crash or timeout; an image retry following an attempted dispatch cannot obtain a second permit. Existing synthetic retry tests remain valid without being mistaken for real-provider financial retry authority.

## Worker integration

`createFencedWorkerScope({worker,spend,operationsForRow})` binds to the existing fenced worker protocol without importing its unmerged product stack. Its resolver opens the worker's existing authorized transaction, loads the durable claim, checks token/fence/state, reauthorizes the actor/tenant/project/brand, checks media rights and compares live preview/brand binding against the frozen quoted profile. No stale start-row shortcut. It then supplies the common job scope. Operations and estimate versions must be resolved server-side from the approved immutable profile; there is no client cost override.

The separately prepared #217 tranche exposes `providerScope(claim,dispatch)` around submit and reconciliation. Only after BOTH sources are reviewed/merged may an operator-owned composition bind this factory to that hook. The hook's default allows synthetic provider implementations; concrete real network boundaries still default deny without a valid scope. No production worker scope, policy or cohort is configured by this PR. Existing #222/#230 production composition must be reconciled with this interface before any activation; no assumption is made that their old daily budget meets the cap.

Reconciliation retains stable provider references and does not submit another paid generation. Status endpoint pricing is unverified here: unknown cost is denied, never assumed free. The current durable per-job/operation permit is one-shot, so repeated status reads are held after the first authorized observation; an approved bounded idempotent/read-only reconciliation contract is still required before video runtime acceptance. Do not evade this by inventing attempt IDs. Definitive provider results/financial settlement evidence remain in existing worker/billing records; no new refund or credit rule.

## Missing cost authority and activation gates

No GBP estimates are invented. Founder/operator must supply approved worst-case bounds for each intended model/quality/size/duration/audio/text-token envelope, provider fees, GBP/FX assumptions and expiry, plus fixed first-ten cohort. Native non-GBP or absent/unapproved bounds fail closed. Zero-cost status reads require verified provider authority and a reviewed bounded observation contract, not an arbitrary positive allowance. No change from £100 aggregate/calendar month to daily budget. Customer11 remains held.

The durable ledger/schema, actual application-pool role/RLS/preflight, backup/restore proof and exact all-provider worker composition require independent runtime acceptance. #231 is proposal-only. No shared SQL, provider call, OAuth, paid generation, Stripe, publishing, IAM/secrets or deployment performed. Launch NO-GO.

## Tests and rollback

Full Node22/PG17 suite and focused provider/ledger tests include default deny at all three call sites, explicit synthetic fixtures, async tenant isolation, changed fence/revocation/completed state, recovery-only observations, durable no-redispatch after ambiguity, and worker claim propagation. Real disposable PostgreSQL race/restart/month/partial-settlement tests from #236 are retained. Exact counts are recorded in the final checkpoint; no live cost/enforcement proof is implied.

Rollback is reviewed source revert while paid gates stay disabled. Never deploy an older unguarded provider composition as a workaround, reset ledger/uncertain reservations, recycle cohort slots or remove financial history. Retain authoritative provider reconciliation and GBP settlement evidence; operational rollback/deployment/SQL require separate approval.

Final local evidence: Node22.23.3/PG17.11 full969/969 in a clean final run (`cost-final-full.tap`), focused78/78; separate billing24/24, campaign25/25; syntax/whitespace PASS. Counts overlap. Intermediate concurrent test transcripts are not the acceptance receipt; the clean final log is authoritative for this source tree. Initial development caught/fixed numeric AbortError.code handling without weakening timeout assertions. No remaining local failures in the final run.
