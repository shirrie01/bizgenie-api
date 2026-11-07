# BG-STAGING-P0 — Customer workspace connectivity

6 November 2026. Status: BLOCKED hosted acceptance. No deployment, IAM/DNS/traffic/secret change or customer database write performed.

## Evidence and limits

| Item | Verified finding |
| --- | --- |
| Browser evidence (founder supplied) | Pages origin `https://bizgenie-studio-staging.pages.dev`; API `https://staging-api.getbizgenie.com`; workspace preflight lacks Access-Control-Allow-Origin; UI Failed to fetch. |
| Local live probe | OPTIONS with exact Origin, requested GET and authorization,content-type was attempted. Environment egress proxy rejected CONNECT with403, server envoy, curl56. Same result outside sandbox. This is NOT the destination's OPTIONS status or Cloudflare/Google evidence. Frontend GET likewise blocked before destination. |
| Confirmed code defect | BG016 bridge pinned only staging-app.getbizgenie.com; the confirmed Pages origin is rejected403 before CORS headers. This would explain the browser symptom IF that bridge serves the API domain. Actual deployed serving component remains UNKNOWN. |
| Backend CORS | Existing middleware already accepts exact configured origins through CORS_ALLOWED_ORIGINS; it requires CORS_ENABLED=true. Wrong/absent configuration can produce the same missing header. No backend middleware widening is required. |
| Cloud Run | Private ingress can reject unauthenticated OPTIONS before application code. Adding backend CORS alone cannot fix that. Actual ingress/auth/routing of this custom domain is UNKNOWN. Do not make the private API publicly invokable. |
| Routes | Existing GET /customer/workspace discovers membership/workspaces using verified identity (including fresh unscoped identity). Existing POST /customer/workspace/bootstrap creates/reuses the workspace. They are complementary, not substitutes. |
| Versions | Remote BG016 c65e62990d686e8254929aaeb4b23f14b39c01d8; #226 f1fc2f51502793d9fb03617f30fd72b5a61c1e2e; Web #68 433c898d9f087e44e00f272db3ad0565d84479f7 verified by native Git. Actual deployed frontend build/backend revision/digest UNKNOWN. API main ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f and web main8310e1d157057b96d312d0e41a86a3119942edf6 were observed remotely; neither proves deployed version. |
| Publication | GitHub issue191 API read returns Forbidden. No issue/register update claimed; live Mission Control unavailable. |

## Smallest staging correction

Bridge now selects ONE exact approved origin via BG_BRIDGE_STUDIO_ORIGIN. Permitted values: existing https://staging-app.getbizgenie.com or confirmed https://bizgenie-studio-staging.pages.dev. Omitted value preserves previous default. Wildcards, preview subdomains and arbitrary Pages sites fail closed. Set BG_BRIDGE_STUDIO_ORIGIN=https://bizgenie-studio-staging.pages.dev in the reviewed STAGING bridge runtime only. Production targets, wrong principals, privileged headers, token verification, rate/size limits, independent write gates and tenant checks are unchanged.

If API domain already routes to a trusted bridge, confirm its exact source first: a new staging bridge deployment is needed for this code if it is not present. Config alone suffices only if the serving implementation already supports the origin. If domain routes directly to private Cloud Run, route it through the approved server bridge under a separate approved operational change; do not expose backend or send IAM tokens to browsers. If Cloudflare rejects OPTIONS before the bridge, repair only its staging routing/Access policy based on captured evidence. No infrastructure failure is guessed from the Chrome error.

The bridge handles browser preflight without IAM calls, authenticates the customer's Supabase session on real requests, forwards original Authorization plus server-only X-Serverless-Authorization, and uses only the reviewed staging invoker and private tagged target. Backend remains private. Browser base remains the confirmed staging API domain only if it resolves to that reviewed bridge; do not change frontend path to bootstrap as a CORS workaround.

## Local checks

Node22.23.3, existing PostgreSQL17 disposable fixtures only. Full suite: 1,146/1,146 PASS; focused connectivity: 26/26 PASS; zero failures/skips/cancellations. Syntax and diff checks PASS. Logs: /workspace/recovery/bg-staging-p0/full.log and focused.log. Focused connectivity includes exact Pages GET/POST preflight, real API configured-origin middleware, absent-auth401 with readable CORS headers, authenticated forwarding, foreign origin rejection, independent bootstrap write gate, production rejection, and entrypoint environment selection. Existing real-router PostgreSQL test covers bootstrap replay (same workspace), session refresh and revocation. Google IAM, Supabase verification/admin propagation and providers remain deterministic standins; these are not deployed tests.

No test created SM Properties. Actual exactly-once creation and Step2→Step3 remain NOT RUN. Existing repository bootstrap uses stable per-user IDs, transaction advisory lock and conflict-safe insert; it does not restore revoked membership. Do not bypass the API or manually insert a workspace to pass acceptance.

## Operator evidence and acceptance sequence — no secret handoff

1. In Chrome Network, preserve log; repeat the failing Step2 action once. Capture OPTIONS and actual request method, request Origin, Access-Control-Request-Method/Headers, status, response headers, redirect chain and final destination. Redact Authorization/cookies/body/personal data from evidence. Do not export an unredacted HAR.
2. Run the read-only commands in scripts/staging/workspace-preflight-readonly.sh from an authorised network. They do not send tokens, follow redirects or create anything. 204 with exact ACAO and required allow headers is necessary; a302/403/404 is not success. Compare public response with staging-only edge/bridge logs and private API logs to locate rejection. DNS/Cloudflare origin route, Cloud Run identity/revision/source/traffic must be inspected as metadata, not inferred from server headers alone.
3. Record deployed Pages deployment ID/Git SHA/API build configuration and serving bridge/API revision/source SHA/image digest. Review resource-only staging invocation and pinned target; retain private backend. Keep production untouched. No new migration is needed by this patch.
4. After approved staging-only correction and deployment, repeat browser OPTIONS GET /customer/workspace and POST /customer/workspace/bootstrap. Both must204, exact ACAO Pages origin, authorization/content-type allowed, no redirects. Invalid/no bearer actual GET must401 with readable ACAO; a valid session must reach actual GET route and receive its documented workspace response, not HTML.
5. Founder/customer controlled authenticated acceptance only: use existing account, inspect GET response first. If workspace exists, select/resume it. Otherwise submit bootstrap once through Studio with SM Properties values; await response, refresh Supabase session if requires_session_refresh, then GET workspace. Verify stable tenant/project/brand IDs and one workspace after retry/resume; no manual SQL, alternate creation endpoint or entitlement grant. Capture only redacted association evidence. Confirm Step2→Step3 and isolation. This writes staging and was NOT executed here.
6. Abort on production target, unverified deployment, auth bypass, wildcard origin, IAM token in browser, duplicate workspace, lost scope or unexpected billing/provider activity. Roll back only the approved staging bridge configuration/revision, preserving customer data and retained backend traffic. Do not delete/recreate workspace or reset credits.

## Required approval and next step

Operational deployment/edge routing is not authorised by this code work. First obtain the missing hosted trace and exact serving versions. Then approve the minimal staging bridge config/deployment (and edge routing only if evidence requires it), preserving private Cloud Run, followed by one controlled authenticated SM Properties bootstrap/resume test. No promotion or production action is included. Until browser acceptance succeeds: staging RED, customer connectivity BLOCKED.

## Proposed existing-register updates (not written)

Append BG-STAGING-P0 evidence to existing integration task/checkpoint and blocker: code origin mismatch repaired/tested; hosted root layer/versions unknown; live trace blocked by environment CONNECT403; deployment/SM Properties acceptance NOT RUN. Update existing EVIDENCE_REGISTER, CHECKPOINT_INDEX, TASK_REGISTER, LAUNCH_BLOCKERS and SESSION_LOG using reconciled existing IDs, without replacing history or creating duplicate tasks. GitHub issue191 proposed comment is in the external recovery evidence directory.
