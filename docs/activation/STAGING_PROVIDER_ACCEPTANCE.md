# Real-provider acceptance: one image, one 4 s Veo video, a TikTok sandbox draft (runbook)

1 Nov 2026, BG-LAUNCH-006. **Staging RED. Launch NO-GO. No real provider, TikTok or paid call has been made.** Nothing here authorises spend, IAM changes, deployment, DNS, a migration or a TikTok authorisation. Every step marked FOUNDER is yours. The last section is the STOP point.

The two existing Supabase projects (`zrczojyxebwjgpymbmgu`, `uvgblmejpbswkvlqvqmz`) hold real data and are **never** used here.

## 0. What the demonstration proves, and what it does not
1. One real OpenAI image. 2. One real 4 s Veo 3.1 Fast video. 3. Both through Studio review, approval and calendar. 4. The approved video uploaded to a **TikTok sandbox** inbox as a draft. 5. The draft shown as awaiting the creator and never as published. 6. Disconnect and credential revocation.
It does **not** prove: real customer sign-in (the harness stubs it; no Supabase is needed), the public callback on `getbizgenie.com`, TikTok app review, customer uploads, hardened media isolation (staging uses `VIDEO_INSPECTION_ISOLATION=local` with BizGenie-generated files only), Instagram/Facebook/LinkedIn.
A rehearsal with the TikTok HTTP stand-in (`RB_TIKTOK_STANDIN=1`) has been run and passes; it is **not** acceptance evidence.

## 1. Setup, in execution order (never paste a secret into chat or GitHub)
Use `read -rs NAME && export NAME` at your own prompt for every secret: nothing is echoed, written to a file or put in shell history. Close the shell when finished.

| # | Step | Who | Exact action |
|---|---|---|---|
| 1 | Demo machine | FOUNDER | Linux or macOS with Node 22, `ffmpeg`+`ffprobe`, Docker, Google Chrome (H.264 playback), `gcloud`, `git`. Outbound HTTPS to `*.googleapis.com`, `api.openai.com`, `open.tiktokapis.com`, `www.tiktok.com` |
| 2 | Code | FOUNDER | Clone both repos at the PR heads listed in the PR descriptions (API `bg-launch-005-integration`, web `bg-launch-003-fe-journey`); `npm ci` in both |
| 3 | Disposable PostgreSQL 17 | FOUNDER | `read -rs PGPASS && export PGPASS` then `docker run -d --name bizgenie-acceptance-pg -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD="$PGPASS" postgres:17` and `export TEST_DATABASE_URL="postgres://postgres:$PGPASS@127.0.0.1:55432/postgres"`. The harness creates and drops its own database inside it |
| 4 | New Google Cloud project | FOUNDER | A **new** project only, with its own billing link. `gcloud services enable aiplatform.googleapis.com storage.googleapis.com --project=P` |
| 5 | Private bucket | FOUNDER | `gcloud storage buckets create gs://B --project=P --location=us-central1 --uniform-bucket-level-access --public-access-prevention` |
| 6 | Service account, no key file | FOUNDER | `gcloud iam service-accounts create bizgenie-acceptance --project=P`; `gcloud projects add-iam-policy-binding P --member=serviceAccount:bizgenie-acceptance@P.iam.gserviceaccount.com --role=roles/aiplatform.user`; `gcloud storage buckets add-iam-policy-binding gs://B --member=serviceAccount:bizgenie-acceptance@P.iam.gserviceaccount.com --role=roles/storage.objectAdmin`; let yourself impersonate it (`roles/iam.serviceAccountTokenCreator` on that account only) and `gcloud auth application-default login --impersonate-service-account=bizgenie-acceptance@P.iam.gserviceaccount.com`. No key file is created |
| 7 | Veo output write access | FOUNDER | Veo writes to `VIDEO_PROVIDER_OUTPUT_STORAGE_URI` through Vertex AI's own service agent (`service-<PROJECT_NUMBER>@gcp-sa-aiplatform.iam.gserviceaccount.com`): grant it `roles/storage.objectAdmin` on gs://B **only if** the first Veo operation reports a write error. Not assumed here |
| 8 | OpenAI | FOUNDER | New project `bizgenie-acceptance`; a **restricted** key with only Images permission; prepaid credit of the ceiling in section 3 with auto-recharge OFF; project budget at the same figure. `read -rs OPENAI_API_KEY && export OPENAI_API_KEY` |
| 9 | TikTok sandbox | FOUNDER | In the TikTok developer portal (docs are not reachable from the preparing session: confirm each item in the portal): use the sandbox of the existing `BizGenie` app; add one test TikTok account as a sandbox target user; products Login Kit and Content Posting API (not Direct Post); scopes `user.info.basic`, `video.upload`; redirect URI exactly `https://getbizgenie.com/customer/social/oauth/callback/tiktok`. `read -rs TIKTOK_CLIENT_SECRET`, then export `TIKTOK_CLIENT_KEY` and the secret |
| 10 | Upload origin and chunk size | FOUNDER, with TikTok's Content Posting API reference | `TIKTOK_UPLOAD_ORIGINS` is the exact HTTPS origin(s) TikTok documents for `upload_url`; `TIKTOK_UPLOAD_CHUNK_BYTES` fits a 4 s video in one chunk (33554432 is the ceiling). Wrong origin fails safe: the connector sends no bytes |
| 11 | Environment | FOUNDER | Export the variables in section 2; generate the vault key: `export SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64=$(openssl rand -base64 32)` (lost with the shell, which is intended for a disposable run) |
| 12 | Preflight | FOUNDER | `npm run staging:preflight -- --tiktok` in the API repo. Every row PASS. The callback row is informational (see section 6) |
| 13 | Approve the ceiling | FOUNDER | Section 3. Then and only then section 5 |

## 2. Environment variable names (no values)
`BIZGENIE_ENVIRONMENT=staging` · `MEDIA_STORAGE_ENABLED=true` · `IMAGE_GENERATION_ENABLED=true` · `VIDEO_GENERATION_ENABLED=true` · `VIDEO_DURATION_SECONDS=4` · `VIDEO_INSPECTION_ISOLATION=local` (disposable staging only) · `GOOGLE_CLOUD_PROJECT` · `MEDIA_STORAGE_BUCKET` · `VIDEO_PROVIDER_OUTPUT_STORAGE_URI=gs://B/veo-out/` · `OPENAI_API_KEY` · `TEST_DATABASE_URL` · `SOCIAL_PUBLISHING_ENABLED=true` · `SOCIAL_PLATFORMS=tiktok` · `TIKTOK_CLIENT_KEY` · `TIKTOK_CLIENT_SECRET` · `TIKTOK_APP_REVIEW_APPROVED=true` (only once the portal shows the scopes) · `TIKTOK_OAUTH_REVIEW_REF` · `TIKTOK_UPLOAD_REVIEW_REF` · `TIKTOK_UPLOAD_ORIGINS` · `TIKTOK_UPLOAD_CHUNK_BYTES` · `SOCIAL_TOKEN_KEY_ID` · `SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64` · harness: `RB_PROVIDERS=real` · `RB_SOCIAL=tiktok` · `RB_APPROVED_SPEND_USD` · `RB_DEMO_CREDITS=8` · `RB_MAX_PAID_JOBS=2` · `RB_KEEP_DB=1` · `BG_BROWSER_CHANNEL=chrome` · `EVIDENCE_DIR`.
Template: `scripts/staging/staging.env.example`. Secrets stay in your shell; do not commit an env file.

## 3. Cost: verified evidence and the proposed ceiling
**Google Veo (official, fetched live 2026-11-01 from cloud.google.com/vertex-ai/generative-ai/pricing):**
| Model | Output | 720p | 1080p |
|---|---|---|---|
| Veo 3.1 **Fast**, video only (**what the code requests**: `generateAudio:false`, 720p) | Video | **$0.08 / 1 count** | $0.10 |
| Veo 3.1 Fast, video + audio | Video+Audio | $0.10 | $0.12 |
| Veo 3.1, video only | Video | $0.20 | $0.20 |
| Veo 3.1, video + audio | Video+Audio | $0.40 | $0.40 |
The page does not define "1 count". Veo 2 is listed at $0.50 on the same page, which matches its known per-second price, so I read it as **per second of output**: 4 s on Veo 3.1 Fast video-only = **$0.32**. If "count" instead means per video, the video is cheaper. **Confirm in the billing report after the run.** Model and settings are fixed in code and tests (`veo-3.1-fast-generate-001`, 720p, no audio, one sample, 4 s).
**OpenAI image (`gpt-image-2-2026-04-21`, medium quality, 1024x1024):** OpenAI's own pricing pages are not reachable from the preparing session, so there is **no official figure here**. Secondary data only (a community price index, not OpenAI): one listing at $0.054 per image; another at $5 / $8 / $30 per million text-in / image-in / image-out tokens. **Founder: read platform.openai.com pricing and confirm before approving.**

| Item | Figure | Basis |
|---|---|---|
| Video, expected | $0.32 | 4 s x $0.08 |
| Image, expected | about $0.05 | secondary data, unconfirmed |
| **Expected total** | **about $0.37** | |
| Video, guard worst case | $1.60 | 4 s x $0.40 (Veo 3.1 with audio) even though the code requests Fast without audio |
| Image, guard worst case | $0.25 | about 4.6x the secondary figure |
| **Worst case for the approved pair** | **$1.85** | what the harness reserves |
| Worst case plus one video retry | $3.45 | |
| **Proposed ceiling** | **US$5.00** | 13.5x expected; 2.7x the pair's worst case; also the OpenAI prepaid balance |
A failed provider operation may or may not be billed (not verifiable here); the ceiling absorbs it.

**Enforcement, strongest first.** (1) Product: the tenant is seeded with exactly 8 credits and credits are reserved before any provider call, so a third job is refused (test: `the demo credit ceiling is enforced by the product`). (2) Harness USD guard (`qa/real-backend/spendGuard.mjs`): before every paid claim it adds that job's **worst-case dollars** to what is committed and refuses the job if the total would exceed `RB_APPROVED_SPEND_USD`; unknown job kinds are refused; 2-job cap. (3) OpenAI prepaid balance equal to the ceiling is a real stop (confirm in the account). (4) Google has **no hard cap**: a budget (`gcloud billing budgets create ... --budget-amount=5USD --threshold-rule=percent=0.4 --threshold-rule=percent=1.0`) only alerts. Credits and the USD guard are not provider limits and do not see what Google or OpenAI actually bill: compare their consoles to the ceiling after the run.

## 4. Validation before any paid call (free)
`npm run staging:preflight -- --tiktok` (all PASS) · `node scripts/staging/toolchain-selftest.js` with `VIDEO_INSPECTION_ISOLATION=local` (exit 0) · `node --test qa/real-backend/spendGuard.test.mjs`-equivalent: `npx vitest run qa/real-backend/spendGuard.test.mjs` in the web repo · a rehearsal with stand-ins: `RB_SOCIAL=tiktok RB_TIKTOK_STANDIN=1 qa/real-backend/run.sh` (about 2.5 minutes, must pass).

## 5. The approved acceptance run (after the ceiling is approved)
Run 1, the image (one paid job):
`RB_PROVIDERS=real RB_APPROVED_SPEND_USD=5 RB_DEMO_CREDITS=8 RB_KEEP_DB=1 BG_BROWSER_CHANNEL=chrome EVIDENCE_DIR=$PWD/evidence-image BIZGENIE_API_DIR=<api repo> qa/real-backend/run.sh 1440x900 -g "F2 creative"`
Run 2, the video and the TikTok draft (one paid job, headed, with you at the keyboard):
`RB_PROVIDERS=real RB_SOCIAL=tiktok RB_APPROVED_SPEND_USD=5 RB_DEMO_CREDITS=8 RB_KEEP_DB=1 BG_BROWSER_CHANNEL=chrome EVIDENCE_DIR=$PWD/evidence-tiktok BIZGENIE_API_DIR=<api repo> qa/real-backend/run.sh 1440x900 --headed`
During run 2: click **Connect TikTok** (the test does this), sign in to TikTok with the **sandbox test account** in the opened browser and approve. TikTok redirects to the unrouted `getbizgenie.com` callback; the test carries the one-use code and state to the local Studio in the same tab. The video is generated by real Veo (allow up to 15 minutes), reviewed, approved and scheduled about 100 s ahead; the Studio then queues the draft. When the Studio shows **Draft sent to TikTok**, open the TikTok app on the test account, find the draft in the inbox, take a screenshot, then `touch /tmp/rb-tiktok-inbox-confirmed`. The test then disconnects.
**Evidence required (keep, do not commit):** the screenshots in `EVIDENCE_DIR`; the TikTok-app screenshot of the draft; the served MP4 and `ffprobe -show_format -show_streams` of it (H.264, 720x1280, 4 s, no audio); in the kept database: credit ledger rows (one reservation and one debit per job: `select entry_type, amount, generation_id from credit_ledger order by created_at`), `media_assets` rows (tenant/project, measured width/height/duration), the dispatch row (`state='uploaded'`, `operation_kind='draft_upload'`, no `publication_id`), `social_token_secrets` non-secret columns (`key_id`, `revoked`); the Google Cloud and OpenAI usage pages; the TikTok developer portal showing the app no longer authorised for the test user.
**Stop at once** if any host other than the listed ones is contacted, a job beyond the cap is attempted, a validation rejection occurs (investigate before a retry), the Studio shows Published for the draft, or spend nears the ceiling.

## 6. What the sandbox run does not cover
The callback relay route on `getbizgenie.com` and a Studio served from it are not exercised (the test performs that hop itself), and both are needed for the TikTok review video. `getbizgenie.com` must not be re-pointed for this run. Whether TikTok accepts a video without an audio track, and TikTok's real upload host and chunk rules, are learned in this run.

## 7. Cleanup and rollback
1. `docker rm -f bizgenie-acceptance-pg` (or `drop database rb_...` first if `RB_KEEP_DB=1` kept it, after the evidence is saved). 2. Delete generated objects, or the whole bucket: `gcloud storage rm -r gs://B`. 3. Delete the acceptance Google project (`gcloud projects delete P`) or at least the service account and its impersonation grant; delete the budget. 4. Revoke and delete the OpenAI key and project. 5. In TikTok: remove the app's access from the test account, remove the test user, rotate the sandbox client secret. 6. Close the shell (the vault key and secrets disappear with it). 7. Nothing in production, DNS, traffic or the two existing Supabase projects was touched, so there is nothing to roll back there.

## 8. STOP point
**Do not run section 5 until the founder has recorded, in Issue #191, an explicit authorisation naming: the USD ceiling, the Google project and OpenAI project to be used, the TikTok sandbox test account, and the person who will perform the run.** Until then everything above is preparation.
