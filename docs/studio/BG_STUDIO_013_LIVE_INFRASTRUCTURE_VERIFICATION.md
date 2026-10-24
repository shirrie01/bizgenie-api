# BG-STUDIO-013-BE — Live staging verification: access-boundary checkpoint

Evidence date: 2026-10-24. **BLOCKED — live infrastructure readiness UNKNOWN; no-go for staging execution.** Read BG_STUDIO_012_STAGING_READINESS.md at `46008ae2a7dd9774fec5adfc5e31d26872af0e8c` before verification. No live infrastructure inventory can be certified with this session's available access. Stop here rather than infer deployed state from repository documentation.

## Verified current GitHub refs

Native `git ls-remote` returned:

| Ref | SHA |
|---|---|
| Backend main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| Backend #213 and canonical onboarding branch | `120a874dfa02313a8c28dad82ddb6582f0065469` |
| Frontend #48 | `40f41ff3b1ba3622a0f3419aaf769627bb6d325a` |
| Frontend #49 | `6839d5565a02dcc89213d64734ba910f2f935bbf` |

Frontend heads have advanced since BG-STUDIO-012. Its previous 503 wording finding is historical evidence, not a verified finding against these new heads. Revalidate frontend retry/error behaviour and dependency ancestry before integration. This infrastructure task did not inspect the new frontend code or claim the issue resolved.

`gh pr view 213 --repo shirrie01/bizgenie-api --json headRefOid,baseRefName,isDraft,statusCheckRollup` returned `Post "https://api.github.com/graphql": Forbidden`. Current draft/base/check metadata is UNKNOWN. Git refs alone do not establish CI, reviews, deployment or acceptance. [Backend #213 checks](https://github.com/shirrie01/bizgenie-api/pull/213/checks), [frontend #48](https://github.com/shirrie01/bizgenie-web/pull/48), [frontend #49](https://github.com/shirrie01/bizgenie-web/pull/49).

## Access evidence and inventory

Available tool metadata contains no authorized Cloud Run/GCP, Supabase/PostgreSQL or Google Sheets/Mission Control connector. `command -v gcloud`, `command -v supabase` and `command -v psql` returned no executable; `gh` exists but the API request above was forbidden. The environment-onboarding configuration-draft tool describes this development environment, not live BizGenie infrastructure, and was not used as an inventory substitute. No credential files, environment secret values or secret-manager payloads were accessed. No alternate credentials, authentication flow or permission bypass was attempted.

**PRESENT** below means directly observed; **MISSING** would require an authoritative scoped inventory proving absence; **UNKNOWN** means not verifiable. No live resource is classified MISSING merely because access is absent.

| Inventory item | Status | Evidence needed / specific remediation |
|---|---|---|
| Canonical backend repository refs | PRESENT | Native git results above; reverify at execution time |
| Cloud Run staging service, revisions and traffic | UNKNOWN | Authorized operator supplies timestamped metadata: project/environment identity, service, region, revisions, artifact digest, traffic split/tags and separation from production |
| PostgreSQL/Supabase instance and version | UNKNOWN | Sanitized project/instance identity, server version, database/schema separation and connection mode; no connection strings or passwords |
| Migration history / onboarding schema | UNKNOWN | Read-only migration ledger and catalog evidence for both pending files, parent keys and hardened schema preflight; do not apply SQL to obtain evidence |
| Effective backend DB role and RLS compatibility | UNKNOWN | Intended runtime identity, ownership, inherited/effective privileges, RLS/BYPASSRLS status and parent-lock privileges; compare to #213 preflight without broadening grants |
| Auth / selection token refresh | UNKNOWN | Nonproduction issuer/audience and redirect metadata; existing app_metadata provisioner binding and refresh contract. Real selection/login tests require separately approved synthetic operations, not this read-only audit |
| Backups and restore evidence | UNKNOWN | Backup timestamp/retention/encryption metadata, protected restore permissions, successful isolated restore report and agreed RPO/RTO |
| Rollback capability | UNKNOWN | Retained compatible backend/frontend artifact IDs, routing/flag rollback procedure, responsible operator; documentation alone is not proof artifacts remain deployable |
| Secret bindings | UNKNOWN | Resource names or redacted binding identifiers, version status and staging ownership only. Never payloads, tokens, private keys or connection URLs |
| Network / CORS | UNKNOWN | Sanitized ingress/egress/VPC/DB reachability and exact browser origin allowlist; demonstrate absence of production routing |
| Feature/provider/billing flags | UNKNOWN | Effective non-secret values and frontend build provenance; show generation/publishing/providers remain disabled, identify any environment override |
| Production data/resource reuse | UNKNOWN | Explicit mapping of auth, DB, storage, service, logging and network resources to environments; attest synthetic fixtures and no production dataset connection |
| Two synthetic workspaces and owner/member identities | UNKNOWN | Authorized operator confirms fixture existence using redacted IDs and roles; no creation or membership change in this task |
| Mission Control current decisions | UNKNOWN | Register owner supplies current DEC-015 / DEC-020 / LOCK-018 and superseding decisions with dated canonical register reference |

Historical service/revision names in BG-STUDIO-012 are not current infrastructure evidence. No endpoint probing or database connection was attempted against guessed targets.

## Cost and risk assessment

**Incremental cost estimate: UNKNOWN, no supported numeric estimate.** Current region, service sizing, minimum instances, billing plan, database capacity, backup storage, usage and negotiated rates are unavailable. Do not interpret absence of paid AI calls as zero infrastructure cost.

For a later estimate obtain existing account pricing and measured/approved workload: Cloud Run CPU/memory active duration and request volume, idle/min-instance baseline, DB compute/storage or plan increments, auth quota, logging volume, backup/restore storage and network egress. Separate existing baseline from incremental test cost. A restore rehearsal or provisioned isolation can add cost and needs separate approval; neither is performed here.

| Severity | Risk | Gate |
|---|---|---|
| High / execution blocker | Accidental production DB/auth/resource binding | Authoritative resource separation evidence before testing/deployment |
| High / execution blocker | Unknown DB role, schema drift or unsupported catalog definitions | Read-only target-role/catalog comparison against #213; no permissions workaround |
| High / execution blocker | No demonstrated backup/restore or compatible rollback | Target-specific recovery evidence and approved operator |
| High / execution blocker | Unknown current CI and live governance locks | Exact-head checks and current Mission Control confirmation |
| Medium / execution blocker | Frontend moved, refresh/retry compatibility not revalidated | Review new heads, including uncertain-save handling and workspace isolation |
| Medium | Unbounded runtime/restore/logging costs | Supported estimate, budget ceiling, duration and stop criteria |

## Next staging approval package — required inputs

An already-authorized operator should provide the sanitized read-only inventory listed above, with capture timestamps, environment scope and evidence locations. No credential values should be sent. If no existing read-only path is authorized, the founder must explicitly authorize a specific metadata-only access arrangement before any access/IAM setup; this task does not authorize such setup or request broader GitHub credentials.

Then prepare a target-specific package containing:

1. Pinned backend/frontend heads, verified exact-head CI, actual PR dependency order and frontend contract reconciliation.
2. Production-separation evidence, intended runtime database-role assessment, migration ledger/catalog comparison and schema/data violation counts without customer content.
3. Backup/restore proof, lock/timeout window, rollback artifacts/operator and retention/deletion decisions.
4. Synthetic two-workspace acceptance plan from BG-STUDIO-012, including owner/member/revocation, real auth refresh and uncertain-save retries.
5. Supported incremental cost estimate, ceiling, duration, monitoring and abort criteria.

Required founder decisions, recorded in canonical Mission Control before execution: exact target and test fixture/write authorization; exact two migration files/order/operator/window and recovery plan; backend/frontend deployment and traffic authorization; staging-only Studio flag activation; permitted test duration/cost ceiling; rollback/recovery authority. Approval of architecture alone authorizes none of these operational actions. Provider activation, paid generation and publishing remain excluded.

**Stop condition reached:** live access unavailable. No migrations, database writes, deployments, traffic/IAM changes, secrets access, resource provisioning or activation occurred. No tests were run: documentation and native GitHub ref checks cannot validate live staging. Existing implementation branches and PRs remain unchanged. This checkpoint is evidence for Mission Control, not a register update or staging sign-off.
