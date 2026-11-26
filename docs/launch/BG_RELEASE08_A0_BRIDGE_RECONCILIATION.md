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
