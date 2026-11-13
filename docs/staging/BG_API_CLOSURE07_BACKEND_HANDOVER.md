# Closure07 — bounded source changes and independent proposal review

11 November 2026. No merge/deployment/Job/traffic/IAM/secret/shared SQL/customer/provider
operation performed. WEB and Claude's #231 source/proxy branches were not edited.

## #230 gate-on negative and positive admission tests

`test/studio-bridge.test.js`: 24 combinations of draftOFF/ON, broad-writeOFF/ON and
categoryOFF/ON for social dispatch, quote confirm and Checkout; six cross-category
checks. Only broad-writeON AND the operation's own flagON forwards to the stub.
Draft mode never substitutes for either, and one category never opens another.
Denied requests never obtain IAM or reach upstream. These are local test settings,
NOT an enabled release. The all-off/workspace-only validators still disallow paid gates.
This is bridge ADMISSION evidence; real owner/membership, quote approval and billing
permissions remain upstream, unchanged. Positive replies are labelled stub fetches,
not dispatches/checkout sessions/provider execution. No billing architecture changes.

## LinkedIn exact staging redirect (source configuration only)

Existing production default remains:
`https://getbizgenie.com/customer/social/oauth/callback/linkedin`.
New explicit option, ONLY with `BIZGENIE_ENVIRONMENT=staging`:
`LINKEDIN_REDIRECT_URI=https://staging-api.getbizgenie.com/customer/social/oauth/callback/linkedin`.

Absent/empty setting retains production default even in staging. Unknown hosts,
userinfo/ports/query/fragments/trailing slash/alternate paths and staging URI outside
staging fail `LINKEDIN_NOT_CONFIGURED` before provider exchange. Both authorization
configuration and token exchange use the SAME pinned URI; changing configuration
requires a fresh intent under the existing configuration-hash rule. Constructor
also refuses arbitrary redirect URIs. No scopes, token storage, posting capabilities,
production defaults or remote-refresh availability changed. Production remains usable
without supplying the new variable. Staging URL is NOT registered/deployed/reachable
by this source change; no real OAuth was performed. Future staged configuration must
also set the reviewed `LINKEDIN_BROWSER_RETURN_URI` to the approved Studio origin and
register the exact redirect in the platform portal under separate activation authority.
Never make private Cloud Run public to deliver an OAuth callback.

Current WEB main a7382f59e14cc8168f438fb03903bd75efe3c85f (native Git, read only)
already permits exact production/staging callback origins in premium/socialClient.js;
LinkedIn Web protocol/PKCE statements remain required. No WEB changes needed here.

Three new connector tests failed before correction, then passed. Tests cover stage
exchange pinning, production/default compatibility and hostile URL variants. Existing
TikTok/LinkedIn tests plus bridge/release focused suite:43/43 PASS. Full changed-source
suite:1,204/1,204 PASS on Node22/disposable PostgreSQL17, no skips. Closure06 unchanged
42/42 suites were not rerun separately. No actual credentials, network provider or
public delivery proof claimed.

## OAuth route completeness / dependency correction

#220 does NOT contain either `GET /customer/social/oauth/callback/:platform` or
`POST /customer/social/connections/:id/refresh`. Do not call root220 complete for the
reported99-route contract (97/99 reported at that root). These are existing features:
- Generic refresh introduced by canonical bafdbd2 (#224), incorporated in #226.
- Callback relay introduced by LinkedIn4d197ce/#227, incorporated by adapted56f7fd3
  in #228. #227/#228/#229/#230 contain both routes.
- #221/#222/#223/#225 alone contain neither. An available generic refresh route does
  NOT grant LinkedIn refresh: supportsRefresh:false /REFRESH_NOT_AVAILABLE stays.
- Callback is provider redirect without a customer bearer; completion still needs
  owner + original intent/browser verifier. It is NOT a browser-bridge write bypass.

The actual97/99 denominator is a separate broader contract from the WEB63 consumer
inventory. Verified the TWO missing registrations and exact introducing commits;
no fabricated endpoint placeholders or false full99 coverage at220. Existing full
PG integration covers callback flow; no duplicate router was added to incomplete220.
See closure07 artifact route-lineage proof. Parent ordering must include224/227 adapted
contracts before a release claims these capabilities; no PR merged or closed by overlap.

## #231 corrected proposal — exact independent review (read only)

New head796731fc31e01ba646450ee241d4a49c4ea44a8b, obtained via native Git AFTER publication.
Script SHA2565f9da0fa7cce5758527b1498cf3a0d9c01b5558f34cbbc585b0b54940799d3a0,
independently matches README. All seven original areas now have corrections; all15 submitted stub
checks pass, but the deadline cleanup guarantee remains incomplete below. Reviewed module hashes match tagged-source f1fc2f51. Evidence class now
correctly says SEPARATE_PROCESS_NEW_POOL_NOT_EXISTING_APP_POOL. No new Job is approved.

Additional independently reproduced findings require Claude changes before execution:

1. **Timeout/cleanup lifecycle — HIGH**, script104–143. Promise.race does not stop
   `work`; after timeout, late connect/metadata continuations still attempt SQL while
   rollback/release/end already ran. With stub compressed deadlines: late preflight
   runs after timeout; an acquired client attempts queries after release; a late client
   is not released while cleanup_ok reports true. A never-resolving pool.end makes
   run() outlive overallMs. Guard/cancel and quiesce work before cleanup, destroy late
   leases, and bound rollback/release/end; no further preflight query may start after
   abort. Preserve first failure and truthful cleanup status. Tests must observe AFTER
   deadline/late resolution, not only initial timeout return. These are STUB observations,
   not claims about a live pg session; production driver limits do not fix source race.
2. **Metadata output redaction — HIGH**, collect-revision-metadata.sh18. Raw startupProbe
   may include httpGet.httpHeaders values, including Authorization. The exact script
   with fake gcloud + real jq printed a synthetic header canary while correctly redacting
   the synthetic env value. No real metadata/credential leaked in this test. Emit an
   explicit allowlist of probe timing/port/path and header NAMES ONLY, never arbitrary
   nested values. Add a collector canary regression; do not run it live as-is.

Collector SHA25640d309007757f960807004772d3d0c2b45af6522f9fac80f51663706c75ba0fa.
Independent stub reproductions are preserved in closure07/231-independent-edge-review.cjs
and metadata-canary artifacts. Claude owns corrections; this review is NOT a competing
proposal and does not alter #231. Exact image/config/secret-version/CA/network parity,
budget and founder acceptance of separate-process evidence remain unresolved.
R1 catalogue replay remains accepted, not rerun; actual213 pool acceptance stays held.
No Job creation/run/delete or scope/traffic change follows from green source CI.
