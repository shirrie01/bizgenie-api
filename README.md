# bizgenie-api

BizGenie Cloud Run API

## Local setup

Requires Node.js 22 LTS and npm.

```bash
npm ci
```

Start the API:

```bash
# After setting ADMIN_KEY, BRAND_BRAIN_DATABASE_URL, and GOOGLE_CLOUD_PROJECT:
npm start
```

Run the complete automated test suite:

```bash
npm test
```

The tests do not call Vertex AI and do not require Google Cloud credentials.

## Existing API

- `GET /` — service status.
- `GET /_admin/ping` — authenticated administration status.
- `POST /generate-script` — existing authenticated script generation.
- `POST /generate-image` — provider-neutral authenticated image generation;
  production must inject the approved OpenAI adapter and durable media
  dependencies.
- `POST /generate-video` — authenticated asynchronous video submission.
- `GET /generate-video/:generationId` — reads current video generation state.
- `POST /generate-video/:generationId/poll` — resumes an accepted operation.

The authenticated routes require the `x-admin-key` header to exactly match the
`ADMIN_KEY` environment variable.

## Commercial policy and credit-ledger foundation

BG-BILL-002A adds the provider-neutral commercial policy, tenant entitlement,
one-account-per-tenant, immutable credit-ledger, derived-balance, reservation,
idempotency, and deterministic concurrency foundation under `src/billing/`.
It does not add routes, Stripe, production generation charging, or a production
PostgreSQL repository. The version-controlled schema and complete accounting,
tenant-isolation, Sheets/Make projection, and follow-up contract are documented
in `docs/billing/COMMERCIAL_CREDIT_LEDGER_FOUNDATION.md`.

## Generation credit accounting

BG-BILL-002C connects the active customer Text and Image paths to the existing
immutable generation job and Billing ledger through one shared orchestrator.
It reserves the server-owned policy cost before execution, coalesces duplicate
job delivery, debits once on success, and releases once on failure. Video uses
the same deterministic `video.normal` / `video.premium` contract without
activating a customer route or provider. Automatic post-debit refunds remain
disabled; an idempotent original-debit-bound seam is available for a future
proven failure condition.

No commercial prices are hard-coded. Production customer execution remains
fail-closed until approved policy rows and the durable BG-BILL-002D repository
adapter are configured. See
`docs/billing/GENERATION_CREDIT_ACCOUNTING.md` for authority, idempotency,
error, refund, migration, and activation boundaries.

## Customer-authenticated generation

BG-AUTH-002B adds separate, fail-closed customer paths without changing the
existing administrator paths:

- `POST /customer/generate-script`
- `POST /customer/generate-image`

They require a verified Supabase Bearer token plus `tenant_id` and `project_id`.
When `brand_id` is supplied it is authorized through the same tenant-owned
project. Any body `user_id` is ignored and replaced with the verified Supabase
Auth UUID before the existing generation contract runs.

Runtime verification uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Neither
is present in source control. With both absent the customer paths remain
fail-closed; partial configuration fails startup. See
`docs/security/CUSTOMER_TOKEN_VERIFICATION.md` for the full verification,
principal-separation, rollout, and dormant Image boundary.

## Stripe subscription lifecycle foundation

BG-BILL-002B adds a pinned Stripe Node SDK, server-controlled plan-to-Price
mapping, tenant-owned Customer mapping, hosted subscription Checkout boundary,
raw-body webhook verification, event replay protection, subscription-to-
entitlement lifecycle mapping, and idempotent monthly included-credit grants.

The Stripe router is mounted only when the lifecycle service is injected.
Checkout reuses the canonical verified customer token and tenant-membership
authorization chain; only tenant owners may start Checkout. Production startup
does not activate Stripe until the durable database adapter and deployment
gates are approved. Configuration, status mapping, event allowlist,
environment guards, and remaining tasks are documented in
`docs/billing/STRIPE_SUBSCRIPTION_LIFECYCLE.md`.

## Customer identity and authorization foundation

BG-AUTH-002A adds the provider-neutral customer actor, tenant membership,
project ownership, and project-to-Brand-Brain authorization contract under
`src/authorization/`. It does not verify customer tokens or change route
authentication; existing routes continue to use `ADMIN_KEY` until the bounded
BG-AUTH-002B enforcement task.

The version-controlled migration creates `customer_profiles`, `tenants`,
`tenant_memberships`, and `projects`, anchors profiles to `auth.users.id`, makes
project tenant ownership immutable, and adds the relational Brand Brain project
foreign key. The complete security, rollout, backfill, and rollback contract is
documented in `docs/security/IDENTITY_AUTHORIZATION_FOUNDATION.md`.

## Brand Brain context foundation

Brand Brain is the persistent brand-intelligence layer of the future Company
Brain. It acts as a digital employee handbook for approved identity, voice,
audience, commercial, competitor, and selectively relevant visual context. The
V1 foundation is deliberately small: it provides strict records, a replaceable
repository contract, deterministic tenancy-aware resolution, bounded prompt
compilation, and protected administration endpoints.

The implementation is isolated under `src/brand-brain/`:

- `schema.js` defines the strict, bounded V1 record and administration input.
- `repository.js` defines `getByBrandId`, `getByProjectAndBrand`, and `upsert`,
  plus the isolated in-memory implementation used by unit tests.
- `postgresRepository.js` implements the production contract with a bounded
  PostgreSQL pool and validates stored rows against the locked V1 schema.
- `contextResolver.js` enforces project ownership and approved status.
- `contextCompiler.js` produces deterministic prompt-ready context.
- `router.js` exposes the smallest protected testability surface.
- `index.js` is the domain's public module boundary.

The `node index.js` production entry point always builds the PostgreSQL
repository from environment configuration and verifies connectivity before it
starts listening. Missing, malformed, or unreachable database configuration
fails startup; production never silently falls back to process memory. Tests
and embedded callers may explicitly inject `InMemoryBrandBrainRepository` into
`createApp`. The resolver and Prompt Compiler only use the repository contract
and contain no PostgreSQL-specific logic.

### V1 record

Stored Brand Brains have this shape. `brand_id`, `project_id`, `name`, and all
four metadata fields are required in the stored record; every domain section
and each field within it is optional, so partial Brand Brains are valid.

```yaml
brand_id: string
project_id: string
name: string
identity:
  description: string
  mission: string
  vision: string
  values: string[]
  positioning: string
voice:
  tone: string
  writing_style: string
  personality: string
  preferred_terms: string[]
  prohibited_terms: string[]
audience:
  summary: string
  pain_points: string[]
  goals: string[]
  objections: string[]
  buying_triggers: string[]
commercial:
  differentiators: string[]
  primary_cta: string
  approved_claims: string[]
  prohibited_claims: string[]
competitors:
  names: string[]
  notes: string
visual:
  colours: string[]
  fonts: string[]
  photography_style: string
metadata:
  version: positive integer
  status: draft | approved | archived
  created_at: ISO 8601 timestamp
  updated_at: ISO 8601 timestamp
```

Identifiers are limited to 128 characters and a safe identifier character set;
names to 200 characters; prose fields to 2,000 characters; general lists to 20
items of 300 characters; and approved/prohibited claim and prohibited-term
lists to 12 items of 200 characters. Objects are strict and unknown fields,
wrong structures, invalid timestamps, unsupported statuses, and oversized
values are rejected rather than coerced into another shape.

### Administration

Both administration endpoints reuse the existing `x-admin-key` middleware:

- `PUT /_admin/brand-brains/:brand_id` creates or replaces a Brand Brain.
- `GET /_admin/brand-brains/:brand_id` retrieves a Brand Brain.

Mutation is not publicly exposed. The route identifier is authoritative and
any supplied body `brand_id` must match it. On first upsert, metadata defaults
to version `1`, status `approved`, and server timestamps; supplied valid
metadata may override those defaults. Upserting an existing `brand_id` for
another `project_id` returns `BRAND_PROJECT_CONFLICT` and cannot transfer
ownership implicitly. Missing records return `BRAND_BRAIN_NOT_FOUND`.
Validation failures use the existing stable `VALIDATION_ERROR` response shape.

### Generation and resolution

`POST /generate-script` now accepts optional `brand_id`. No existing caller has
to provide it.

- With no `brand_id`, the existing prompt and generation behaviour are
  preserved, including the documented Brand Context placeholder.
- With an unknown `brand_id`, generation continues with that same fallback.
- With an approved record belonging to the request's `project_id`, compiled
  Brand Brain context replaces the placeholder.
- With a project mismatch, draft record, or archived record, no Brand Brain
  content is injected and generation continues with the fallback.

The assembly order remains System role, Platform, Script type, Audience,
Intent, Voice, Brand Brain, User context, Quality rules, and Output contract.
Brand Brain supplements rather than replaces the existing structured modules
or the caller's `compiled_prompt`.

### Context budget and relevance

Compiled Brand Brain context has an 8,000-character maximum. Empty sections and
metadata are omitted. Sections are selected deterministically in this priority
order: identity/positioning, voice, audience, differentiators, claims,
preferred CTA, competitors, then visual context. Visual context is considered
only for Instagram, TikTok, or UGC generation.

When the complete context would exceed the budget, lower-priority sections are
dropped whole; content is never cut mid-value. Brand name, prohibited terms,
and prohibited claims are reserved before optional content, so governance
language is never shortened in a way that changes its meaning. Schema bounds
ensure that reserved governance content fits the configured default budget.
This is deterministic section selection, not semantic or vector retrieval.

### Security and tenancy

Generation lookup always uses the `(project_id, brand_id)` pair. A `brand_id`
match alone is insufficient, so one project's context cannot enter another
project's prompt. Unknown identifiers return no data. Repository values are
defensively copied, project ownership cannot be reassigned through upsert, and
only `approved` records resolve. Generation success/error logs contain safe
execution and provider metadata only; prompts and Brand Brain content are not
written to generic logs.

The security boundary has three deliberate layers:

1. PostgreSQL stores `project_id`, makes `brand_id` globally unique, prevents
   updates to project ownership and creation time with a trigger, enables RLS,
   and revokes table access from Supabase `anon` and `authenticated` roles. No
   client RLS policy is created because this service does not use Supabase Auth
   and the table is not exposed to clients. The server-only database role owns
   or bypasses RLS as expected for a direct backend connection.
2. Repository generation reads use `WHERE project_id = $1 AND brand_id = $2`.
   The atomic upsert only updates a conflict when the existing `project_id`
   matches; otherwise it returns `BRAND_PROJECT_CONFLICT`.
3. The context resolver repeats the ownership boundary through that scoped
   method and only compiles records whose status is `approved`. Draft and
   archived records never enter generation context.

### Durable PostgreSQL persistence

The canonical schema is created by
`supabase/migrations/20260808170000_create_brand_brains.sql`. It creates one
`public.brand_brains` row per globally stable `brand_id` with `project_id`,
`name`, JSONB columns for the six bounded V1 sections, and typed `version`,
`status`, `created_at`, and `updated_at` metadata. Database checks cover
identifier formats, core bounds, status, version, and JSON object shape; the
application performs the complete locked Zod validation on write and read. The
composite `(project_id, brand_id)` index supports tenant-scoped lookup.

Apply the migration through the version-controlled Supabase workflow, never as
a dashboard-only change:

```bash
supabase link --project-ref your-project-reference
supabase db push --linked
```

Run the optional real-database persistence test only against a disposable,
migrated database. The default CI suite does not require a database secret:

After setting `BRAND_BRAIN_TEST_DATABASE_URL`, run:

```bash
npm run test:brand-brain:integration
```

For Cloud Run, `BRAND_BRAIN_DATABASE_URL` should be the server-side Supabase
Supavisor **session-mode** PostgreSQL connection string with TLS enabled. Cloud
Run instances are long-lived application servers rather than per-query edge
functions, so session mode plus one process-wide `pg.Pool` is appropriate. The
pool defaults to five connections per instance, a five-second connection
timeout, and a 30-second idle timeout. This bounds per-instance connections
while allowing reuse across requests and avoids ORM or PostgREST complexity.
Account for `Cloud Run maximum instances × pool maximum` when sizing the
Supabase database and pooler.

### Persistence failure behaviour

Startup validates both configuration and connectivity before opening the HTTP
listener. Database errors are converted to
`BRAND_BRAIN_PERSISTENCE_UNAVAILABLE` without returning raw provider messages,
connection details, credentials, or stored Brand Brain content. Administration
requests return the structured error with HTTP 503.

Generation deliberately fails closed with the same safe 503 when a caller
explicitly supplies `brand_id` and its lookup fails. It does not call Vertex AI
or pretend Brand Brain was applied. This favours correct, governed output over
availability. An absent `brand_id` performs no lookup and retains the previous
generation behaviour; a successful lookup for an unknown ID still retains the
existing no-context behaviour.

### Operations, backup, and production verification

Supabase/PostgreSQL operators remain responsible for backups, point-in-time
recovery configuration, retention, restore testing, database capacity, and
credential rotation. This repository does not create an application-level
backup channel.

After merge, use this production verification procedure (it is a runbook, not
an instruction to deploy from this change):

1. Apply `supabase/migrations/20260808170000_create_brand_brains.sql` with
   `supabase db push --linked` and record the migration result.
2. Configure the required server-side environment/secret names listed below;
   do not expose the database value to a client.
3. Deploy the normal Cloud Run release.
4. Send an authenticated `PUT /_admin/brand-brains/:brand_id` for an approved,
   non-production test brand owned by test Project A.
5. Send authenticated `GET /_admin/brand-brains/:brand_id` and compare the
   returned identity, status, version, and project to the PUT response.
6. Call `POST /generate-script` with the matching `project_id` and `brand_id`.
7. Confirm the generated result reflects a distinctive approved test-brand
   instruction without exposing the full prompt in logs.
8. Deploy a no-code Cloud Run revision, or otherwise direct traffic to a newly
   started instance after the original instance is stopped.
9. Repeat the authenticated GET for the same `brand_id`.
10. Confirm the same record is returned, proving survival across process
    replacement.
11. Attempt to PUT the same `brand_id` with test Project B and confirm
    `BRAND_PROJECT_CONFLICT`; then generate as Project B and confirm no Project
    A Brand Brain content is injected.

### Explicit future extension points

The repository interface is the persistence seam. The resolver/compiler can
later accept richer relevance signals or retrieval results without changing
the Prompt Compiler contract. New Company Brain domains can remain separate
context providers and be composed at the same controlled injection boundary.

This persistence layer does **not** implement vector retrieval, pgvector
indexes, embeddings, document ingestion, website ingestion, Brand Brain
onboarding UI, the Genie interview, Product Brain, Customer Brain, Campaign
Brain, Competitor Brain, Learning Brain, Trend Intelligence, social ingestion,
Opportunity Engine, or automated performance learning. A future pgvector or
semantic retrieval repository can be composed behind the existing repository
and resolver boundary without changing the Prompt Compiler contract.

## Mission Control foundation

Mission Control is an internal, in-memory foundation for reviews and Red Team
findings. All endpoints reuse the existing `x-admin-key` authentication:

- `POST /_admin/mission-control/reviews`
- `GET /_admin/mission-control/reviews/:reviewId`
- `POST /_admin/mission-control/reviews/:reviewId/findings`
- `GET /_admin/mission-control/reviews/:reviewId/findings`

### Create a review

```bash
curl -X POST http://localhost:8080/_admin/mission-control/reviews \
  -H "content-type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "review_type": "weekly",
    "status": "draft",
    "evidence_pack_id": "evidence_pack_001"
  }'
```

`review_type` must be `event`, `daily`, `weekly`, `monthly`, or `quarterly`.
`status` must be `draft`, `ready`, `running`, `completed`, or `failed`.
`review_id` and `created_at` are generated when omitted.

Successful response (`201`):

```json
{
  "review": {
    "review_id": "review_...",
    "review_type": "weekly",
    "status": "draft",
    "created_at": "2026-07-29T22:30:48.000Z",
    "evidence_pack_id": "evidence_pack_001"
  }
}
```

### Add a finding

```bash
curl -X POST \
  http://localhost:8080/_admin/mission-control/reviews/review_001/findings \
  -H "content-type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "reviewer_role": "Technical and security architect",
    "provider": "provider-name",
    "title": "Unbounded provider retries",
    "description": "Provider retries have no explicit upper bound.",
    "severity": "high",
    "confidence": 0.9,
    "status": "open"
  }'
```

For v1, `finding_id`, `review_id`, and `created_at` may be omitted; the server
generates or derives them. All other fields from the canonical Finding schema
in `docs/mission-control/RED_TEAM_ENGINE.md` are supported and optional except
`reviewer_role`, `provider`, `title`, `description`, `severity`, `confidence`,
and `status`.

### Errors

Missing or invalid administration credentials retain the existing response:

```json
{ "error": "Forbidden" }
```

Mission Control validation failures return HTTP `400` with a stable shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "path": "review_type",
        "code": "invalid_value",
        "message": "Invalid option"
      }
    ]
  }
}
```

An unknown review returns `404` with error code `REVIEW_NOT_FOUND`.

## Branding configuration

All product-facing branding values are centralised in
`config/branding.json` and validated by `src/config/branding.js`. The
contract covers the app name, logo, colours, favicon, legal name, copyright,
support email, named URLs and named marketing strings.

Values that have not been approved are deliberately `null` or empty maps.
The checked-in defaults preserve the existing API output.

Deployments may apply partial overrides with `BRANDING_CONFIG_JSON`. Nested
colour, URL and marketing-string maps are merged with the checked-in defaults:

```bash
BRANDING_CONFIG_JSON='{
  "appName": "Configured Brand",
  "logo": "/assets/logo.svg",
  "colors": { "primary": "#112233" },
  "supportEmail": "support@example.com",
  "urls": { "marketing": "https://example.com" },
  "marketingStrings": { "serviceStatus": "Configured service is up" }
}'
```

Configuration is validated at startup. Invalid JSON, email addresses, URLs or
field types fail fast rather than silently applying partial branding.

## Environment variables

The fail-closed non-production activation variables and safe staging sequence
are documented in
[`docs/activation/STAGING_ACTIVATION.md`](docs/activation/STAGING_ACTIVATION.md).

- `ADMIN_KEY` — required for all administration and script-generation routes.
- `BRAND_BRAIN_DATABASE_URL` — required server-only Supabase/PostgreSQL
  session-pooler connection string used by production startup.
- `BRAND_BRAIN_DB_POOL_MAX` — optional bounded connections per Cloud Run
  instance; defaults to `5`.
- `BRAND_BRAIN_DB_CONNECTION_TIMEOUT_MS` — optional connection acquisition
  timeout; defaults to `5000`.
- `BRAND_BRAIN_DB_IDLE_TIMEOUT_MS` — optional idle connection timeout;
  defaults to `30000`.
- `BRAND_BRAIN_TEST_DATABASE_URL` — optional and only used by the manually
  invoked disposable-database integration test.
- `BRANDING_CONFIG_JSON` — optional validated partial override for the central branding configuration.
- `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, or `GCP_PROJECT` — Google Cloud
  project used by the existing script generator.
- `VERTEX_LOCATION` — optional; defaults to `europe-west1`.
- `VERTEX_MODEL` — optional; defaults to `gemini-2.5-flash`.
- `PORT` — optional; defaults to `8080`.

Mission Control introduces no new environment variables. Its repository
remains process-local and is reset whenever the process restarts.

## Generation completion protection

The Video foundation and asynchronous contract are documented
in [`docs/video-generation.md`](docs/video-generation.md). The production
application factory configures a video provider, durable asset store, and
rights-aware reference loader only when every explicit staging/production gate
passes; they remain unconfigured by default. Video input/reference locations are
resolved server-side from BizGenie asset identities; caller-supplied provider
locations are never authoritative. Every Veo submission explicitly sends
`generateAudio: false` and exposes no customer audio control.

`POST /generate-script` requests one candidate with a bounded 4,096-token
output budget. The service assembles every text part in that candidate, records
safe provider completion and token-count metadata, and requires non-empty
content for Hook, Concept, Script, CTA, Caption, Hashtags, and Filming
instructions before returning `status: "completed"`.

Token exhaustion, empty output, a non-success provider stop reason, or a
missing required section returns HTTP `502` without returning the partial text:

```json
{
  "status": "failed",
  "error": {
    "code": "GENERATION_INCOMPLETE",
    "message": "The model response ended before all required sections were completed",
    "details": {
      "finish_reason": "MAX_TOKENS",
      "missing_sections": ["CTA", "Caption", "Hashtags", "Filming instructions"],
      "retryable": true
    }
  },
  "script_body": ""
}
```

The endpoint does not retry provider requests automatically. This avoids
duplicate persistence or charge risks in upstream orchestration.

## AI image generation

BG-MEDIA-001 adds a provider-neutral backend boundary. BG-MEDIA-001A approved
the OpenAI API with the pinned `gpt-image-2-2026-04-21` snapshot as the primary
renderer. `OpenAIImageProvider` implements that existing boundary without
changing the public `/generate-image` request, response, state, approval, or
error contracts.

The default application dependency remains
`UnconfiguredImageGenerationProvider`, which returns HTTP `503` with
`IMAGE_PROVIDER_SELECTION_REQUIRED`. This prevents live or billable calls
until production supplies the OpenAI credential, approved reference loader,
and durable image asset store. Tests always inject a mocked transport and do
not call OpenAI.

The isolated implementation under `src/image-generation/` contains:

- a strict request and media-record contract;
- deterministic `queued`, `processing`, `completed`, and `failed` states;
- separate `pending`, `approved`, and `rejected` approval states;
- a BizGenie-owned provider interface and normalized result contract;
- a deterministic image prompt compiler using approved Brand Brain context;
- orchestration that records failures without creating a successful asset;
- a replaceable repository interface with an in-memory test implementation;
- structured, sanitized provider and validation errors; and
- the authenticated `POST /generate-image` route;
- a direct OpenAI generation/edit adapter with no provider SDK dependency; and
- bounded retry for network failures, `429`, and `5xx` responses only.

### Approved OpenAI adapter

`OpenAIImageProvider` calls `/v1/images/generations` when no references are
present and `/v1/images/edits` with multipart `image[]` inputs when approved
references are present. GPT Image 2 processes references at fixed high
fidelity, so the adapter deliberately never sends `input_fidelity`.

The provider accepts only BizGenie-owned configuration. The model and
moderation setting are pinned in code. The optional environment-backed factory
accepts only:

- `OPENAI_API_KEY`;
- `OPENAI_IMAGE_QUALITY` (`low`, `medium`, or `high`);
- `OPENAI_IMAGE_OUTPUT_FORMAT` (`jpeg`, `png`, or `webp`);
- `OPENAI_IMAGE_OUTPUT_COMPRESSION` (`0` to `100`);
- `OPENAI_IMAGE_TIMEOUT_MS` (`1` to `300000`);
- `OPENAI_IMAGE_MAX_ATTEMPTS` (`1` to `3`); and
- `OPENAI_IMAGE_RETRY_DELAY_MS` (`0` to `5000`).

Client request metadata cannot select an OpenAI model, moderation level,
quality, output format, compression, retry policy, endpoint, or arbitrary
provider parameter.

The adapter requires two injected, server-side dependencies:

- `referenceAssetLoader.load(referenceAsset)` must perform tenant/rights-aware
  retrieval and return approved JPEG, PNG, or WebP bytes; and
- `assetStore.save(asset)` must persist decoded output bytes and return a
  durable `http(s)`, `gs`, or `s3` location.

Neither dependency may expose credentials or make unvalidated client URLs
provider-accessible. The adapter sends no reference URLs to OpenAI. It stores
only allowlisted generation lineage alongside the image and never logs API
keys, compiled prompts, reference bytes, or raw provider responses.

### Request contract

Required fields are `execution_id`, `generation_id`, `user_id`, `project_id`,
`topic`, `image_purpose`, and `aspect_ratio`. Supported aspect ratios are
`1:1`, `4:5`, `9:16`, and `16:9`. Optional fields are `parent_generation_id`,
`brand_id`, `campaign_id`, `content_item_id`, `platform`, `audience`, `goal`,
`intent_stage`, `product_service_context`, `additional_context`, and up to five
bounded `reference_assets`.

An example provider-neutral request is:

```json
{
  "execution_id": "execution_image_001",
  "generation_id": "image_generation_001",
  "user_id": "user_001",
  "project_id": "project_001",
  "brand_id": "brand_001",
  "campaign_id": "campaign_001",
  "topic": "Launch a planning workflow",
  "platform": "LinkedIn",
  "audience": "Founder-led small businesses",
  "goal": "Build qualified awareness",
  "image_purpose": "Campaign hero image",
  "aspect_ratio": "16:9",
  "additional_context": "Use a calm editorial composition."
}
```

Successful injected providers return normalized media metadata only:

```json
{
  "status": "completed",
  "execution_id": "execution_image_001",
  "generation_id": "image_generation_001",
  "media": {
    "provider": "provider-name",
    "provider_job_id": "provider-job-reference",
    "asset": {
      "location": "https://asset-location.example/image.webp",
      "mime_type": "image/webp",
      "width": 1600,
      "height": 900
    },
    "aspect_ratio": "16:9",
    "approval_status": "pending",
    "created_at": "2026-08-15T12:00:00.000Z",
    "completed_at": "2026-08-15T12:00:03.000Z"
  }
}
```

Generation identifiers are create-only. A retry, regeneration, or variation
must use a new `generation_id` and may set `parent_generation_id`; attempting
to reuse an existing identity returns `IMAGE_GENERATION_EXISTS` and does not
overwrite history.

### Safe extension boundaries and remaining production dependencies

The provider receives only a compiled prompt, aspect ratio, bounded reference
asset metadata, and BizGenie identifiers. Provider payloads, model names,
polling, and raw responses remain adapter concerns. Results must normalize to
provider, provider job identifier, and an externally stored image asset. Large
binary assets are never accepted in the request or media record.

The approved provider adapter and fail-closed durable media composition are
complete, but any environment activation still requires:

- an OpenAI project/API key with GPT Image 2 access and any required
  organization verification;
- the unapplied durable media migration and an existing private storage bucket;
- explicit Image, media, Billing, environment, and CORS activation gates;
- approved execution-cost policy data and the durable Billing production
  adapter; or
- approval, rejection, variation, or regeneration endpoints.

Those dependencies require explicit storage, commercial, and environment
configuration tasks. The in-memory repositories remain deterministic test
dependencies and never become the production system of record.
