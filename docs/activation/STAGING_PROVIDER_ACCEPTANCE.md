# Isolated staging: first real image + Veo video demonstration (runbook)

31 Oct 2026, BG-LAUNCH-004. Staging RED / launch NO-GO. **No real provider has been called.** Nothing here authorises spend, IAM changes, deployment or a migration; each needs separate founder approval. `npm run staging:preflight` states what is ready; until it prints READY the environment is not operational.

## 1. Journey being demonstrated
Customer onboarding -> Brand Brain -> campaign -> real image and real 4 s Veo video -> byte-level inspection -> review (platform fit) -> approval -> calendar -> credit reconciliation. Every step except the two provider calls is already exercised without cost by `qa/real-backend` (web repo) with clearly labelled stand-ins; **stand-in output is never acceptance evidence.**

## 2. What exists and what must be provisioned
| Item | State | Note |
|---|---|---|
| App, worker, quote/confirm, credits, fencing | exists (#222) | flags off by default |
| Veo + image validation from bytes; invalid output fails, nothing charged | exists (#223, #225) | |
| Upload quarantine + structural inspection + clamd adapter | exists (#225) | needs a **deployed clamd** for production (section 10) |
| Production image with pinned toolchain, non-root | exists (#225) | CI-proven; not deployed |
| Supabase | a project named staging (`zrczojyxebwjgpymbmgu`) was observed read-only on 21 Oct (Issue #191) | **founder decision**: use it (needs migration approval) or create a new isolated one. Never the primary project |
| PostgreSQL 17 (disposable) | **must be provisioned** | the harness creates and drops its own database inside it |
| Google Cloud project with Vertex AI + Veo 3.1 access | **must be provisioned / confirmed** | not verifiable from this session |
| Private GCS bucket + `veo-out/` prefix | **must be provisioned** | uniform access + public access prevention enforced |
| OpenAI project + restricted key | **must be provisioned** | |
| Stripe test key | **must be provisioned** (billing leg only) | |

## 3. Environment variables (names only; values are never committed)
Template: `scripts/staging/staging.env.example` (copy to the git-ignored `scripts/staging/staging.env`).
| Capability | Variables |
|---|---|
| Mode | `BIZGENIE_ENVIRONMENT=staging` |
| Generation | `QUOTED_GENERATION_ENABLED`, `MEDIA_STORAGE_ENABLED`, `IMAGE_GENERATION_ENABLED`, `VIDEO_GENERATION_ENABLED`, `TEXT_GENERATION_MODEL`, `VIDEO_DURATION_SECONDS=4`, `VIDEO_ASPECT_RATIO`, `IMAGE_ASPECT_RATIO` |
| Google | `GOOGLE_CLOUD_PROJECT`, `MEDIA_STORAGE_BUCKET`, `VIDEO_PROVIDER_OUTPUT_STORAGE_URI`, `GOOGLE_APPLICATION_CREDENTIALS` (or workload identity) |
| OpenAI | `OPENAI_API_KEY` |
| Database / auth | `TEST_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Billing | `STRIPE_SECRET_KEY` (`sk_test_` only) |
| Inspection | `VIDEO_INSPECTION_ISOLATION` (unset = hardened; `local` only in disposable staging) |
| Uploads (not needed for the media demo) | `MEDIA_INTAKE_ENABLED`, `MALWARE_SCANNER=clamd`, `MALWARE_SCANNER_HOST`, `MALWARE_SCANNER_PORT`, `MALWARE_SCANNER_TIMEOUT_MS`, `MALWARE_SCANNER_MAX_SIGNATURE_AGE_HOURS`, `MEDIA_RIGHTS_POLICY_VERSION`, `MEDIA_RIGHTS_POLICY_STATEMENT` |
| Harness only | `RB_PROVIDERS=real`, `RB_APPROVED_SPEND_USD`, `RB_MAX_PAID_JOBS` (default 2), `RB_DEMO_CREDITS` (default 8) |

## 4. Exact permissions (least privilege)
* **Google service account** (one dedicated account; no owner/editor): `roles/aiplatform.user` on the project; `roles/storage.objectAdmin` on the **media bucket only** (create/read/delete objects; bucket metadata read is needed by startup). Veo writes to `storageUri` through Vertex AI's own service agent, which needs write access to that prefix: **confirm on the first dry run**, not assumed here. No project-level storage role, no IAM admin.
* **OpenAI**: a project-scoped restricted key with only the Images capability.
* **Stripe**: a restricted **test-mode** key (Checkout Sessions, Customers, Prices read/write, Webhooks read).
* **Database**: a disposable PostgreSQL 17 superuser (the harness applies migrations to a database it creates itself and drops on exit). The preview-profile migration `20261031120000` is included; applying it to any shared database needs separate approval.
* **Network**: egress from the demo machine to `*.googleapis.com`, `api.openai.com`, `api.stripe.com`, `*.supabase.co`. From the Claude session used to prepare this, `api.openai.com`, `api.stripe.com`, `developers.facebook.com`, `learn.microsoft.com` and `docs.cloud.google.com` do not resolve.

## 5. Provider limits and costs: what is and is not verified
* **From this repository's code (verified):** video model `veo-3.1-fast-generate-001` (normal) / `veo-3.1-generate-001` (premium); 720p; native audio off; one sample per request; 4/6/8 s only, demo uses 4; 9:16 or 16:9. Image: one image per request; 1:1 = 1024x1024, 9:16 = 1152x2048.
* **Prices and provider quotas: NOT verified.** The Google pricing page renders client-side and could not be read from the session, and the Veo/quotas documentation host is blocked. I am therefore **not quoting any USD figure**. To get one: read the Vertex AI pricing page for Veo 3.1 Fast (price per second of output, audio off) and the OpenAI image price for the configured quality and size, then `cost = 4 s x video price + 1 x image price`. Pages to read: <https://cloud.google.com/vertex-ai/generative-ai/pricing>, the Veo video generation model reference under cloud.google.com/vertex-ai/generative-ai/docs, <https://openai.com/api/pricing/>. The earlier "US$10" figure was a placeholder, is **not authorised**, and may not be provider-enforceable; it is withdrawn.

## 6. Spend ceiling and how it is actually enforced
| Layer | Enforced by | Strength |
|---|---|---|
| Credits | The tenant is seeded with exactly `RB_DEMO_CREDITS` (default 8 = one 2-credit image + one 6-credit video in the harness's synthetic tariff). Credits are **reserved before any provider call**; a further job is refused as insufficient credits (existing test: `generation-quotes.integration.test.js` "competing confirmations cannot overspend"). | Hard, in the product, independent of any provider setting |
| Paid-job cap | The harness refuses to claim more than `RB_MAX_PAID_JOBS` (default 2) in real mode and will not start without `RB_APPROVED_SPEND_USD` | Hard for this harness |
| Request shape | Fixed by the quote profile: one image, one Veo sample, 4 s | Structural |
| Provider side | OpenAI project budget; Vertex AI request-quota override for the Veo model; Google Cloud budget alert | **Defence in depth only.** Budgets are alerts, not hard stops; whether the OpenAI project limit is a hard stop must be checked in that account. Not relied on |
| USD ceiling | Derived from section 5 once prices are supplied, then approved by the founder | **Open** |

## 7. Command sequence once approved
```
cp scripts/staging/staging.env.example scripts/staging/staging.env      # fill in; never commit
npm run staging:preflight                                               # every row must PASS
VIDEO_INSPECTION_ISOLATION=local node scripts/staging/toolchain-selftest.js   # disposable staging only; production image defaults to hardened
# web repo:
RB_PROVIDERS=real RB_APPROVED_SPEND_USD=<founder-approved> RB_DEMO_CREDITS=8 \
  BIZGENIE_API_DIR=<this repo> TEST_DATABASE_URL=<disposable pg17> BG_BROWSER_CHANNEL=chrome qa/real-backend/run.sh
```
Evidence to keep: screenshots; the served MP4 and its `ffprobe` output; the two jobs' credit-ledger rows (one reservation + one debit each); the `media_assets` rows (tenant/project, measured size and duration); the provider consoles' own usage pages; the harness log (it prints every refused paid job).

## 8. Rollback and cleanup
1. Stop the harness (it drops its own database on exit; confirm with `\l`).
2. Delete generated objects: `gcloud storage rm -r gs://<bucket>/veo-out/ gs://<bucket>/<media prefix>/` (names are in the harness output and the `media_assets` rows).
3. Revoke the OpenAI key; delete the Google service-account key (or the service account); rotate the Stripe test key; delete `scripts/staging/staging.env`.
4. If a Supabase project was created for this, pause or delete it; if the existing staging project was used, remove only the rows the run created (listed by tenant id) and record that migration state changed.
5. Nothing in production, DNS or traffic is touched by this procedure; there is nothing to roll back there.

## 9. Production media safety: state
* **Inspection runtime:** the production `Dockerfile` installs ffmpeg/ffprobe/bubblewrap at the pinned versions in `runtime/video-inspection-toolchain.v1.json`, runs as the non-root `node` user, and CI runs the self-test inside the built image. Limits are in `src/media/inspectionLimits.js` (per process: 5 s CPU probe, 30 s CPU decode, 1-2 GiB address space, 64 files, 1 MiB write, 32 MiB input). Container CPU/memory/request timeouts are deployment settings (Cloud Run), not in this repository.
* **Fail closed:** video and uploads are enabled only after a startup self-test passes in the configured isolation; hardened (bubblewrap) is the default and `local` is refused outside staging. Whether the **target runtime permits user namespaces** (needed by bubblewrap) is unproven; CI reports it either way. If it does not, hardened isolation is unavailable there and video stays disabled there.
* **Malware scanning:** the adapter and quarantine semantics are implemented and tested against a protocol stand-in. **A real clamd has not been run.** Deployment and cost decisions are in section 10.
* The Google Buildpack image that CI also builds has no media toolchain; media features must be deployed from the Dockerfile image, and on the buildpack image the startup self-test refuses to enable them.

## 10. Decisions for the founder (scanner)
ClamAV is free software; running it means a separate always-on service with roughly 1-2 GiB of memory (signature database), a signature-update feed (freshclam needs outbound access to ClamAV's mirrors) and an internal-only network path from the API. Options: (a) a ClamAV service on Cloud Run or a small VM in the same VPC, reachable only by the API (infrastructure cost, no per-scan fee); (b) a commercial/managed scanning API (per-scan fee, and customer files leave BizGenie's boundary, which needs a privacy/DPA decision); (c) defer customer uploads: the media demo and first customers do not need them (Hybrid UGC is post-launch). Recommended: (c) for launch, (a) when uploads are scheduled. Until a real scanner is deployed, `MEDIA_INTAKE_ENABLED` must stay off in production.
