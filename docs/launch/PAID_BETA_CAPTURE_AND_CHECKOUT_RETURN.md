# Paid-beta capture and Checkout return contract

**Task:** BG-LAUNCH-002F

**Baseline:** `52d1c130a76db689f71b0f200fd4a6ded3eaa969` (tree `ce597d7b6959f92a9179afadd95f2e494e98420e`)

**Authority:** `bizgenie-api` owns the server endpoint and durable PostgreSQL record. The standalone buyer-facing homepage remains a separate frontend artifact.

**Mutation state:** repository implementation only; no environment, database, Stripe object, staging, cloud, or production state was changed.

## Architecture decision

The API exposes one write-only public boundary:

```text
POST /public/paid-beta-interest
```

There is no public list, lookup, update, or delete route. The endpoint writes to
the dedicated `paid_beta_interests` and `paid_beta_interest_receipts` domain.
Auth profiles, tenant memberships, Billing, Stripe, entitlements, credits,
generation jobs, provider data, Sheets, Make, and a CRM are not involved.

`paid_beta_interests` keeps one canonical follow-up record per normalized work
email. `paid_beta_interest_receipts` keeps one opaque receipt and immutable
consent evidence per client submission identity. A repeat email with a new
submission identity adds consent/receipt evidence but cannot overwrite the
first public record.

## Exact frontend request contract

Send `Content-Type: application/json` from an origin already approved in
`CORS_ALLOWED_ORIGINS`. The complete, strict body is:

```json
{
  "name": "Ada Lovelace",
  "work_email": "ada@example.com",
  "business_name": "Analytical Engines Ltd",
  "website_or_social_profile": "https://example.com/ada",
  "business_stage": "250k-1m",
  "primary_marketing_challenge": "Keeping launch campaigns consistent.",
  "privacy_contact_consent": true,
  "source": "homepage-paid-beta",
  "submission_id": "client-generated-stable-identity"
}
```

| Field | Rule |
| --- | --- |
| `name` | required, trimmed, 1–120 characters |
| `work_email` | required, trimmed, lower-cased, valid email, at most 254 characters |
| `business_name` | required, trimmed, 1–160 characters |
| `website_or_social_profile` | required HTTP(S) URL, at most 2,048 characters; credentials forbidden |
| `business_stage` | `pre-revenue`, `under-250k`, `250k-1m`, `1m-5m`, or `5m-plus` |
| `primary_marketing_challenge` | required, trimmed, 1–1,000 characters |
| `privacy_contact_consent` | must be the boolean `true` |
| `source` | required lower-case source label, 1–64 safe identifier characters |
| `submission_id` | required stable client identity, 1–128 safe identifier characters |

Unknown fields are rejected. Text is stored as data and is never returned or
treated as trusted HTML. Generate `submission_id` once when a form attempt
starts and reuse it for transport retries. Do not put an email, tenant ID,
payment reference, or other authority in that value.

Success and same-intent replay both return HTTP 202:

```json
{
  "status": "received",
  "reference_id": "pbi_safe-opaque-public-reference"
}
```

The same submission identity and intent returns the same reference. A matching
email under another identity receives the same status/shape with a different
receipt reference, so prior capture is not disclosed. Reusing one submission
identity for changed intent returns `IDEMPOTENCY_KEY_CONFLICT` without exposing
stored data.

## Consent, data handling, and privacy limits

The server records consent version `paid-beta-contact-v1`, the exact wording:

> I agree that BizGenie may use these details to contact me about the paid beta.

It records the receipt time as both consent and audit time. Collected data is
limited to the request fields, server-generated internal/receipt identities,
an HMAC request fingerprint, consent evidence, and audit timestamps. Raw IP
addresses are not stored; abuse buckets contain only an HMAC pseudonym and a
short time window.

Purpose is limited to paid-beta qualification and follow-up. This task sends no
email or Slack message, pushes nothing to a CRM, adds no analytics/tracking,
creates no account or tenant, and confers no payment/product authority.

Before public activation, human privacy/legal review must confirm lawful basis,
the displayed notice, controller/contact details, and consent wording/version.
This engineering contract is not final legal policy or legal approval.

Retention is unresolved and must be approved before activation for interest,
receipt, and expired HMAC bucket records. Export/deletion workflows require a
separately authorized administrator implementation. Until then, interest and
consent rows are append-only. Database-owner/operator access is the only access
boundary and must follow existing secret, audit, backup, and least-privilege
controls.

## Idempotency and abuse protection

The request fingerprint is an HMAC of normalized input and the server consent
version. PostgreSQL uniqueness protects normalized email, submission identity,
and receipt reference. One transaction resolves replay, duplicate email, and
concurrent inserts without a second canonical interest.

Before JSON validation, every attempt consumes an atomic PostgreSQL bucket for
an HMAC-pseudonymized socket identity. Defaults are five attempts per 15-minute
window. This works across API instances and covers malformed/invalid attempts.
It does not replace approved upstream WAF/edge protection, monitoring, or
incident response for public launch.

## Database and privilege contract

Migration `20260901170000_create_paid_beta_interest_capture.sql` creates the two
append-only canonical tables plus short-lived abuse buckets, applies database
bounds, enables RLS without customer policies, revokes `PUBLIC`, `anon`,
`authenticated`, and `service_role`, blocks ordinary evidence update/delete,
and adds only email/idempotency, operator audit, and expiry-cleanup indexes.
Writes occur through the direct server PostgreSQL boundary. No broad
`service_role` grant is introduced.

## Activation configuration

Capture is off by default. Enabling it requires existing database/environment
checks plus:

| Environment value | Contract |
| --- | --- |
| `PAID_BETA_CAPTURE_ENABLED` | exactly `true` to mount the route |
| `PAID_BETA_SUBMISSION_HASH_SECRET` | server-only HMAC secret, at least 32 characters |
| `PAID_BETA_CLIENT_HASH_SECRET` | distinct server-only HMAC secret, at least 32 characters |
| `PAID_BETA_RATE_LIMIT_MAX_ATTEMPTS` | optional integer 1–100; default 5 |
| `PAID_BETA_RATE_LIMIT_WINDOW_SECONDS` | optional integer 60–86,400; default 900 |

`BIZGENIE_ENVIRONMENT` remains mandatory. Production also requires the existing
`PRODUCTION_ACTIVATION_ENABLED=true` gate. The migration and startup privilege/
trigger checks must pass before the listener opens. No values were configured
by this task.

## Checkout return-route contract

Stripe Checkout remains server configured and fail-closed:

```text
STRIPE_SUCCESS_URL=https://<approved-frontend-origin>/billing/checkout/success
STRIPE_CANCEL_URL=https://<approved-frontend-origin>/billing/checkout/cancel
```

Both must share the approved frontend origin. Live mode requires HTTPS; test
mode also permits loopback HTTP. Credentials, query strings, fragments, a
different origin, the protected API root, or another path fail startup.
Staging/production values must not change until the real frontend implements
both routes and an operator authorizes the configuration change.

Browser return paths and parameters are not financial authority. After success,
the frontend must authenticate and retrieve current subscription/entitlement
state from a tenant-authorized backend read boundary before showing access or
credits. This repository currently lacks that customer-safe read route, so it
is a required next dependency. Webhooks and the canonical Stripe Customer
mapping remain state-changing authority.

## Rollout, rollback, and next task

Safe rollout is: decide legal/retention controls, merge, apply the additive
migration in an authorized environment, configure secrets and exact CORS/
frontend values, then run an approved non-personal synthetic smoke submission.

Before environment mutation, rollback is closing/reverting this change. After
data exists, disable `PAID_BETA_CAPTURE_ENABLED`, preserve/export records under
the approved privacy procedure, and use a reviewed forward migration. Never
drop consent evidence as an application rollback shortcut.

Next: integrate the standalone homepage with this POST contract, implement both
frontend return routes, add/approve a tenant-authorized customer subscription/
entitlement read endpoint, complete legal/retention/operator-access decisions,
then request separate staging configuration and smoke-test authority.
Production activation remains a separate decision.
