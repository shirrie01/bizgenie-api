# BG-SOCIAL-LAUNCH-CLOSURE-01 — TikTok and LinkedIn commercial launch readiness

24 Nov 2026. Authority: Issue #191. Base: API `main` `20951d14`, WEB `main` `50666b81`. Branch `bg-social-launch-closure-01` in both repositories (draft PRs, no merge, no deploy).
**Nothing here submits an app, connects an account, calls a provider, changes cloud configuration, runs a migration or publishes. No credential or token appears in this document.**

## 0. Verification limits (read first)
- `developers.tiktok.com` and `learn.microsoft.com` (LinkedIn docs) are **not reachable from the preparing container** (DNS refused). Provider facts below are marked **[V-search]** (seen in a web-search result; mostly third-party, official page not read), **[V-code]** (what the repository already assumes) or **[CONFIRM]** (must be read in the developer portal/official page by the founder before relying on it). Nothing marked CONFIRM is a stated provider requirement.
- "Tests passed" means deterministic tests with provider HTTP doubles or a disposable local PostgreSQL 16. It is never evidence of a genuine account connection.

## 1. Existing implementation reconciliation (Workstream A)
| Capability | TikTok | LinkedIn | Where (API) | Tests |
|---|---|---|---|---|
| OAuth initiation (owner-only, scoped, 5-min single-use intent, S256 PKCE bound to intent) | yes | yes | `social-publishing/service.js` `oauthIntent`, `oauthConfiguration.js` | `social-oauth-configuration`, `generation-quotes.integration` |
| Provider-side PKCE | not sent (TikTok Web) | not sent (OIDC web) | `authorizeURL` | `tiktok-connector` |
| Callback | API relay route `GET /customer/social/oauth/callback/:platform` (303 to fixed browser return) **and** Studio-hosted callback (WEB `oauthReturn.js`) | same | `router.js`; WEB `PremiumConnections.jsx` | WEB `oauthReturn`, `App.oauthReturn` (44) |
| State validation | hash lookup, single use, expiry, tenant/project/brand/actor binding, config hash + redirect pinned | same | `connect`, `callbackRedirect` | yes |
| Token exchange / identity | `/oauth/token/` then `/user/info/` (`open_id` must match) | `/accessToken` then OIDC `/v2/userinfo` (`sub`) | `tiktok.js`, `linkedin.js` | yes |
| Token storage | AES-256-GCM, bound to tenant/project/brand/platform/account, RLS-locked | same | `tokenVault.js`, `postgresRuntime.js` | `social-token-vault`, PG integration |
| Refresh | yes, rotating, fenced | **none by design** (no refresh grant) | `refreshConnection` | PG integration |
| Scope validation | requires `user.info.basic`+`video.upload` | requires `openid`+`profile`; `w_member_social` optional, reported as capability | `validConnection` | yes |
| Account discovery | single creator (`open_id`) | single member (`sub`); company pages **not** supported | connectors | yes |
| Status | active / expired / revoked | same + capability map | `publicConnection` | yes |
| Disconnect / revocation | local revoke + provider `/oauth/revoke/` | local revoke only (provider revoke unverified) | `disconnect` | yes |
| Publishing | **draft upload only** to creator inbox (Direct Post disabled in code and DB) | text-only member post, off unless a reviewed posting policy is supplied | `uploadDraft`, `publish` | yes |
| Media upload / status | chunked FILE_UPLOAD, status fetch, reconciliation | text only | `tiktok.js` | yes |
| Tenant isolation / audit | application-level (every query scoped); `social_dispatch_audit`; **runtime DB role bypasses RLS** (known, #191) | same | | `social-*` |
| Customer UI | `PremiumConnections.jsx`, `SendDraftToTikTok.jsx` | `PremiumConnections.jsx` | WEB | 33 + more |

## 2. Gaps found, and what was done (Workstream C)
| # | Gap | Severity | Action |
|---|---|---|---|
| G1 | **Studio-hosted callback unusable on staging.** WEB design D (`BG_OAUTH_STAGING_CALLBACK.md` §6) needs the API to accept `https://staging-app.getbizgenie.com/customer/social/oauth/callback/{provider}`; the API only accepted `staging-api` (private IAM host: a browser redirect from a provider cannot reach it) | blocker for any hosted staging connection | **Fixed (API).** New exact URI for both providers, accepted only when `BIZGENIE_ENVIRONMENT=staging` and set explicitly via `LINKEDIN_REDIRECT_URI` / `TIKTOK_REDIRECT_URI`. 9 negative cases (query, fragment, userinfo, port, look-alike hosts, other provider path, http, trailing slash, non-staging). Production defaults unchanged |
| G2 | **TikTok connection lapsed after ~1 day.** Access token ≈24 h [V-search]; the connection reported `expired`, new dispatches were refused, due dispatches failed, and nothing ever refreshed (route existed, no UI, no automation) | blocker for TikTok drafts after day 1 | **Fixed.** A due dispatch rotates the token first, as the owner who created it; a refreshable connection is accepted at schedule time (rotated at dispatch time); connection view carries `refreshable` |
| G3 | A refresh that **failed** (timeout, 429, provider error) left the connection's refresh claim set forever, so every later refresh answered `REFRESH_NOT_AVAILABLE` until the owner reconnected | blocker (found by the new test) | **Fixed.** The claim is released on failure; the vault's own fence still blocks an uncertain rotation |
| G4 | A successful refresh bumped the connection `version`, silently invalidating every queued dispatch (`connection_version` is immutable on the dispatch) | blocker for G2 | **Fixed.** Version only changes when the grant changes (scopes or token reference) |
| G5 | No customer control to renew; "Needs reconnecting" forced a full re-consent for a renewable TikTok connection | UX | **Fixed (WEB).** Owner-only **Renew** button; wording "Needs renewing" for renewable connections; new error text |
| G6 | **TikTok cannot be enabled at all (even to connect) unless video generation, media storage, a video inspector, `TIKTOK_UPLOAD_ORIGINS`, `TIKTOK_UPLOAD_REVIEW_REF`, `TIKTOK_UPLOAD_CHUNK_BYTES` are configured** (`premiumComposition.js` ~L168). Upload origins are only known from a real sandbox upload | blocker for a connection-only acceptance; coupling with Sprint10C/video work | **Not changed** (composition is shared with Codex's work). Recommended: let TikTok register for OAuth with the upload policy absent and make dispatch refuse with `TIKTOK_UPLOAD_NOT_CONFIGURED` at enqueue. ~0.5–1 day. **Founder decision needed** (see §9) |
| G7 | **Production token-vault key provider does not exist** (`envKeyProvider` refuses production; KMS design recommended in `SECURITY_DECISIONS_BG_LAUNCH_006.md` §1, not approved) | blocker for production; staging "disposable isolated" only | **Not built** (design needs founder approval; infra). ~1 day + review + restore test |
| G8 | LinkedIn: no refresh (by design); token lifetime ≈60 days [V-search]; no provider revoke; text posts only; no company pages | accepted limitation | Owner sees "Needs reconnecting"; documented |
| G9 | Publication confirmation for LinkedIn and "published" evidence for TikTok (draft only) are unavailable by design | accepted | documented |

## 3. Callback URLs (derived from code, not invented)
| Environment | TikTok | LinkedIn | Status |
|---|---|---|---|
| Production | `https://getbizgenie.com/customer/social/oauth/callback/tiktok` | `https://getbizgenie.com/customer/social/oauth/callback/linkedin` | code default; **host must serve the Studio SPA at that path** (not verified) |
| Staging, Studio-hosted (new) | `https://staging-app.getbizgenie.com/customer/social/oauth/callback/tiktok` | `https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin` | needs API `BIZGENIE_ENVIRONMENT=staging` + the `*_REDIRECT_URI` env; DNS/Pages custom domain **not verified to exist** |
| Staging, API relay | `https://staging-api.getbizgenie.com/...` | same | private IAM host; **cannot receive a provider redirect — do not register** |
Register exactly one URI per app (provider matching is exact). Use a separate developer app for staging and production if the portal allows.

## 4. Provider requirements (Workstream B)
**Account connection approval and publishing approval are separate gates.**

### TikTok
| Item | Finding |
|---|---|
| Developer app | Exists per #191 (org `BizGenie`, app `BizGenie`, production DRAFT, `getbizgenie.com` DNS-verified, Login Kit + Content Posting API selected, `video.upload` configured). **No approval evidence anywhere** |
| Products / scopes requested | Login Kit (Web): `user.info.basic`; Content Posting API: `video.upload` (inbox draft). **Not** `video.publish` [V-code] |
| Draft vs Direct Post | `video.upload` + `/v2/post/publish/inbox/video/init/` puts a draft in the creator's inbox; the creator finishes it in TikTok [V-search, official URL listed]. Direct Post (`video.publish`) is a separate audit; unaudited clients' posts are restricted to private [V-search]. BizGenie never calls Direct Post |
| Authorisation vs approval | TikTok approves the app to request scopes; each user then grants them [V-search] |
| Token lifetimes | access ≈24 h, refresh ≈365 days, refresh may return a new refresh token [V-search; matches the connector, which stores the rotated pair] |
| Rate limits | inbox init ≈6 requests/min per user token [V-search] |
| Sandbox | Sandbox target users only; rules **[CONFIRM]** |
| Review needs | Terms of Service URL, Privacy Policy URL, app icon/description/category, redirect URI, demo video covering every requested scope [V-search; exact list **CONFIRM** in portal] |
| PKCE for web | Connector sends none (TikTok web uses `state`); **[CONFIRM]** against the current Login Kit Web page |
| Upload hosts / chunk limits | **[CONFIRM]** from a real sandbox init response (`upload_url` host); the repository deliberately has none |

### LinkedIn
| Item | Finding |
|---|---|
| Developer app | **No evidence an app exists.** Needs a LinkedIn Page association and Page-admin verification **[CONFIRM]** |
| Products | "Sign In with LinkedIn using OpenID Connect" (scopes `openid profile`) and "Share on LinkedIn" (`w_member_social`); self-serve vs reviewed **[CONFIRM]** in the portal Products tab |
| Tokens | access ≈60 days; refresh tokens only for apps LinkedIn has enabled them for; otherwise the member re-authorises [V-search]. Connector assumes **no refresh** (safe default) |
| Posting | `POST /rest/posts`, `LinkedIn-Version: YYYYMM`, `X-Restli-Protocol-Version: 2.0.0`, post id in `x-restli-id` [V-code]; supported version window **[CONFIRM]**; no post read-back (publication stays "accepted, unverified") |
| Company page posting | `w_organization_social` / Community Management API — separate approval; **not claimed or built** |
| Review | Self-serve products may need no review; anything beyond needs a use-case submission **[CONFIRM]** |

## 5. TikTok developer configuration checklist (founder)
1. https://developers.tiktok.com/ → Manage apps → `BizGenie`. Confirm organisation owner.
2. Basic info: 1024×1024 PNG icon, app name, short and long description, category, **Terms of Service URL and Privacy Policy URL** (must be live on `getbizgenie.com`; footer currently shows "not set up yet" per #191).
3. Platform: **Web**; add URL/domain verification for `getbizgenie.com` (done per #191) and, for staging, the staging host if used.
4. Products: Login Kit (Web) with redirect URI = one row from §3; Content Posting API.
5. Scopes: `user.info.basic`, `video.upload` only.
6. Sandbox: create a sandbox, add the founder's TikTok account as a **target user**; keep the sandbox client key/secret separate from production.
7. Record the `upload_url` host and accepted chunk behaviour from the first sandbox init (see acceptance §8) → `TIKTOK_UPLOAD_ORIGINS`, `TIKTOK_UPLOAD_CHUNK_BYTES`, `TIKTOK_UPLOAD_REVIEW_REF`.
8. Submit for review only after the demo video exists (§6).
Environment (names only): `SOCIAL_PUBLISHING_ENABLED`, `SOCIAL_PLATFORMS`, `BIZGENIE_ENVIRONMENT`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_BROWSER_RETURN_URI`, `TIKTOK_APP_REVIEW_APPROVED`, `TIKTOK_OAUTH_REVIEW_REF`, `TIKTOK_UPLOAD_ORIGINS`, `TIKTOK_UPLOAD_REVIEW_REF`, `TIKTOK_UPLOAD_CHUNK_BYTES`, `SOCIAL_TOKEN_KEY_ID`, `SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64` (disposable staging only); WEB build: `VITE_SOCIAL_ACCOUNTS_API=true`, `VITE_SOCIAL_PROVIDERS`.
**Secrets:** client secret and encryption key go in Secret Manager (or the platform's secret store) and are injected at deploy; never in GitHub, chat, a `.env` or a screenshot. Set `TIKTOK_APP_REVIEW_APPROVED=true` only when the portal shows the products/scopes granted (sandbox use: only on the isolated sandbox revision, with a review ref that says "sandbox").

## 6. TikTok review submission draft
> BizGenie helps small businesses create and schedule marketing videos. After the business owner approves a video inside BizGenie, BizGenie uploads it to the owner's own TikTok inbox as a **draft** (`video.upload`) so the owner can review it and publish it themselves in TikTok. We read the owner's display name (`user.info.basic`) only to show which account is connected. BizGenie never posts on the owner's behalf and does not use Direct Post. Tokens are stored encrypted, scoped to the owner's workspace, and revoked when the owner disconnects. Connection requires the workspace owner to sign in to BizGenie and approve each permission on TikTok.

Evidence to attach: live Terms and Privacy URLs; demo video following `docs/activation/TIKTOK_SANDBOX_REVIEW_CHECKLIST.md` §4 (real product, real consent screen with both scopes visible, display name shown after connect, draft appearing in the TikTok app inbox, nothing posted, disconnect); screenshots of the connect and draft-sent screens. No mocked, replayed or pre-seeded footage.

## 7. LinkedIn developer configuration checklist (founder)
1. https://www.linkedin.com/developers/apps → Create app: name, **LinkedIn Page** (company page the founder administers; Page admin must verify the app), privacy policy URL, logo.
2. Products tab: request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**; record whether each is granted instantly or pending review.
3. Auth tab: add the redirect URL from §3 (exactly one); copy Client ID/Secret into the secret store (never paste them in chat).
4. Scopes the app will request: `openid profile w_member_social` (the authorize request includes `w_member_social`; if "Share on LinkedIn" is not yet granted LinkedIn will refuse the whole request — request the product first).
5. Environment (names only): `SOCIAL_PUBLISHING_ENABLED`, `SOCIAL_PLATFORMS`, `BIZGENIE_ENVIRONMENT`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `LINKEDIN_BROWSER_RETURN_URI`, `LINKEDIN_APP_REVIEW_APPROVED`, `LINKEDIN_OAUTH_REVIEW_REF`, token-vault key variables as above. Text posting stays **off** (no posting policy is supplied by environment today).
6. Set `LINKEDIN_APP_REVIEW_APPROVED=true` only once the products show as granted.

## 8. LinkedIn review/product submission draft (if a use-case form is shown)
> BizGenie is a marketing workspace for small businesses. The workspace owner signs in with LinkedIn (OpenID Connect, `openid profile`) to connect their own member profile so BizGenie can show which LinkedIn identity is connected. With `w_member_social`, BizGenie will, only after the owner explicitly approves each item, publish a text post to the owner's own feed. BizGenie does not post to company pages, does not read other members' data, and does not publish without the owner's per-post approval. Access tokens are stored encrypted and scoped to the owner's workspace, are not shared across customers, and are discarded when the owner disconnects.
Evidence: privacy policy URL, screen recording of sign-in consent → connected identity → disconnect (and, if posting is requested, the per-post approval screen). Do not record a publish until posting is separately approved.

## 9. Founder acceptance procedure (Workstream E) — no publishing, no spend
Preconditions (all founder-authorised separately): API revision and Studio release carrying branches/PRs below; provider app configured (§5/§7); secrets injected; callback host serving the Studio; test accounts are Fonzo's own.
1. **Founder authentication:** sign in to the Studio as the workspace owner; confirm the Fonzo workspace/brand is the active scope.
2. **Connect LinkedIn:** Accounts and publishing → Connect LinkedIn → consent on linkedin.com (address bar shows the LinkedIn domain; permissions shown: sign-in/profile and share) → return; the address bar is cleaned; no code or token visible.
3. **Identity:** the connected name matches the intended Fonzo LinkedIn member; open "What BizGenie cannot do yet": text post only if a posting policy exists, company page/media/analytics listed as unavailable.
4. **Connect TikTok:** same flow; consent shows `user.info.basic` and `video.upload`; display name matches the Fonzo TikTok account (sandbox target user while in sandbox).
5. **Status:** both show Connected with a renewal date; a second owner-less member sees them read-only.
6. **Permissions:** confirm no extra scope is shown on the provider consent screen.
7. **Refresh:** TikTok → **Renew** → "was renewed", new date; LinkedIn shows no Renew (expected: reconnect when the permission ends).
8. **Draft preparation:** prepare (do **not** send) a TikTok draft for an approved video item; confirm the "send as draft" control describes a draft and nothing is sent; do not tick the confirmation. LinkedIn: confirm no publish control exists.
9. **Disconnect:** disconnect each; status Disconnected; for TikTok confirm in TikTok's settings that the app no longer has access; reconnect attempt works from clean.
10. Record: screenshots (redacted), timestamps, API revision + WEB build id → Issue #191. A pass is "genuine account connection verified"; it is **not** publishing verification.

## 10. Readiness matrix (Workstream F)
Legend: ✔ done · ✖ not done · ? unknown/unverifiable from here.
| Gate | TikTok | LinkedIn |
|---|---|---|
| Code complete (connect, status, refresh, disconnect) | ✔ (draft upload only) | ✔ (login + status; refresh none by design) |
| Code complete (publishing) | ✔ draft upload; Direct Post intentionally absent | ◐ member text post exists but is **off** (no posting policy) |
| Automated tests passed (doubles / local PG) | ✔ | ✔ |
| Hosted route available | ✖ (no hosted callback evidence; G1 fix not deployed; staging-app DNS ?) | ✖ same |
| Provider configuration complete | ✖ (icon, legal pages, redirect, upload origins outstanding) | ✖ (no evidence an app exists) |
| Provider approval complete | ✖ (none evidenced) | ✖ (none evidenced) |
| Genuine account connection verified | ✖ | ✖ |
| Publishing verified | ✖ (and TikTok is draft-only) | ✖ |
Enablement blockers in code: G6 (TikTok coupled to video), G7 (production key management). Mocked tests are **not** counted anywhere in the "genuine connection" rows.

## 11. Test results (this branch)
- API: social unit suites 27/27 + new `social-staging-studio-callback` 1/1 (9 negatives × 2 providers); PostgreSQL 16 integration `generation-quotes.integration` 65/65 including 2 new tests (dispatch-time rotation incl. failure + recovery + version stability; refreshable vs non-refreshable enqueue/status); full `node --test` 1182 pass / 0 fail / 2 skipped (PG-only files skip without a database). Not run: PG17-only billing test (asserts PG17).
- WEB: vitest 1597 passed / 52 skipped / 0 failed (baseline unchanged), build OK; new tests for Renew button and `refreshConnection` client.

## 12. Remaining external dependencies and effort
| Dependency | Owner | Notes |
|---|---|---|
| Live Terms + Privacy on `getbizgenie.com` | Founder + adviser | needed by both providers [CONFIRM] |
| TikTok icon/metadata, sandbox, target user, review + demo video | Founder | review lead time unknown **[CONFIRM]** |
| LinkedIn app + Page verification + product grants | Founder | lead time unknown **[CONFIRM]** |
| Callback host serving the Studio (prod `getbizgenie.com`; staging `staging-app` DNS/Pages domain) | Founder | not verified |
| Secret Manager entries, env, API revision, Studio release | Founder / separately authorised | |
| G6 decoupling decision; G7 KMS design approval | Founder | |
| Dedicated least-privilege DB role (BYPASSRLS runtime role) | Engineering | #191, before a second customer |
Engineering estimate (excluding provider review waits): G6 0.5–1 day; G7 ~1 day + review + restore test; hosted staging connection run ~0.5–1 day after configuration; LinkedIn posting policy (if wanted) 1–2 days after product grant. Provider approval durations are not known and are not estimated here.
