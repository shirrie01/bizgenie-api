# BG-STUDIO-014-BE — Identity write-policy contract gate

2026-10-24. Authority supplied by founder: DEC-021 / LOCK-019. Only workspace owners may change authoritative Brand Brain `name` and `identity.description`; member editing of unrelated fields must remain functional. **BLOCKED before functional changes** under the work order's explicit stop condition for an unsafe existing API contract. Staging remains RED.

## Current evidence

Native remote refs verify #213 / `bg-studio-010-be-onboarding-persistence` at `120a874dfa02313a8c28dad82ddb6582f0065469`, main at `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`. Attempts to read latest [#213 comments](https://github.com/shirrie01/bizgenie-api/pull/213), [#191](https://github.com/shirrie01/bizgenie-api/issues/191) and [#197](https://github.com/shirrie01/bizgenie-api/issues/197) each returned GitHub GraphQL Forbidden. Current comments, CI and live Mission Control cannot be independently reconciled; supplied founder direction is attributed, not a claim that the register was read. No broader credentials were requested.

All source references below are at that immutable [#213 head](https://github.com/shirrie01/bizgenie-api/tree/120a874dfa02313a8c28dad82ddb6582f0065469).

## Backend path inventory

| Path | Current behaviour | Policy implication |
|---|---|---|
| `PUT /customer/workspace/brand-brain` | `src/customer-workspace/service.js:114-160`: trusted scope/current membership lookup, read existing Brain, construct replacement, then generic upsert | No role check for identity differences. Membership authorization and write are separate. Missing optional sections can delete description. Full payload can overwrite a concurrently changed name/description. |
| `PUT /_admin/brand-brains/:brandId` | `index.js:119-129,443-447`; `src/brand-brain/router.js:25-55`: admin-key-only create/replace via generic upsert | No customer actor or membership context. Retaining unrestricted identity writes violates literal owner-only policy. Removing/requiring owner authentication changes a tested administration contract. **Founder decision required.** |
| Workspace bootstrap | `src/customer-workspace/postgresRepository.js:94-138` creates owner membership and initial Brain in transaction; Brain ON CONFLICT DO NOTHING | Initial ownership creation, not existing-Brain correction; must not convert to identity overwrite on retry. In-memory counterpart creates initial workspace metadata. |
| Additional workspace creation | Same file:144-179: checks owner then inserts new project/Brain | Owner read is not locked through commit. Future implementation must hold membership authority lock while creating identity; do not silently claim revocation-safe today. |
| Repository entry points | `src/brand-brain/postgresRepository.js:162-218`, `repository.js:38-48`: generic full-record upsert | Project ownership check only. No customer field policy, authorization lock or CAS. Internal trusted callers/tests use upsert; request-path auditing must distinguish these from owner-authorized mutations. |
| Onboarding persistence / campaign / generation | `src/workspace-onboarding/` owns separate preferences; campaign/generation code reads Brain | No additional production Brain update call site found in `src` search. Preserve Architecture A, snapshots, entitlements and unrelated member operations. Direct privileged SQL is outside application authorization, not something this patch can control. |

No customer PATCH route exists in the inspected router. Payloads may omit optional sections but PUT still replaces them; nested omission is a consequential change, not proof of an unrelated edit. `name` is currently required. Unknown fields are rejected by schemas. Client-supplied scope IDs cannot replace trusted customer scope.

## Required decision before implementation

Recommended: retain admin reads and unrelated admin corrections, but require a verified workspace-owner customer actor for existing-Brain name/description changes, in addition to any retained admin credential. Explicitly decide initial admin-created Brain behaviour: prohibit identity creation through this unscoped API, or approve a separate narrowly defined bootstrap authority. Do not invent an admin exemption under an owner-only lock.

An alternative is to prohibit identity mutations on the admin route entirely and require the existing owner-authenticated customer route. This removes a supported admin operation and must be explicitly approved. A broad admin exemption would weaken the supplied policy and is not recommended or implemented.

Founder must select the admin-route behaviour, including initial creates. No new policy is needed for unrelated member fields; their access remains required. The current task authorizes field enforcement, but does not specify how to replace admin-key identity authority without breaking its existing contract. This is why functional work stops rather than hiding an alternate write bypass.

## Smallest safe implementation after decision

- Add a customer-scoped repository mutation accepting verified actor/scope plus validated input, not client role claims. Within one PostgreSQL transaction lock current membership and project, then current Brain row; compare effective replacement `name` and `identity.description` under lock. Treat description removal as a change. Member unchanged identity plus unrelated corrections succeeds; member changed identity rejects atomically with 403. No silent field dropping or partial-success response.
- Recheck membership and workspace binding at commit authority boundary. Revocation before authority lock denies; a revocation after lock waits for the already-authorized transaction. Do not promise recall of committed responses. Ensure role demotion obeys the same locking semantics.
- Construct replacement/version using the locked current row, with a repository-side stale-read guard when callers supplied full snapshots. A member's stale full payload must never restore an old owner identity. Return an honest conflict rather than silently rewriting identity. Preserve existing response envelope; document any new conflict code and frontend reload requirement.
- Preserve unrelated member semantics and existing full-document versus omission behaviour; do not convert PUT to PATCH without separate contract review. Memory adapter must model commit-boundary reauthorization for deterministic tests; database locks provide production concurrency safety.
- Apply the founder-selected admin rule to every alternate request path. Keep raw server maintenance entry points explicitly trusted and unreachable from unguarded customer input. Hold additional-workspace membership lock through insertion. No schema migration is needed for row locks/comparison.

Tests to add after the decision: owner name/description changes; member unrelated fields with unchanged identity; member name/description changes and omission-based deletion; full-payload and nested bypasses; stale member payload after owner edit; concurrent writes/version increments; revocation and demotion before lock versus after lock; nonmember/foreign tenant/project/brand; forged actor/body role; admin chosen policy including creates; bootstrap retries and additional-workspace revocation. Run focused HTTP/unit tests, isolated disposable PostgreSQL tests and full suite using CI Node22, then exact-head CI. No connected staging writes.

## Verification and publication boundary

Baseline only, unchanged functional code: `node --test test/customer-brand-brain-correction.test.js test/brand-brain-admin.test.js` passed **12 tests, zero failures/skips** on local Node24.19.0. This demonstrates existing contracts, not the requested security guarantee or Node22/CI parity. Log: `/workspace/.onboarding/bg-studio-014-baseline.log`. PostgreSQL/full suite not run because no implementation was made; no green security/CI claim.

Only this report changes on the existing isolated documentation branch. No competing implementation/draft PR, canonical #213 modification, governance-task duplication, migration, deployment, SQL, IAM/secrets access, feature activation or paid calls. Next action: founder resolves admin identity-write/create policy and provides current comment/lock evidence through an authorized route; then implement/test on #213-compatible isolated work. Do not mark DEC-021 implementation complete or staging ready.
