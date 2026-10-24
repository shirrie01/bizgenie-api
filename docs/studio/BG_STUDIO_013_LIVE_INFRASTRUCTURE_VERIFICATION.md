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

## Founder-evidence continuation — 2026-10-24

This section supersedes the earlier UNKNOWN rows **only for the specific facts supplied below**. Source: founder-verified infrastructure evidence supplied in this chat, stated to be recorded in sole Google Sheets Mission Control. The register itself and its evidence attachments remain inaccessible here; no canonical row URL, evidence capture timestamp or full Cloud Run revision identifier was provided. VERIFIED (founder) is distinct from directly queried by Codex. Do not treat the earlier blanket access-boundary inventory as the latest factual checkpoint.

### Current authority checks and evidence provenance

Native GitHub ref lookup again confirms backend main `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`, and #213 plus its canonical branch `120a874dfa02313a8c28dad82ddb6582f0065469`. Native fetch succeeded. Current issue/PR reads were attempted independently for [#191](https://github.com/shirrie01/bizgenie-api/issues/191), [#197](https://github.com/shirrie01/bizgenie-api/issues/197) and [#213](https://github.com/shirrie01/bizgenie-api/pull/213); each returned `Post "https://api.github.com/graphql": Forbidden`. Their current bodies, comments, decisions, PR status and exact-head CI are **BLOCKED to this reviewer**, not reconstructed from older reports. Git objects support the code references below; they do not prove serving revision contents. Live Mission Control is also BLOCKED to this reviewer. No duplicate governance tasks or GitHub comments were created.

| Finding | Classification | Consequence / remaining unknown |
|---|---|---|
| Staging service `bizgenie-api-staging`, serving revision suffix `00029-wtc`, dedicated staging runtime identity | VERIFIED (founder) | Service/runtime separation exists; exact principal, cloud project, revision image/SHA, tags and full traffic split UNKNOWN |
| Production service `bizgenie-apii`, serving revision suffix `00126-vaw`, default Compute Engine runtime identity | VERIFIED (founder) | Runtime identity differs; default identity may be shared by other workloads, inventory UNKNOWN |
| Healthy separate Supabase projects: staging `zrczojyxebwjgpymbmgu`, production `uvgblmejpbswkvlqvqmz` | VERIFIED (founder) | Separate projects do not establish which URL/DB/key each deployed consumer uses; data provenance and migrations UNKNOWN |
| Both serving revisions reference the same `SUPABASE_SERVICE_ROLE_KEY` Secret Manager secret, version 1; both runtimes can access it | VERIFIED (founder) | Shared credential isolation failure. Secret's Supabase project ownership/validity UNKNOWN; no secret read or authentication probe performed |
| Production runtime roles: project Editor, Cloud Run Admin, Service Account User, Artifact Registry Writer, Vertex AI User, Logging Log Writer | VERIFIED (founder) | Broad runtime privileges; exact resource scope/conditions, inherited grants and observed use require metadata review |
| Staging dedicated database secret and mounted Supabase CA certificate | VERIFIED (founder) | Positive separation signals, not proof of DB target/role, TLS enforcement, CA use or absence of other shared bindings |

**Assessment: staging NO-GO / BLOCKED.** Shared privileged credential access and excessive production runtime authority are high-severity findings. This is evidence of exposure potential, not evidence of credential compromise or actual cross-environment data access. A single shared secret version does not prove it works in both independent Supabase projects: it may belong to one, be stale, or be unusable for one service. Do not decode, copy, print, test or otherwise access its value in this task.

### Prioritized remediation plan — proposals only

| Priority / risk | Specific remediation and proof required | Approval / dependency |
|---|---|---|
| P0 high: shared service-role credential | Authorized operator maps each revision's non-secret Supabase URL, publishable configuration and secret resource/version metadata to the intended project using existing secure provenance records. Inventory every consumer and every accessor of the shared secret, including inherited grants and historical revisions. If ownership cannot be established without handling credentials, pause for separate secure credential-handling authorization. Prepare separate staging and production secrets/keys; each runtime can access only its own binding. Prove separation from resource policies, including inherited access. | Separate founder approval for credential issuance/rotation, secret bindings, least-privilege IAM, rollout/restart and revocation. No values in evidence. Merely creating two secrets containing the same credential is not isolation. |
| P0 high: production default identity overprivileged | Inventory other workloads using the default identity, effective IAM (project/folder/organization), impersonation grants and actual runtime API needs. Prefer a dedicated production runtime identity. Separate build/deploy identities from serving identity. Remove Editor, Run Admin, Service Account User and Artifact Registry Writer from the serving path only after dependency review and approved transition. | Dedicated identity/provisioning and IAM changes need explicit approval. Do not remove roles blindly from a shared default account or enable new APIs. |
| P1 high: residual production permissions | Resource-scope Secret Accessor only to required production secrets; narrowly scope existing storage/other proven runtime needs. Logging writer may be justified; Vertex AI User is justified only by explicitly authorized runtime requirements, not by role presence. Artifact pulls are normally a platform/service-agent concern; confirm deployed setup before assigning runtime artifact privileges. Review implicit permissions remaining through groups/inheritance. | Document required permissions and owner-approved IAM diff plus rollback; no guessed replacement role list or provider activation. |
| P1 high: schema/role readiness | Authorized operator supplies target server version, migration ledger and read-only catalog comparison to #213. Confirm both onboarding SQL files' exact hashes/order, parent unique keys, data validity and intended backend role/RLS compatibility. Compare strict preflight including grants/columns/constraint definitions. No SQL executed in this continuation. | Separate read-only DB/catalog access approval if needed, then distinct migration approval after disposable rehearsal/backup proof. Never weaken preflight or grant browser/service_role table access. |
| P1 high: authentication | Verify staging frontend/backend issuer and project configuration consistently target staging. Confirm existing auth admin provisioner uses staging-only credentials. Review redirect origins, CORS and session refresh dependencies. Later approved real tests must reject production tokens at staging and staging tokens at production, and cover selected tenant/project/brand claims, owner/member rights and revocation. | Auth config changes and synthetic sign-in/selection/app_metadata test writes require separate approval; no credential probing now. |
| P1 high: recovery/rollback | Obtain target backup timestamp, retention/PITR entitlement, restore report, RPO/RTO, compatible revision artifacts and operator. Plan isolated restore rehearsal; identify production restore protections. Keep onboarding records, constraints/RLS and owner-only backend safeguards. | Restore exercise/cost and any rollback routing/deployment need specific authority. Backup existence is still UNKNOWN. |
| P1 high: production data/resources | Map both revisions' DB/auth/storage/secret/network dependencies, including non-serving tagged revisions, with redacted resource identifiers. Determine whether staging data was copied from production and confirm synthetic fixtures/retention. | Explicit owner attestation and evidence before integrated test; separate project names are insufficient. No personal record inspection here. |
| P2 medium: costs | Collect current region, Cloud Run CPU/memory/min instances/concurrency/billing mode, Supabase plan/PITR/restore charges, secret operations, logging retention, storage/egress and expected test volume. Separate baseline from incremental test/migration rehearsal/restore costs. | Numeric estimate UNKNOWN pending account-specific evidence. Founder approves ceiling, duration and stop criteria before chargeable execution; no paid generation or provider activation. |

Code evidence at [#213 immutable head](https://github.com/shirrie01/bizgenie-api/tree/120a874dfa02313a8c28dad82ddb6582f0065469): `src/authentication/customerScopeProvisioner.js` uses `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` for auth admin user lookup/update and trusted app_metadata; this is a real privileged dependency, not just an unused variable name. `src/authentication/tokenVerifier.js` binds issuer to configured project and validates audience/expiry/trusted scope. Correct source logic does not prove correct live configuration. `src/workspace-onboarding/preflight.js` rejects unexpected RLS policies and PUBLIC/anon/authenticated/service_role table/column privileges and requires the exact schema contract. `postgresRepository.js` locks current owner membership/project/approved brand through commit. Source health and a mounted CA do not prove the deployed connection validates certificate chain/hostname; that remains UNKNOWN.

### Safe execution order and founder gates

1. Reconcile this evidence with current register entries and inaccessible issue/PR comments; obtain canonical evidence links/timestamps, full resource identities and exact-head CI. No implementation or readiness sign-off while these are missing.
2. Complete metadata-only dependency/access inventory and recovery proof. Obtain the approved credential-isolation and production IAM plan, including blast radius, operators and separately authorized change window.
3. Under future explicit authority, establish environment-specific credentials and production runtime least privilege with staged validation. Coordinate service-role rotation with Supabase's actual key type and all consumers: legacy key/JWT-secret changes can affect other tokens and clients. Do not prescribe blind project-wide JWT-secret rotation. Shared credential compromise, if later suspected, requires the incident owner to choose containment timing rather than waiting for convenience.
4. Preserve compatible isolated rollback artifacts, but never roll back to a shared secret or excessive runtime permissions. Prefer a forward correction using isolated bindings. Do not disable/delete the old shared secret version until authorized dependency validation confirms all legitimate consumers have moved; remove old access in the approved sequence. Old revision rollback must not silently reintroduce version 1.
5. Obtain separate target-specific migration approval only after schema/role/data/backup rehearsal, then separate deployment/traffic and staging-only flag approvals. Controlled real-auth fixture writes/test plan and a cost ceiling are distinct approvals. No production rollout is implied by staging approval.
6. Run integrated acceptance only after those gates; current task executes none of them. No arbitrary restore, migration, IAM or auth action is a substitute for missing read-only evidence.

### Existing governance reconciliation — no duplicate tasks

The following are **proposed evidence attachments**, not edits to canonical task definitions/statuses. ChatGPT/register owner must first match the actual current row titles, scope and owners because this reviewer cannot read them:

- **BG-STUDIO-013:** attach founder-verification table, access limitations, dependency inventory gaps and staged approval package.
- **BLK-STUDIO-06 / BLK-STUDIO-07:** reconcile the credential-isolation and staging/schema/auth/restore gates with whichever existing blocker owns each; do not guess their individual meanings or create replacement blockers.
- **TD-STUDIO-SEC-001 / TD-STUDIO-SEC-002:** reconcile shared service-role binding and broad/default production identity findings with existing debt scopes; record exact IAM/credential plans, owners and acceptance evidence under the matching rows.

No task is marked resolved. Current live state/CI/governance remains partly BLOCKED; founder-provided infrastructure facts are VERIFIED with attribution; secret ownership, deployed code/schema, backup recovery, TLS enforcement, data provenance and costs remain UNKNOWN. Only documentation changed. No SQL, secret values, IAM, provisioning, deployments, feature/provider activation, paid calls or production operations were performed.
