# BG-LAUNCH-FINAL-API-01 — staging release packet

15 November2026. Source accepted main `ed680727e067532518bdfce8a3e12fbbb483147f` includes250/251. WEB reference81e1014e8e16ea8b7ea6186061936fe686e17b71. Neither is claimed deployed. **PREPARED / OPERATOR EVIDENCE BLOCKED / NO DEPLOYMENT APPROVAL.** Existing BG-E2E-P0-251 runbook remains applicable; this packet supplies the requested commands and accepted validator path, not another architecture.

## 1. Current evidence / intended targets

| Field | Evidence |
|---|---|
| Studio URL / intended Pages project | https://bizgenie-studio-staging.pages.dev / bizgenie-studio-staging, source-configured; active appSHA/deployment UNKNOWN |
| Intended bridge | bizgenie-backend/europe-west1/bizgenie-studio-bridge-staging; serving revision/traffic/image digest UNKNOWN |
| Source-allowlisted bridge URL | https://bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app; actual serving mapping UNKNOWN |
| Private API | bizgenie-api-staging; service URL/audience/tag/revision/source/traffic UNKNOWN. Historical00029/00030 are lookup references, not current facts. |
| Staging auth | https://zrczojyxebwjgpymbmgu.supabase.co; configured revision binding/provisioner permissions UNKNOWN |
| Runtime identity | Source expects bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com; attachment/effective invoker privileges UNKNOWN |
| Artifact / rollback / cost | Published matching immutable bridge image, old safe bridge revision, Pages prior deployment and cost ceiling UNKNOWN; CI build alone is not registry publication |
| Current request failure | Founder-observed STAGING_WRITES_DISABLED. Source: src/studio-bridge/service.js write guard returns403 before forwarding; actual failed response/serving config UNKNOWN. |

No connected authenticated GCP/Cloudflare/Sheets tool is available and gcloud is absent. No installation/credential recovery attempted. Earlier staging CONNECT403 was a proxy failure, not an application response. No SQL, cloud Job or customer request executed. Current external deployment triggers and Cloudflare automatic production settings are UNKNOWN; source staging WEB workflow is manual-only, not proof that other automation is disabled.

## 2. ONE existing-operator metadata handoff (read-only commands)

For an operator with an EXISTING authorised Google Cloud session, no new credentials/permissions. Commands below return only named metadata, omit inline environment values and secret payloads. Never run an unfiltered environment dump. Scope is staging only.

```sh
gcloud run services list --project=bizgenie-backend --region=europe-west1 --filter='metadata.name=bizgenie-api-staging OR metadata.name=bizgenie-studio-bridge-staging' --format='json(metadata.name,status.url,status.traffic,spec.template.metadata.name,spec.template.spec.serviceAccountName,spec.template.spec.containers.image)'
# Set each VERIFIED_* variable from the first output/reviewer evidence, not historical examples.
gcloud run revisions describe "$VERIFIED_BRIDGE_REVISION" --project=bizgenie-backend --region=europe-west1 --format='json(metadata.name,spec.serviceAccountName,spec.containers.image,spec.containers.command,spec.containers.args,spec.containers.env.name,spec.containers.env.valueFrom,spec.volumes)'
gcloud run revisions describe "$VERIFIED_API_REVISION" --project=bizgenie-backend --region=europe-west1 --format='json(metadata.name,spec.serviceAccountName,spec.containers.image,spec.containers.env.name,spec.containers.env.valueFrom,spec.volumes)'
gcloud run services get-iam-policy bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --format=json
gcloud artifacts repositories list --project=bizgenie-backend --location=europe-west1 --format='table(name,format,location)'
# Use only the existing approved repository URI obtained above.
gcloud artifacts docker images list "$VERIFIED_EXISTING_REPOSITORY_URI" --include-tags --format='json(package,version,tags,updateTime)'
```

Operator privately inspects ONLY whitelisted non-secret gate/target names: BIZGENIE_ENVIRONMENT, BG_BRIDGE_STUDIO_ORIGIN/TARGET_URL/AUDIENCE/REVISION/SOURCE_SHA/REVIEW_REF, BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING and all six other write flags. Return names/value/status for those, never the actual founder UUID, tokens, DB URLs, public/private keys or whole environment. Confirm founder binding present/UUID-valid/matches the authorised existing account WITHOUT publishing it. Runtime secret reference/version/CA metadata is not effective IAM or a working connection proof.

Cloudflare existing-session Console: Workers & Pages→bizgenie-studio-staging→Deployments gives active deploymentID, app commit, aliases/branch and prior rollback deployment. Settings→Builds/branch controls gives current automatic production/preview settings. For existing authorised tooling in the reviewed WEB checkout, read-only `PAGES_PROJECT=bizgenie-studio-staging node scripts/staging/cloudflare-previous-deployment.mjs` and `... --verify "$VERIFIED_WEB_APP_SHA"` use already configured operator auth; never copy credentials into this packet. Also record actual built API origin and dist hash. GitHub workflow ref is not necessarily inputs.sha/app commit. Obtain current main-push trigger status from the existing operator before any merge; do not change it.

Required fields: timestamps/operator; actual project/service/revision/traffic; appSHA and workflowSHA separately; bridge digest/source provenance; upstream pinned URL/audience/revision/source; runtime principal and invoker relationship; individual gate status; configured staging pool/provisioner references; existing245 runtime evidence; rollback IDs; redacted prior failed request method/path/status/error.code/redirect/request correlation. No personal payload/token/HAR export. Minimal existing Pages Read and scoped Run/registry/policy metadata visibility suffice for discovery; do not request broad admin or Secret Accessor. Inaccessible is not absent.

## 3. Exact future configuration / immutable image

Existing bridge entrypoint: Dockerfile.studio-bridge, non-root, node scripts/staging/studio-bridge.js; PORT8080/BG_BRIDGE_BIND0.0.0.0. Normal API/worker startup is not used. Once separately authorised to build/publish to an existing approved registry, build FROM accepted source, never a dirty directory:

```sh
# FUTURE APPROVED ARTIFACT OPERATION ONLY. Verify these supplied values first.
git archive "$REVIEWED_ACCEPTED_SOURCE_SHA" | docker build -f Dockerfile.studio-bridge -t "$APPROVED_STAGING_IMAGE_TAG" -
# Run the existing reviewed synthetic container contract (no host port/IAM/provider calls):
git show "$REVIEWED_ACCEPTED_SOURCE_SHA:scripts/staging/smoke-studio-bridge.sh" | bash -s -- "$APPROVED_STAGING_IMAGE_TAG"
# Then ONLY with publication approval:
docker push "$APPROVED_STAGING_IMAGE_TAG"
docker image inspect "$APPROVED_STAGING_IMAGE_TAG" --format '{{json .RepoDigests}}'
```

Record full registry image@sha256 plus sourceSHA/workflow/build evidence; independently read registry digest before deployment. Base-image digest is not built-image provenance. Initial accepted source is ed680727…; any later runtime source fix requires a newly reviewed/accepted source and new artifact evidence. No registry/resource/IAM creation or paid call authorised here. Publication/runtime costs remain unverified: operator must substantiate cost bounds and founder must approve a numeric ceiling before any billable operation; no amount invented.

Use existing `scripts/staging/bridge-founder-onboarding-release.example.json` as a schema/template ONLY. It is OFF/unresolved and intentionally fails. Fill private reviewed manifest with verified immutable artifact/pins and actual approvals, then:

```sh
node scripts/staging/validate-founder-onboarding-release.js /secure/reviewed-founder-release.json
```

ON requires exacttrue `BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING`, canonical lower-case `BG_BRIDGE_FOUNDER_AUTH_USER_ID` privately bound to the existing verified Supabase sub, actual founderOnboardingApproval/founderIdentityBindingEvidence/upstreamDatabasePoolEvidence/upstreamAuthProvisionerEvidence references, all base metadata and evidence. All other flags false: BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP, BG_BRIDGE_ALLOW_WRITES, BG_BRIDGE_ALLOW_DRAFT_WORKFLOW, BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION, BG_BRIDGE_ALLOW_SOCIAL_WRITES, BG_BRIDGE_ALLOW_STRIPE_CHECKOUT. Target staging URL/project only; no identity/admin/DB secret in browser. Source default remains OFF. Validation SUCCESS is structural, NOT approval or live verification. No live candidate fabricated or validator SUCCESS claimed here.

## 4. Runtime prerequisites / controlled inspection (#245)

Require evidence from the actual application pool: current_user/session_user, effective SELECT/INSERT/UPDATE metadata on relevant tables, role/RLS boundary, current membership/brand policy and exported onboarding preflight(client) result matching professional schema. A privileged SQL Editor or same-config Job is not evidence from the running pool. Borrow already-owned client, BEGIN READ ONLY, set local bounded statement/lock timeouts, catalog queries only, invoke exact reviewed preflight(client), ROLLBACK and release in finally; NEVER close the shared pool, SET ROLE, read customer records, run DDL/DML or dump configuration. No approved in-process access mechanism is established here; method/operator/source/digest/time/output/cost bounds need separate diagnostic approval. Do not resurrect or execute deferred231, create a Job/endpoint or run SQL to fill this packet. Supabase Auth-admin provisioner reference/status and runtime access must be separately verified; metadata alone is not successful auth mutation proof.

## 5. Approval / execution ladder (nothing executed)

1. Metadata packet complete and operator/private API isolation, rollback and main-trigger safety verified.
2. Independent source review + exact-head CI; source-only merges only under founder workflow and protection gates, verify main/CI. No deployment implied by merge.
3. Separate exact source/artifact publication approval, existing registry/identity/cost bound; record digest.
4. Separate founder-approved staging deployment/configuration: exact service/revision/image, private upstream pin, account binding, evidence refs, flags, operator and rollback. No traffic/IAM/DNS/secret changes bundled without their own authority.
5. Existing manual WEB staging workflow approved exact appSHA, verified bridge origin, smoke_url=https://bizgenie-studio-staging.pages.dev and staging-studio protection. Record actual served app/digest/Pages deployment after operation. Keep API compatibility manifest fail-closed; no fabricated feature evidence.
6. Read-only health: supported OPTIONS204 for exact origin, hostile origin403, GET workspace401 without auth/200 with approved account. Root404 is not health success. Negative write probes and real Fonzo write/resume/isolation test require separate controlled-write approval even if a negative probe should deny. Collect redacted statuses, exact components and correlation where available; do not invent request IDs.

Only exact POST/bootstrap, PUT/onboarding and PUT/brand-brain are admitted by founder mode. Verified non-founder403 then429 at budget, invalid auth401; no IAM/upstream for denials. All33 unrelated write variants stay blocked. Existing owner/tenant/RLS/CAS checks remain mandatory. Source generation/recommendation/campaign/calendar writes are not enabled by this profile; further non-paid journey operations require separately scoped authority, never a broad flag workaround. No paid/provider/OAuth/Stripe test hidden in acceptance.

## 6. Abort / rollback / evidence destination

Abort on wrong source/digest/origin/project, production reference, malformed/unready manifest, absent DB/provisioner/runtime evidence, missing rollback, unexpected paid path or foreign data. Future authorised operator stops tests, disables founder gate/restores recorded all-gates-off bridge revision, restores previous staging Pages deployment if needed. Preserve customer records and private API/production traffic. No downSQL/reset/delete. Verify blocked writes and unchanged reads/OPTIONS. Actual rollback IDs must precede approval; UNKNOWN means no release.

Evidence destination existing249/191 and actual relevant PR, canonical Mission Control existing task/blocker/evidence/session/audit/checkpoint/active-closure only. Public notes redact identifiers/customer payloads; private approved store holds detailed test evidence. SYNC PENDING unless write/readback succeeds. No duplicate register.

**Exact approval request:** once UNKNOWN fields are filled, approve only named operator executing the reviewed artifact/configuration on the identified staging target and bounded controlled Fonzo writes, with all other gates OFF, actual rollback IDs and substantiated cost ceiling. This packet requests no implicit deployment today. Current operational status BLOCKED on existing operator connection/evidence; source preparation can continue independently.
