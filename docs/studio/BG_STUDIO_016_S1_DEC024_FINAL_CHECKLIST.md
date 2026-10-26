# BG-STUDIO-016 S1 — DEC-024 final operator/reviewer package

26 October 2026. Supersedes the unassigned-operator and unset-budget proposal rows in the older identity checkpoint. **Preparation only. Gate A incomplete, S1 execution unapproved, staging RED, launch NO-GO.** Sole operational authority remains Google Sheets Mission Control under DEC-015; DEC-024 and the following metadata are attributed to founder work orders, not a fresh Codex cloud inspection. No new governance rows created.

## S1 approval matrix

| Field | Exact proposal / evidence class |
|---|---|
| Operator | **Founder**, designated under DEC-024. Actual Google principal and execution window must be recorded privately before approval; runtime identity is not operator identity. |
| Independent reviewer | **Not yet nominated**. Must independently review source-project provenance, metadata, inherited/impersonation access, scope, costs and cleanup; must not need or receive the payload. Reviewer nomination and sign-off are prerequisites, not delegated to Codex. |
| Target GCP project | Founder-verified `bizgenie-backend`, number **303691956826**. |
| Candidate credential provenance | Existing default secret/private `sb_secret_…` key belonging to staging Supabase **zrczojyxebwjgpymbmgu**. Owner verifies the selected project in its Console, key type/status and intended server use without copying values into evidence. No decoding, fingerprinting or proof by matching payloads. |
| Existing-resource inventory | UNKNOWN. Search metadata for an already suitable staging-only secret before creating anything; a staging-looking name alone is not provenance. |
| Proposed secret if needed | **`projects/303691956826/secrets/bizgenie-staging-supabase-admin`**. Resource name remains proposed, not confirmed present. At most one resource and one initial version. Record replication/location and final numeric version after any separately approved operation. |
| Runtime principal | **`serviceAccount:bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com`**. |
| Proposed runtime grant | `roles/secretmanager.secretAccessor` on that secret resource only, with no project-wide accessor and no production principal added. This does not override inherited permissions. |
| Operator permission scope | Approved existing human identity only: narrowly scoped secret creation/version-add and policy-change rights needed for the approved step. Do not grant the runtime admin/version-add roles. Do not broaden privileges automatically; if required rights are missing, stop. No secret-read grant is needed for the reviewer or verification. |
| Entry procedure | Separately approved founder operation: private trusted session, verified staging Supabase project, direct secure entry into selected Secret Manager version UI. No shell arguments/history, terminal output, log, screenshot/recording, Git, issue, ordinary file, chat or clipboard-sync destination. Clear local clipboard after transfer; never expose payload in verification. Record only provenance attestations and metadata. |
| Budget proposal | **GBP £1 total incremental Secret Manager cost for the first 30 days**, no paid calls/runtime deployment/other resource spend. Founder must approve it explicitly; it is not already approved. See assumptions below. |
| Verification | Reviewer checks exact project/resource/version state, replication, direct grant, inherited/impersonation access and absence of changed Run bindings/traffic. No payload access or live Supabase request. Metadata attestation verifies routing/provenance, not credential functionality. |
| Abort | Wrong Supabase/GCP project; unknown existing consumer; inherited access unresolved; reviewer absent; price/replication outside budget; unexpected grants; uncertain key provenance; accidental value exposure; missing cleanup authority. Stop and preserve restricted metadata evidence, no improvisation. |
| Rollback | Before any future Run binding: under explicit cleanup authority remove only the newly introduced staging binding and disable only the newly created unused version, after confirming no consumer. Do not destroy versions, disable a reused resource, revoke shared/production keys, change traffic or rotate issuer keys. Restore prior resource IAM if modified; preserve audit metadata. Disabling/storage retention may still incur cost. Any cleanup permissions must be approved in advance. |

## Founder-verified IAM findings versus unresolved access

* Staging runtime project roles labelled **AI Platform User** and **Logging Writer**: founder-verified metadata. Exact role IDs/conditions were not independently read; these labels alone prove no Secret Manager access or isolation.
* Shared secret explicitly grants Secret Accessor to staging runtime and default Compute identity: founder-verified. Until old consumers/bindings are separately retired, existing shared-credential exposure remains. A new staging-specific resource does not erase an already loaded key.
* Default Compute identity has project Editor, Cloud Run Admin and Service Account User; App Engine default identity has project Editor: founder-verified. Exact principal emails, scope/conditions and custom permissions need evidence. Editor alone is not proof of payload access. Run deployment plus actAs on an accessor identity can defeat isolation; verify the complete path.
* No explicit Token Creator in inspected project policy; staging account resource policy `null`; ancestor query showed only project: founder-verified **limited negative observations**, not proof of no effective Token Creator/actAs or inherited access. Groups, folder/org policy, deny policies, principal boundaries and conditions remain UNKNOWN.
* Resource-level least privilege cannot negate inherited Secret Accessor/Secret Manager Admin or a deploy+actAs/impersonation path. **True staging-only isolation is unproven and blocked on this evidence**, not confirmed safe by the proposed grant.

## Required Console evidence (metadata only)

Founder/reviewer must obtain timestamped captures in restricted evidence storage, including the selected project and inspecting principal:

1. Project info/number and visible folder/organization ancestry. If visibility ends at project, mark ancestors UNKNOWN.
2. Cloud Run staging `bizgenie-api-staging` and production `bizgenie-apii`: current full serving/tagged revision names, traffic percentages, per-revision runtime identity, env *names* and `secretKeyRef` resource/version references, mounted secret/CA references. Earlier serving suffixes `00029-wtc` / `00126-vaw` are historical founder evidence, **not current verified heads**. No plaintext env values/full unfiltered export.
3. Secret Manager inventory: names, project, creation time, replication/locations, version IDs/states/aliases, consumers and resource policy for shared/candidate secrets. Never open Access secret version/payload view. Distinguish current serving, tagged/old revisions and other consumers.
4. IAM project plus each visible ancestor: direct/inherited Secret Accessor/Admin/custom roles, runtime/build/deploy/default identities, groups and conditions. Record inability to expand groups/ancestors. Inspect service-account permissions for actAs (`roles/iam.serviceAccountUser`) and getAccessToken/signJwt/signBlob (`roles/iam.serviceAccountTokenCreator` or custom), at account **and inherited scopes**.
5. Correlate those principals with Cloud Run create/update/deploy permissions and available runtime identities. Review build/deploy chain as well as direct access; do not test by deploying or minting tokens.
6. Existing Policy Troubleshooter, if accessible without enabling services: read-only explanations of `secretmanager.versions.access` against each actual secret for staging/production/build identities; `iam.serviceAccounts.actAs`/`getAccessToken` against the staging identity; `run.services.update`/create against correct service/project resources. Record exact permission, resource, condition and GRANTED/DENIED/UNKNOWN. A not-yet-created secret cannot have an actual-resource verdict.

No cloud tools/authorized live metadata connector are available here. GitHub API also returns Forbidden. Existing cloud authority must be used by founder; no elevated access requested. Database inventory/queries are outside S1.

## Cost assumptions, not a verified quote

Official reference: https://cloud.google.com/secret-manager/pricing (pricing content could not be retrieved: public fetch returned403, including approved retry). Current tariff/replication is therefore **UNKNOWN**. Historical planning assumptions only: USD0.06 per active version/location/month, USD0.03 per10000 access operations; ignore free allowances. One version × two billable locations × one month = USD0.12; S1 has **zero runtime payload reads**. Even100 hypothetical later approved reads adds USD0.0003, not an S1 action. Actual replication/version billing and FX/tax must be confirmed by founder before approval. GBP£1 is a proposed conservative envelope, not an exchange-rate quote or guarantee. Abort if current pricing cannot support it. Budget alerts are not hard spend caps; keep one version/resource, no unrelated operations and an expiry/cost-review owner.

## Separately gated S2 and production remediation

S2 requires exact compatible backend/frontend artifacts, reviewed onboarding migrations and drift/RLS evidence, isolated database/auth fixtures, restore proof and budget, test owner/member/two-workspace identities, safe provider/Stripe flags, independent reviewer, explicit deployment/provisioning approvals and rollback. S1 does not change Run references or test key functionality.

Production default-identity least privilege and retirement/revocation of shared credentials are separate high-risk approvals: inventory all consumers and effective permissions, design dedicated least-privilege identities and canary/rollback, obtain founder sign-off before any IAM/traffic/credential action. Cached keys are not revoked by removing Secret Manager access. Do not bundle this into S1.

ChatGPT reconciliation only: existing BG-STUDIO-016/017, EV-067–069, BLK-STUDIO-06/07/08 and TD-STUDIO-SEC-001/002. Reported BLK row/dashboard misalignment remains UNVERIFIED; exact rows and readback are inaccessible, so no canonical entry was edited or duplicated.
