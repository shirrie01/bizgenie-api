# BG-SOCIAL-002 — LinkedIn member connector

Checkpoint: 31 October 2026. Staging RED; launch NO-GO. Implementation and deterministic local evidence only. No live OAuth, publishing, shared SQL, deployment or governance writes.

## Authority and integration base

Founder confirmed Share on LinkedIn and OIDC products, and portal scopes `openid profile email w_member_social`. Request only `openid profile w_member_social`; email is unnecessary. App ID 266676580 and Company Page 146913305 are not OAuth client credentials or member author identities.

Branch `bg-social-002-linkedin` is based on PR #224 at `bafdbd2afc71870748928a5bf70ae54b14c38adf`, reusing its encrypted scoped vault, journal, fencing and approval contracts. It avoids importing Claude's active media composition work. Native remote refs verified: main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`; #222 `d2eecc3a57e93ae37697d73417718b6d5705961d`; #223 `6548db571443a041a7016a7d04b272f7ca0b07fb`; #225 `9db25ee93d57577fa9a4d35963f3a21823c7789c`. Web #63/#64/#65 heads respectively `cbd2d7ce0e06cf15c6279c663b9a1a38d1a0e151`, `e4bbcf75cf2bc6b1369205d85601d72006b5cb0a`, `6d033486911958b7e0394ff2302dc42dc288681a`.

GitHub issue/comment/CI API access returned Forbidden. Native refs establish code heads, not current draft/open/check status or latest Issue #128/#191 decisions. Mission Control remains sole programme authority; its 27 October snapshot is not live-state proof. Preserve current founder decisions and append-only PostgreSQL financial authority. No pricing, credits or premium scope changes.

## Verified source boundaries

Microsoft Learn OAuth, OIDC and Share documentation returned HTTP 403, including retry. Read official SDK repositories without executing their code:

- [Python SDK](https://github.com/linkedin-developers/linkedin-api-python-client/tree/6331e52f5ea59b326447efa67a9bf925ed2d9ec7), commit 20 November 2023: README OIDC `/userinfo`; auth utilities and client authorization/code-exchange contracts. Its OIDC-capable scope helper uses spaces.
- [JavaScript SDK](https://github.com/linkedin-developers/linkedin-api-js-client/tree/e4a1fae1f829b370a339477a071d8affe0f6fd3b), commit 23 March 2023: `lib/auth.ts`, constants, OAuth utilities and `examples/create-posts.ts`. Confirms endpoints, form exchange, REST headers and historical text body. Its comma scope helper differs; use Python OIDC helper's space encoding.

These historical official sources support the wire implementation but do not establish a current Posts API version, current media contracts or a permitted member-post read API. Examples using `202302`, `/me` or `r_liteprofile` are not current application authority. No guessed API version, identity conversion or token-revocation endpoint.

## Implemented contract

Registered/intended callback: **https://getbizgenie.com/customer/social/oauth/callback/linkedin**. Route: `src/social-publishing/router.js`, `/oauth/callback/:platform`, explicitly allowlisted. Not deployed or publicly verified.

OAuth uses `https://www.linkedin.com/oauth/v2/authorization`, form POST `https://www.linkedin.com/oauth/v2/accessToken`, authenticated GET `https://api.linkedin.com/v2/userinfo`. Account identity comes from HTTPS UserInfo `sub`, never decoded unverified ID tokens, email or company-page ID. Existing owner authorization, scoped state consumption and internal S256 verifier remain mandatory. Reviewed web protocol omits external provider PKCE parameters; generic S256 remains unchanged.

Tokens and actual granted scopes are encrypted through the existing tenant/project/brand/platform/account-bound vault. Expiry and reconnect are enforced. Disconnect invalidates local vault access and is explicitly local-only; no remote revocation claim. Refresh is rejected without changing the connection because application support is unverified. Bounded HTTP timeout/response size and redirect rejection preserve confidentiality.

| Capability | Implemented state | Remaining gate |
|---|---|---|
| Member OAuth/UserInfo | Deterministic implementation | Configured vault, application credentials and approved staging test |
| Member text submission | Journaled transport implemented, disabled by default | Current reviewed Posts version, text constraint and independently verified member author mapping |
| Publication confirmation | Unavailable | Documented read/status eligibility under actual grants |
| Image/video | Unavailable | Current approved upload/post contracts and permissions |
| Company/admin/analytics | Unavailable | Separate product approval and documented permissions |
| Refresh/remote revoke | Unavailable | Application-specific documented support |

Text transport accepts only supported text-only content. An injected reviewed policy must provide `apiVersion`, `reviewRef`, `maxTextCodePoints` and an evidence-bearing `memberAuthor` resolver. Never derive a person URN by concatenating OIDC `sub`. Queue pins the reviewed contract and rejects policy drift. Business rate budgets require explicit configuration, not invented LinkedIn quotas. No new migration is introduced.

A 201 with post ID is only `accepted_unverified`; lost response is `submission_unknown`. Durable journal/reconciliation never blindly resubmits an ambiguous create, calls an unapproved post-read API, marks content published or invents a URL. Uncertain operations require an independently authorized reconciliation procedure. Local fencing cannot promise provider-side exactly-once after an ambiguous response; conservative no-resend avoids duplicate posting.

Configuration: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_APP_REVIEW_APPROVED`, `LINKEDIN_OAUTH_REVIEW_REF`, optional `LINKEDIN_BROWSER_RETURN_URI`; existing social master gates and encrypted PostgreSQL vault/key-provider dependencies also apply. Defaults remain disabled/fail-closed. Never substitute numeric portal App ID for verified OAuth client ID. Secret entry, database provisioning and activation are outside this change.

## Claude integration handover

Web #65 currently insists on external S256 for every provider. `patches/BG_SOCIAL_002_WEB65_SOCIAL_CLIENT.patch` is a reviewable proposal against exact web #65 head, not a modification of Claude's branch. It recognizes only reviewed LinkedIn/TikTok web protocols, exact origins/callbacks/state, preserves internal verifier completion and filters typed capabilities. Generic S256 stays required. Existing honest 503 behavior is already implemented and is preserved.

Claude must review/apply the patch, render unavailable capability reasons, and distinguish submitted/accepted-unverified/unknown from published. Existing TikTok uploaded/creator-action UI remains a separate inherited integration dependency. No browser E2E or integrated frontend acceptance is claimed. Composition with #225 and shared test-file changes requires Claude's normal integration review; no conflict-free claim.

## Test evidence

Node 22.23.3; disposable local PostgreSQL 17.11, loopback port 5433. Synthetic tokens/identities only.

- `node --test`: **1051 passed**, zero failed/cancelled/skipped.
- `node --test --test-name-pattern='LinkedIn' test/generation-quotes.integration.test.js test/linkedin-connector.test.js`: **9 passed**.
- `node --test test/tiktok-connector.test.js test/social-token-vault.test.js test/social-oauth-configuration.test.js`: **12 passed**.
- `node --test test/postgres-billing.integration.test.js test/postgres-campaign.integration.test.js`: **57 passed**.
- `BIZGENIE_DISPOSABLE_RESTORE_PROOF=1 node scripts/local-onboarding-restore-proof.cjs`: passed; encrypted connector/journal associations restored. Private object bytes are explicitly not backed up by this proof.
- Proposed frontend patch synthetic Node probe: both protocols, malicious URL/state/redirect/duplicate parameters, generic PKCE, retained verifier, capabilities and existing 503 passed. No actual browser/provider interaction.

Adversarial coverage includes missing grants, cross-tenant binding, callback replay, unsupported refresh without mutation, local disconnect, wrong author/org URN, unsupported media, expired tokens, lost responses, restart reconciliation without duplicate POST, queued contract drift, current campaign approval and unchanged ledger. Local evidence does not establish hosted CI or live readiness.

## Exact next owner actions / existing-register update proposal

1. Obtain current official Posts API version/constraints and authorized OIDC-sub-to-person-author relationship; obtain permitted confirmation contract or approve an explicit manual reconciliation design. No production policy is configured meanwhile.
2. Claude reviews the supplied web #65 patch and accepted-unverified UI contract, then composes with #225 without changing media ownership.
3. Obtain exact-head hosted CI through existing authorized GitHub access; no broadened credentials. Before any live test, founder separately approves isolated staging secret/schema/role configuration, deployment, callback reachability and account connection. No publishing permission follows automatically.
4. Reconcile evidence into existing BG-SOCIAL-002/checkpoint records only: code SHA, local test counts, API Forbidden, callback not deployed, member-text contract gates and frontend dependency. No duplicate Mission Control task/register or live write performed.

This is a usable OAuth/member lifecycle foundation and gated text transport, not a claim of fully verified current LinkedIn publishing or launch acceptance.
