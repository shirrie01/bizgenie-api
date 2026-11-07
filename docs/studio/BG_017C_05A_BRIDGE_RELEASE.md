# BG-017C-05A — Secure Studio bridge release package

7 November 2026. AUTHORISED engineering only; no deployment/IAM/DNS/traffic or live data change. Existing API PR229 branch bg-staging-p0-workspace-origin is used; depends on PR228. Base229 SHA6adeed03d91429dcd87a79d48954ea645f004634; base228 c65e62990d686e8254929aaeb4b23f14b39c01d8. Exact release SHA is the final Git head/publishing checkpoint, never a moving branch. Web71 head observed cf6bfec78c4254d1a9d11ceeb1ba20cac0ac394e. Existing implementation and tests preserved.

## Evidence and root cause

Founder-supplied infrastructure checkpoint: Pages deployment0508d40e-88ca-41dc-aa3e-35901dd23ae0/source1e08cbce69b0ec47e19d067c96445ef20045feda; Studio browser API base staging-api.getbizgenie.com maps directly to IAM-protected staging API. Serving00029-wtc100%,00030-pob0%, image sha256:e443d4bc136c79080f6535f78a7fb72a03d69a6ea39b91473ee3d84e240f7ae2, CORS_ENABLED=false, no bridge origin/CORS origins. No separate bridge among nine europe-west1 services; no working bridge elsewhere verified. This resolves prior unknown topology for this work order, but is supplied checkpoint evidence, not a new live query.

Browser IAM rejection may precede application OPTIONS; enabling CORS on private API cannot alone solve browser invocation. Existing optional bridge was not deployed. The published origin correction alone cannot alter this topology. API remains private. GitHub128/191/comments and hosted CI API reads are blocked by Forbidden here; no contrary approval is assumed. NativeGit verifies228/229 heads. No credentials requested or recovered.

## Implementation and package

Reuse scripts/staging/studio-bridge.js and src/studio-bridge/service.js unchanged. New Dockerfile.studio-bridge uses the same pinned Node22 base and lockfile, production dependencies, copied src and only bridge entrypoint, non-root USER node, PORT8080 and bind0.0.0.0. It contains no API/worker startup, migrations, database connection, media toolchain or provider execution. Normal Dockerfile/startup remain unchanged. Build is reproducible from exact source and lockfile; resulting image digest must be recorded separately, never inferred from source SHA.

New offline release validator scripts/staging/validate-bridge-release.js rejects missing evidence refs, mutable images, production config, wrong principals, private credentials/extra env and enabled write gates. It validates structure, not cloud truth or actual founder approval. Bridge sourceSha and BG_BRIDGE_SOURCE_SHA are deliberately separate: the latter is deployed upstream API source, not this bridge commit. Never substitute the bridge SHA for an unknown upstream SHA.

New synthetic container smoke tests non-root startup, preflight before auth, missing-token401, hostile-origin403 and writes-disabled403. It uses fictional public configuration, no valid tokens or IAM calls. Existing CI retains all assertions and adds build/smoke of bridge image. This is a hosted-CI preparation, not evidence that CI has run.

## Proposed exact staging configuration

| Parameter | Proposal / evidence needed |
| --- | --- |
| Project/region | bizgenie-backend / europe-west1 |
| Service | bizgenie-studio-bridge-staging (PROPOSED, not provisioned) |
| Image | Existing approved regional Artifact Registry repository, image at sha256 digest built from exact final commit; repository/image/digest unresolved |
| Entrypoint | node scripts/staging/studio-bridge.js, non-root, PORT8080, bind0.0.0.0 |
| Identity | bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com is code-required candidate; suitability/effective privileges still need verified review |
| Browser origin | https://bizgenie-studio-staging.pages.dev, exact |
| Public bridge URL | UNKNOWN until provisioned/verified; do not invent or hardcode one |
| Private upstream | Reviewed revision-tag URL for isolated bizgenie-api-staging-00030-pob; actual URL/tag-to-revision mapping UNKNOWN |
| IAM audience | Exact untagged staging service origin corresponding to tagged URL; UNKNOWN |
| Source SHA | Bridge exact final commit; upstream deployed source separately UNKNOWN |
| Authentication | Existing staging Supabase public URL + existing sb_publishable key only; no service-role/DB/provider/Stripe keys |
| Limits proposal | 8 concurrent requests, max1 instance, min0, 30s request deadline, bounded ingress; initial1GiB/1CPU proposal requires cost/platform approval; actual cost UNKNOWN |

Use scripts/staging/bridge-release.example.json; placeholders deliberately fail offline validation. It is not a deployment manifest or approval. All env keys are listed there. Default all write/confirmation/social gates false. SUPABASE_PUBLISHABLE_KEY is public but not copied into source evidence. No private identity key/static ID_TOKEN environment exists.

The inherited URL validator currently accepts reviewed tagged a.run.app service-origin format only; if actual metadata uses another hostname format, stop for a bounded tested contract adjustment, never replace with arbitrary URL acceptance. No tag URL is fabricated.

## IAM/ingress approval proposal — NOT EXECUTED

The proposed bridge must accept unauthenticated platform invocation so OPTIONS reaches its application without Google identity. That exposure applies ONLY to the dedicated bridge service, NOT bizgenie-api-staging or any tag on it. Public bridge actual requests still require existing verified customer bearer, restricted routes and scope checks; public OPTIONS has no upstream/IAM side effects. Bridge IAM exposure is security-sensitive and requires founder approval.

Review existing candidate staging account for resource-level roles/run.invoker on private staging API only, attached-identity token acquisition and public auth verification network access. No Editor, production invocation, secret access, storage/DB/provider/billing roles are needed by this process. A shared staging API identity may already have excessive rights; suitability is not established by its email. If excess/inherited permissions prevent safe reuse, pause identity approval; do not silently create an identity or broaden grants. Runtime parsing of email/audience/expiry is a fail-closed guard; Google SDK/CloudRun verify the actual invocation token. Deployer needs narrowly scoped deployment permission, artifact read/use and iam.serviceAccounts.actAs on approved runtime; public-invoker grant requires an authorised policy operator. No permissions are granted by this package. Organisation public-access constraints remain UNKNOWN.

API current traffic/private authentication must remain unchanged. No upstream deployment or CORS activation is necessary merely for bridge-origin handling: bridge processes browser CORS itself and does not forward Origin. API code deployed at pinned target must actually support current workspace routes and bootstrap prerequisites. Missing schema, runtime authority or scope-provisioner produces a real blocker, never a bridge workaround.

## Contract for Claude / WEB71

This supersedes the historical frontend document proposal to expose the private API publicly, within the scope of this work order only. Do not edit Claude branches.

- Set VITE_BIZGENIE_API_URL and PAGES_EXPECT_API_ORIGIN to the ACTUAL verified browser-facing bridge HTTPS origin only after backend deployment approval and smoke; update build CSP accordingly. No invented URL. Pages remains static; no service credentials in browser.
- Browser Origin remains https://bizgenie-studio-staging.pages.dev. Send Authorization: Bearer <customer Supabase access token>. JSON writes content-type:application/json; media range as required. No Google ID tokens, serverless/admin headers or cookies.
- OPTIONS /customer/workspace requested GET and /customer/workspace/bootstrap requested POST respond204 with exact origin/allowed method and authorization,content-type; no auth/IAM call. Unknown origins403. This does not authorise actual writes.
- GET /customer/workspace uses verified identity even before trusted workspace scope exists. POST /customer/workspace/bootstrap reuses existing service; successful backend response201 with workspace and possible requires_session_refresh. Discover/select existing workspace before creating; refresh session after bootstrap if required. Stable IDs/transaction lock preserve retry safety; no client-created tenant/duplicate account.
- Initial read-only bridge returns403 STAGING_WRITES_DISABLED on actual bootstrap. Controlled customer bootstrap therefore needs a separately approved allowWrites phase. This flag enables other allowlisted writes too; do not represent it as bootstrap-only permission. Generation confirmation and all social writes remain independently false even then. No entitlement or billing authority is granted. Real onboarding acceptance is not read-only and has not run.
- Missing/invalid customer token401 AUTHENTICATION_REQUIRED; forbidden origin403 ORIGIN_FORBIDDEN; route/scope404 RESOURCE_NOT_AVAILABLE; privileged header400 SERVER_HEADERS_FORBIDDEN; limit429 BRIDGE_RATE_LIMITED; oversize413 BRIDGE_REQUEST_TOO_LARGE; deadline504 STUDIO_BRIDGE_TIMEOUT; upstream unavailable502 PRIVATE_API_UNAVAILABLE. Bridge failures use {error:{code,message}} with sanitised message. Forwarded backend bodies/statuses retain existing contract (including stale409 and unavailable503). Never require a message string equality or infer success from404.
- Excluded: admin/internal/legacy generation/callback routes, unapproved commercial mutations. OAuth provider callbacks intentionally not supported here; do not enable social connection flags as an acceptance prerequisite. No product feature is removed; remaining capability activation is separately gated.

## Release order and smoke

1. Review exact final229 commit and dependencies; require hosted tests and bridge artifact build/smoke green at that SHA. No merge authorised.
2. Verify upstream tag/revision/source/digest/routes and existing staging credential/schema/backup requirements from approved metadata. Do not rerun migrations. Fill release spec with exact bridgeSHA, image digest, actual tag/audience, approval/evidence refs and public staging auth config. Run node scripts/staging/validate-bridge-release.js /secure/reviewed-bridge-release.json. OFFLINE_VALIDATED is NOT deployment approval.
3. Founder approves exact target/commit/image, identity suitability, bridge-only public invocation/ingress, runtime limits/cost ceiling and rollback owner. No approval is asserted here.
4. Authorised release operator builds Dockerfile.studio-bridge from exact commit, deploys proposed bridge only using immutable digest and initial read-only gates, leaves API00029/00030/privateIAM/traffic unchanged. This step is not executed by this task. Record actual bridge URL/revision/digest/config. TCP startup probe port8080; no public health handler has been added and '/'404 is not a health success. Availability proof: exact origin OPTIONS204 + unauthenticated actual workspace401 (application response, not Google HTML). Actual valid session read then tests IAM/upstream chain.
5. With actual URL, Claude cuts over reviewed WEB71 build+origin/CSP; Pages release uses its own exact frontendSHA, not bridgeSHA. Browser sign-in/workspace GET must200 with real customer scope, invalid token401, foreign tenant selectors404, correct CORS and session refresh. Collect sanitised logs without bearer, query identity or bodies.
6. Only after separate controlled-write approval, open allowWrites for one existing SM Properties onboarding acceptance, keep generation/social false, discover existing workspace then bootstrap once if needed, refresh, Step3, reload persisted IDs, cross-customer denial. Close temporary write window if approved plan requires. No Stripe/paid provider/social calls. All actual acceptance NOT RUN in this engineering task.

## Rollback / abort

Before cutover preserve Pages deployment0508d40e-88ca-41dc-aa3e-35901dd23ae0, actual prior config and reviewed frontend commit; preserve existing API private revisions and traffic. If bridge fails, stop cutover; restore previous reviewed frontend deployment and/or restrict/disable ONLY bridge access under approval. Old direct-private connection is a known blocked state, not a working rollback claim. A new bridge has no prior bridge revision: abort/disable it, do not invent a previous good revision. Preserve customer data and evidence; no SQL/credit resets, account recreation or down migration.

Abort for auth weakening, unexpected production target/token/secret, wrong digest/SHA, missing permissions, unbounded egress, customer leak or side-effecting acceptance. No fallback to public private-API invocation. Rate/concurrency limits are process-local, not distributed; max1 instance is proposed to bound staging exposure. 8x32MiB upload buffering plus runtime overhead needs reviewed memory. Public preflights/invalid traffic still incur runtime cost and can deny service; platform rate/WAF budgets are unverified. In-flight media revocation remains inherited risk, not newly solved. Paid/social gates stay off.

## Recorded validation

Full Node22.23.3/PostgreSQL17 local suite: 1,148/1,148 PASS, zero failures/skips/cancellations. Focused bridge/CORS/runner/release tests28/28 PASS. Actual routers and disposable PostgreSQL are LOCAL REAL; Supabase verifier/admin propagation, IAM token issuer and providers are MOCKED. Syntax, shell syntax and whitespace checks pass. The unresolved example is rejected with BRIDGE_RELEASE_NOT_READY, as intended.

Pinned Node base with existing mounted dependencies, no external container network, non-root bridge: startup and synthetic OPTIONS/missing-token/origin/write-gate assertions PASS. This is NOT the Dockerfile-built release artifact. Local dependency-install artifact builds failed with npm Exit handler never called; a separate container registry probe returned TypeError EAI_AGAIN. Environment-specific build networking is unresolved until a full artifact build passes. Existing assertions/dependencies/lockfile are not weakened to hide this. Exact-head hosted CI and actual built-image smoke remain release gates.

## Readiness and governance

Code/security regression evidence is LOCAL unless exact hosted CI is obtained. Supplied infrastructure checkpoint is founder-verified, not independently queried. Hosted customer progress NOT RUN. Proposed issue/PR/WEB71/Mission Control checkpoints are in the external evidence package when API access is blocked. No register update claimed. Do not create duplicate tasks. GO for engineering review only; NO-GO for deployment until exact hosted CI, tag/audience/source/image, identity/exposure approval, assigned URL and rollback ownership are resolved.
