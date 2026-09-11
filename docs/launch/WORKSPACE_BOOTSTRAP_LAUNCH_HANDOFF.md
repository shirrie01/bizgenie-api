# Workspace Bootstrap Launch Handoff

**Date:** 2026-09-11

## Status

The current launch-critical blocker is no longer the campaign spine itself. The
API now has a customer workspace bootstrap boundary for the signed-in but
unlinked state:

- `GET /customer/workspace`
- `POST /customer/workspace/bootstrap`

This keeps the existing scoped customer API fail-closed while allowing a real
Supabase Auth user to create or recover their tenant, owner membership, project
and approved Brand Brain before requesting a campaign recommendation.

When server-side trusted scope provisioning is configured, bootstrap returns
`requires_session_refresh: true`. The frontend must refresh the Supabase session,
or ask the customer to sign in again, before calling scoped customer routes that
depend on `tenant_id`, `project_id` and `brand_id` claims.

## Source Signals

The latest ledger and launch materials agree on the direction:

- core generation, Cloud Run and pipeline foundations are operational;
- billing, credits and paid activation remain launch gates, not public claims;
- campaign is the dominant product object;
- the first customer journey must be goal-first and campaign-first;
- public proof must be authentic, not synthetic or time-claim driven;
- competitor pressure should be answered with a sharper complete-campaign flow,
  not more visible machinery.

## Next Task

**BG-LAUNCH-003A - Workspace-to-Recommendation proof**

Prove that a new customer can move from email confirmation to one explained
campaign recommendation without manual database repair.

Acceptance checks:

1. New Supabase Auth user reaches the public site.
2. `GET /customer/workspace` returns `missing_workspace`.
3. Frontend calls `POST /customer/workspace/bootstrap` with the supplied business
   context.
4. If `requires_session_refresh` is true, the frontend refreshes the session or
   prompts a clean re-sign-in.
5. The next `POST /customer/campaign-recommendations` call uses the trusted
   tenant, project and brand scope.
6. The Audi A3 / Lease Expert goal returns one explained recommendation without
   exposing internal generation, billing, publishing or workspace machinery.

Out of scope for this task:

- Stripe activation;
- final pricing copy;
- publisher connectors;
- automated posting;
- public time-to-complete claims;
- migration of the production app to a different host.

## OpenAI Sites Role

OpenAI Sites is useful as a fast founder-review and public-proof surface:

- prototype a clearer campaign workspace or offer-specific proof page;
- test positioning, hierarchy and CTA language quickly;
- show a polished, truthful preview of the product direction.

It should not replace the current GitHub/Supabase/Cloudflare production path
until the workspace-to-recommendation flow is verified. A Sites prototype may be
used in parallel only if it preserves the same proof boundaries: no fabricated
results, no automatic-publishing claim, and no specific completion-time claim.

## Deployment Gate

Before declaring this ready for customer use:

- confirm the API deployment picked up the workspace bootstrap commit;
- configure `SUPABASE_SERVICE_ROLE_KEY` only as a server-side production secret;
- verify the Supabase Auth redirect URL points to the deployed site, not
  `localhost`;
- run the end-to-end Audi A3 proof once from a fresh account.
