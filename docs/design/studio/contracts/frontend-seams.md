# Frontend seams and interface inventory — v0.1 (read-only)
Authority: #168, audit #169, API work order #173. **Draft, not implementation approval.**
Observed `shirrie01/bizgenie-web` main `543cf14ec50c87588297d93a63df04ba5df37df2`. Revalidate before execution.

## Verified implementation
- `src/main.jsx`: React root renders `App`; imports global `styles.css`.
- `src/App.jsx`: combined customer journey, recommendation, bootstrap, Brand Brain, campaign creation, variant generation/preview/approval, manual publication, measurements and calendar.
- `src/AuthPanel.jsx`: Supabase email/password sign-in and sign-up.
- `src/session.js`: session states unconfigured/signed-out/scope-missing/ready; tenant, project and brand scope from authenticated `app_metadata`.
- `src/BillingPanel.jsx` and `src/billingClient.js`: checkout and authoritative subscription-return display; isolated and must not be rewritten for Studio.
- `src/styles.css`: global Work Sans/Fraunces styling, existing responsive breakpoint 680px. NOT the approved final Studio system.
- `src/test/BillingPanel.test.jsx`: observed billing boundary tests. Full suite execution and coverage outstanding.

## Frontend-observed HTTP paths (backend existence/semantics still require source verification)
- POST `/customer/campaign-recommendations`
- GET `/customer/workspace`
- GET/PUT `/customer/workspace/brand-brain`
- POST `/customer/workspace/bootstrap`
- POST `/customer/campaigns`
- POST `/customer/campaigns/:campaignId/content-items`
- Variant actions: generate, preview-renders, preview-acknowledgements, approval, manual-publication and manual-publication/confirm
- Campaign measurements read/write and calendar read
- Billing client: `/billing/stripe/checkout` and authoritative billing state (verify exact read path before integration)

## Risks and safe seams
1. Monolithic `App.jsx`: no parallel editing. Extract adapters in a separately reviewed integration PR only after interface tests.
2. Session and tenant scope: must remain backend-authorised; no scope from user-editable forms.
3. Brand Brain: existing GET/PUT and review; website discovery is not verified as available. Prototype must not promise live scraping.
4. Publishing and paid generation: no implicit execution from onboarding transitions.
5. Billing: checkout redirect alone is not entitlement; preserve authoritative return-state checks.
6. Global CSS: use namespaced isolated Studio preview tokens, no global overrides.
7. Demo data: must be conspicuously illustrative, licensed and kept outside tenant persistence.

## Next evidence needed
Backend route/schema/permissions comparison; full source tree and CI inventory; current test/build execution; verified frontend deployment/rollback; Figma ownership and approved assets. Unknown is not absent.
