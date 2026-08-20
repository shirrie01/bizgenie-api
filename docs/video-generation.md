# BizGenie Video Generation v1.0

## Status

This is a provider-neutral, administration-only foundation. Production activation,
credentials, deployment, customer JWT authentication, billing, and provider calls
are intentionally absent.

## Verified Google contract

Verified against current official Google Cloud documentation on 2026-08-19:

- Normal maps only to `veo-3.1-fast-generate-001`.
- Premium maps only to `veo-3.1-generate-001`.
- Both approved models are GA and available in `us-central1`.
- Submission uses `:predictLongRunning`; polling uses
  `:fetchPredictOperation` with the accepted full operation name.
- Text-to-video, image-to-video, and asset-reference-to-video are supported.
- Supported aspect ratios are `16:9` and `9:16`.
- Supported durations are 4, 6, and 8 seconds; reference-image generations are
  restricted to 8 seconds.
- The implemented output is MP4 at the locked adapter resolution of 720p.
- The shared `VideoGenerationModelParams` contract defaults `generateAudio` to
  `true`, while current model documentation marks sound generation as unsupported
  for both approved GA models. The adapter therefore sends `generateAudio: false`
  explicitly on every submission and exposes no native-audio capability or
  customer control over that provider parameter.

Official sources:

- https://cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-first-and-last-frames
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/use-reference-images-to-guide-video-generation
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/VideoGenerationModelInstance
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/VideoGenerationModelParams

## Provider boundary

`VideoGenerationProvider` has two operations:

- `submit(request)` performs exactly one billable submission and returns a
  normalized provider identity, accepted operation ID, model evidence, and safe
  diagnostic/cost-correlation metadata.
- `poll(request)` resumes that known operation and returns `processing`,
  `completed`, or `failed` in a normalized form.

Google request bodies, endpoint names, full operation-name validation, REST
polling, and response parsing are isolated in `googleVeoProvider.js`. Clients
cannot choose a provider, model, resolution, seed, safety setting, arbitrary
provider parameter, output bucket, or native-audio option.

## State and retry contract

```text
queued -> submitted -> processing -> completed
                    \-> failed
queued ----------------> failed
```

`completed` requires a valid durable asset and approval state. `failed` never
contains an asset. Completed and failed records are terminal and cannot be
resurrected.

Submission is never automatically retried. Once an operation is accepted, every
later attempt polls the stored operation ID. Polling timeouts, transient polling
failures, malformed polling responses, and asset-store failures leave the job in
`processing`, so the same operation can be polled again without a second billable
submission. A provider-declared terminal failure moves the record to `failed`.

## Administration API

All routes retain the existing `x-admin-key` middleware:

- `POST /generate-video` validates, queues, and submits once; returns HTTP 202.
- `GET /generate-video/:generationId` reads BizGenie's current state without
  contacting Google.
- `POST /generate-video/:generationId/poll` polls/resumes the accepted operation;
  returns HTTP 202 while active and HTTP 200 when completed.

Public responses contain BizGenie states, Normal/Premium quality, aspect ratio,
duration, approval state, timestamps, and a normalized durable asset. They do not
expose provider/model names, Google operation names, Google payloads, raw errors,
credentials, output bucket configuration, or cost evidence.

The request retains the existing ownership-readiness fields (`user_id`,
`project_id`, optional `brand_id`, campaign and content lineage), but the admin
key remains the only authentication boundary. Request `user_id` is metadata, not
proof of identity. Customer-facing production activation remains blocked on the
canonical tenant authorization work.

## Durable asset boundary

Video bytes are never stored in the application database. The service uses an
injected asset store with the same `save()` shape already used by Image. It passes
a provider output location plus lineage and expects normalized durable metadata
back. No production asset store is configured by this task, so the default route
fails closed before production use.

Input and reference locations use a separate injected
`VideoReferenceAssetLoader`. Public requests identify BizGenie assets by
`asset_id`; any supplied `location`, MIME type, or dimensions are compatibility
hints only and never reach the provider. Before submission, the service asks the
loader to resolve each identity with the project, requested user metadata,
generation lineage, usage, and required `video.generate.reference` right. The
loader must derive authoritative tenant/project ownership and rights from
server-side data, return a matching asset identity and approved `gs://` location,
and must not treat request `user_id` as proof of identity. The resolved result is
strictly validated before Veo receives it. The default unconfigured loader fails
closed with `VIDEO_REFERENCE_ASSET_UNAVAILABLE`, and provider submission is not
attempted.

## Economic readiness

Credit values do not exist in the provider adapter. Internal records preserve a
client-supplied transaction correlation ID and safe provider operation/model
evidence so later reservation, provider-cost confirmation, delivery, debit, and
margin events can be connected without changing the provider boundary. These
fields are deliberately omitted from public responses.
