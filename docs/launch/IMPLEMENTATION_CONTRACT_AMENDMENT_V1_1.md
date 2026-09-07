# bizgenie-implementation-contract-amendment-v1.1

## Failed manual publication — authoritative clarification

Authority: explicit founder instruction in the PR #55 remediation session on
2026-09-07, recorded in Issue #51. This section records the supplied clarification;
it does not invent additional provisions of the later amendment.

This authority supersedes the earlier failure wording in campaign-spine.v1 section 4
and acceptance cases CS-28/CS-29:

- Failed publication is metadata, never a sixth workflow stage.
- Record an append-only failure resolution/event with the human actor, timestamp,
  reason and not-published attestation; preserve all previous evidence.
- Clear the active failed schedule, retaining the original schedule and an immutable
  cancellation event with `reason_code=publication_failed`.
- Return the variant to Approved. Item and campaign stages remain derived from their
  children; mixed Approved and Published yields Approved.
- Require a new explicit schedule after the failure before another manual attempt.
  Neither a new idempotency key nor an old/expired schedule permits a retry.
- Preserve normal first-attempt unscheduled manual publication as first-class.
  Cancellation without failure retains the prior workflow/schedule.
- Successful replay returns the original receipt without repeating failure effects.
  A terminal failed attempt can never later be confirmed.

I-B implements this persistence/domain behavior only. No automatic publishing,
customer route, preview renderer, connector, shared migration or activation follows.
PR #55 remains draft and unmerged pending fresh independent review.
