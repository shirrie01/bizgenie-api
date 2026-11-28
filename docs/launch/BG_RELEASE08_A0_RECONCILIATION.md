# BG-RELEASE08-A0 — API template reconciliation (two reviewed differences)

Live comparator result (read-only founder diagnostic, #191 comment 7178780819): the latest `bizgenie-api-staging` template differs from serving `00029-wtc` in exactly two environment entries. No secret payload was read. This note records which configuration is authoritative for Release 08 and why.

## Decision table
| # | Difference | Authoritative for Release 08 | Evidence (all in #191 unless stated) | Why not the older configuration |
|---|---|---|---|---|
| 1 | `SUPABASE_SERVICE_ROLE_KEY` secret reference (name and version differ) | **Latest template**: `bizgenie-staging-supabase-service-role-key` version `1` | BG-LAUNCH-009 correction plan (3 Nov): create a dedicated staging secret, never a new version of the old one; deploy references it, `00029-wtc` keeps the old reference so rollback needs no secret change. 9 Nov founder read-only check: `00030-pob` references the staging-named secret v1. 16 Nov R1-02a: that key was accepted by the **staging** Auth admin API (HTTP 200, status only). BG-017C-07 security hold (9 Nov): the historical `bizgenie-supabase-service-role-key` was referenced by both staging `00029-wtc` and production `00126-vaw` and the staging runtime SA can read it (elevated-privilege finding). | The older reference is the shared, production-class secret. Restoring it would re-introduce the confirmed least-privilege failure. |
| 2 | `VIDEO_INSPECTION_ISOLATION` present in the latest template, absent from serving | **Latest template**, value exactly `local`, only with `BIZGENIE_ENVIRONMENT=staging` | BG-LAUNCH-009 deployment runbook: the new image's start-up self-test fails closed unless `VIDEO_INSPECTION_ISOLATION=local` is set (staging only), so it is added when the service lacks it. `SECURITY_DECISIONS_BG_LAUNCH_006.md` §2: `local` is allowed only in disposable staging with BizGenie-generated files; Cloud Run's platform sandbox is the isolation. Code (`productionComposition.js`, `premiumComposition.js`) refuses `local` outside staging. | Without it the image would fail its start-up check under the carried-over video configuration. It is not a weakening of anything serving today: serving `00029-wtc` predates the check. |

Limits (stated, not hidden): the value of difference 2 was withheld, so the script verifies it by hash equals `local`; if it is anything else the run stops. The historical secret's IAM grant for the staging runtime SA is a separate open finding. It is **not** changed here, because serving `00029-wtc` (the rollback target) may still need it. Customer media intake stays off, so no customer file reaches the `local` inspector in A0.

## What the scripts now enforce (`a0-deploy.sh`)
`template_matches_serving` for the **API** service accepts a difference only if it is exactly one of:
1. `VIDEO_INSPECTION_ISOLATION`: absent on the serving revision; on the template its value hashes to `local`, **and** the template's `BIZGENIE_ENVIRONMENT` hashes to `staging`.
2. `SUPABASE_SERVICE_ROLE_KEY`: a secret reference on both; the serving revision references `bizgenie-supabase-service-role-key` (any version) and the template references exactly `bizgenie-staging-supabase-service-role-key` version `1` (not `latest`, not another version, not a literal).

Anything else (a third difference, a different value or secret name, a changed or added variable, service account, resources, probes, scaling...) stops the run before any deploy, printing only kind and key. When either reviewed difference is present, `EV_RECONCILIATION` (a #191 comment URL holding the founder's approval) is mandatory. The exceptions never apply to the bridge, which stays strict, and secret-backed bridge env still blocks the env-file deployment.

## Read-only check (no cloud change)
```bash
bash a0-founder-run.sh preflight
```
Runs `a0-deploy.sh check-templates`: the API check with the two reviewed exceptions, the **bridge template vs serving `step7-c023184c`** check (strict), refuses secret-backed bridge env, and lists the serving bridge's env variable **names** (the A0 deployment replaces the bridge environment with the validated A0 file, so any other name is dropped). `run` performs the same check first, before anything is deployed.

## Founder approval needed
One comment in #191 stating that the two differences above are approved for Release 08 (new staging-only service-role secret `…-staging-…` v1 and `VIDEO_INSPECTION_ISOLATION=local` in staging), then its URL is `EV_RECONCILIATION`. No other approval, secret, IAM or traffic change is required.
