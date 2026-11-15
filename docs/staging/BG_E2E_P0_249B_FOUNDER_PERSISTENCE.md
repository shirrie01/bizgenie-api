# BG-E2E-P0-249B — founder-account staging persistence

14 November 2026. Founder authorises CODE AND TEST ONLY. API baseline 1858417f0fc0d21d7211795881c0eaa7732b63d0; read-only WEB baseline 01016cc9292100ed42c81c12f02ad3a0ab673cbe. Original worktrees/branches preserved; no WEB changes or interference with #85. Neither baseline is evidence of deployed code.

## Configuration and scope

New optional server-only settings:

- `BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING`: omitted or exact `false` means OFF; only exact `true` enables. Any other supplied value fails startup without printing configuration.
- `BG_BRIDGE_FOUNDER_AUTH_USER_ID`: configured lower-case canonical UUID of the existing approved test account. Never use email, workspace name, browser state, query or caller-supplied identity. Missing ID when enabled, or malformed supplied ID, fails startup. No actual ID is checked in, logged or used in tests.

The bridge already refuses production, preview and unknown environments/targets. When this permission is enabled, every existing broad/bootstrap/draft/paid/social permission must be false or omitted; a conflicting configuration fails startup. In particular the existing `BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP` is not used. Previously reviewed independent bridge profiles are unchanged when the new permission is OFF.

Only exact combinations receive the candidate exception:

| Method | Path | Verification |
|---|---|---|
| POST | /customer/workspace/bootstrap | Existing verified Supabase identity token; unscoped new account allowed |
| PUT | /customer/workspace/onboarding | Existing verified scoped access token |
| PUT | /customer/workspace/brand-brain | Existing verified scoped access token |

The exception is admitted by route, then checked against `actor.auth_user_id` from the existing verifier BEFORE IAM retrieval, parsing or upstream forwarding. Other verified users receive 403 STAGING_WRITES_DISABLED; absent/invalid/expired tokens receive existing 401 AUTHENTICATION_REQUIRED. The exception never authenticates its own token, decodes an unverified JWT or provisions roles. A default-OFF denied write remains403 before authentication, preserving existing behavior. Query strings, trailing slashes, encodings and alternative methods cannot obtain the exception. All other writes remain subject to their unchanged OFF gates. GET/HEAD/OPTIONS, approved origins and private upstream IAM remain unchanged.

The configured account is not hard-bound to a brand named FONZO. It may modify its authorised owned workspaces through these routes; upstream current ownership/project/brand checks remain mandatory. A separate future Fonzo-only workspace binding would need additional authority. No new RLS policy, database grant, migration, tenant authority, subscription or entitlement is introduced.

## Preserved API contracts

Bootstrap accepts existing business_name, optional website_or_social_profile and primary_marketing_challenge; it creates/reuses the existing deterministic workspace and requests session refresh. It does not accept arbitrary description/user/tenant fields. Save the genuine customer description through the existing onboarding draft and/or Brain contract as appropriate; website-reference text is not customer confirmation.

Onboarding retains expected_version, idempotency_key, customer/inferred provenance, explicit completion requirements and errors. Brain retains its existing payload/version/owner-write rules. This change introduces no new Brain CAS request field; existing concurrency guarantees and limitations are unchanged. Upstream403/409/400/422/503 responses pass through, not converted to success. Input validation, bootstrap2KiB and existing save limits, rate/concurrency/timeouts and private upstream response controls remain intact. No frontend compatibility-manifest bypass or automatic capability activation.

## Tests and evidence

Synthetic IDs only. The new bridge tests cover absent/OFF/malformed settings, conflicting permissions, environment rejection, verified subject mismatch, missing/invalid/expired tokens, forged headers/body, exact URLs/methods and normalisation bypasses, all33 other current allowlisted write variants, CORS/OPTIONS/reads, size/JSON/scope rejection, rate limits, preserved upstream error envelopes and entrypoint environment wiring.

The new integration fixture owns a unique disposable local PostgreSQL database and reuses accepted migrations only there. It calls real application HTTP handlers through an in-process mock transport, not Google IAM/Supabase/live network. It creates/reuses one synthetic workspace, saves onboarding and Brain, reads both back, checks idempotency/stale409, invalid schema400, foreign-workspace403, other-subject403 before forwarding, member/revoked403 and non-resurrection on replay. Test fixture SQL writes are local only. Its disposable administrator pool exercises application authorization and persistence, not the deployed runtime role or effective RLS grants; those remain separate runtime evidence. It uses drained socket teardown and ordinary DROP of its own database. Existing regressions cover transactional revocation races and Brain concurrency; this permission does not replace their policy.

Environment: existing Node22.23.3, PostgreSQL17.11 at loopback5433, existing dependencies. No installations. `TEST_DATABASE_URL` points only to disposable local PostgreSQL. Commands:

```
node --test --test-concurrency=2 test/studio-bridge*.test.js test/customer-workspace*.test.js test/workspace-onboarding*.test.js test/customer-brand-brain-correction.test.js test/brand-brain-write-policy.integration.test.js test/customer-authentication.test.js test/authorization*.test.js
node --test --test-concurrency=2
```

Final focused results: 165/165 PASS, zero skipped/cancelled/failed, including PostgreSQL integrations. Exact full-suite counts/logs/SHA are recorded in the final publication checkpoint; never infer hosted CI from local results. Logs: /workspace/recovery/bg-e2e-p0-249b. Existing assertions/skips and migration files are unchanged. New integration suite explicitly skips only if the normal test database variable is absent; PostgreSQL-enabled execution is required evidence here.

## Review and operational boundary

Request independent Claude review of identity provenance, server configuration authority/default OFF, environment/exact-path isolation, conflicting-gate refusal, owner/RLS/CAS preservation and negative tests. Hosted exact-head CI and independent review are outstanding until confirmed; no automatic merge authorised.

No deployment, activation, Cloudflare/IAM/secret/traffic change, shared SQL/Job, live customer write, paid provider call, OAuth or Stripe operation is authorised or performed. Existing read-only/workspace-write release validators reject the new settings; they are deliberately not broadened by this source task. A separately reviewed release specification is required before activation, not permission to bypass them.

Deployment prerequisites remain UNKNOWN: serving Pages/bridge/API revision/digest/source, current gates, failed browser response, application DB/provisioner bindings, effective runtime permissions and exact rollback. Obtain metadata only through the existing authorised operator, never payloads, tokens or whole environment dumps. Configuration must bind the approved existing Supabase account without exposing its ID in public logs/docs. Production is excluded.

After green source/independent review, founder must separately approve the exact bridge SHA/digest/revision, server-side account binding and gate settings, deployment and controlled test writes. Keep all other permissions false. Actual Fonzo create→save→reload→sign-out/in and foreign fixture denial remains NOT RUN. Rollback proposal (not executed): disable the new permission or restore the recorded previous all-gates-off bridge revision, preserve API traffic and customer records, verify blocked writes and unchanged reads/OPTIONS. No down SQL or record deletion.

Launch remains NO-GO. Mission Control is the sole programme register; update existing #249 task/blocker/evidence/session/audit/checkpoint/active-closure records only after successful authenticated writes/readback. If access fails, provide SYNC PENDING handoff instead of a second register.

## BG-E2E-P0-249C — verified denial rate accounting

14 November 2026; bounded amendment to PR250 starting at99b38975e47a3b0c838c36123dcdb6e507270cd3. The founder subject denial previously preceded the existing per-user rate counter, allowing a verified non-founder to repeat denied writes without consuming its allowance. The correction moves only that denial below the existing window creation/increment/429 check, still before parsing, IAM or upstream forwarding. Existing flags, auth, owner/tenant/CAS/RLS policy and default-OFF behavior are unchanged.

Three new route-specific regressions each failed against the old code (three failures, six passes in that file), then passed with the correction. Each verifies first non-founder403, subsequent429 BRIDGE_RATE_LIMITED, a shared read/write budget, no denied IAM/upstream call, and an independent founder budget. A fourth test preserves missing/invalid token401, unrelated blocked route403 and founder allowance. Exact previously configured rate response is retained. Focused security/auth/workspace/onboarding/Brain/PostgreSQL regression result169/169 PASS, zero failures/skips/cancellations. Full-suite result and exact published amendment SHA are recorded in the checkpoint. No assertions weakened or new skips/configuration added. No WEB changes; #86 untouched.

Claude must independently re-review the amended two-line move and tests after exact-head hosted CI; author re-review is not independent acceptance. No automatic merge or operational approval follows. Deployment, gate enablement, shared/live database writes, migrations, IAM/secrets and paid operations remain prohibited; local disposable fixture writes are the only database writes made for verification.
