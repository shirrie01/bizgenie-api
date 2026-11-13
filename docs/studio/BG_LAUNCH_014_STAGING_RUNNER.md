# Read-only isolated staging acceptance runner

## Command and prerequisites

On an **existing authorized operator machine**, using the reviewed candidate checkout:

```bash
node scripts/staging/acceptance.js /secure/operator/approved-staging-acceptance.json > staging-acceptance.json
```

Exit 0 = all required live checks PASS; 1 = a failed gate/response; 2 = NOT RUN/incomplete. The report always has `promotionAuthorized:false`. A mocked unit-test run has scope `simulation`, `liveAcceptance:false` and overall NOT RUN even when every simulated check passes. No mocked response is live evidence.

Start from `scripts/staging/acceptance.example.json`; it deliberately fails validation until placeholders and `fixture.approved` are reconciled with existing approved evidence. Do not commit the operator's filled file. It contains **environment-variable names**, never credential values. Existing owner/foreign Supabase sessions and a valid existing Cloud Run invoker ID token must already exist securely under those names. Do not mint tokens, log in, create accounts, obtain keys or paste credentials into chat to run this tool. The tool does not obtain customer sessions or ID tokens.

Provide actual verified run region, existing Cloud Build ID/build region, expected DEPLOYED source SHA (not automatically the latest candidate SHA), and approved fixture identifiers/version/known image SHA-256/current expected credit balance. Only project `bizgenie-backend`, service `bizgenie-api-staging`, target `bizgenie-api-staging-00030-pob`, retained `bizgenie-api-staging-00029-wtc` and Supabase `zrczojyxebwjgpymbmgu` are accepted. Target lock changes for a future revision require a separately reviewed update; it never follows latest revision automatically.

The exact image test uses an EXISTING image/JPEG/PNG/WebP; no image/video generation, fixture attachment or database seed is performed. If no approved existing fixtures/credentials exist, leave NOT RUN. Do not run local fixture creation against staging.

## Metadata and authorization gates

The installed existing `gcloud` identity performs metadata-only reads: project describe, staging service/revision describe and selected existing build provenance. The metadata must prove:

- Correct project number/namespace, exact staging service/revision, Ready condition and dedicated `bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com` identity.
- One existing tag URL bound to the target, HTTPS run.app URL distinct from default service URL, target zero traffic, retained 00029-wtc 100%. No tag/resource/traffic mutation occurs; ambiguous tag mappings are refused.
- Successful build with `sourceProvenance.resolvedRepoSource.commitSha` equal to expected SHA and image digest equal to revision status.imageDigest. A label or mutable tag alone is not provenance. The runner currently supports that Cloud Build provenance form only; storage-source/manual-upload builds without it remain NOT RUN, not inferred verified. Supply existing provenance evidence through the release gate rather than inventing a commit.
- Public SUPABASE_URL from revision metadata points to the staging project, never production. If URL is only a secret reference, the tool does not dereference it: NOT RUN until separately verifiable existing provenance is available. No Secret Manager payload access. Revision env metadata is captured inside the operator process for validation only; raw configuration, values, secrets and stderr are never emitted or written by the runner.

The existing IAM ID token goes in **X-Serverless-Authorization**; customer JWT stays in **Authorization**. Local JWT claim parsing checks expiry/issuer/scope as a safety filter; it is NOT cryptographic authentication. Real Cloud Run IAM and the actual backend verify the tokens on the positive requests. Distinct legitimate foreign-tenant identity must have a positive workspace response and no membership in the owner fixture workspace. The no-customer-token request retains invoker authentication so a platform-level 403 cannot masquerade as application 401.

No gcloud auth/login/impersonation/print-identity-token/secret command, install, deploy, SQL, OAuth, Stripe or provider endpoint is executed. gcloud stdout is bounded/captured; errors are sanitized. No retries.

## Finite acceptance matrix

After metadata and token prerequisites, only GETs are issued: root; missing-customer-token workspace 401; existing owner workspace 200; existing unrelated tenant workspace 200; owned campaign 200 with expected current version; same known campaign with foreign session 404 RESOURCE_NOT_AVAILABLE; exact revision-bound creative-preview metadata 200; owned image bytes 200 with known MIME and SHA; same asset with foreign session 404; owner's existing subscription/credits 200 with expected balance; foreign credit selector 404. Customer responses must carry private/no-store and Vary: Authorization. JSON responses are capped at 256 KiB and image bytes at 32 MiB. Requests have deadlines and redirects are rejected. A positive 404 always FAILS. No `/health` route is assumed.

**Byte reads require `mediaReadHasNoDatabaseWrites:true` backed by the existing reviewed deployment.** Optional runtime delivery-budget/audit hooks can write counters on GET; no such hook may be bypassed/disabled. Without that evidence, media checks are NOT RUN and overall acceptance is incomplete. The source candidate's normal production composition does not inject runtimeDeliveryLimits, but that is not proof of deployed configuration.

Legacy `/customer/generate-video/:id`, all provider callbacks/OAuth, confirm/cancel/attach/select/bootstrap, social reconciliation and generation routes are excluded. Preview metadata does not itself authorize bytes; both are separately tested. No MP4 download is attempted by this first-image operator runner; existing automated range/streaming tests cover the video transport locally.

A bounded metadata-only Cloud Logging query gathers up to 20 ERROR-or-higher entries for this exact staging revision over the recent 15 minutes. Only a count is emitted, no raw payload/message/PII. Unavailable logs are optional NOT RUN. Nonzero counts are NOT RUN pending triage and prevent complete acceptance; they are not automatically attributed to this run.

## Security limitations and stop rules

Any wrong target, production reference, source/digest mismatch, active target traffic, missing invoker identity, invalid/expired/wrong-scope session, changed fixture, missing privacy headers, unexpected error, oversized response, redirect or image mismatch stops the matrix. Statefulness, inaccessible metadata/fixtures and unavailable provenance are reported explicitly. Never treat an arbitrary 404, root 200 or local test suite as tenant-isolation/deployed acceptance.

The fixture approval reference is operator-supplied governance evidence, not a grant created by this file. No credentials are printed, copied, rotated or exported. Keep the JSON result within the existing evidence process. No code in the runner changes production or grants traffic-promotion authority.

### Data-plane isolation prerequisite

A staging public SUPABASE_URL alone is insufficient to rule out an accidentally shared database/service-role credential. Configuration must also name the **already reviewed** database and service-role Secret Manager references, numeric versions and existing isolation evidence references (`databaseSecretRef` / `authSecretRef`). They must match the target revision's BRAND_BRAIN_DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY secretKeyRef name/key metadata before any HTTP request. Changed, literal or unapproved references fail closed. The runner never reads those secret payloads or asserts their contents independently; the approved issuance/project-isolation provenance is an explicit external prerequisite. A secret whose name contains "staging" is not, by itself, proof. If that provenance is unavailable, do not approve/fill the configuration to manufacture acceptance.
