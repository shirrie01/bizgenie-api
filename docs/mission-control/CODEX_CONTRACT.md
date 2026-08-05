# Codex Implementation Contract v1.0

## Role

Codex implements one approved atomic BG task at a time. It does not redesign BizGenie, reinterpret product strategy or expand scope without an explicit task amendment.

## Required prompt structure

Every Codex prompt must include:

1. Task ID and title.
2. Business purpose.
3. Repository and target branch.
4. Current architecture and relevant files.
5. Exact in-scope deliverables.
6. Explicit out-of-scope items.
7. Data and API contracts.
8. Security and tenancy requirements.
9. Acceptance criteria.
10. Tests and evidence required.

## Mandatory operating rules

- Inspect existing implementation before editing.
- Preserve working behaviour unless the task explicitly changes it.
- Prefer small, reviewable changes.
- Never commit secrets, tokens or customer data.
- Use environment variables for provider credentials.
- Add deterministic validation and structured errors.
- Add tests for success, invalid input, provider failure and authorisation boundaries.
- Record assumptions instead of inventing missing product rules.
- Stop and report a blocker when a required contract is ambiguous.

## Required completion response

Codex must return:

- Summary of implementation.
- Files changed.
- Tests added.
- Test commands and exact results.
- Security considerations.
- Data migrations, if any.
- Environment variables introduced.
- Known limitations.
- Follow-up tasks discovered.
- Commit SHA or pull request reference.
- Confidence level with rationale.

## Prohibited behaviour

Codex must not:

- Rewrite unrelated modules.
- Introduce a second architecture for an existing concern.
- change canonical field names without approval.
- bypass authentication for convenience.
- mark work complete without executed tests.
- merge its own pull request.
- deploy to production without an explicit release task.

## Review sequence

```text
Codex implementation
→ automated tests
→ evidence submission
→ Architecture Guardian
→ human review
→ merge decision
```

## Base prompt footer

Use this footer on every implementation task:

> Complete only the stated scope. Preserve existing verified behaviour. Do not infer missing product decisions. If a required contract is ambiguous, stop and report the ambiguity with the smallest set of decisions needed. Do not mark the task complete until all acceptance tests have been executed and evidence supplied.