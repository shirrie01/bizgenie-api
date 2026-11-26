# BG-RELEASE08-A0 — bridge template reconciliation

Live read-only comparison (founder, after the accepted API reconciliation): the latest `bizgenie-studio-bridge-staging` template differs from serving `bizgenie-studio-bridge-staging-step7-c023184c` in nine entries: eight environment settings and the container name. No deployment, traffic change or cloud mutation occurred.

## Key fact: the bridge environment is REPLACED, not inherited
`a0-deploy.sh bridge` deploys with `--env-vars-file`, which removes every existing plain environment variable and sets exactly the validated A0 file. So the eight environment differences describe the *latest template's* leftovers from earlier no-traffic candidates; none can reach the A0 revision. What **would** be inherited silently: secret-backed environment (`--env-vars-file` does not touch it), volumes, probes, resources, ports, args, service account, scaling and the container name. The comparator therefore (a) treats environment differences as superseded only when no secret-backed variable exists on either side, and (b) keeps everything else strict.

The A0 file contains exactly 22 approved names (Release 07 `workspace` profile; `PORT` is excluded — see blocker B1). `a0-deploy.sh` re-validates names and flag values before any deploy: the seven permission flags must be exactly `false`, `BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE` exactly `true`, `BIZGENIE_ENVIRONMENT` `staging`; any other name (campaign-root, LinkedIn, token-vault...) is refused.

## Decision table (live values were not available; the read-only diagnostic below verifies them safely)
| # | Difference | Authoritative for A0 | Evidence | Security implication | Treatment |
|---|---|---|---|---|---|
| 1 | `BG_BRIDGE_ALLOW_DRAFT_WORKFLOW` template-only | A0 file: explicit `false` | Release 07 validator rejects the `workspace` profile unless draft workflow is false; `service.js` treats absent as off | If inherited as `true` it would open draft writes | Superseded by replacement; explicit `false` enforced |
| 2 | `BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT` template-only | Absent (off) | `service.js`: only the literal `true` enables it; A1 deploys it later with its own validated profile | Campaign-root write path | Removed; any appearance in the A0 file is refused |
| 3 | `BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP` template-only | A0 file: explicit `false` | Generic bootstrap must stay closed (smoke asserts 403); the founder uses `POST /customer/workspace/brands` under the additional-workspace pin | Generic account bootstrap | Superseded; explicit `false` enforced |
| 4–7 | `BG_BRIDGE_FOUNDER_CAMPAIGN_{BODY_SHA256,BRAND_ID,PROJECT_ID,TENANT_ID}` template-only | Absent | Release 04/07 campaign-root pins belong to A1 (`validateA1ToA2`), not the workspace profile | Pins could target the wrong (possibly Fairway) scope | Removed. The diagnostic reports only presence and whether each matches the recorded Fairway fingerprint |
| 8 | `BG_BRIDGE_SOURCE_SHA` value differs | A0 file: accepted upstream API SHA `dfd49116…` | Release 07 example comment: the deployed *upstream* SHA, set by `a0-prepare.sh` | Wrong pin = wrong upstream identity | Replaced by the validated value |
| 9 | Container name (`RT c0.name`) | Latest template name accepted **only** if: one container on both sides, no sidecar-dependency annotation, no volumes, plain DNS-label names, and every other runtime field equal (ports, limits, args, command, mounts, probes, security context, working dir, concurrency, timeout, scaling, service account) | Container name is referenced only by dependency annotations, volume mounts and probes; the comparator proves none exist | Cosmetic under those conditions; otherwise refused | Distinct founder approval required |

Serving-only name `BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS` (off by default) is removed by the replacement: recommendations stay off in A0.

## Bridge exception approval
`EV_BRIDGE_RECONCILIATION` — a **new** #191 founder comment URL, distinct from the API reconciliation (`…#issuecomment-7189924572`) and the release approval. Required whenever any superseded environment difference or the container-name change is present. It is not an allow-list: any other difference stops the run.

## One consolidated read-only founder diagnostic
```bash
bash a0-founder-run.sh preflight
```
Prints only: permission-flag values (true/false/absent), whether each campaign pin is present and matches the recorded Fairway fingerprint (no ids), body-hash well-formedness, whether the SHA equals the accepted API SHA, container names, ports/limits equality, probe/volume/dependency presence, secret-backed variable names, and the retained/added/removed/not-carried-forward environment plan (names only). Then the template check. Nothing is changed.

## Foreseeable blockers reviewed along the A0 path
| # | Finding | Status |
|---|---|---|
| B1 | `PORT` is reserved by Cloud Run; the example profile carries `PORT=8080` and the env file would have made the bridge deployment fail after the API revision was already created | **Fixed**: `a0-prepare.sh` drops `PORT` from the deployed file (the validated manifest keeps it); the file allowlist refuses it |
| B2 | Secret-backed bridge env/volumes would be silently inherited | **Fixed**: refused on both template and serving |
| B3 | Comparator ignored probes, full volume definitions, security context, working dir and three annotations | **Fixed** for all services |
| B4 | Env file was not re-validated at deploy time | **Fixed** (`validate_a0_env_file`) |
| B5 | Smoke's identity check assumes the authenticated `GET /customer/workspace` response contains the Fairway project id (consistent with `scripts/staging/acceptance.js`, which reads `workspaces[].project_id`) | Unchanged; the check is hash-only, and a mismatch stops before any shift |
| B6 | No reviewed resume path after a partial tagged API deployment | Unchanged and stated: do not rerun `run` after an API deploy; use `a0-deploy.sh bridge` onward and report first |

## Second-pass adversarial self-review (not independent acceptance)
Each row was reproduced as a failing regression test against head `7d1599f8` before the correction.
| # | Defect found in my own reconciliation | Correction |
|---|---|---|
| S1 | The bridge environment exception accepted **any** template-only or changed `ENV` name, not only the eight reviewed ones | Superseded names are limited to the eight reviewed names; any other template drift (new flag, changed `BG_BRIDGE_AUDIENCE`, `LINKEDIN_*`) stops the run |
| S2 | The A0 env file was checked for names and booleans only: URLs, identity pins, SHA, revision and key shape were unchecked; non-string and malformed values were not parsed | Every setting is parsed as JSON string and validated exactly: staging Supabase URL, Studio origin, accepted SHA, bind, revision pattern **and equality with the API revision in the state**, audience pattern and `TARGET_URL == https://a0-dfd49116---<audience host>`, publishable key not secret-shaped, idempotency key, business name, founder and tenant pins against the recorded fingerprints, review ref |
| S3 | EV_BRIDGE_RECONCILIATION was only distinct from two references; EV_TAG was never checked at the deploy step; evidence was not bound anywhere | EV_BRIDGE_RECONCILIATION is distinct from approval, API reconciliation, scope, rollback and tag; EV_TAG is required and distinct before the bridge deploy; both, with the API reconciliation, are recorded in the state and re-required by `shift-bridge` |
| S4 | A state bound to another EV_TAG/revision was not detected | Conflict stops the run |
| S5 | Shift trusted the revision's existence; it did not re-prove the seven permission flags on the live revision, nor the API tag | Shift re-reads all seven flags (`false`), the API tag, digest and serving revision |
| S6 | Duplicate keys, comment lines, indented lines and nested YAML in the env file | Refused before any deploy |
| Verified, no defect | `bridge_container_name_ok`: single container, plain names, no dependency annotation; volumes are refused for the bridge for every difference, and probes, mounts, security context, working dir and all runtime fields are compared separately so any drift is reported | — |
| Verified, no defect | Diagnostic output prints no values (tested with sentinel secrets); smoke token travels only on stdin (`curl -K -`), never on a command line (tested) | — |

## Partial-deployment recovery (resume)
`a0-deploy.sh api` and `bridge` are now idempotent and never deploy twice under the tag (`gcloud run deploy --tag` would silently move it):
- **Checkpoint:** an existing `a0-dfd49116` tag is adopted only if it is not the serving baseline, carries the exact accepted image digest, is Ready, receives 0% traffic, serving is still the recorded baseline, and the state (if any) names the same revision and baseline. The bridge is adopted only if its live environment equals the validated A0 file exactly and it is pinned to the accepted API revision.
- **Before deploying** the revision list is snapshotted into the state. After a failed deploy, any new revision that is untagged or unrecognised stops the run (inspect read-only); a clean failure (nothing new) may be retried once; an attempt older than 24 h with nothing verifiable is STALE and needs a human to review and remove the state file.
- **EV_TAG:** required and bound to the API revision before the bridge is deployed; a state bound to a different pair is a conflict.
Tests are synthetic only; nothing was run against Cloud Run.

## Reconciliation of the Codex REQUEST CHANGES findings (older head `7d1599f8`) against the current head — self-review, not independent acceptance
Codex's original `REVIEW.md` and its 21 assertions were not accessible (its executor failed; GitHub GraphQL was forbidden to it). The cases below are **reconstructed from the four reported findings**, not Codex's original fixtures (`test/release08-a0-scripts.test.js`, tests prefixed `P1-A`…`P2-D`). Run against head `f31e4f67`, all four reproduced in part; all pass after the corrections.
| Finding | Current-head reproduction (`f31e4f67`) | Status before | Minimum correction | Regression evidence |
|---|---|---|---|---|
| P1-A structural guards conditional on a container-name difference | With **identical** names a two-container bridge with a sidecar passed; an invalid name, an `h2c`/second/wrong port on both sides likewise bypassed the name-only checks | Partially resolved (volumes and secret env were unconditional; sidecar count, name validity, dependency annotation and port shape were not) | `bridge_structure` runs unconditionally on the template **and** the serving revision: one container, DNS-label name, no dependency annotation, no volumes or mounts, exactly one HTTP/1 TCP port 8080 (an `h2c` port name is refused); port definitions are compared in full | `P1-A` (8 identical-name cases, check-templates and deploy; clean identical-name bridge still passes) |
| P1-B environment validation | Duplicates, malformed, non-string and exact bindings were already enforced (S2); but the deployed file was never compared with the **private validated manifest**, and one jq error path could echo a value | Partially resolved | Deploy requires the file to equal `baseProfile.environment` of `a0-manifest.json` minus `PORT`; jq stderr suppressed on the file path | `P1-B` (missing manifest, extra/missing/changed values, malformed and rejected values never appear in output) |
| P1-C false preflight PASS | Failed reads were fixed in `f31e4f67`; remaining: a comparator subprocess that dies (empty fingerprints) compared "equal" | Partially resolved | Fingerprints must be non-empty with their identity line and a minimum size, else STOP | `P1-C` (failed gcloud, empty/malformed JSON, missing API or bridge metadata or revision, no containers, non-object containers, non-array env, missing traffic or conditions, dying jq) never print `TEMPLATE CHECK: PASS` for either service |
| P2-D attempt journal and smoke evidence | Smoke start already clears evidence; the bridge had **no** revision snapshot, and an early failure of a new attempt left the previous smoke evidence and bridge checkpoint eligible | Partially resolved | `invalidate_downstream` at the start of every API and bridge attempt (removes smoke evidence and the bridge checkpoint); bridge revision snapshot and unrecognised-revision stop; shift refuses an empty checkpoint | `P2-D` (journal visible to the deploy command, no checkpoint recorded before verification, early failures of four kinds, failed deploy command, unrecognised revision, shift unavailable) |

## Final A0 correction — seven further defects found on head `c9820e5b` (self-review; Codex's `API_CORRECTIONS.md` was not obtainable, so these are my own reproductions, not Codex's fixtures)
Each failed as a regression test on `c9820e5b` (7 of 55) and passes now; all earlier tests are retained.
| # | Category | Defect reproduced on `c9820e5b` | Correction |
|---|---|---|---|
| F1 | metadata | An empty recorded API digest compared equal to an unreadable (empty) live digest, so the API tag check passed | `verify_api_tag` requires a non-empty revision and a valid `sha256:` digest |
| F2 | metadata | An empty or baseline-less revision list stored an empty snapshot, which silently disabled untagged-revision detection | The list must be readable and contain the serving baseline, or the deploy stops |
| F3 | rollback | If the update command failed part-way, or the service could not be read after the shift, the script exited with traffic possibly shifted and no restore | The update and the post-shift read are checked explicitly; any failure attempts the restore and prints the manual command if that also fails |
| F4 | rollback | `rollback-bridge` never verified the result and left the old smoke evidence and checkpoint eligible | Verifies serving equals the baseline, prints a manual command on failure, and invalidates evidence and checkpoint first |
| F5 | env | Shell command substitution stripped trailing newlines, so `"false\n"`, `"staging\n"`, a SHA or URL with a trailing newline passed the exact-equality checks | Every value must be printable ASCII; any control character stops the deploy |
| F6 | approval | `EV_APPROVAL`, `EV_SCOPE`, `EV_ROLLBACK` and `EV_RECONCILIATION` were optional or unrecorded, and the shift did not re-prove distinctness | All six references are required, valid and pairwise distinct before the bridge deploy; all are recorded; the shift re-proves validity and distinctness from the state and the live revision's review reference |
| F7 | smoke | The shift accepted any seven PASS entries and did not bind the smoke result to the API digest or EV_TAG | The shift requires exactly the eight named checks, the API digest and the EV_TAG recorded in the state |
