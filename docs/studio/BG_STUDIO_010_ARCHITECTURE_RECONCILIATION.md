# BG-STUDIO-010 architecture reconciliation

**24 October 2026 — decision recommendation, not founder acceptance.**

**Recommend Implementation A (#213) as the canonical architecture and wire contract.** Keep structured sector/industry classification, channel planning preferences and workspace onboarding progress in A's workspace-owned profile. Keep approved business knowledge in Brand Brain. Retire B as a competing implementation; do not merge its alternative endpoint, preference fields or personal-draft table into A.

A narrowly scoped hybrid is justified **only as hardening of A**: reuse B's owner-policy checks, transaction-bound ownership validation and private no-store response pattern after the founder decides write permissions. Align completion semantics with the frontend before release. This does not require combining persistence models or replacing frontend #48.

This is a documentation-only audit on existing branch `bg-studio-010-be-persistent-onboarding`. Neither implementation, migration, test, frontend branch nor PR was modified. No database was queried or migrated, no functional tests were executed, and no new PR was created. DEC-015 keeps the [Google Sheets Mission Control Register v1.0](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) as sole operational authority; this is engineering evidence for that decision.

## 1. Verified inputs and confidence

Native Git fetch/ls-remote verified:

| Input | Exact reviewed revision |
| --- | --- |
| Canonical backend main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| A: PR #213 / bg-studio-010-be-onboarding-persistence | `d0e1142c91c0c12b907227f2881e14f3bb2a44e2` |
| B: bg-studio-010-be-persistent-onboarding, before this audit | `f67c0438082bfccc460bdaf38097b35b995474ee` |
| Premium Studio frontend PR #48 | `9fa058232ba50209c8c26946fcb4b8744a577332` |

Both backend alternatives are based independently on main; neither needs the video-runtime stack. A's draft status and independently verified GREEN CI #350 are founder-provided authority. GitHub PR/check API read returned `Forbidden`, so this audit does not independently certify CI/review state. B's prior local 644-test result and unverified CI are historical evidence, not a fresh audit run. Neither report proves deployment or that any shared table exists. No production/staging inventory or private data was accessed.

The recommendation rests on actual service/repository/schema/frontend code and reviewed test coverage, not test-count comparisons. In particular, A's existing tests prove unchanged Brand Brain rows, scoped isolation, CAS and latest-retry handling. They do not prove owner-only writes, atomic authorization against revocation during commit, full business completion, or a historical learning ledger.

## 2. What the implementations actually own

**A:** `workspace_onboarding_profiles`, primary key `(tenant_id,project_id,brand_id)`. Verified token scope chooses the workspace; requests cannot select another scope. Sector key/source, industry text, ordered channel values/source, mutable draft, progress and completion live together under a separate profile version. Saving does not write Brand Brain. Latest-action idempotency plus atomic SQL CAS supports safe lost-response retry. Completed channel preferences reorder existing recommendation candidates; sector does not drive an invented strategy engine. [A1–A5]

**B:** `identity.sector` and `commercial.preferred_channels` extend the strict Brand Brain schema and existing JSON columns. Explicit Brain corrections change its version/timestamp and therefore its snapshot input. Separate proposed `customer_onboarding_drafts` is one private scratchpad **per user**, optionally carrying a workspace target; it supports identity-only accounts before workspace/profile creation. Drafts have atomic version checks but no equivalent idempotent replay receipt or completion model. Bound writes validate owner access under transaction locks. [B1–B4]

**Neither is an append-only Learning Brain.** A retains the latest preference state/last writer, B retains the current Brain/draft state, and campaign snapshots capture selected historical Brain records when campaigns request them. A version counter or a current `source` label alone is not a complete historical provenance ledger.

## 3. Decision matrix

Hybrid H below means **A's unchanged canonical stores/wire format plus selected B security patterns**, not running both backends.

| Criterion | A (#213) | B | H: A plus bounded hardening |
| --- | --- | --- | --- |
| One authority for industry/channels | One workspace profile; no new scalar preference fields in Brain | Canonical choices in Brain; private draft may carry differing tentative choices | Retain A as sole structured preference authority; draft values remain tentative, never second canonical values |
| Brain versioning/safe correction | Strong isolation: progress/preferences leave Brain version/hash untouched; inherited Brain correction still lacks CAS/owner-role enforcement | Preference edits use non-CAS Brain PUT and advance version/time; adds owner gate and preserves omitted new fields | A's separation plus reviewed write-capability protection; do not copy preference writes into Brain |
| Pre-workspace persistence | Not supported; needs trusted selected scope/bootstrap first | Genuine advantage: verified-identity draft before workspace/profile | Defer unless product requirement is confirmed; then design a distinct private intake API, not a second shape at A's URL |
| Multiple businesses | Independent workspace profiles; permitted collaborators share one workspace state | Brain preferences per business, but one user's draft target can replace another business's draft | Prefer A workspace ownership; explicitly decide collaborator write roles |
| Concurrency/retry | Atomic CAS, merge semantics, latest idempotency replay; older retry conflicts | Draft CAS with full snapshots; Brain correction remains last-write-wins; lost-response replay returns conflict | Keep A's protocol; add authorization lock around commit, not B's snapshot protocol |
| Customer-confirmed completion | Explicit complete command plus sector/channel presence; server predicate narrower than UI | Does not claim a completion decision; progress only | Preserve wire, agree server/UI completion meaning and provenance before release |
| Frontend #48 | Directly implemented contract | Incompatible request, response, status, step and retry formats at the **same URL** | Keep A contract; compatible hardening rather than frontend rewrite |
| RLS/schema/migration/rollback | New workspace table with RLS/revokes, source/completion checks; standard pending migration; tenant FK/drift/retention review needed | New private draft table proposed outside migration runner; RLS/revokes and owner-lock pattern; new Brain keys complicate reader rollback | Review A migration and safe retained-data rollback; borrow controls, no second table now |
| Learning/multi-industry growth | Source labels and workspace version are useful foundations; seven layout sectors are not a universal industry taxonomy; no historical context ledger | Free text and broader channel IDs more flexible immediately; no field provenance, and UI choices churn Brain snapshots | Keep A plus future versioned taxonomy/context references; retain custom industry text and distinguish inference from confirmation |
| Implementation/release risk | Lowest integration cost: tested PR and compatible frontend exist; identified gates remain | Would redo #48 and introduce schema/Brain migration complexity | Smallest justified extra scope, on #213 only after decision; no competing implementation |

**Decision:** select A's architecture and contract, with H as a bounded follow-up review scope. B's advantages are real but can be reused without its competing stores/API. There is no evidence that replacing A with B yields benefits sufficient to outweigh frontend and data-model conversion costs.

## 4. Exact findings requiring review

### 4.1 Write authority and revocation — A needs a policy and a stronger commit boundary

A's `#authorizedScope` checks current workspace membership, but `save` does not check `workspace.membership_role` or an explicit write capability. Thus every member accepted by selection can save/complete shared onboarding. Existing authorization policy distinguishes owner write actions from member reads/generation. Whether collaborative members should edit onboarding is a **founder policy decision**, not something this audit silently changes. B explicitly requires owner for bound drafts and Brain corrections. [A2, A6, B2]

A's authorization check and profile CAS are separate operations. `PostgresWorkspaceOnboardingRepository.commit` receives scope/record but does not recheck/lock membership in that transaction. A revocation after the service check can race a write. Its existing revocation test covers a revoked membership before the next call, not that interleaving. B's bound-draft transaction demonstrates the stronger pattern: recheck/lock membership/project/brand while committing. [A2, A3, B3]

Recommended bounded follow-up on A: decide write capability; preserve member read if intended; bind server actor to a transaction-scoped authorization check and profile CAS; add an adversarial revocation-during-commit test. No new table or frontend request format is necessary. This is release hardening, not evidence of a demonstrated cross-tenant API leak.

B's owner protection is not a complete answer by itself: its canonical Brain PUT remains non-CAS and its separate service precheck is not locked to the Brain upsert. Neither implementation should claim all concurrent Brain corrections are resolved.

### 4.2 Completion is narrower on the server than in frontend #48

A's `completeness` checks only a non-null sector and at least one channel. `complete:true` does not require source=`customer`, a real non-placeholder Brain name, or a real non-seeded description. `neutral` is accepted as a sector. The server returns a placeholder flag but does not use it as a completion guard. A direct caller can therefore mark preference onboarding completed even when the frontend's business-readiness check would refuse confirmation. [A2]

Frontend `confirmationReadiness` additionally checks saved Brain name/description and rejects the bootstrap description prefix; it does **not** require customer source for sector. `confirmSetup` sends an explicit completion action. This is evidence of customer action in the current UI, not server proof that every saved value was independently confirmed or that the whole business is ready. `updated_by` is last editor, not a durable `completed_by`; later edits can keep the original completed timestamp. [F2, F3]

Founder must define whether `completed` means (a) preference wizard complete, with separate Brain readiness, or (b) customer-confirmed business setup. Recommend aligning server checks with the current UI before using it as (b), retaining inference labels until explicit confirmation and never making completion an entitlement/approval gate by implication. Do not auto-promote inferred values to customer provenance. Neither meaning authorizes publishing or paid generation.

### 4.3 Privacy and tenant integrity

Both schemas enable RLS and revoke direct PUBLIC/anon/authenticated/service_role access. Both depend on the existing trusted backend DB role; RLS is not a substitute for backend authorization. B adds explicit `private, no-store` and `Vary: Authorization` on draft routes. A's new router lacks those explicit headers; reuse the pattern as privacy hardening, without claiming a cache leak was demonstrated. [A4, A5, B4]

A's `(project_id,brand_id)` FK verifies the brand/project pair, but no FK in its new table ties its `tenant_id` to the project's tenant. The service graph currently supplies that protection. Strengthen/verify full tenant/project integrity during pending schema review, using existing referenced keys where valid, and test mismatched tenant/project/brand writes. This is defense in depth against trusted-writer mistakes, not proof a foreign token currently passes the API. [A5]

A's CREATE IF NOT EXISTS rerun test proves no data loss on the expected table; it does not validate an unexpected pre-existing table's constraints/grants. Require a schema/grant preflight before enabling the API. B's proposal is outside the automatic migration directory, which is safer against accidental application but does not itself make its competing schema preferable.

### 4.4 Recommendation and learning provenance

A only reorders deterministic existing candidates using completed-profile channels. Lookup failure falls back to existing recommendation behavior; no unsupported provider output is fabricated. However the injected context omits profile version/source/digest, and historical preference state is not retained. Same recommendation key after preference changes can conflict, as A documents. [A7]

Keep that limited behavior for compatibility. Before making learning/attribution claims, record a versioned reference or snapshot of the exact profile consumed, scoped to tenant/project/brand, alongside the existing recommendation evidence. Do not reconstruct historical preferences from the current mutable row, infer performance from onboarding, or alter historical campaign snapshots. This is a future approved provenance work order, not a new Learning Brain built here.

### 4.5 Correcting B's prior documentation

B's previous report says campaign-list ties have no specified secondary order. Actual canonical main and both reviewed implementations sort `updated_at` descending **then `campaign_id` ascending** in both repository adapters. A's contract is correct on this point. The B report under-described an existing guarantee; it is not a reason to introduce another campaign-list implementation. [A8]

## 5. Why frontend #48 must keep A's contract

The identical URL `/customer/workspace/onboarding` hides fundamentally incompatible protocols:

| Concern | Frontend #48 / A | B |
| --- | --- | --- |
| Scope | Verified selected-workspace token; no body scope IDs | Verified identity plus explicit nullable workspace target in draft |
| Save | `idempotency_key`, expected version, partial sector/channel/progress/draft updates | Expected version plus complete nested draft snapshot; idempotency key is unknown |
| Result | `onboarding.contract_version=workspace-onboarding.v1`, sector/channels/source, integer step, completion | `{version,draft,updated_at}`; missing state is a different shape |
| Retries | Latest identical action replays with unchanged version | Stale save conflicts; caller rereads/reconciles |
| Errors | VERSION_CONFLICT / ONBOARDING_* codes | ONBOARDING_VERSION_CONFLICT / WORKSPACE_* codes |

Frontend #48's parser explicitly requires A's envelope; it rejects B responses as `ONBOARDING_BAD_RESPONSE`. A-shaped writes fail B's strict schema. Running both routers or dispatching by field/token presence is not a safe compatibility plan. [F1, B2]

Keep #48's form field limits, patch/null semantics, source labels and idempotency keeper. Workspace/account changes clear onboarding state and the keeper and guard late onboarding responses with a scope epoch. Verify two-business, logout/login, refresh/retry and multi-tab behavior against the chosen backend. [F1, F4]

The actual Premium Studio Brain loader is `premiumLoadBrain` (`App.jsx:820`), passed at line 953, and it has a scope-epoch check just like `premiumLoadOnboarding` at line 855. The older unguarded `loadBrandBrain` at line 429 belongs to the legacy view; it must not be presented as a demonstrated Premium Studio scope leak. Preserve/test the current Premium guards. Separately correct Brain-save wording at `PremiumOnboarding.jsx:92`: the existing API preserves current Brain status and does not always make it draft.

## 6. Canonical ownership and extensibility

Adopt these boundaries in the existing contract, not another master register:

1. **Workspace onboarding profile (A):** sole current structured source for sector/layout classification, industry text and channel planning preference, with source and profile version. Unsaved `draft` fields are tentative, not competing canonical Brain values.
2. **Brand Brain:** explicit saved business knowledge/governance and existing version/snapshot behavior. No parallel B `identity.sector` / `commercial.preferred_channels` writers. Prose can describe an industry without becoming another machine-authoritative preference scalar.
3. **Campaigns/recommendations:** consume reviewed, version-bound context. Campaign approvals, billing, entitlements, connected-account authority and publishing remain separate.
4. **Future Learning Brain:** tenant-isolated observations/inferences referencing immutable evidence and the exact source versions. Inferences are proposals, never silent overwrites of customer choices. Neither A nor B supplies this full ledger now.

A's seven sector keys are an initial UI/guidance vocabulary, **not a claim that every industry fits seven businesses**. Preserve `industry_text` for custom business descriptions and explicit neutral handling. A future taxonomy should have stable IDs/versioned mappings and optional multiple industry classifications; current #48 keys remain valid presentation mappings. Expand channel capabilities only through explicit versioned planning metadata—not by pretending a connected provider exists. B's free text and YouTube/other IDs are flexibility advantages worth retaining as requirements, not justification for a second source of truth today.

## 7. Migration and frontend compatibility plan — conditional, no execution

### Default: neither alternative has persisted shared data

Shared/staging state was not inspected; absence is not assumed as fact. If an authorized inventory confirms neither schema/data has been applied:

- Founder selects A/H as canonical and marks B superseded as an alternative; retain B's commit and this audit for evidence. Do not merge B or apply its draft proposal.
- Review bounded changes on existing #213 only: write-policy/commit race, completion meaning, cache controls and schema preflight/integrity. Rerun exact-head backend CI and #48 contract/multi-workspace tests after any fixes. No new competing PR is needed.
- Review the **existing A migration**, DB role/RLS, privacy/retention, backups and rollback. This audit creates no new migration. Only a separately authorized operator may apply it in a controlled nonproduction environment.
- Enable backend table/contract together under an approved rollout, then frontend #48 after authenticated readiness smoke. Before availability, frontend must truthfully show unavailable/unsaved. No command or deployment was executed here.
- Roll back API/UI by disabling new writes/feature use while retaining private data and compatible readers. **Do not use DROP TABLE as the default rollback.** A's migration-plan example acknowledges data loss; a premium customer-data rollback should preserve the table unless deletion is explicitly approved.

### If B data has already been saved anywhere that matters

This is a contingency requiring a new approved reconciliation/data work order, not executable SQL in this audit:

1. Freeze B preference/draft writes, inventory the two schemas and affected Brain records under authorized scope, and retain a protected backup. Do not dump customer data into issues/chat. Keep schema-capable readers while reconciling; older strict Brain readers may reject B's new JSON keys.
2. Prefer an existing A record for a workspace; do not overwrite it by latest timestamp from personal drafts. Require owner-authorized review and A CAS/idempotency for promoted values. Multiple users may have B drafts pointing to the same business; no arbitrary winner.
3. Map B's free sector text to A keys only with an explicit reviewed/customer-confirmed mapping; preserve original text in `industry_text` when appropriate. No silent neutral/default completion. B stores no equivalent field-source history, so do not manufacture provenance from a row's existence.
4. Six common channel IDs map directly. B's `youtube`/`other` have no current A equivalent: preserve as unresolved exceptions until customer choice or an approved contract extension. Do not silently drop them or invent provider capability.
5. A bound B draft needs fresh workspace authorization and explicit promotion. Unbound personal drafts cannot be assigned to a guessed business; the user must bootstrap/select first. Translate audience→audience_summary and stage IDs→#48 indexes only under a reviewed map. B's 2000-character CTA versus A's 500, blank-versus-null and full-snapshot-versus-patch differences need validation, not truncation. Do not mark completed during conversion.
6. Remove/deprecate B writers before declaring one authority. Handle current Brain JSON cleanup through an approved versioned change or keep deprecated read-only compatibility fields temporarily. **Never rewrite old campaign snapshots, hashes or provenance** to make them fit A; historical readers must remain compatible. No automatic bulk upsert or destructive rollback is proposed.
7. Prove the mapping and rollback using representative synthetic records and an approved nonproduction fixture before any shared data change. Preserve unmapped data until the owner resolves it.

### Pre-workspace Save and exit

A requires a selected workspace; #48 only saves in a ready session. B's verified-identity scratchpad solves an additional UX need, but costs another persistence/privacy boundary. Founder must decide whether this is required for the current release. If yes, reuse the **concept** of a private identity-bound intake draft under a separately versioned contract, with explicit one-time promotion into a selected workspace. Keep A's current URL/envelope unchanged and do not create Brain preferences there. Do not provision that extra table merely because B has a proposal.

## 8. Required founder decision and release risks

**Approve one canonical architecture: A's `workspace-onboarding.v1` and workspace-owned table, with the bounded hardening scope above; supersede B as a competing implementation.** This is not approval to merge, migrate or deploy.

Then decide:

- Who may edit/complete shared workspace onboarding: owner or an explicit delegated write capability? Recommend matching existing owner-write policy until delegation is designed.
- What exactly does completed certify, and how are inferred selections explicitly confirmed? Recommend server/UI agreement before calling it customer-confirmed business completion.
- Is pre-workspace durable Save and exit essential now, or may the existing bootstrap-first flow remain honest about unsaved state?

Release risks requiring evidence: transactional revocation/write-role enforcement; agreed completion semantics; migration/grant and tenant-integrity validation; non-destructive retention/rollback; frontend #48 scope-reset/late-response QA; and exact-head CI after any functional follow-up. These are conditions for later release review, not new approval flows imposed on this read-only audit.

No merges, deployments, shared migrations, pricing changes, provider activation or paid generation were performed.

## 9. Immutable code references

Line anchors below refer to reviewed immutable commits, not the audit branch's different source layout.

- **A1:** [A schema, sector/channel vocabulary and strict input](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/schema.js#L5).
- **A2:** [A service, completeness](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/service.js#L47), [scope authorization](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/service.js#L85), [latest-action replay/CAS](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/service.js#L119), [completion](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/service.js#L194), [inferred overwrite guard](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/service.js#L219).
- **A3:** [A SQL scope reads and CAS commit](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/postgresRepository.js#L39).
- **A4:** [A token-scoped router](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/workspace-onboarding/router.js#L16).
- **A5:** [A migration, scope FK and RLS/revokes](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/supabase/migrations/20261023100000_create_workspace_onboarding_profiles.sql#L5).
- **A6:** [Existing owner/member capability policy](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/authorization/policy.js#L12).
- **A7:** [Recommendation preference lookup/context](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/campaigns/router.js#L692), [deterministic candidate sorting](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/campaigns/goalRecommendation.js#L153), [Brain snapshot fields/hash](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/campaigns/postgresRepository.js#L202).
- **A8:** [Actual SQL campaign tie-break](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/campaigns/postgresRepository.js#L287), [in-memory tie-break](https://github.com/shirrie01/bizgenie-api/blob/d0e1142c91c0c12b907227f2881e14f3bb2a44e2/src/campaigns/repository.js#L152).
- **B1:** [B Brain sector](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/src/brand-brain/schema.js#L36), [B channel preferences](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/src/brand-brain/schema.js#L68).
- **B2:** [B private-draft service and ownership](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/src/customer-workspace/service.js#L30), [owner Brain correction and new-field preservation](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/src/customer-workspace/service.js#L166).
- **B3:** [B transactional owner check and draft CAS](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/src/customer-workspace/postgresRepository.js#L70), [personal-draft schema proposal](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/docs/studio/migrations/BG-STUDIO-010-onboarding-drafts.proposed.sql#L1).
- **B4:** [B private/no-store draft router](https://github.com/shirrie01/bizgenie-api/blob/f67c0438082bfccc460bdaf38097b35b995474ee/src/customer-workspace/router.js#L48).
- **F1:** [#48 strict A response parser](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/premium/onboardingClient.js#L49), [retry key keeper](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/premium/onboardingClient.js#L85).
- **F2:** [#48 frontend completion-readiness predicate](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/premium/onboardingModel.js#L142).
- **F3:** [#48 explicit confirmation action](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/premium/PremiumOnboarding.jsx#L105).
- **F4:** [#48 state/epoch reset](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/App.jsx#L369), [onboarding loader epoch check](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/App.jsx#L855), [Premium Brain loader guard](https://github.com/shirrie01/bizgenie-web/blob/9fa058232ba50209c8c26946fcb4b8744a577332/src/App.jsx#L820).

Reviewed tests include A `test/workspace-onboarding.test.js` and `.integration.test.js`, `test/studio-010-contract-g5-g6.test.js`, and B `test/customer-onboarding.test.js` / its PostgreSQL additions. They were read, not rerun. Validation of this deliverable is Git whitespace/content-scope verification only; no new functional or migration execution is warranted for a documentation-only audit.
