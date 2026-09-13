# BG-LAUNCH-003C1 — Review fix required before PR

## Blocking finding
The customer generation route currently obtains `generationAuthorization` through the router's generic `authorize(...)` helper. That helper always returns `contextFromAuthorization(authorization)`, which deliberately strips fields not needed by the campaign repository, including `action` and `brand_id`.

`GenerationJobService.authorizeAndCreateJob()` explicitly requires the trusted authorization object to include `action === "generation:create"` and uses `authorization.brand_id` as immutable job ownership. Passing the stripped campaign context will therefore fail in the real composed application even though the focused service test passes with a manually constructed authorization object.

## Required correction
For `POST /customer/campaigns/:campaignId/variants/:variantId/generate`:

1. Verify the bearer token once and retain the verified customer actor.
2. Authorize project read to resolve/conceal the campaign safely; convert only that project authorization to campaign context when calling `repository.getCampaign(...)`.
3. After reading the campaign's server-owned `brand_id`, call `authorizationService.authorizeProjectBrand(...)` directly with the same verified actor and `action: "generation:create"` / `requireApprovedBrand: true`.
4. Pass the full returned generation authorization object — including `action`, `brand_id`, trusted actor/scope and membership — to `campaignGenerationService.generate(...)` / `GenerationJobService`.
5. Do not accept brand/provider/model/cost/token authority from the browser.

## Regression test required
Add a route/composed-app test that uses the real `AuthorizationService` + real `GenerationJobService` contract (dependencies may otherwise be in-memory/fake) and proves the generate endpoint reaches job creation with `action: generation:create` and the campaign's approved server-resolved `brand_id`.

The existing unit test that manually supplies a complete authorization object is useful but does not cover this integration seam.

Do not merge or deploy until this fix and regression test pass.