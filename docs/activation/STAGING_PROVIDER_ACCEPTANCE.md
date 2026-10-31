# Isolated staging: first real image + video demonstration (BG-LAUNCH-003)

31 Oct 2026. Staging RED / launch NO-GO. Nothing here has been run against a real provider. `npm run staging:preflight` reports what is ready; until it prints READY the environment is not operational.

## What exists and is reproducible today (no founder action)
| Piece | State |
|---|---|
| App + worker composition (quote/confirm, fencing, credits) | `createProductionApp` + `node worker.js` (#222), flags off by default |
| Veo output validation (ffprobe, request-bound) | #223; invalid output fails the job, nothing charged |
| Byte-level generated-image validation | this PR: format, completeness and size read from the bytes |
| Upload inspection (images from bytes; video ffprobe + full decode) | this PR; **not a malware scan** (see below) |
| Media toolchain in a runtime image | `Dockerfile.staging` (ffmpeg, ffprobe, prlimit); CI builds it and runs `scripts/staging/toolchain-selftest.js` inside it. The production `Dockerfile` has **none** of these, so Veo validation cannot run there |
| Preflight | `scripts/staging/preflight.js` (read-only, free); copy `scripts/staging/staging.env.example` |
| Browser harness | web `qa/real-backend/run.sh`: runs the product worker loop; real-provider mode needs `RB_APPROVED_SPEND_USD` and stops after 2 paid jobs (`RB_MAX_PAID_JOBS`) |

## Founder-controlled prerequisites (everything the preflight lists as `founder`)
1. A **disposable PostgreSQL 17** database (superuser URL) and an **isolated Supabase project** (URL, publishable key, service-role key). Do not reuse `zrczojyxebwjgpymbmgu` or `uvgblmejpbswkvlqvqmz` unless you decide so.
2. A **separate Google Cloud project**: Vertex AI enabled with Veo 3.1 access; a private bucket (uniform access, public access prevention enforced) plus a `gs://BUCKET/veo-out/` prefix; a service account with Vertex AI User and object admin on that bucket only.
3. An **OpenAI project key** with a hard monthly spend limit.
4. A Stripe **test-mode** key (`sk_test_`). Not needed for the media-only run; needed for the billing leg.
5. The network policy of the machine that runs the demo must allow: `api.openai.com`, `api.stripe.com`, `*.supabase.co` (and `developers.facebook.com`, `learn.microsoft.com`, `www.linkedin.com` if I am to verify platform limits; they are blocked in this session).
6. A text model id for `TEXT_GENERATION_MODEL` (Vertex) if text is part of the run.
7. Explicit approval of the spend cap below.

## Proposed cap
One image + one 4 s Veo fast video, with at most one retry of each (harness cap: 2 paid jobs, so a retry needs a new approval). **Proposed hard cap: US$10**, set at the provider accounts (OpenAI project limit; Google budget alert + quota) as well as `RB_APPROVED_SPEND_USD=10`. This is a ceiling, not an estimate: I could not read current provider price lists from this session, so I am not quoting unit prices. Credits charged to the test tenant are `image.normal` 2 and `video.normal` 6 in the harness's synthetic tariff only; no approved customer tariff exists.

## Steps once the prerequisites exist
1. `cp scripts/staging/staging.env.example scripts/staging/staging.env`, fill in, `npm run staging:preflight`: every row PASS.
2. Apply migrations to the **disposable** database only (the harness does this itself). The preview-profile migration `20261031120000` is included; applying it anywhere shared needs your separate approval.
3. In the web repo: `RB_PROVIDERS=real RB_APPROVED_SPEND_USD=10 BIZGENIE_API_DIR=... TEST_DATABASE_URL=... qa/real-backend/run.sh` (use `BG_BROWSER_CHANNEL=chrome` for H.264 playback).
4. Evidence to keep: the screenshots, the served MP4 (`ffprobe` output), the credit ledger rows for the two jobs (one reservation + one debit each), the `media_assets` rows (tenant/project ownership, measured size), and the provider consoles' own usage.

## Known limits that remain
* Upload inspection has no antivirus engine. `MEDIA_INTAKE_ENABLED` fails closed unless a scanner-backed inspector is injected; isolated staging can opt in with `MEDIA_INTAKE_STRUCTURAL_INSPECTION=true` and `MEDIA_INTAKE_ALLOW_UNSCANNED=true` (the engine name then says UNSCANNED).
* `Dockerfile.staging` uses `VIDEO_INSPECTION_ISOLATION=local` (the container is the sandbox). Hardened bubblewrap isolation needs user namespaces and the pinned Debian 13 toolchain; moving media validation to production needs that security review.
* Platform media limits (`src/media/platformMediaProfiles.js`) are operator-configured and not verified against current platform documentation.
