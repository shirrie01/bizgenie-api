# BG-SOCIAL-001 — TikTok foundation and precise stop boundary

31 October 2026. **PARTIAL IMPLEMENTATION; NOT A COMPLETE TIKTOK CONNECTOR. STAGING RED / LAUNCH NO-GO.** No live credentials, OAuth/API exchanges, uploads, publishing, deployment, shared migration, provider charges or traffic changes.

## Baseline and isolated change

Live native Git refs verified before work: main ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f; PR220 e22cbcaf981973cd2c642654a49054fd57bffce2; PR221 8864f003a4b8f23259ffbf2c817fe9beb3d91a62; PR222 d2eecc3a57e93ae37697d73417718b6d5705961d. Local previous branch bg-studio-025-social-contract was clean at b289a738. Created bg-social-001-tiktok directly from verified222, preserving original branches. Parent branch is bg-launch-001-production-composition. PR222 hosted checks could not be read: `Post "https://api.github.com/graphql": Forbidden`. Do not downgrade previously verified PASS; current exact-head CI is UNKNOWN here.

No modifications to Claude's activation/composition, Veo, preview-profile or media-acceptance files. Changes stay in social service/router, provider-neutral vault boundary and relevant tests. No new migration or competing persistence layer.

## Exact redirect URI and implemented route

**Proposed production Login Kit redirect URI:**

`https://getbizgenie.com/customer/social/oauth/callback/tiktok`

Implementing route: GET /customer/social/oauth/callback/tiktok in src/social-publishing/router.js, delegating to DurableSocialPublishing.callbackRedirect. This is locally implemented/tested only. **Not deployed, not publicly reachability-tested, not confirmed as routed to Cloud Run.** Verified ownership of getbizgenie.com does not establish backend routing. Portal configuration alone cannot make it work. Separate approval/deployment/routing/TLS and log-redaction verification must precede activation.

The route is a relay, not an unauthenticated token-exchange endpoint. It requires a configured TikTok platform and reviewed OAuth metadata, validates bounded code/state, reads an unconsumed/unexpired persisted intent by platform+state hash, and checks stored configuration hash and redirect. It returns303 to configured `oauth.browser_return_uri` restricted to HTTPS getbizgenie.com, no userinfo/port/query/fragment. Carries only code/state using URL encoding. Referrer-Policy no-referrer and existing private/no-store response headers. No exchange, connection commit or nonce consumption on this GET.

Claude's existing Connections code/state return protocol remains unchanged. The frontend must retain the verifier and intent/scope in browser session storage, obtain current bearer authentication and call existing POST /customer/social/oauth-complete. That completion still checks owner/tenant/brand, PKCE and nonce atomically, then owner membership before committing. Invalid, consumed or expired callback intent yields409 OAUTH_STATE_INVALID, with no redirect. Missing service/configuration yields503. Missing code/error-only user cancellation cannot create a connection; browser can discard its attempt, nonce expires. A relay is not proof that TikTok's particular Login Kit flow has been verified.

Callback state/code must not be logged. No source logging added; production proxy/Cloud Run/access-log query redaction and retention remain an activation prerequisite, since HTTP query parameters can otherwise be captured upstream.

## Implemented reusable token boundary

src/social-connectors/tokenVault.js exports SocialTokenVault, **default driver null and fail-closed503**. No encryption key, credential, persistence driver or live provider is installed/configured.

A reviewed driver must implement `create({reference,binding,credentials})`, `read({reference,binding})` and `revoke({reference,binding})`. Binding is strict tenant_id/project_id/brand_id/platform/account_id. Store returns only a server UUID reference. Read validates returned binding, revocation and absolute expiry before invoking an internal operation; raw provider/driver exceptions are sanitized. Revocation is idempotent under the driver's atomic binding enforcement. Credentials are an internal provider-neutral DTO (accessToken, optional refreshToken, expiresAt), **not a claimed TikTok wire schema**. Never pass this class or driver directly to HTTP clients.

The driver must provide encrypted-at-rest storage under approved key management, atomic scope checks and revocation, create-only/idempotent writes for supplied UUID, confidentiality from logs/errors, retention/deletion, recovery and expired/orphan credential cleanup. No such approved durable vault driver exists in the inspected composition, so no token persistence is activated. This wrapper does not claim a secure operational vault, rotation or provider refresh implementation.

Social connector exchange now receives additive `authorization_context` containing verified tenant/project/brand/actor/intent. Dispatch publish/reconcile receive additive `connection_binding` containing tenant/project/brand/platform/account. Existing mock adapters remain compatible; this closes the context gap that otherwise prevents a future connector from safely binding token storage/use. Existing scoped connection lookup, version/fence, expiry, rights, approval and actor-revocation checks remain in force. Vault operations require those service checks first. Revocation cannot recall a provider operation already in flight; no such cancellation guarantee is claimed.

## Why actual TikTok integration stops here

Official public sources attempted31 October:
- https://developers.tiktok.com/doc/oauth-user-access-token-management
- https://developers.tiktok.com/doc/login-kit-web

Both returned403; Login Kit retry outside sandbox also returned403. No content/current endpoint/permission/PKCE/response schema was verified. Existing repository has no TikTok wire adapter: src/social-connectors registry is empty. **Do not guess from remembered endpoint paths or extend the generic OAuth builder as if platform contracts were interchangeable.** In particular, the correct authorization parameter names and Web Login Kit PKCE rules require verification; existing generic client_id/S256 handling is not evidence of TikTok compatibility.

Founder-reported portal products/scopes: Login Kit, Content Posting API, user.info.basic, video.upload; Direct Post disabled. This describes portal configuration, not proof of granted access or an API specification. No video.publish permission requested or assumed.

Smallest unblocking evidence is the official Web Login Kit authorization/code exchange/identity/refresh/revoke contract and Content Posting inbox-upload/init/transport/status/error/creator-action contracts, supplied through an accessible official source or founder export. Include selected application type, approved scope evidence, redirect constraints and media/chunk/rate requirements. No credentials needed. Once verified, implement one TikTok registry factory/transport, normalize verified identity and token DTO into this vault, and keep flags off. No LinkedIn/Meta implementation is included.

## Draft-upload lifecycle gap: never mark a draft published

Current DurableSocialPublishing uses connector.publish/reconcile and terminal states published/failed/cancelled. Its published path requires confirmed platform publication ID, URL and published_at. That is incompatible with treating a successful **draft inbox upload** as a public post. Returning published or inventing a URL would corrupt campaign publication and Learning Brain provenance.

Smallest corrective architecture after the wire contract is verified: additive immutable operation kind draft_upload, a distinct uploaded/awaiting_creator_action terminal/read state, upload task identity/status (not publication ID), matching dispatch trigger transition and read projection, and identity/fence-based ambiguous-outcome reconciliation with no automatic re-upload. Preserve approval/revision/rights requirements and media generation/SHA pins; exclude uploaded drafts from verified_campaign_publications and performance ingestion. Explicit user action in TikTok remains required. Separately gated direct posting requires its own permission/app/product acceptance. This report does not apply a migration or add guessed TikTok status names.

Additional prerequisites: generation-pinned approved video streaming into provider upload with documented constraints, bounded chunk/byte/cancellation rules, creator UX/consent, verified account identity/scopes, vault binding and refresh CAS, durable revocation/orphan cleanup, sanitized audit records. These are precise unfinished requirements, not a claim that token boundary/relay tests complete the mission.

## Configuration and portal actions

Current implemented server settings are existing optional social platform configuration (oauth.redirect_uri, approved_redirect_uris, browser_return_uri, review metadata) and reviewed connector injection. Existing production controls SOCIAL_PUBLISHING_ENABLED and SOCIAL_PLATFORMS remain unchanged/OFF. No TikTok factory or TIKTOK_* environment variables are wired, so do not configure fictitious supported environment names. Real client-key/secret/vault references need a reviewed factory once the contract is recovered; no secret values belong in reports or source.

Founder/operator next: provide official contract evidence; confirm application review/granted products/scopes; review exact redirect above and same-origin browser return; approve a durable vault driver and dispatch-state extension; separately approve staging deployment/routing/log redaction and controlled OAuth/upload acceptance. Do not enable Direct Post, public OAuth, provider flags or shared migrations now.

## Test evidence and governance handover

Node22.23.3, existing dependencies, PostgreSQL17.11 loopback5433. Restarted existing disposable container only. Tests create/drop new UUID databases using existing fixture migration chain; no shared database accessed. Focused4/4: callback relay/config/state replay boundaries, no token exchange on public GET, scoped vault confidentiality/expiry/revocation/default-off failures. Existing OAuth integration also asserts verified authorization context. Full initial suite1025/1025 with no skips; final exact code evidence follows in JSON/report checkpoint.

These tests exercise actual new boundaries but are not TikTok API conformance, live identity, external token revocation, encrypted storage, refresh, draft upload or public reachability proof. Existing generation/ledger/worker safety tests retained. No fixture count is substituted for missing provider implementation.

Mission Control proposal only: append this partial checkpoint under existing social/R11 and BG-SOCIAL-001 authority, exact branch/SHA/tests and official-doc403; mark token boundary/callback locally implemented, TikTok wire/draft upload/real vault BLOCKED. Preserve #222 and previous verified PASS. No duplicate tasks, register IDs or live writes created. Reviewable dependent draft should target #222, explicitly partial, not ready-for-activation.

Final local validation: full1025/1025, zero failures/cancelled/skips (28.162s); separate billing/campaign PostgreSQL57/57; focused4/4; five changed JS files syntax checked; git diff --check clean. No TikTok conformance/draft-upload success is claimed.
