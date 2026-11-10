# Studio component interface contract v0.1 — PROPOSED
Issues: #170–#174. This is a design-stage interface proposal, not approved runtime API.

## Isolation boundary
Studio components must not import `src/App.jsx`, `src/session.js` or `src/billingClient.js` directly. All data enters through explicitly versioned props/adapters. Isolated preview uses static, labelled fixture data. No browser storage of tokens, no production fetch, no paid calls.

## Design primitives (proposed)
`StudioButton`: variant=primary|secondary|quiet; size=sm|md|lg; disabled/loading; accessible name.
`StudioField`: id/label/help/error/required; controlled value; keyboard support.
`StudioCard`: semantic heading/content/action, density and responsive rules.
`StudioProgress`: current/total and textual accessible status.
`StudioMediaTile`: mediaKind=still|video; poster; rightsRecordId; demoLabel; muted; reducedMotion fallback.
`StudioShell`: region landmarks, mobile nav, focus management, no implicit authentication.

## Journey event model (proposed, not yet frozen)
`WELCOME_CONTINUE`, `BUSINESS_SUBMIT`, `BUSINESS_CONFIRM`, `GOAL_SELECT`, `BRAND_REVIEW_CONFIRM`, `CHANNEL_SKIP`, `CHANNEL_SELECTION_CHANGE`, `PROPOSAL_REVIEW`, `BACK`, `RETRY`, `SAVE_DRAFT`.
Each event is local-only until a verified backend adapter explicitly authorises persistence. Channel selection != channel connection. Proposal review != generation approval. A website URL != verified extracted brand truth.

## Contract test gates
- Type/prop contract and component fixture snapshots (no real customer data)
- Keyboard navigation, focus visibility, form errors, reduced-motion and contrast
- 320px mobile to desktop responsive states; empty/loading/error/partial-import
- No network call in isolated preview; no fake metrics, endorsements or ROI
- Separate explicit owner for integration and shared-file changes
- Founder approves actual visual tokens and screens before freeze
