# BG-STUDIO-016 S1 — founder identity reconciliation and Console review

25 October 2026. Documentation only; S1 is not self-approved. Staging RED. Approved planning reference `7d66cb07674b72487729b355ba49bae3bf0a51a3`; compatibility evidence `f64176f32cca6e0c6c220fdef95b79b9aad243fa`. This supplements those files without repeating their audit or creating governance tasks.

## Resolved identity versus execution blockers

| S1 field | Exact proposal / evidence |
|---|---|
| GCP project | **`bizgenie-backend`**, founder-verified in current instruction; numeric project identifier not independently read |
| Staging runtime | **`bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com`**, founder-verified; this supersedes earlier UNKNOWN-email rows, not the unresolved permission review |
| Supabase source | **`zrczojyxebwjgpymbmgu`**, existing staging default secret/private key candidate; no value retrieved |
| Secret | Reuse a verified existing staging-only resource if suitable. Otherwise proposed **`projects/bizgenie-backend/secrets/bizgenie-staging-supabase-admin`**; existence still UNKNOWN |
| IAM member and role | Proposed `serviceAccount:bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com` → **`roles/secretmanager.secretAccessor`**, only on the selected secret resource, not the project or all secrets; not applied |
| Named operator/reviewer/window | **UNASSIGNED** in available authority. Founder must name authorized operator, reviewer and rollback owner before execution; the runtime account is not the operator. |
| Secure entry | Follow existing S1 operator procedure in compatibility report: approved private operator-only transfer to Secret Manager; no command argument/history/log/GitHub/ordinary file, credential fingerprint or browser recording. No secret handling authorized in this task. |
| Numeric cost ceiling | **UNSET / execution blocker.** Obtain current replication/version/access tariff and existing-resource reuse estimate; founder records numeric currency ceiling and stop owner. Do not invent a budget. Proposed scope remains at most one new resource/one initial version, no runtime reads in S1. |
| Verification | Metadata/provenance/effective-policy evidence only in S1; actual key/gateway read needs separately approved S2 and an approved synthetic identity. |
| Rollback | If an approved future S1 aborts before binding: under explicit cleanup authority remove only its new unused grant/version, preserve evidence and pre-existing consumers; no shared/production key revocation, issuer rotation, serving revision or traffic change. Reused resources must not be disabled merely to undo this step. |

Exact target identity is now resolved; operator, budget, existing-resource inventory and effective isolation are not. This checklist does not authorize execution or close Gate A.

## Read-only Google Cloud Console evidence the founder must obtain

Use the existing authorized Console session. View only; do not click Grant/Save/Edit/Add Version/Reveal/Access/Deploy or enable services/APIs. If access is denied, record the gap rather than changing privileges.

1. **Project selector / project information:** capture project ID `bizgenie-backend`, number and visible folder/organization ancestry. Preserve timestamp, operator identity and selected project in restricted metadata evidence.
2. **Cloud Run → staging service → revisions/traffic:** current full serving/tagged revision names, traffic allocation and runtime identity. Confirm the supplied email on each relevant revision, not just the current desired template. Capture env variable *names plus secret resource/version references* and secret volume references only; do not reveal plaintext values or export whole config. Include old tagged revisions/consumers.
3. **Secret Manager → list:** identify existing staging-specific candidates and exact resource project/name, version states, aliases/replication. A staging-looking name is not credential provenance. The credential-origin record must identify the staging Supabase project without revealing/decoding the key. Compare consumer bindings by metadata, not values.
4. **Each relevant secret → Permissions:** capture resource-level bindings, inherited bindings, role, principal/group and condition, including the shared secret and candidate staging secret. Distinguish direct accessor grants from inherited access. No secret version payload view.
5. **IAM & Admin → IAM at project and visible ancestors:** include inherited grants and inspect the staging/production runtime principals, relevant groups and build/deploy identities. Record Secret Accessor/Secret Manager Admin and custom-role permissions; evaluate conditions, deny policies and principal-access boundaries where visible. Missing group expansion/ancestor visibility is UNKNOWN, not a denial.
6. **Service Accounts → staging identity → Permissions / principals with access:** inspect `roles/iam.serviceAccountUser` (actAs), `roles/iam.serviceAccountTokenCreator`, relevant custom roles and any impersonation chain. Project/folder/org grants can be absent from the account-only view; correlate both. Do not create keys or generate/impersonate tokens to test it.
7. **Cloud Run deployment authority:** identify who has Run Admin/Developer/custom `run.services.update`/`run.services.create` permissions, and whether those same principals can actAs the staging accessor account. Capture scope/conditions and service invoker exposure separately. A deploy+actAs path may obtain the staging key even without direct Secret Accessor on that principal.
8. **Policy Troubleshooter, if already accessible:** request read-only explanation of `secretmanager.versions.access` for both runtime principals against shared/staging secret resources; separately inspect `iam.serviceAccounts.actAs`, `iam.serviceAccounts.getAccessToken` and relevant Run update/create permissions on their correct resources. Save granted/denied/unknown explanation with context/time. Do not enable APIs or perform an actual secret read or deployment as a permission test. A proposed nonexistent secret cannot provide actual resource-policy proof; use parent-policy evidence and recheck exact resource metadata only after approved preparation.

## Isolation conclusion and evidence return

**No inherited permissions were newly verified by Codex.** Founder previously reported broad production Editor, Cloud Run Admin, Service Account User, Artifact Registry Writer, Vertex AI User and Logging Log Writer. Editor alone does not establish payload-read access. Broad Run deploy plus actAs/Token Creator or inherited Secret Accessor/Admin **may defeat staging-only isolation**, depending on actual scopes/conditions. Do not convert a suspected path into a confirmed grant or assume a narrow secret binding cancels inheritance.

Removing old Secret Manager access does not clear a key already loaded in an old process. Consumer quiescence/retirement and any issuer-side revocation remain separate approved gates; no production default-account role cleanup is included in S1. Until effective-access/impersonation and cached-consumer evidence is complete, two-way isolation is unproven.

Return a restricted metadata evidence pack: capture time/operator; project/ancestry; per-revision runtime/reference/traffic mapping; secret resource/version metadata; direct and inherited bindings; group/condition/deny visibility; deploy/impersonation paths; unexplained access gaps. ChatGPT reconciles into existing BG-STUDIO-016, BLK-STUDIO-06/07 and TD-STUDIO-SEC-001/002 scopes after reading their canonical rows. No duplicate tasks or register changes here.
