# BG-STUDIO-016 — Supabase server-key compatibility

25 October 2026 (Europe/London). Target is exact backend #215 `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b`, including #213/#214. **PASS for backend/client compatibility with a modern `sb_secret_...` key. UNKNOWN for actual hosted authorization, deployed artifact and binding.** Recommend the existing independently attributable staging default secret/private key as the first candidate for approved S1/S2; no compatibility reason was found to issue another key or retain a legacy JWT. This is not permission to retrieve/copy/bind it. Staging RED; S1 not authorized.

Founder input: staging Supabase project `zrczojyxebwjgpymbmgu` has default publishable and secret/private keys; no values supplied. This is accepted provenance of existence, not evidence that the existing Cloud Run shared secret contains the staging key or that all consumers are isolated. The approved isolation plan `7d66cb07674b72487729b355ba49bae3bf0a51a3` remains unchanged. No Mission Control task/register created.

## Exact dependency and call-path findings

- Local git ancestry confirms #213 `120a874dfa02313a8c28dad82ddb6582f0065469` → #214 `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` → #215 target above. Source/package files on this review branch match #215 before adding tests/docs. No live GitHub/Supabase API was queried.
- `package.json`/lock pin `@supabase/supabase-js` **2.112.3**; its `@supabase/auth-js` dependency is also **2.112.3**. Installed versions used in tests match. This conclusion is version-specific, not a guarantee for an older deployed image or arbitrary SDK replacement.
- The only production source read of `SUPABASE_SERVICE_ROLE_KEY` is `src/authentication/customerScopeProvisioner.js:121-140`. It requires URL/key together and passes the string unchanged to `createClient(normalizedProjectUrl, key, {auth:{autoRefreshToken:false,detectSessionInUrl:false,persistSession:false}})`. No legacy-JWT prefix/segment/signature/role/expiry decoding or signing is applied to this server key.
- Downstream calls are `auth.admin.getUserById(auth_user_id)` and `auth.admin.updateUserById(auth_user_id,{app_metadata})`. Existing metadata is preserved while trusted tenant/project/brand scope is updated; result contains no key and requests session refresh. Lookup/update errors become sanitized `CUSTOMER_SCOPE_PROVISIONING_FAILED`, not success.
- `index.js` wires this provisioner into workspace bootstrap/additional-workspace/selection after existing authorization. New key format does not change owner/member policy, revoke checks, CAS, entitlements or campaign authorization. It does not eliminate existing distributed selection/provisioning boundaries.
- Customer authentication is separate: `tokenVerifier.js` constructs its client using `SUPABASE_PUBLISHABLE_KEY`, then verifies **customer access JWTs**, issuer/audience/expiry and trusted app_metadata. Do not put a private API key into the customer bearer token or replace the customer's JWT verification with API-key acceptance.
- PostgreSQL pools use `BRAND_BRAIN_DATABASE_URL`/existing DB configuration, not this API key. An opaque Supabase server key is not a DB password or SQL login. The onboarding preflight's denied direct PostgreSQL `service_role` table grants remain intact; no RLS/grants/schema change is required for this key format. Repository search found no use of this environment key in PostgREST queries, Edge Functions, Realtime, GCS, Stripe, provider calls or billing in this dependency chain.

Immutable backend references: [provisioner](https://github.com/shirrie01/bizgenie-api/blob/e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b/src/authentication/customerScopeProvisioner.js), [customer verifier](https://github.com/shirrie01/bizgenie-api/blob/e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b/src/authentication/tokenVerifier.js), [production wiring](https://github.com/shirrie01/bizgenie-api/blob/e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b/index.js), [pinned lock](https://github.com/shirrie01/bizgenie-api/blob/e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b/package-lock.json).

## SDK transport detail: do not confuse Auth admin with JWT-only middleware

Installed SDK source `supabase-js/src/lib/fetch.ts` recognizes modern prefixes. `SupabaseClient.ts` calls key-format checking but does not demand that a recognized secret key be a JWT. **Its Auth admin initialization still sets BOTH `apikey: <key>` and `Authorization: Bearer <same-key>`** (`_initSupabaseAuthClient`); Auth admin GET/PUT retain those headers. The real compiled SDK mock-transport test confirms this exact behavior.

The same package contains an Edge Functions-specific option that omits a new-format key as Bearer. That special path is not used by this backend's Auth admin provisioner. Do not generalize its comment into a claim that Auth admin sends only apikey. An opaque value in this SDK-generated header is not proof it is a JWT, and a mocked successful response does not prove a hosted gateway accepts it. Whether the hosted staging gateway accepts/normalizes this header combination and grants Auth admin authority remains UNKNOWN until a separately approved S2 check.

No custom Authorization override, JWT conversion, manual key decoding or blanket header stripping is proposed. If an approved future synthetic-user read reveals a gateway incompatibility, retain the sanitized error/status and review a narrowly scoped SDK/transport correction before any change. Do not automatically fall back to the shared production/staging credential or rotate JWT signing secrets.

## Disposable tests and limits

Added `test/supabase-secret-key-compatibility.test.js`; Node22.23.3 command:

```bash
node --test test/supabase-secret-key-compatibility.test.js \
  test/customer-scope-provisioner.test.js test/customer-authentication.test.js
```

**25 passed; 0 failed/skipped/cancelled**, including6 new tests:

1. Real pinned SDK initializes with a deliberately fake opaque secret, emits expected Auth admin GET/PUT, carries matching API-key/Bearer headers, preserves metadata, returns refresh-required and excludes key from DTO.
2. Synthetic legacy-shaped key also works through that transport without server-key JWT parsing.
3. Simulated gateway403 stops before PUT and returns sanitized failure.
4. Simulated PUT denial does not report success/refresh and does not leak synthetic upstream diagnostic/key text.
5. A publishable client can initialize but simulated admin denial remains fail-closed: initialization alone never proves service-role authority.
6. Customer verifier uses its separate publishable key; an opaque private key supplied as customer JWT is rejected before network transport.

All SDK clients use injected in-memory fetch and `https://supabase.fixture.invalid`; responses/users/keys are synthetic. No real credentials, remote API, PostgreSQL, infrastructure, provisioning or staging writes. No real secret was decoded, fingerprinted or exported. SDK request-format tests cannot establish project ownership, key enabled state, gateway behavior, Auth admin permissions or actual refresh in a real deployment. Local log: `/workspace/.onboarding/bg016-key-compatibility.log`. Existing full-suite/CI evidence was not rerun or relabelled for this targeted check; no new CI result claimed.

## Decision matrix

| Option | Compatibility verdict | Recommendation / required evidence |
|---|---|---|
| Reuse existing staging default secret/private key | **PASS locally; hosted authority UNKNOWN** | **Recommended candidate**, provided founder-approved provenance, consumer/lifecycle inventory and S1 isolation are satisfied. New-format string is accepted by current code/pinned SDK. Do not copy/rebind it before approval; separately gated S2 must verify existing approved synthetic-user read through the actual staging Auth gateway. |
| Issue a separate staging key | **Not required for code compatibility** | Choose only if existing key has unknown consumers or independent revocation/audit ownership is needed. Separate approval for issuance and lifecycle; do not invent a technical need or issue it now. New key has the same unverified hosted/deployment constraints. |
| Retain a staging-specific legacy service-role JWT | **PASS for existing opaque-key transport; unnecessary as default choice** | Use only for a proven supported gateway/operational constraint reviewed later. Do not retain legacy merely because the variable is named SERVICE_ROLE_KEY. Never treat the current shared binding as an acceptable isolation fallback. |

**Required application changes: none established by this check.** Keep current environment-variable name and SDK pin; tests protect the used path. A future naming cleanup is unnecessary for S1 and would require coordinated configuration review. Service-role administrative power comes from the project's server-side key/gateway configuration, not a client-decoded `role` claim. This task cannot independently certify its scope by mocking the server.

**Next bounded step remains approval, not execution:** use this compatibility evidence in the existing BG-STUDIO-016 S1 matrix; obtain exact project/principal/resource/provenance/cost fields through Gate A handoff. If approved later, reuse or prepare only the independently staging-scoped binding. S2's real synthetic-user read/credential use needs its own authorization and existing approved fixture; a selection/update test additionally requires approved app_metadata writes. No production probing, key-value comparison/fingerprinting or JWT-secret rotation. Existing default key availability does not clear shared bindings, inherited IAM, cached credentials, production least-privilege, migration/restore or staging acceptance gates.

## Final S1 operator checklist — evidence prepared, execution not approved

This checklist supplements the unchanged approved plan, not a new Mission Control task. **S1 remains blocked for execution until missing project/principal/operator/budget fields and inherited-access evidence are resolved.** No real credential has been handled to prepare it.

| Item | Exact target or required operator action | Status / stop rule |
|---|---|---|
| Supabase source | Staging project **`zrczojyxebwjgpymbmgu`**; existing default secret/private key, never the publishable key or the old shared credential of unknown provenance | Existence founder-verified; actual enabled state, other consumers and hosted Auth admin acceptance not tested |
| Operator/reviewer/window | Named authorized human operator, independent reviewer, approved change window and rollback owner | **UNKNOWN; must be named before execution.** The current chat actor is not automatically the operator. |
| GCP resource project | Verified GCP project ID/number owning the approved secret; Supabase project ID is not a GCP project ID | **UNKNOWN; Gate A evidence required.** |
| Proposed Secret Manager resource | Reuse a verified suitable staging-only resource if one exists. Otherwise proposed secret ID **`bizgenie-staging-supabase-admin`**, full resource `projects/<VERIFIED_GCP_PROJECT_NUMBER>/secrets/bizgenie-staging-supabase-admin` | Proposed name only; existence UNKNOWN. Do not create a duplicate or assume the parent project. |
| Staging principal | Exact runtime service-account email from currently serving `bizgenie-api-staging` revision metadata, including owning project/uniqueId | **UNKNOWN exact email.** Dedicated identity is only previously founder-reported; do not fabricate its address from the service name. |
| IAM grant | `roles/secretmanager.secretAccessor` to **`serviceAccount:<VERIFIED_STAGING_RUNTIME_EMAIL>`**, on the **single approved secret resource** only | Proposed grant, not applied. It covers that secret's accessible versions; it is not per-version IAM. No project/folder/org grant, wildcard member, production principal or actAs grant. |
| Versions/replication | One reviewed initial version if a new resource is approved; record actual numeric version metadata and approved replication/cost policy | Do not assume version1 for reused resources; no latest alias in a later binding without explicit review. No binding occurs in S1. |
| Cost ceiling | Founder-approved numeric currency ceiling using current Secret Manager tariff, replication and active-version/access counts | **UNSET / BLOCKED.** No supported numeric estimate is available. Proposed workload cap: at most one new secret and one enabled version, zero runtime payload reads/tests in S1, no new service or replica policy without approval. This cap is not a price estimate or budget authorization. |
| Completion evidence | Redacted change record, source-project/type attestation, resource/version metadata, exact IAM diff and effective-access review | No secret value, credential fingerprint, JWT decoding, screenshot of a key or clipboard export in evidence |

### Safe credential-entry procedure — only after separate S1 execution approval

1. Verify the signed-off project/principal/resource, existing-resource inventory, operator and ceiling first. Reconfirm that the source is the **existing staging** project key and that the key is not already shared with production or unrelated consumers. If provenance/consumer scope is unclear, stop; separate issuance requires its own approval.
2. Use an approved trusted workstation/session and a secure operator-only transfer path from the staging project's key management view into the approved Secret Manager version. This future step necessarily handles a secret and is **not authorized by this documentation/push request**. Do not use chat, tickets, GitHub, screenshots, recording, command arguments, shell history, environment dumps or ordinary files as transfer channels. No `echo <key>` or inline command containing the value. Disable debug/HTTP logging and session recording; avoid clipboard-sync/clipboard-history mechanisms. If a compliant transfer path is unavailable, stop and agree one rather than improvise.
3. If an approved CLI transfer is selected, use only the operator's approved secure-input/stdin workflow with no value in arguments/history/output or persistent temporary file. Do not publish or execute a credential-bearing command in this repository. Record metadata and provenance only; clear ephemeral buffers under the approved procedure. Never retrieve the newly stored payload just to compare or fingerprint it.
4. Apply only the approved secret-level accessor grant and capture metadata. Do not change Cloud Run bindings/versions/traffic or production/shared secret access in S1. Never copy the shared secret into a second resource as a substitute for staging provenance.
5. Record actual resource/version identifiers and restricted evidence through the existing Mission Control owner. No duplicate task. A successful version creation does not prove hosted auth compatibility or true isolation.

### Verification and inherited-access constraints

S1 verification is **metadata only**: correct parent/resource/version state, authorized source attestation and direct plus inherited IAM review. The25 local tests prove the pinned SDK/request path; they do not prove a live credential's role. Separately approved S2 may perform a read-only lookup of an already-approved synthetic staging user through the actual Auth gateway, with no real-user listing or app_metadata writes; no runtime check is authorized now.

**No inherited grants were freshly verified in this session.** Gate A could not inspect live IAM, so true staging-only isolation is not established. Check these specific paths before declaring it:

- Project/folder/org Secret Accessor or Secret Manager Admin grants, nested groups and conditions may allow additional readers even when the secret-level policy names only staging. Removing a resource-level binding does not remove inherited access. Deny/PAB/VPC-SC effects and unresolved membership must be reported, not assumed.
- Founder-reported production default runtime has project-level Editor, Cloud Run Admin and Service Account User, among other roles. **Editor alone is not proof of secret payload read access.** However, deploy authority plus actAs on the staging accessor identity can enable a revision to obtain the staging credential if those scopes/conditions permit. Exact applicability remains UNKNOWN pending metadata evidence; production least-privilege changes remain separately gated.
- Token Creator/other impersonation grants on the staging identity, build/deploy identities and old tagged revisions can defeat apparent isolation. Evaluate effective access, not merely a single secret policy screenshot.
- Removing staging's old Secret Manager grant does not erase a shared credential already loaded by a running old revision. Consumer retirement/quiescence and any issuer-side revocation decision belong to separately approved S2/operational gates; do not disable a shared version still used by production. S1 cannot certify old cached-key removal.

### Abort and rollback

Abort before any execution if operator/target/principal/ceiling/provenance is missing, an equivalent resource has unresolved ownership, the proposed grant is broader than approved, inherited/impersonation paths defeat the required isolation, or any excluded action becomes necessary. Preserve sanitized evidence and return the blocked field for canonical reconciliation.

If a future approved S1 fails **before binding**, leave existing serving revisions and shared/production secrets untouched. Under explicit cleanup authority, remove only the newly added staging grant and disable the newly created unused version if needed; retain evidence/retention and avoid immediate destructive deletion. If an existing secret was reused, do not disable/delete its versions or remove pre-existing grants used by other consumers. Destroying a resource, revoking an issuer key or rotating credentials is a separate approved lifecycle action. No rollback or cleanup is executed now.
