# BG-EXEC-009 campaign reconciliation — 9 November 2026

Authority: founder-recovered Issue191 comment6751810473. GitHub REST remains Forbidden; do not claim a live issue read. Native Git independently confirms API22977032dcd573b1cf41292b4a0c50a6d5fe6564555 and API230f1f46b77e73944892b9d17897daad18cd16c98a0. PR230 hosted CI42689190548 both jobsSUCCESS is independently verified by the founder, not re-read by this execution.

## One integration path

Use PR230 as the campaign base; this dependent branch bg-exec-009-campaign-reconciliation contains only reviewed incremental campaign changes. Do not merge/cherry-pick the entire Codex435ed1950b5cb8346c183dac83d0e156ee5702c7 branch as a second campaign fix. Both implementations share77032dcd as merge base. PR230 changes only goalRecommendation.js and two tests; Codex additionally modifies recommendationStrategy.js, registry tests, bridge gate/release tests and docs. No original branch overwritten.

| Behaviour | PR230 | Codex435ed195 | Reconciled choice |
|---|---|---|---|
|Cross-industry lead vocabulary|Broader verified deterministic cases; removes bare businesses false-positive|Narrow additions for bookings/consultations/instructions|Keep PR230 classifier and precedence|
|Natural titles|Case/acronym/punctuation handling,60-character cap|160-character sentence or generic booking label|Keep PR230 formatter but use existing campaign-schema200-code-point bound; booking/location details retained|
|Location|Bradford omitted from title by60-character cap|Booking/property strategy labels can omit location|Use customer's formatted goal for property titles; keep full original goal in payload for all industries|
|Property content|Generic lead items|Grounded property explainer/enquiry/consent-follow-up|Selectively reuse property strategy and item set; no fabricated listings/locations/results|
|Trade/clinic|Existing strategy titles|Existing strategy titles|Preserve existing behaviour; full goal remains unchanged|
|Bridge gate|No new draft gate|Independent default-OFF draft workflow gate|Not part of this campaign branch; retain separately for security review|

This is a bounded correction to an implementation-specific title limit, not a campaign schema expansion: src/campaigns/schema.js name already permits200 Unicode code points. No frontend request/response fields changed; some output names/items intentionally improve. Frontend should wrap long titles, never assume60characters as API maximum. Full request goal and timezone remain in create_campaign_payload. Arbitrarily long goals still need bounded display names; full goal remains available without claiming every location fits a title.

No security assertions weakened: former60-character expectations updated to existing authoritative200-code-point schema and full natural wording; new Unicode/schema-parity and location regression tests added. All cross-industry intent cases retained. No API229/bridge/flags/IAM/provider/billing/schema files changed.

## Review and release

Target dependent review against PR230; do not create a competing fix PR on main or modify Claude's original branch. Native analytics branch remains a separate API229-dependent feature: changed implementation files do not overlap this campaign diff. Neither is included in the reviewed bridge image/release manifest. Exact commits, local test results, publication and hosted CI state are in the accompanying execution checkpoint; no hosted result inferred from Git push. Rollback is code revert before release; never delete customer campaigns or undo data.
