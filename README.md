# bizgenie-api

BizGenie Cloud Run API

## Local setup

Requires Node.js 22 LTS and npm.

```bash
npm ci
```

Start the API:

```bash
ADMIN_KEY=replace-with-a-local-secret \
GOOGLE_CLOUD_PROJECT=your-project-id \
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

The authenticated routes require the `x-admin-key` header to exactly match the
`ADMIN_KEY` environment variable.

## Brand Brain context foundation

Brand Brain is the persistent brand-intelligence layer of the future Company
Brain. It acts as a digital employee handbook for approved identity, voice,
audience, commercial, competitor, and selectively relevant visual context. The
V1 foundation is deliberately small: it provides strict records, a replaceable
repository contract, deterministic tenancy-aware resolution, bounded prompt
compilation, and protected administration endpoints.

The implementation is isolated under `src/brand-brain/`:

- `schema.js` defines the strict, bounded V1 record and administration input.
- `repository.js` defines `getByBrandId`, `getByProjectAndBrand`, and `upsert`.
- `contextResolver.js` enforces project ownership and approved status.
- `contextCompiler.js` produces deterministic prompt-ready context.
- `router.js` exposes the smallest protected testability surface.
- `index.js` is the domain's public module boundary.

The default repository is process-local and in-memory. It stores defensive
copies and can be replaced by a permanent repository later without changing the
prompt compiler. No database or persistence-provider dependency is introduced.

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

### Explicit future extension points

The repository interface is the persistence seam. The resolver/compiler can
later accept richer relevance signals or retrieval results without changing
the Prompt Compiler contract. New Company Brain domains can remain separate
context providers and be composed at the same controlled injection boundary.

This foundation does **not** implement permanent production persistence, Brand
Brain onboarding UI, the Genie interview, voice onboarding, automatic website
ingestion, social ingestion, document ingestion, vector/semantic retrieval,
Product Brain, Customer Brain, Campaign Brain, Learning Brain, Trend
Intelligence, Opportunity Engine, or automated performance learning. Those
remain separately reviewed roadmap components.

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

- `ADMIN_KEY` — required for all administration and script-generation routes.
- `BRANDING_CONFIG_JSON` — optional validated partial override for the central branding configuration.
- `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, or `GCP_PROJECT` — Google Cloud
  project used by the existing script generator.
- `VERTEX_LOCATION` — optional; defaults to `europe-west1`.
- `VERTEX_MODEL` — optional; defaults to `gemini-2.5-flash`.
- `PORT` — optional; defaults to `8080`.

Mission Control introduces no new environment variables. Its repository is
process-local and is reset whenever the process restarts.

## Generation completion protection

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
