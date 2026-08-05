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
