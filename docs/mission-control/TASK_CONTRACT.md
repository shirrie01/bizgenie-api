# Canonical BG Task Contract v1.0

Every BizGenie build task must contain the following fields.

## Identity

- `task_id`: Permanent BG identifier.
- `title`: Clear outcome-oriented title.
- `module`: Product or platform area.
- `task_type`: architecture, backend, frontend, integration, data, test, documentation, security or operations.
- `priority`: critical, high, medium or low.
- `status`: proposed, ready, in_progress, review, blocked, accepted or closed.

## Purpose

- Problem being solved.
- User or system value.
- Why the task belongs in the current phase.

## Scope

### In scope
Explicit deliverables.

### Out of scope
Related work that must not be added silently.

## Inputs and dependencies

- Canonical documents and contracts.
- Existing files and APIs.
- Upstream tasks.
- External services and required secrets.

## Technical contract

- Data objects and fields.
- API request and response shapes.
- Validation and error behaviour.
- Permissions and tenancy rules.
- Logging and observability requirements.
- Credit or cost events where applicable.

## Acceptance criteria

Each criterion must be objectively pass/fail. Include:

- Functional behaviour.
- Failure behaviour.
- Security and tenant isolation.
- Tests required.
- Documentation required.
- Evidence required.

## Evidence of completion

- Files changed.
- Tests executed and results.
- API examples or screenshots where relevant.
- Known limitations.
- Follow-up tasks discovered.
- Commit SHA and pull request.

## Completion gate

A task may be marked `accepted` only when:

1. All acceptance criteria pass.
2. Required automated tests pass.
3. Architecture Guardian returns no unresolved critical drift.
4. No undocumented schema or contract change was introduced.
5. Human review approves the evidence.

## Change control

Any scope, schema or contract change discovered during implementation must be recorded as either:

- an approved amendment to the current task; or
- a new linked BG task.

Codex must not silently expand scope.