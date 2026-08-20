# Customer token verification and generation boundary

BG-AUTH-002B adds the reusable customer boundary on top of BG-AUTH-002A. It
does not apply the staged database migration, activate production customer
authentication, deploy code, or create customer credentials.

## Verification contract

The server uses `supabase.auth.getClaims(accessToken)` from the pinned
`@supabase/supabase-js` dependency. Supabase verifies asymmetric tokens against
the project's cached JWKS endpoint and falls back to an Auth-server validation
call for legacy symmetric signing. BizGenie then requires the expected project
issuer, the `authenticated` audience, an unexpired integer `exp`, and a UUID
`sub` before creating the canonical customer actor.

This is deliberately not a decode-only flow. Provider errors, malformed JWTs,
expired tokens, invalid signatures, invalid claims, and missing Bearer headers
all produce the same sanitized `AUTHENTICATION_REQUIRED` response. Raw JWTs and
authorization headers are never logged, persisted, or forwarded.

Production construction uses:

- `SUPABASE_URL`: the HTTPS project URL.
- `SUPABASE_PUBLISHABLE_KEY`: the current publishable API key used by the
  Supabase client, including for the legacy symmetric-token network fallback.

Both variables must be configured together. With neither configured, customer
authentication remains fail-closed while existing administration continues to
start. A partial or insecure configuration fails startup.

## Principal separation

- Customer: verified Supabase Auth UUID only.
- Administrator: existing exact `x-admin-key`/`ADMIN_KEY` comparison only.
- Service: reserved for BG-AUTH-002C and not implemented here.

A customer JWT is ignored by administrator middleware. `ADMIN_KEY` is ignored
by the customer boundary. Neither credential can acquire the other's principal.

## Customer generation paths

- `POST /customer/generate-script`
- `POST /customer/generate-image`

Both paths require `Authorization: Bearer <access-token>`, `tenant_id`, and
`project_id`. `brand_id` remains optional, but when supplied it must resolve
through the same tenant-owned project. The boundary calls the existing
`AuthorizationService` with `generation:create`, removes the routing-only
`tenant_id`, replaces any body `user_id` with the verified actor's Auth UUID,
and only then invokes the existing generation handler/service.

Unknown resources, missing membership, cross-tenant projects, and project/brand
mismatches share the same non-enumerating `RESOURCE_NOT_AVAILABLE` response.
Unexpected authorization persistence failures return a sanitized temporary
unavailability response and never proceed to a provider.

The operational internal paths remain unchanged:

- `POST /generate-script` requires `x-admin-key` and preserves its request and
  response contract.
- `POST /generate-image` requires `x-admin-key` and preserves BG-MEDIA-001.
- `/_admin/*` remains administrator-only.

## Image activation boundary

The customer image path uses the same authorization architecture as text, but
BG-MEDIA-001 remains dormant by default. No OpenAI adapter, credentials,
storage, reference loading, or billable call is activated. Production image
execution still requires an approved provider and durable tenant-owned asset
storage/reference-loading design in a separate task.

## Rollout boundary

Before production activation, the BG-AUTH-002A migration and deliberate legacy
ownership backfill must be reviewed and applied in an authorized staging flow.
Production then needs the two-tenant real-database adversarial acceptance in
BG-AUTH-002D. BG-AUTH-002C must first add the authorized generation-job and
Make/service-principal boundary; customer JWTs must never be sent to Make.
