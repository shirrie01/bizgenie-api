# Integration candidate and readiness matrix (BG-LAUNCH-005)

31 Oct 2026. **Staging RED. Launch NO-GO.** Nothing here authorises a merge, deployment, shared-database migration, live OAuth, publishing or paid generation. "Proven" means proven by deterministic tests or hosted CI with labelled stand-ins for provider HTTP; it never means a real provider was called.

## Update 1 Nov 2026 (BG-LAUNCH-006)
Superseded or added since the matrix below: the draft-upload journey was rehearsed in a real browser with the TikTok stand-in (not acceptance); two real faults found and fixed (the Studio refused TikTok's authorize URL because it demanded PKCE parameters TikTok does not use; the Studio could not send an item to a connected account because the variant DTO hid its destination key and no screen bound an item to a connection or offered "send as a draft"); failure recovery proven end to end (TikTok FAILED, worker death mid-upload then restart with no second init or upload, unapproved upload origin, revoked connection, withdrawn asset); the decoder is H.264-only; a USD guard sits beside the credit cap. The acceptance procedure, verified Google pricing, the proposed US$5.00 ceiling, the security recommendations and the TikTok review checklist are in `STAGING_PROVIDER_ACCEPTANCE.md`, `SECURITY_DECISIONS_BG_LAUNCH_006.md` and `TIKTOK_SANDBOX_REVIEW_CHECKLIST.md`. The "Blocked" list below is unchanged except that "TikTok upload origins" now has a route to being learned (the sandbox run).

## 1. The candidate
| Part | Branch | Exact SHA | Basis |
|---|---|---|---|
| **API integration candidate** | `bg-launch-005-integration` (no PR; CI by workflow_dispatch) | see the PR report | merge of #224 `bafdbd2a` into #225 `9db25ee9`, plus the interface work in section 3 |
| API chain | #220 `e22cbcaf` -> #221 `8864f003` -> #222 `d2eecc3a` -> #223 `6548db57` -> #225 `9db25ee9` | | each green on its exact head |
| TikTok (Codex) | #224 `bafdbd2a`, base #222 | | green; branch untouched. #224 and #223/#225 are siblings on #222, so the integration branch is the first place they meet |
| Web chain | #63 `cbd2d7ce` -> #64 `e4bbcf75` -> #65 (`727c64b2`) | | |
Merge conflicts found: none textually (the only overlapping file, `test/generation-quotes.integration.test.js`, auto-merged). Semantic conflicts found: section 3.

## 2. Readiness matrix
### Proven (deterministic tests and hosted CI; provider HTTP is a labelled stand-in)
| Capability | Evidence |
|---|---|
| Quote -> confirm -> reserve -> worker -> settle, single provider call under concurrent workers, one debit | `premium-composition-worker.integration.test.js` |
| Veo output measured from real bytes; invalid output fails the job, no asset, nothing charged | same file (audio, aspect, duration, VP9, truncated, corrupt) |
| Generated images measured from bytes before storage | `image-inspection.test.js` |
| Unsuitable media cannot reach preview, approval or schedule; customer sees why | `platform-media-profiles.test.js`, web `CreativePreviewCard` tests, browser 8/8 |
| **Validated Veo video -> approved -> scheduled -> TikTok DRAFT in the creator's inbox; stored as `uploaded`, never `published`; exact stored bytes uploaded; upload URL never receives the bearer token; Direct Post never called** | `TikTok draft upload end to end` (this branch) |
| Credentials encrypted AES-256-GCM, bound to tenant/project/brand/platform/account, tamper-evident, unusable the moment the owner disconnects; no secret in any customer-facing value or error | same |
| Media source gives bytes to nobody else (other tenant/brand, other revision, extra asset, changed object, re-measured bytes no longer valid) | same |
| Encryption-key configuration fails closed before any OAuth exchange (missing/short/weak key, production, missing upload policy or origins, unreviewed app, no validated video) and never echoes the key | same |
| In-product spend ceiling: with exactly one image + one video of credits, a third job is refused before any provider call | same file |
| Customer uploads: quarantined until structure, decode and scan pass; scanner down or slow stays quarantined; a hit is rejected with no asset; `UNSCANNED` is never accepted outside disposable staging | same file, `clamd-scanner.test.js` (protocol stand-in) |
| Production image: pinned toolchain, non-root, startup self-test fails closed when hardened isolation is unavailable | CI "Production image" steps |
| Migrations additive-only, ordered, credential tables RLS-locked with no role grants, draft cannot be a publication | `scripts/rehearse-migrations.js` in CI on the disposable PostgreSQL 17 service |
| Studio shows a TikTok draft as a draft the creator must finish, never Published or platform-confirmed, with no cancel | web unit tests + real-backend browser acceptance against the merged backend |

### Blocked (code or design cannot proceed without a decision or an environment)
| Item | Why |
|---|---|
| Hardened (bubblewrap) isolation | Not established under any container profile CI could try (errors recorded in #225). Video generation therefore stays disabled in production by the startup check |
| Production token-vault key management | Only an environment-variable provider exists and it refuses production. A KMS-backed provider needs a founder-approved key-management design (also retention of old keys, rotation, backup, recovery) |
| Retention of revoked credentials | Revoked rows keep their ciphertext and audit history indefinitely; no purge exists. A retention rule is a policy decision |
| Real malware scanner | Adapter and quarantine are ready; no ClamAV (or other) service is deployed. Uploads stay off |
| TikTok upload origins and chunk plan | The reviewed values (`TIKTOK_UPLOAD_ORIGINS`, `TIKTOK_UPLOAD_CHUNK_BYTES`) come from a real sandbox run; none is invented here |
| TikTok public callback | `getbizgenie.com/customer/social/oauth/callback/tiktok` is implemented but not deployed; app review incomplete |
| Platform media limits | Instagram/Facebook/LinkedIn/TikTok limits are operator-configured, unverified against current documentation (hosts blocked from this session) |
| Hybrid UGC | Post-launch, pending founder confirmation |
| LinkedIn, Instagram, Facebook connectors | Not implemented |

### Missing credentials or environment
Disposable PostgreSQL 17; isolated Supabase project (the two existing projects hold data and are not to be used); Google project with Veo 3.1 access, private bucket, service account; OpenAI restricted key; Stripe test key; TikTok sandbox client key and secret; outbound network to `api.openai.com`, `api.stripe.com`, `docs.cloud.google.com` and the TikTok hosts from the demo machine.

### Founder approvals required
1. The toolchain pins (`pinned_to_production_base_image_pending_security_review`).
2. Where hardened isolation runs, or acceptance of container-as-sandbox for the first customers.
3. Scanner: defer uploads (recommended) or deploy one.
4. Key-management design and the revoked-credential retention rule.
5. A USD ceiling for the demo, computed from the provider price pages once supplied.
6. Using an isolated staging database for migrations (the repository migrations are additive; nothing has touched either Supabase project).
7. A TikTok sandbox draft-upload run with a test account.

## 3. Interface and contract mismatches found and resolved (no test disabled, no security bypass)
| Mismatch | Resolution |
|---|---|
| The composition called connector factories with `{env,pool,logger,now}`; the TikTok factory needs a vault, a provider journal, a media source and a reviewed upload policy | The composition builds all four from validated configuration and fails startup before any OAuth exchange if one is missing |
| The connector's `mediaSource.loadApprovedVideo/revalidate` had no implementation | `approvedVideoSource.js`, on the private media authority; reuses the Veo rules and the TikTok media profile |
| The Studio dropped the new `uploaded` state, so a draft vanished from the list and calendar | The web client, list and calendar now show a draft awaiting the creator; never Published |
| Two parallel branches both modify the social registry and the quote test | Merge verified; the registry now holds only Codex's TikTok factory |
| Pre-existing Veo/upload assumptions about env-only bubblewrap | Unchanged; documented as blocked |

## 4. Minimal real-provider staging acceptance sequence and bounded spend proposal
**A. Media (paid).** Preconditions: section 2 "missing credentials" for Postgres, Google, OpenAI and the network; `npm run staging:preflight` all PASS. Run the web `qa/real-backend/run.sh` with `RB_PROVIDERS=real`, `RB_APPROVED_SPEND_USD=<approved>`, `RB_DEMO_CREDITS=8`. It performs one real 1080-class image and one real 4 s Veo fast video, then the Studio review, approval and calendar journey. Evidence: screenshots, the served MP4 with its `ffprobe` output, the two ledger rows per job, the `media_assets` rows, the provider consoles' own usage.
**Bounded spend proposal (not authorised):** at most **2 paid jobs and 8 credits**, enforced by the product before any provider call (and by the harness). The **USD ceiling is not stated** because provider prices could not be read from the preparing session; it is `4 s x Veo-fast price + 1 x image price`, to be computed from the supplied price pages and approved by the founder with a stated headroom for one retry. Provider-side limits (OpenAI project limit, Vertex quota) are defence in depth only.
**B. TikTok draft (no spend, external account).** After A and after the callback is routed: connect a TikTok sandbox test account, upload the Veo video from A as a draft, confirm it appears in the test creator's inbox, then disconnect and confirm revocation. Needs founder approval, test-account credentials and the reviewed upload origin and chunk values. Direct Post stays disabled.
**Stop conditions:** any unexpected provider call, any job beyond the cap, any unrecognised host, any rejected-by-validation output is investigated before continuing.
