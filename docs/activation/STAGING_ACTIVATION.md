# Staging activation layer

## Current evidence authority

The configuration contract below remains canonical for safe environment
composition. The current BG-ACT-001 acceptance state, evidence classifications,
Tenant B matrix, failure-drill matrix and proposed verdict are governed by
[`BG-ACT-001_FINAL_EVIDENCE_PACK.md`](BG-ACT-001_FINAL_EVIDENCE_PACK.md).

That pack supersedes earlier activation summaries wherever their historical
baseline, blocker list or restart instruction conflicts with the 1 September
2026 Issue #39 canonical lock. It does not authorise production or close Issue
#39.

BG-ACT-001B adds only the repository seams proven missing by the BG-ACT-001
reconnaissance. It does not activate or deploy any environment and it does not
change canonical Auth, Billing, generation-job, provider-selection, or
commercial policy authority.

## Default state

Every new capability is OFF when its activation variable is absent, empty, or
`false`. Any other value fails startup. An enabled capability also requires
`BIZGENIE_ENVIRONMENT=staging` or `production`. Production additionally
requires `PRODUCTION_ACTIVATION_ENABLED=true`; that variable is absent by
default and is not set by this repository.

No source value contains a staging URL, secret, Stripe Price, provider cost,
or execution-credit value.

## Durable media authority

Migration `20260823133000_create_durable_media_assets.sql` creates the
server-only `public.media_assets` table. It binds generated assets to the
canonical tenant/project pair and immutable generation job, records a private
storage bucket/key, media metadata, status, and explicit allowed-use rights,
and prevents updates from changing ownership or storage identity. RLS is
enabled and all table authority is revoked from `anon`, `authenticated`, and
`service_role`; the existing trusted direct PostgreSQL application connection
is the only writer.

Storage keys are created from SHA-256 ownership partitions plus a
server-generated UUID. Request bodies cannot select a bucket, key, output
prefix, provider location, or stored asset location. Image and Video reference
loaders query by the complete `(asset_id, tenant_id, project_id)` authority and
require an active asset plus the exact server-owned right before returning
bytes or a provider-readable GCS location.

The staging storage bucket must already exist. Startup verifies that uniform
bucket-level access and public-access prevention are enforced. The runtime
identity needs only the bucket metadata, object create/read/delete permissions
needed for the configured private media bucket, plus read access to the
separately configured Veo output prefix. No bucket or provider resource is
created by the application.

Generated image assets are explicitly eligible for
`image.generate.reference` and `video.generate.reference`. Generated videos
receive no reference right. Revocation/deletion is represented by the durable
asset status; there is no customer delete endpoint in this activation layer.
Bucket retention/lifecycle rules remain an operator-owned staging resource and
must be reviewed before activation.

## Customer Video

The customer endpoints are:

- `POST /customer/generate-video`
- `POST /customer/generate-video/:generationId/poll`
- `GET /customer/generate-video/:generationId`

Submission uses the existing verified customer authorization chain, creates
the existing immutable generation job with `video.normal` or `video.premium`,
and reserves credits before provider submission. A processing result remains
reserved. Completion debits only after durable asset persistence. A terminal
provider failure releases the reservation. A fresh process reconstructs the
reservation and any debit/release from the canonical Billing ledger by the
immutable generation job and deterministic financial keys; process-local
promises remain only a coalescing cache. Repeated poll/get calls reuse the
durable exactly-once Billing effect. Status and poll authority is derived from
the stored Video record and immutable job; customer query/body values cannot
reinterpret it for another tenant.

## Activation variables

| Variable | Contract |
| --- | --- |
| `BIZGENIE_ENVIRONMENT` | Required for enabled activation; `staging` or `production` only |
| `PRODUCTION_ACTIVATION_ENABLED` | Separate explicit production gate; OFF by default |
| `MEDIA_STORAGE_ENABLED` | Enables durable media repository/storage composition |
| `MEDIA_STORAGE_BUCKET` | Existing private GCS bucket; never customer supplied |
| `IMAGE_GENERATION_ENABLED` | Enables the approved OpenAI Image adapter; requires media storage |
| `OPENAI_API_KEY` | Server-only Image credential |
| `VIDEO_GENERATION_ENABLED` | Enables the approved Google Vertex Veo adapter; requires media storage |
| `VIDEO_PROVIDER_OUTPUT_STORAGE_URI` | Existing server-controlled GCS output prefix ending in `/` |
| `VIDEO_PROVIDER_TIMEOUT_MS` | Optional bounded provider transport timeout |
| `STRIPE_BILLING_ENABLED` | Composes Stripe only with active durable Billing |
| `STRIPE_MODE` | Must be `test` in staging and `live` in production |
| `STRIPE_SUCCESS_URL` | Approved frontend origin plus exact `/billing/checkout/success` path |
| `STRIPE_CANCEL_URL` | Same frontend origin plus exact `/billing/checkout/cancel` path |
| `PAID_BETA_CAPTURE_ENABLED` | Enables the write-only paid-beta route after its migration/configuration checks |
| `PAID_BETA_SUBMISSION_HASH_SECRET` | Server-only request-fingerprint HMAC secret |
| `PAID_BETA_CLIENT_HASH_SECRET` | Distinct server-only abuse-identity HMAC secret |
| `CORS_ENABLED` | Enables separate-frontend CORS; otherwise requests carrying `Origin` are denied |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact URL origins; `*`, paths, queries, and fragments are rejected |

All pre-existing Billing approval variables, Stripe server values, Auth values,
Google project credentials, OpenAI options, service-principal values, and
PostgreSQL configuration remain authoritative and must also pass their existing
fail-closed startup checks.

## Safe staging sequence

1. Provision or select a dedicated non-production project outside this change.
2. Review and apply the complete version-controlled migration chain there.
3. Create/configure the private media bucket and provider output prefix outside
   the application; do not reuse production resources.
4. Configure approved non-production commercial policies and positive test
   execution prices outside source control.
5. Set `BIZGENIE_ENVIRONMENT=staging`, then enable durable Billing, media,
   selected providers, Stripe test mode, and CORS individually.
6. Start the application and require every initialization check to pass before
   exposing staging traffic.
7. Run the two-tenant Golden Journey and failure drills. Do not treat repository
   tests alone as paid-launch or production-activation approval.

No migration, provider request, Stripe object, deployment, or production state
is created by this repository change.
