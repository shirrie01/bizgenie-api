# Parallel agent delivery protocol — v0.1 DRAFT
Parent: #168. Read-only audit: #169. Work orders: #170 A; #171 B; #172 C; #173 D; #174 E/F.
## Contract envelope (mandatory for every work order)
- ID, parent authority, version and explicit approved status
- Named owner, designated integration reviewer, exact base SHA and branch
- Purpose, included/excluded behaviour, file/path allowlist and denylist
- Input/output schemas with versions, event names and source-of-truth mapping
- Dependencies, readiness criteria, mock fixtures, failure and empty states
- Accessibility, mobile, performance, security and visual acceptance tests
- Change-control process, evidence links, PR and rollback
## Ownership rule
One active writer per shared module. No agents concurrently modify `src/App.jsx`, `src/styles.css`, `src/session.js`, `src/billingClient.js` or backend authoritative routes. First Studio UI PRs must use a separate namespace and isolated preview entry; no global CSS overrides.
## Dependency graph
Audit #169 → stable API/trust map #173; draft tokens/components #170 → welcome #171 and onboarding visual UI #172; onboarding state #172 + API map #173 → integration design #174; quality/release gate #174 + founder design signoff → any controlled merge/release. Specification work may run in parallel; integration cannot.
## Integration gate
1. Verify exact main SHAs and existing CI baseline before implementation.
2. Review interface diffs and changed-file allowlist; block unauthorised edits.
3. Run unit, consumer-contract, a11y, responsive, visual and regression tests.
4. Confirm authenticated tenant scoping, Brand Brain approvals, billing and campaign controls unchanged.
5. Review screenshots and interactive flows with founder; no implied approval.
6. Integration owner merges in declared dependency order; rollback plan and release authorisation separately required.
## Drift management
Stop on ambiguity, conflicting contracts, unsupported endpoint, new schema requirement or UI deviation. Record decision in design log and amend upstream contract before code proceeds. Passing tests alone does not override a contract mismatch.
## Evidence classification
VERIFIED = cited code/test/production evidence; PROPOSED = design decision not approved; DEMO = illustrative sample; UNKNOWN = needs audit. Do not promote one category to another silently.
