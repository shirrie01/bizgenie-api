# BG-SOCIAL-003 — LinkedIn contract/security acceptance checkpoint

1 November 2026, Europe/London. This supplements BG_SOCIAL_002_LINKEDIN_CONNECTOR.md; it does not replace founder governance, assert deployed behavior or authorize activation. Staging RED; launch NO-GO.

## Live code evidence and access limitations

Native remote refs verified before editing:

| Source | Exact head |
|---|---|
| Backend main | ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f |
| Existing LinkedIn #227 / bg-social-002-linkedin | 4d197ce237893eca4b96301436869dca320eb1f9 |
| TikTok #224 | bafdbd2afc71870748928a5bf70ae54b14c38adf |
| Combined #226 | 5c5c3371dc4a1dc6c6332ec3938c5f6a39766759 |
| Web #65 | 727c64b278ef72920a3b59359d3a4dc60797a6a0 |

The LinkedIn checkout was clean at the verified head. All changes remain on its existing branch; no branch switches, merges, new PR, Claude branch changes or Web changes. GitHub GraphQL PR #227 and Issues #128/#191 reads returned `Post "https://api.github.com/graphql": Forbidden`. Ref access proves code heads, not live issue approvals, PR draft metadata or CI. No claim that older governance snapshots establish current decisions. No Mission Control writes or duplicate tasks.

## Contract verification matrix

Official sources below distinguish historical implementable wire contracts from missing current product/access evidence. Microsoft Learn Posts and OIDC requests failed with `curl: (56) CONNECT tunnel failed, response 403`; Posts retry outside sandbox also failed. MicrosoftDocs/linkedin and MicrosoftDocs/linkedin-docs Git endpoints reported repository not found. The official Python SDK remote remains at 6331e52f5ea59b326447efa67a9bf925ed2d9ec7 (20 November 2023); it is not a current API-version specification.

| Contract | Verified evidence / supported implementation | Unresolved gate / safe state |
|---|---|---|
| OAuth/OIDC | Official [Python SDK](https://github.com/linkedin-developers/linkedin-api-python-client/tree/6331e52f5ea59b326447efa67a9bf925ed2d9ec7): README UserInfo example, auth client and OAuth helper. Authorization-code form exchange, state, space-separated scopes, bearer UserInfo. Founder confirms OIDC and Share products. | [Current OIDC docs](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) unavailable here. Scope display is not proof of every API permission or live app approval. |
| Member identity | Authenticated `/v2/userinfo` subject binds stored account; unverified ID token/email ignored. | No verified current equivalence of pairwise OIDC subject and Posts person identifier. Never construct person URN from subject. Reviewed author resolver required. |
| Posts headers/body | Official [JS SDK](https://github.com/linkedin-developers/linkedin-api-js-client/tree/e4a1fae1f829b370a339477a071d8affe0f6fd3b), constants and create-posts example: `/rest/posts`, `LinkedIn-Version`, `X-Restli-Protocol-Version: 2.0.0`, historical text body and response `x-restli-id`. | [Current Posts docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-10) unavailable. The requested view is NOT proof that 202610 is supported. No current version configured; historical 202302 must not be used. |
| Member text create | Durable transport exists behind reviewed policy, actual `w_member_social` grant, current campaign approval and explicit publishing confirmation. | Current access tier, API version, text limits, author mapping must be evidenced before configuring policy. Default unavailable. The internal 32768 guard is not an authoritative LinkedIn limit. |
| Status/read | Journal preserves accepted reference; ambiguous creates cannot auto-resend. 201 means accepted-unverified, never public evidence. | Member read/status eligibility under actual grants unverified; do not issue guessed GET, assume read access from write scope, or fabricate public URL. |
| Image/video | Existing connector explicitly reports unavailable. | [Images](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api) / [Videos](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api): current initialization, owner, upload headers, expiry, size/format, finalization and read permissions still require authoritative evidence. No upload implementation or invented limits. |
| Organisation | Founder approved member products only. | [Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview) and organisation role/access requirements need separate approval and verification. Company Page ID is not posting authority. Disabled. |
| Expiry | Honor validated provider `expires_in`, enforce encrypted-vault expiry, reconnect required. | No hard-coded provider lifetime claim. |
| Refresh | Historical SDK has refresh helper; that is not this app's entitlement. | Application eligibility/current documentation unverified; refresh disabled without mutating connection. |
| Revocation | Local encrypted credential revocation and reconnect retirement are implemented/tested. | No verified remote revoke endpoint assumed. LinkedIn-side grant may persist; owner must remove it using LinkedIn account's permitted-app controls and verify that provider-side state independently. |
| Analytics/admin | No requested/verified authority. | Disabled; scope names or portal products do not authorize new operations. |

No additional provider functionality is enabled by this checkpoint. Missing current contracts are explicit blockers, not post-launch scope removals.

## Bounded security repair

`src/social-connectors/linkedin.js` now re-reads the bound encrypted-vault credential after asynchronous author resolution and journal creation, immediately before POST. It verifies unchanged token, unexpired credential and actual write grant; cancellation is checked again. A revoked, expired, rotated or narrowed credential cannot use the earlier decrypted snapshot. The operation journal remains conservative: a withheld request may stay unknown and is never automatically replayed.

Deterministic tests revoke/change credentials during both author and journal waits, test cancellation during each, and confirm zero outbound calls. A disposable PostgreSQL regression revokes the actual encrypted row after operation claim, confirms zero posts through worker execution/reconciliation and unchanged financial ledger counts.

This narrows the check-to-use interval; it does not make remote transport atomic with local revocation. Revocation after the final read or after request transmission cannot retract an in-flight provider operation. There is no provider idempotency guarantee asserted. Ambiguous responses remain blocked for reconciliation; automatic retry is unsafe. Existing tenant binding, owner/campaign authority, consent, vault encryption, TikTok behavior and approval safeguards are preserved. No new schema, route, scope or response-envelope changes.

## Portal and developer acceptance checklist

1. Founder/operator verifies the **existing** BizGenie app and actual OAuth client ID (portal App ID 266676580 is not substituted), Share on LinkedIn plus Sign In with LinkedIn using OpenID Connect, and current access/review restrictions. Retain dated metadata/screenshots, without credentials.
2. Exact registered redirect: `https://getbizgenie.com/customer/social/oauth/callback/linkedin` — HTTPS/static/exact-match. Backend allowlisted callback route exists; deployment and public reachability remain unverified. Do not run live reachability/OAuth as part of this checkpoint.
3. Requested scopes are `openid profile w_member_social`; portal-visible `email` is intentionally unused. Confirm actual issued grants; missing write grant still allows supported account identity but not posting. Do not request organisation, analytics, extra profile or media permissions.
4. Current configuration names are unchanged: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_APP_REVIEW_APPROVED`, `LINKEDIN_OAUTH_REVIEW_REF`, optional `LINKEDIN_BROWSER_RETURN_URI`. Existing master gates, encrypted PostgreSQL runtime, key-provider and schema preflight must be satisfied. Do not set review-approved merely because products appear in the portal. No secrets requested in chat.
5. Before enabling text submission, an authorized reviewer supplies current official Posts access/version/limits evidence, a verified person-author resolver bound to the authenticated subject, review reference and explicit business rate policy. Otherwise capability remains unavailable. No guessed API version or default resolver.
6. Only after separate founder approval of isolated staging/deployment/schema/credential/callback prerequisites: owner signs in, selects workspace, starts connection, validates state/internal verifier callback and identity, checks redacted audit and encrypted persistence. Test denial, replay, two tenants, expiry, reconnect and local disconnect. Real OAuth is not executed here.
7. Live posting requires separate explicit approval and test-account/content controls, independent of connection approval. Current deterministic mocks demonstrate boundaries only. No live posting acceptance is claimed.

## Claude integration handover

- Consume PR #227's existing stack on #224 into #226 through Claude's controlled composition. No change to Claude's current refs is made here. Shared integration-test edits need normal merge review; no claim of conflict-free composition.
- No new migration or configuration variables in BG-SOCIAL-003. Parent #224 private vault/journal/lifecycle migrations remain proposed prerequisites, never applied to shared DBs. Durable encryption keys/role/schema and staging isolation still require approval.
- Keep existing `linkedin_oidc_web` internal verifier/state completion; external provider PKCE is not invented. Review the existing BG_SOCIAL_002_WEB65_SOCIAL_CLIENT.patch against **current** Web #65 before applying: it was authored against the earlier 6d033486 head, not the current 727c64b2 head. Do not blindly apply an outdated patch. No web file is modified here.
- Render typed unavailable capabilities; local-only disconnect must not claim remote grant removal. Show accepted-unverified/submission-unknown separately from published. No public URL or verified publication evidence is returned for LinkedIn submissions.
- These source/access blockers must remain explicit in the integration checklist; Claude need not rediscover endpoints or infer unsupported contracts. A reviewer with official documentation access must supply the listed missing evidence before activation.

## Evidence and governance handoff

Local Node 22.23.3 and disposable PostgreSQL 17.11; synthetic tokens and mock provider transport only. Commands/results are recorded in the companion BG_SOCIAL_003_TEST_EVIDENCE.json. Full source/test syntax and whitespace checks are included. Hosted CI is distinct and must be checked at the pushed exact SHA; local results do not authorize GREEN.

Proposed updates only to existing BG-SOCIAL-003 / BG-SOCIAL-002 and Issue #191 checkpoints: append exact source commit, test results, unchanged callback, no schema/config change, narrowed pre-send revocation interval, explicit in-flight limitation, current-doc/API access blockers and linked PR #227. No duplicate register/task IDs. Access failures must not downgrade previously independently verified PASS evidence; this head's CI remains independently unverified until obtained.
