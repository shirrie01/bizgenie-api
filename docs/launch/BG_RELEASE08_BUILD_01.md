# BG-RELEASE08-BUILD-01 — E1 build execution, A0 readiness and scanner revision (operator runbook)

25 Nov 2026. Authority: #191 comment 7175314064 (E1 approved, E2 approved, E3 **deferred**, E4 approved, D1–D6 retained with D5 deferred). Governing runbook: `BG_FOUNDER_RELEASE_08_ACTIVATION.md` at `220f57b5…` §5–§9. **Locked source:** API and bridge `dfd49116a0fe6bde11dbc25ca4599a03b8046999`; WEB `18119b3fd9eec2283ab4f8910848dfda81c49dc0`. No LinkedIn secrets, token vault, TikTok, Stripe, publishing, paid generation, broad IAM, Auth-admin writes, unscanned upload or Sprint10C change is performed or enabled by anything below.

## 1. What was executed here and what was not
| Item | Result | Evidence class |
|---|---|---|
| E1 published images | **NOT EXECUTED.** This session has no credentialed Google Cloud account, so nothing was pushed to Artifact Registry and no real `image@sha256` exists yet. The ONE consolidated script is §3; every digest printed by tests below is a stub value and must not be used | — |
| Exact-SHA export | `git archive dfd49116…` into a clean directory; no `.git`; secret scan clean (private-key/cloud/GitHub/Slack/Stripe-live patterns) | VERIFIED locally |
| **Bridge image** (`Dockerfile.studio-bridge`) | built locally from that export (local daemon, sandbox CA shim only, not publishable); **`scripts/staging/smoke-studio-bridge.sh`: PASS** (non-root, preflight before auth, no-token denial, origin denial, write gate) | VERIFIED locally |
| **A0-configured bridge container** (same build, A0 env) | the §6 smoke checks all PASS against it: preflight 204, foreign origin 403, no token 401, bootstrap 403, asset write 403, **workspace permission active (401 at auth, not 403)** | VERIFIED locally |
| **API/worker image** (`Dockerfile`) | local build **not possible here**: the Debian archive hosts are outside this sandbox's network allowance, so the pinned media toolchain (`ffmpeg 7:5.1.9-0+deb12u1`, `bubblewrap 0.8.0-2+deb12u1`) could not be verified. **Risk:** the Dockerfile fails closed if Debian has superseded those pins. The §3 script checks this first and stops before any build or push | NOT VERIFIED |
| WEB `studio-staging-release.yml`, `deploy=false` for `18119b3f…` | **PASS** — run `45707139253`: `build-verify` success (checked-out commit equals requested SHA, `npm test` **1622 passed / 52 skipped**, build, `smoke-pages: PASS`), `deploy` job **skipped**; artifact `studio-staging-dist-18119b3fd9eec2283ab4f8910848dfda81c49dc0` retained 30 days (its dist sha256 is in the run's step summary). Nothing was deployed | VERIFIED (hosted) |
| A0 manifest builder + Release 07 validator | script tested with synthetic ids and stubbed cloud reads: **success path** returns `OFFLINE_FOUNDER_WORKSPACE07_VALIDATED_NOT_DEPLOYMENT_APPROVAL`; **four fail-closed paths** (bridge digest drift, wrong fingerprint, missing/untagged API revision, reused evidence) stop. The REAL private manifest was **not** produced: the private ids and the tagged API revision do not exist for this session | VERIFIED (script), real manifest NOT PRODUCED |
| Scanner revision spec | patch tool tested on a sample export; refusals proven (§7) | VERIFIED (tool) |

## 2. Genuine blockers and the single next action
1. **E1 needs your credentialed Cloud Shell** (§3). It is one script, one paste.
2. **Pinned toolchain availability** — decided by §3 step 3 in about one minute. If the pins are gone the script stops with the archive output; building from another commit or editing the pins needs a new reviewed change, which this authorisation does not cover.
3. **WEB cannot yet present the Fonzo journey from the accepted source (found while inspecting the exact workflow).** `studio-staging-release.yml` always builds with `VITE_SOCIAL_PROVIDERS=tiktok`, sets `VITE_API_ROUTE_LIMITS=bridge-v1` for the bridge origin (which blocks copy editing), and does **not** set `VITE_API_ROUTE_LIMITS=bridge-founder-release04`, `VITE_API_SOURCE_SHA`, `VITE_API_SERVING_REVISION`, `VITE_COPY_EDIT_API`, `VITE_CONTENT_PLAN_API`, `VITE_CUSTOMER_MEDIA_INTAKE_API` or `VITE_FOUNDER_CAMPAIGN_ROOT_API`; and `src/premium/apiCompatibility.js` ships an empty manifest, so every gated feature stays OFF. Deploying `18119b3f…` as is would change nothing the founder can use. A0 (curl) is **not** affected; A1 onwards needs the Studio. **Minimal fix (not built; needs your authorisation and independent review, about 0.5 day):** (a) a `route_profile` workflow input (default empty = today's behaviour) that, for the bridge origin, sets the release04 profile, the two API identity variables and the feature flags above with `VITE_SOCIAL_PROVIDERS=` empty (LinkedIn deferred); (b) one manifest entry for the exact pair (API SHA `dfd49116…`, the new API revision name) with capabilities `contentPlan`, `copyRevisions`, `workspaceCalendar`, `founderCampaignRoot` (and `mediaIntake` only after A2). The WEB SHA to deploy then differs from `18119b3f…`; this is intentional and must be an accepted merge, not a floating build.
4. Not blockers: deferred E3 items; scanner (E4) only gates artwork intake; Sprint10C stays HOLD.
**Single next founder action:** open Cloud Shell, paste the §3 script, and paste its `E1 RESULT` block into #191.

## 3. E1 — ONE consolidated build, smoke, publish and digest-readback script (tested)
Tested here end to end (real git export of the exact SHA, real bridge build, real smoke test; registry, digest and the API build simulated): success path prints the result block; superseded-toolchain path **stops before building or pushing**; a provenance mismatch stops. It never deploys or touches traffic; it pushes **only** unique `release08-e1-…` tags to the existing `cloud-run-source-deploy` repository and reads the digests back from the registry.
*(script now lives at `scripts/release08/e1-build.sh`, tested by `test/release08-a0-scripts.test.js`; it is not duplicated here)*

## 4. A0 — sequence (each step gates the next; the founder personally makes the workspace request)
| # | Step | Command / gate |
|---|---|---|
| 1 | E1 | §3 → `API_REF`, `BRIDGE_REF` |
| 2 | API revision, **no traffic**, tagged (`a0-dfd49116`) | `bash a0-deploy.sh api` (§5). The bridge reaches the API through the tagged URL, so API serving traffic never changes |
| 3 | Post the tag-to-revision readback in #191 | gives `EV_TAG` |
| 4 | Private manifest + validation | `bash a0-prepare.sh` (§5): baseline guards, hidden prompts, fingerprints, Release 07 validator |
| 5 | Bridge A0 revision, **no traffic**, tagged | `bash a0-deploy.sh bridge` |
| 6 | Smoke on the tagged bridge | `bash a0-smoke.sh` (§6) must print `A0 SMOKE: PASS` |
| 7 | **A0 readiness checkpoint — STOP.** Evidence in #191 (image digests, tag readbacks, smoke, validation status, rollback digests) | founder confirms |
| 8 | The only traffic change | `bash a0-deploy.sh shift-bridge` |
| 9 | Founder's single workspace request (`BG_FOUNDER_RELEASE_08_ACTIVATION.md` §6 A0 request; hidden-prompt token; key `fonzo.workspace.v1`) | founder |
**Rollback targets (recorded, digest-checked by the scripts):** bridge `bizgenie-studio-bridge-staging-step7-c023184c` `sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18`; API `bizgenie-api-staging-00029-wtc` `sha256:e443d4bc136c79080f6535f78a7fb72a03d69a6ea39b91473ee3d84e240f7ae2`; Studio Pages `e312dee7-f3d4-44e8-be5f-e615db91b7e6` (`ce8694e1c5cc47849d8f2b9f8b7bf7169949248e`). Nothing is deleted. Bridge rollback: `bash a0-deploy.sh rollback-bridge`. **Rollback never restores identity scope**: after Fonzo creation use the activation runbook §8 restore (recovery fingerprints: founder `d5a6f5ec`, tenant `7129d2ba`, project `b321c195`, brand `01e15c41`).
**Safeguards built into the scripts:** abort if the serving bridge/API drifted from the recorded revisions or digests; abort if a new revision would inherit a latest template whose env names differ from the serving one; abort if the serving bridge has secret-backed env (the env file replaces all variables); abort if the tagged API revision is not Ready-at-0%, not tagged, or its digest differs from `API_REF`; verify serving traffic is unchanged after each tagged deploy and print the exact rollback command if it is not; the single traffic change is a separate command.

## 5. A0 scripts
**`a0-prepare.sh`** — builds and validates the private manifest (read-only on cloud; writes two private mode-600 files outside git; prints statuses and 8-character hashes only):
*(script now lives at `scripts/release08/a0-prepare.sh`, tested by `test/release08-a0-scripts.test.js`; it is not duplicated here)*
**`a0-deploy.sh`** — tagged deployments, the single traffic shift and the rollback:
*(script now lives at `scripts/release08/a0-deploy.sh`, tested by `test/release08-a0-scripts.test.js`; it is not duplicated here)*

## 6. A0 smoke checks (tested against a real bridge container built from `dfd49116…` with the A0 profile)
*(script now lives at `scripts/release08/a0-smoke.sh`, tested by `test/release08-a0-scripts.test.js`; it is not duplicated here)*

## 7. E4 — real ClamAV scanner revision (specification ready; not applied; intake stays OFF until acceptance)
Follows `BG_FOUNDER_RELEASE_08_ACTIVATION.md` §9: sidecar `127.0.0.1:3310`; `StreamMaxLength`/`MaxFileSize` 33M with `AlertExceedsMax yes`; instance-based billing (CPU always allocated) so the signature updater runs; TCP startup probe; `container-dependencies`; sidecar 1 vCPU / 3 GiB; `min 1 / max 2`; the API refuses a signature database older than 72 h and fails closed.
**Image (public tag list, 25 Nov):** `clamav/clamav:1.4.7`, index digest `sha256:ac15046e610610347c459afabea6683a52cd041c7a10adf5f050ebb05525d62d` (amd64 `sha256:ae2405b10591b9a707ff4ae84da4e40c774ee0eecfe61a24316708ce6def79f2`). Mirror it by digest, then use the registry digest:
```bash
SRC='clamav/clamav:1.4.7@sha256:ac15046e610610347c459afabea6683a52cd041c7a10adf5f050ebb05525d62d'; REPO=europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy
docker pull "$SRC" && docker tag "$SRC" "$REPO/clamav:1.4.7-e4" && gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet && docker push "$REPO/clamav:1.4.7-e4"
CLAMAV_REF="$REPO/clamav@$(gcloud artifacts docker images describe "$REPO/clamav:1.4.7-e4" --project=bizgenie-backend --format='value(image_summary.digest)')"; echo "$CLAMAV_REF"
# T1 container contract (local, before any deployment): publish 3310 on loopback ONLY for this local test, wait for readiness, run the acceptance probe from a checkout of dfd49116
docker run -d --name clamd-t1 -p 127.0.0.1:3310:3310 -e CLAMD_CONF_StreamMaxLength=33M -e CLAMD_CONF_MaxFileSize=33M -e CLAMD_CONF_MaxScanSize=64M -e CLAMD_CONF_AlertExceedsMax=yes -e CLAMD_CONF_TCPSocket=3310 -e CLAMD_CONF_TCPAddr=0.0.0.0 "$CLAMAV_REF"
until node -e 'require("node:net").connect(3310,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))'; do sleep 10; done
CLAMD_PORT=3310 node clamd-acceptance.js     # the 5-check probe in BG_FOUNDER_RELEASE_08_ACTIVATION.md §9 (head 220f57b5); expect 5 PASS; then: docker rm -f clamd-t1
```
(`CLAMD_CONF_*` is the official image's documented mapping; if the pinned digest does not honour it the 32 MiB check FAILS and you mount a `clamd.conf` instead. The probe was validated against a protocol double: healthy 5 PASS, 25 MiB default limit → the 32 MiB check fails, stale database → all scan checks fail closed.)
**Revision patch tool (offline, tested):** exports → patches → writes a YAML; applies nothing. It preserves every existing traffic entry, names the new revision explicitly, tags it at 0%, keeps secret-backed env as is, and **refuses** (non-zero, writes nothing) if: images are not digest-pinned in the existing repository; traffic uses `latestRevision` or does not sum to 100; the service already has more than one container; the unscanned/structural-only flags exist; or the extra env touches LinkedIn, the token vault or `SOCIAL_PUBLISHING_ENABLED` (E3 is deferred).
*(script now lives at `scripts/release08/a2-scanner-patch.py`, tested by `test/release08-a0-scripts.test.js`; it is not duplicated here)*
**Apply (operator, only after §7 T1 passes and E4 is confirmed):** `gcloud run services describe bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --format=export > svc.yaml` → run the tool with `--api-image "$API_REF" --clamav-image "$CLAMAV_REF" --suffix a2s1 --tag a2-scanner --env MEDIA_STORAGE_ENABLED=true --env MEDIA_INTAKE_ENABLED=true --env MEDIA_RIGHTS_POLICY_VERSION=fonzo-staging-rights.v1 --env 'MEDIA_RIGHTS_POLICY_STATEMENT=<D4 text>'` (plus the existing bucket variable names from the inventory) → review `a2-service.yaml` → `gcloud run services replace a2-service.yaml --project=bizgenie-backend --region=europe-west1` (no traffic moves).
**Acceptance, no bypass and no simulation:** T1 container, T2 adapter probe, then hosted T3 on the tagged revision: a clean founder file reaches `ready`; the same revision with the scanner port deliberately wrong (a second tagged revision) answers `INSPECTION_UNAVAILABLE`, leaves the asset `quarantined`, creates no media asset and no preview; the correct revision then completes the same asset; the serving revision's env names contain neither `MEDIA_INTAKE_ALLOW_UNSCANNED` nor `MEDIA_INTAKE_STRUCTURAL_INSPECTION`. An infected-file result is proven by T1/T2 (EICAR test string) and the automated suite, not by real artwork.
**Estimated cost with the proposed configuration (UNVERIFIED list prices $0.000018 per vCPU-second and $0.000002 per GiB-second, USD→GBP 0.79 assumed; confirm in the GCP pricing calculator):** the tool prints the exact figure from your API container's real limits. For an API container of 1 vCPU / 1 GiB plus the sidecar (instance 2 vCPU / 4 GiB, `min 1`): **about £90 a month = about £3.00 a day**; a 3-day acceptance window ≈ **£9**, then scale to `min 0` or remove the sidecar revision. Registry storage and egress are negligible. Request-based billing would be cheaper but starves the signature updater (database goes stale, scanning fails closed).

## 8. Evidence index
#191 approval: comment 7175314064. WEB verification run 45707139253. Activation runbook head `220f57b55313de21a224b781172d70eae8cfbf01`. Locked SHAs above. Mission Control: this session holds no cell-write capability and recorded nothing there; the exact payload is in the #191 comment for the operator who holds write access.


## 9. BG-RELEASE08-E1 COMPLETE — consolidated A0 run (revision 3)
E1 PASS (evidence #191 comment 7178191933): API `...bizgenie-api@sha256:af4814e7eaef97a8f46925c6738492f8649ee14038d8e9705dbb72e03604d952`, bridge `...bizgenie-studio-bridge@sha256:5cfdc9a2c4ba86676a1d1f365f3edc493cf039ea7829265e80f4a5a679b1667f`. Nothing is rebuilt.

**ONE file for the founder:** `scripts/release08/a0-founder-run.sh` (generated by `build-a0-bundle.sh`; a test fails if it drifts from the sources). It re-executes itself in a clean `bash --noprofile --norc` with a minimal environment and tees a private log (no secrets are ever printed) to `~/.bg-private/logs/`.
`bash a0-founder-run.sh` → registry digest check → tagged no-traffic API revision (template validated) → you post the tag readback in #191 and paste the URLs → private manifest + Release 07 validation → tagged no-traffic bridge → mandatory smoke incl. authenticated read → **STOP (traffic not shifted)**.
`bash a0-founder-run.sh shift` → type the revision to accept → independent re-verification → exact-revision shift → **STOP at the founder workspace-creation checkpoint** (identity proofs P1–P4, then you create the workspace in Studio).
`bash a0-founder-run.sh rollback` → bridge back to `bizgenie-studio-bridge-staging-step7-c023184c` (digest-checked).

### Review findings closed
| Finding | Fix | Test |
|---|---|---|
| Env NAMES alone compared | Canonical fingerprint of service template vs serving revision: env values (hashed), secret refs, service account, resources, ports, args/command, volumes, concurrency, timeout and selected scaling/network/CPU annotations; only differing *kind and name* is printed, never values | value change, secret-ref change, SA change refused; value not in output |
| Shift enforces revision/digest/evidence | `shift-bridge` re-reads the cloud: typed revision confirmation, `BRIDGE_REF` digest equals deployed digest equals live digest, tag→revision, Ready, bridge pinned to the accepted API revision, evidence bound to revision+digest+tag+API revision, all checks PASS, authenticated read true, ≤60 min old; shifts with `--to-revisions=<revision>=100` (never `--to-tags`) | 9 refusal cases + success case |
| Authenticated read optional | Hidden token prompt is mandatory; empty ⇒ exit 1, no evidence; response must carry the recorded Fairway project fingerprint (hash compared, nothing printed) | empty-token test |
| Scanner readiness/freshness only TCP | `a2-scanner-gate.sh pre`: clamd must answer `VERSION` with a database ≤72 h before the 5-check acceptance probe; `post`: revision Ready/healthy, `[api, clamav]`, pinned digests, dependency, always-on CPU, min≥1, no bypass flags, 0% tag. Liveness probe added. **Limit stated honestly:** Cloud Run cannot run a freshness probe inside a sidecar; runtime freshness is the API's per-scan VERSION check (fail closed) and the signed-in T3 run is the final gate | patch + syntax tests; probe exercised earlier against fake clamd |
| Scanner patch inputs unrestricted | `--env` allowlist with exact approved values (`MEDIA_STORAGE_ENABLED`/`MEDIA_INTAKE_ENABLED`=true, rights policy version/statement, bucket-name pattern); `--remove` deleted; min=1/max≤2; structural diff aborts on any other change | allowlist/refusal tests |
