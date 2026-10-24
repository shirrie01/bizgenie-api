# BG-STUDIO-016 — Staging isolation, recovery verification and real-integration readiness plan

24 October 2026. **Preparation, documentation and isolated local testing only. Staging remains RED / NO-GO.** Nothing in this document has been executed against Google Cloud, Supabase, Stripe or any provider. This is engineering evidence for the sole Google Sheets Mission Control (DEC-015); it is not a second register and creates no operational record of its own. Decisions DEC-014/015/020/021/022 and LOCK-018/019/020 are respected and not re-opened.

## Evidence classes used throughout

| Tag | Meaning |
|---|---|
| **[V]** | Independently verified live metadata, read by this session. **None.** `gcloud` is installed but has no credentialed account in this environment, so no live cloud, Supabase or Stripe metadata was read. |
| **[F]** | Founder-supplied evidence (BG-STUDIO-013 live-infrastructure comment on Issue #191 and `BG_STUDIO_013` documents). Not re-verified here. |
| **[R]** | Repository-confirmed: read from code or migrations at the commit named in section 1. |
| **[L]** | Local disposable-test result: PostgreSQL 16.15 on loopback, synthetic data, no network. Proves a procedure or a code path, not the hosted environment. |
| **[U]** | Unverified assumption. Must be checked before it is relied on. |
| **[P]** | Proposed: a design or step not yet approved or executed. |

Every command in this document is marked **NOT EXECUTED — REQUIRES APPROVAL** unless it is a local loopback test. No command here contains a credential; angle-bracket placeholders stand for values the founder supplies out of band. Never paste a key, connection string or token into chat, Issues, PRs or Mission Control.

## 1. Executive summary

1. **The most important isolation defect is a shared secret.** [F] Staging revision `00029-wtc` and production revision `00126-vaw` both reference Secret Manager secret `bizgenie-supabase-service-role-key` at version 1, and both runtime identities hold Secret Accessor on it. Which Supabase project that key belongs to is **unknown [U]**. If it is the production key, the staging service holds a credential that bypasses Row Level Security on production data. If it is the staging key, production holds it. Either way one environment can reach the other's data authority. This must be closed before any real-customer or billable staging test.
2. **Production runs on the default Compute service account with Editor, Cloud Run Admin, Service Account User, Artifact Registry Writer, Vertex AI User and Logging Log Writer.** [F] Any code-execution flaw in the API would hold project-wide write power. A dedicated least-privilege identity is proposed (section 5). Staging already has a dedicated identity, `bizgenie-staging-runtime` [F].
3. **Restore has never been tested.** [F] Dashboard backups are visible; no restore has been performed. This session rehearsed the *procedure* locally [L] (dump, restore into a separate database, integrity checks, selective row recovery) and it works, but it proves nothing about Supabase backup availability, PITR, restore time or the hosted role model.
4. **New finding from the local restore rehearsal [L].** A logical dump/restore produces a database that is semantically identical but which the backend's own onboarding preflight **rejects**, so workspace onboarding would answer 503 until corrected. Cause: `pg_get_constraintdef` renders the nested `AND` of a `BETWEEN` check with different parentheses after `pg_dump`/`pg_restore`, and the preflight (`src/workspace-onboarding/preflight.js` with `schemaContract.json`) compares the raw text. The fail-closed behaviour is correct and must not be weakened without review. A repair that works on the restored copy was proven locally: re-issue the one constraint with its original migration text (section 7.4). A physical or point-in-time restore on the same major version is expected not to re-render constraints, but that is **[U]** until a real restore is rehearsed.
5. **Local migration rehearsal passed [L]:** the 20 prerequisite migrations, the onboarding base and the onboarding hardening apply in order, re-run idempotently, refuse out-of-order or violating-data application, roll back fully, and keep RLS and privilege properties. 20/20 checks passed. The repository's own onboarding PostgreSQL suite passed 19/19 on PostgreSQL 16.15.
6. **Staging flags are not a safe baseline.** [F] Staging currently has `STRIPE_BILLING_ENABLED`, `MEDIA_STORAGE_ENABLED`, `IMAGE_GENERATION_ENABLED` and `VIDEO_GENERATION_ENABLED` true. With those on, an authenticated staging request can reach paid image and video providers. A conservative baseline is proposed (section 8).
7. **Recommended order:** read-only verification first (Gate A), then credential isolation (B), database readiness (C), restore rehearsal in a separate staging-only target (D), safe configuration (E), the controlled end-to-end programme (F) and only then any production hardening cut-over (G). Nothing may begin without the approval named in section 12.
8. **First safe executable step:** Gate A, steps A1–A3, entirely read-only, requires only founder approval to run them with a read-only (`roles/viewer`-class) identity. See section 13.

### Reference heads (confirmed against GitHub during this task)

| Item | Head | Status |
|---|---|---|
| Backend main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` | [R] |
| Backend PR #213 | `120a874dfa02313a8c28dad82ddb6582f0065469` | draft, not superseded [R] |
| Backend PR #214 | `51e8ca493be1bfd6b45da1cb540d4bc090de2a85` | draft, base #213 [R] |
| Backend branch `bg-studio-015-backend-reliability` | `e84c6d0e8eacc6600a0d6e9a3971ccc7ee81384b` (tested code `fc9214f95b639092c2630805f7f98cd8588eb205`) | no PR [R] |
| Backend branch `bg-studio-012-staging-readiness` | `77a3bb99…` | documentation [R] |
| Frontend PR #48 / #49 | `7fe2bcc15f489b32fc7e80ffd2e0fc9ab24b7645` / `6c8e7b6bb68aee83843f567b5ba4dea84f3a0a1b` | draft [R] |

This branch is documentation-only and is based on `e84c6d0`. No application code, migration, workflow or dependency file was changed.

## 2. Verified infrastructure (and what verification means here)

| Item | Value | Class |
|---|---|---|
| GCP project / region | `bizgenie-backend` / `europe-west1` | [F] |
| Staging service | `bizgenie-api-staging`, serving `00029-wtc`, runs as dedicated SA `bizgenie-staging-runtime` | [F] |
| Production service | `bizgenie-apii`, serving `00126-vaw`; latest ready `00132-rep` receives no ordinary traffic; runs as the default Compute SA | [F] |
| Supabase staging | `zrczojyxebwjgpymbmgu`, micro compute, Ireland | [F] |
| Supabase production | `uvgblmejpbswkvlqvqmz`, nano compute, Ireland | [F] |
| Backups | dashboard backups visible for both; no restore ever performed; PITR status unknown | [F]/[U] |
| Shared secret | `bizgenie-supabase-service-role-key` v1 referenced by both revisions as `SUPABASE_SERVICE_ROLE_KEY`; Secret Accessor held by both runtimes | [F] |
| Differing bindings | `SUPABASE_URL`, `BRAND_BRAIN_DATABASE_URL` and `STRIPE_SECRET_KEY` refer to different secrets/values per environment | [F] |
| Staging flags | `STRIPE_BILLING_ENABLED`, `MEDIA_STORAGE_ENABLED`, `IMAGE_GENERATION_ENABLED`, `VIDEO_GENERATION_ENABLED` true; `PRODUCTION_ACTIVATION_ENABLED=false` | [F] |
| Production runtime roles | Editor, Cloud Run Admin, Service Account User, Artifact Registry Writer, Vertex AI User, Logging Log Writer | [F] |

**Limitation recorded honestly:** this session could not read live metadata. Section 3 lists what remains unknown, and Gate A (section 11) is the approved route to turn each unknown into a [V] item.

## 3. Known versus unknown

| # | Question | Known | Unknown / how to resolve | Risk if wrong |
|---|---|---|---|---|
| U1 | Which Supabase project does the shared service-role key belong to? | Both runtimes reference it [F] | Founder decodes the key's non-secret `ref`/`role` claims locally (A3). Newer `sb_secret_…` keys carry no `ref` claim; then compare against each project's key list in the dashboard | Cross-environment data authority |
| U2 | Has the shared key been logged, exported or seen by anyone/anything outside the runtimes? | No evidence either way | Audit logs `data_access` for Secret Manager (A2); Supabase API logs | Determines whether rotation of the production key is required |
| U3 | Do other secrets overlap (`ADMIN_KEY`, `SERVICE_PRINCIPAL_*`, webhook secrets, Stripe keys)? | Three bindings differ [F] | Compare secret resource names across both services (A1) | Shared admin or webhook trust |
| U4 | Is staging Stripe in test mode, with a test-mode webhook secret and test price ids? | Code requires `STRIPE_MODE=test` in staging [R] | Founder confirms key prefix only (`sk_test_`) and dashboard mode (A4) | Real charges from staging |
| U5 | Hosted PostgreSQL major version and the connecting role's attributes (`rolbypassrls`, ownership) | Tests assume PG17 in one test [R]; local runs were PG16.15 [L] | Read-only catalog queries (C1) | RLS-without-policies tables look empty to a non-bypass role [L]; preflight/ownership surprises |
| U6 | Which of the 22 migrations are applied on staging and production, and by what mechanism (CLI ledger vs manual SQL)? | Repository has 22 [R] | `supabase_migrations.schema_migrations` plus catalog fingerprint (C1–C3) | Applying a migration that expects absent parents; ledger drift |
| U7 | Supabase backup type (daily vs PITR), retention, restore procedure, restore duration, and whether restore keeps the `public` schema's constraint text | Backups visible [F] | Dashboard review (D1); a rehearsed restore into a *new* staging-only project (D3) | Unrecoverable data loss or unusable restore |
| U8 | Do Vertex AI User and the other roles on the production SA reflect actual use? | Code uses Vertex for text generation (`src/generation.js`) and Veo video (`src/video-generation/googleVeoProvider.js`) [R] | IAM Recommender and audit-log review (A5) | Over-broad or under-broad hardening |
| U9 | Budget, quota and alert configuration | Unknown | Billing console (A6) | Unbounded spend |
| U10 | Whether the production default Compute SA is used by other services in the project | Unknown | `gcloud run services list`, IAM policy (A5) | Changing its roles breaks unrelated workloads |
| U11 | Customer cancellation/deletion path and data-retention obligations | No customer cancellation/deletion API [R, BG-STUDIO-015-BE] | Founder policy | Compliance and support gap |

### Backend limitations carried from BG-STUDIO-015-BE [R]

Unresolved there, and relevant to any real test: no cross-instance exclusivity for generation execution (two orchestrators on one job invoked the provider twice); a Stripe event claim left `processing` returns 503 with no automatic takeover; 11 production dependency findings (2 critical, 2 high) from `npm audit --omit=dev`; campaign list performs per-campaign hydration (56 queries at 4 campaigns); no idempotency key on additional-workspace creation; no customer cancellation/deletion API. These constrain what the E2E programme may do (section 9): no concurrent generation, no deliberate webhook interruption, small data volumes.

## 4. Staging credential-isolation runbook

**Objective:** staging uses only staging credentials; production credentials are unreachable from the staging identity; production is not changed except where explicitly approved (and then only in Gate G).

**Principles:** a new secret rather than a new version of the shared one; production secret and production revision untouched; every step has a verification that never prints a secret; every step has a rollback.

### 4.1 Read-only discovery (Gate A) — NOT EXECUTED — REQUIRES APPROVAL

```bash
# A1  Which secrets does each service reference? (names and versions only; secret values are never returned by describe)
gcloud run services describe bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 \
  --format='yaml(spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env)'
gcloud run services describe bizgenie-apii        --project=bizgenie-backend --region=europe-west1 \
  --format='yaml(spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env)'
#     Review: any plain-text `value:` that looks like a secret; any secretKeyRef name present in BOTH services.

# A2  Who may read the shared secret, and who has read it?
gcloud secrets get-iam-policy bizgenie-supabase-service-role-key --project=bizgenie-backend
gcloud secrets versions list  bizgenie-supabase-service-role-key --project=bizgenie-backend
gcloud logging read 'protoPayload.serviceName="secretmanager.googleapis.com" AND protoPayload.methodName:"AccessSecretVersion" AND protoPayload.resourceName:"bizgenie-supabase-service-role-key"' \
  --project=bizgenie-backend --freshness=30d --limit=200 \
  --format='table(timestamp,protoPayload.authenticationInfo.principalEmail)'
#     Data-access logs exist only if enabled for Secret Manager; if they are off, record "no evidence" - do not infer "no access".

# A3  (founder, local terminal only) which project is the shared key for? Prints two claims only, never the key.
#     Skipped if the key is the newer opaque format; then use the dashboard key list instead.
gcloud secrets versions access 1 --secret=bizgenie-supabase-service-role-key --project=bizgenie-backend \
  | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); print({k:d.get(k) for k in ("ref","role")})'
#     This step does read the secret into a pipe. It needs explicit approval and must run on the founder's own terminal.

# A4  Stripe mode (founder, dashboard): staging uses test-mode keys and a test-mode webhook endpoint; record only "test"/"live".
# A5  Service accounts and role usage
gcloud projects get-iam-policy bizgenie-backend --format='table(bindings.role,bindings.members)'
gcloud run services list --project=bizgenie-backend --format='table(metadata.name,spec.template.spec.serviceAccountName)'
gcloud recommender recommendations list --project=bizgenie-backend --recommender=google.iam.policy.Recommender --location=global
# A6  Budgets and alerts (billing account id supplied by the founder)
gcloud billing budgets list --billing-account=<BILLING_ACCOUNT_ID>
```

### 4.2 Remediation (Gate B) — NOT EXECUTED — REQUIRES APPROVAL

Pre-conditions: Gate A complete; U1 answered; the founder has issued a staging-only service-role credential in the **staging** Supabase project dashboard (Project Settings → API keys). The credential is never shown to Claude.

```bash
# B1  Create a NEW staging-only secret (value read from the founder's clipboard/file via stdin, never from a command argument)
gcloud secrets create bizgenie-staging-supabase-service-role-key --project=bizgenie-backend --replication-policy=automatic
gcloud secrets versions add bizgenie-staging-supabase-service-role-key --project=bizgenie-backend --data-file=-   # stdin, founder-run

# B2  Grant the staging runtime, and only it, access to the new secret
gcloud secrets add-iam-policy-binding bizgenie-staging-supabase-service-role-key --project=bizgenie-backend \
  --member='serviceAccount:bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor

# B3  Deploy a NEW staging revision, no traffic, tagged, pointing SUPABASE_SERVICE_ROLE_KEY at the new secret
gcloud run deploy bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --image=<CURRENT_STAGING_IMAGE_DIGEST> \
  --no-traffic --tag=iso1 --update-secrets=SUPABASE_SERVICE_ROLE_KEY=bizgenie-staging-supabase-service-role-key:latest

# B4  Verify on the tagged URL (section 4.3), then move traffic
gcloud run services update-traffic bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --to-tags=iso1=100

# B5  Remove staging's access to the shared secret (last step; only after B4 is healthy for an agreed soak period)
gcloud secrets remove-iam-policy-binding bizgenie-supabase-service-role-key --project=bizgenie-backend \
  --member='serviceAccount:bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com' --role=roles/secretmanager.secretAccessor
```

The same pattern applies to any other secret found shared by A1 (`ADMIN_KEY`, service-principal keys, webhook secrets): create a staging-only secret, bind it, deploy no-traffic, verify, switch, remove the old accessor.

### 4.3 Verification without printing a secret

1. Metadata: repeat A1; the staging service references only `bizgenie-staging-*` secrets and no secret name appears in both services. [V once run]
2. Binding: `gcloud secrets get-iam-policy` on every secret shows each runtime SA only on its own environment's secrets.
3. Fingerprint (founder terminal): compare a truncated hash, not the key: `gcloud secrets versions access latest --secret=<name> | sha256sum | cut -c1-8` for the staging and production secrets; the two prefixes must differ. This reads the secrets into a pipe and needs the same explicit approval as A3.
4. Behaviour (synthetic staging account): a bootstrap/session-refresh request to the tagged URL succeeds (the scope provisioner uses the service-role key to write `app_metadata`); the new user appears in the **staging** Supabase Auth user list and not in production's.
5. Negative: with the staging identity, access to the production secret must be denied: `gcloud secrets versions access latest --secret=bizgenie-supabase-service-role-key --impersonate-service-account=bizgenie-staging-runtime@…` returns PERMISSION_DENIED after B5. (Impersonation requires an approved token-creator grant; otherwise rely on the IAM policy read in step 2.)

### 4.4 Production protection

No production deploy, no change to production secrets, bindings, traffic or flags in Gates A–F. Revision `00126-vaw` stays pinned. `00132-rep` stays without traffic. If U2 shows the shared key may have been exposed, the production key rotation is a **separate** decision (Gate G) because rotating a legacy JWT-secret-based key invalidates the anon/publishable key too and would break every signed-in customer; the newer per-key mechanism, if available on the production project, rotates only the service key.

### 4.5 Rollback

If anything is unhealthy after B3 or B4: `gcloud run services update-traffic bizgenie-api-staging … --to-revisions=bizgenie-api-staging-00029-wtc=100`. B5 is reversed by re-adding the binding. The new secret may be disabled (`gcloud secrets versions disable`) without affecting production. Rollback re-introduces the shared-credential exposure, so it is a temporary state, recorded as such.

## 5. Production IAM hardening proposal (Gate G — design only)

Current state [F]: the production runtime is the default Compute service account with Editor, Cloud Run Admin, Service Account User, Artifact Registry Writer, Vertex AI User and Logging Log Writer. Runtime code needs far less [R]: read its own secrets, write logs, call Vertex AI for text and (only if enabled) Veo, write media to one bucket (only if enabled), and talk to Supabase and Stripe over the network.

| Permission | Proposed identity | Scope | Justification |
|---|---|---|---|
| `roles/secretmanager.secretAccessor` | `bizgenie-prod-runtime` (new) | per secret, only the production secrets | Reads `BRAND_BRAIN_DATABASE_URL`, Supabase key, Stripe keys, webhook secret, admin key |
| `roles/logging.logWriter` | `bizgenie-prod-runtime` | project | Structured logs |
| `roles/aiplatform.user` | `bizgenie-prod-runtime` | project — **keep only if** A5/Recommender confirms use | `src/generation.js` Vertex text; Veo only when `VIDEO_GENERATION_ENABLED` |
| `roles/storage.objectCreator` + `roles/storage.objectViewer` | `bizgenie-prod-runtime` | the media bucket only, **only when** media storage is enabled | `MEDIA_STORAGE_BUCKET`; avoid `objectAdmin` unless deletion is required |
| Editor, Cloud Run Admin, Service Account User, Artifact Registry Writer | **removed from the runtime**; held by a separate deployer identity (CI/Cloud Build or the founder) | project/repo | Deploy-time rights have no runtime purpose |

Staged change [P]: (1) create `bizgenie-prod-runtime`, bind the minimum above; (2) read IAM Recommender output for the default Compute SA and check A5 for other services using it (U10); (3) deploy a **no-traffic tagged** production revision with the new identity and run read-only smoke tests (health, authenticated read of a synthetic account in a pre-agreed production test tenant if one exists — otherwise health only); (4) move traffic only with Gate G approval, in a pre-agreed window; (5) remove roles from the default Compute SA last, and only if U10 shows no other consumer. Rollback: traffic back to `00126-vaw` (which still uses the old identity until step 5). **Do not** edit the default Compute SA's roles before step 4 has soaked.

Residual risk: removing Editor may reveal a permission the service silently needed (for example a Vertex region or a bucket). This is why the proof happens on a no-traffic tag first.

## 6. Database and migration readiness

### 6.1 Repository facts [R]

* 22 migrations in `supabase/migrations`. Onboarding base `20261023100000_create_workspace_onboarding_profiles.sql` requires `customer_profiles` and the `brand_brains (project_id, brand_id)` unique key; hardening `20261024090000_harden_workspace_onboarding_profiles.sql` requires the base, adds a composite FK to `projects (project_id, tenant_id)` (needs the unique key from the credit-ledger migration) and a channels-values check, in one transaction with validation.
* There is no `CREATE/ALTER TABLE` in `src`; every repository `initialize()` verifies relations and guards only. The application never repairs schema.
* Onboarding preflight compares the catalog exactly (RLS on, no policies, no PUBLIC/anon/authenticated/service_role privileges at table and column level, 18 columns with types, constraints validated, `pg_get_constraintdef` text) and returns 503 on any difference.
* `brand_brains_project_id_fkey` is intentionally `NOT VALID` (migration `20260818010000`).
* The backend uses one pool from `BRAND_BRAIN_DATABASE_URL` for most repositories. The tables have RLS enabled and no policies, so the connecting role **must** bypass RLS (BYPASSRLS or owner). Local proof [L]: a non-owner role without BYPASSRLS sees 0 rows and cannot insert; BYPASSRLS and owner roles see rows; anon/authenticated/service_role have no privilege.

### 6.2 Local disposable results [L] (PostgreSQL 16.15, loopback, synthetic data)

Script: `docs/studio/rehearsal/bg016_migration_rehearsal.sh`.

| Check | Result |
|---|---|
| 20 prerequisite migrations → onboarding base → hardening apply in order | pass |
| Idempotent re-run of base and hardening | pass |
| Hardening before base is refused | pass |
| Data violating the hardening is refused and the whole transaction rolls back; after repair it re-applies | pass |
| RLS on, no policies; privilege matrix; parent unique keys present | pass |
| Role behaviour (non-bypass / BYPASSRLS / owner) | pass |
| **Total** | **20 pass / 0 fail** |
| Repo `npm run test:onboarding:postgres` against PG 16.15 | 19/19 pass |
| Focused brand-brain / workspace-reliability / billing / campaign integration set | 60 of 61 pass; the one failure asserts PostgreSQL 17 (`server_version` mismatch) — the pre-existing, known PG17 assertion, not a defect |

Not proven locally: hosted Supabase role model (`postgres` is not a superuser there), extensions, real data volumes, lock duration on a micro/nano instance, the Supabase CLI migration ledger.

### 6.3 Staging verification plan (Gate C) — read-only — NOT EXECUTED — REQUIRES APPROVAL

Run from a trusted terminal through the pooler/direct connection with a **read-only** role (or the application role used only for SELECT). Connection details come from the founder, never from chat.

```sql
-- C1  environment identity (confirms we are looking at staging, not production)
select current_database(), current_setting('server_version'), inet_server_addr(), now();
select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = current_user;
-- C2  migration ledger and presence of the onboarding objects
select version, name from supabase_migrations.schema_migrations order by version;   -- may not exist if migrations were applied by hand
select to_regclass('public.workspace_onboarding_profiles') is not null as has_onboarding,
       to_regclass('public.customer_profiles') is not null as has_customer_profiles;
-- C3  RLS and privileges on the onboarding table
select relrowsecurity, relforcerowsecurity, relowner::regrole from pg_class where oid = 'public.workspace_onboarding_profiles'::regclass;
select count(*) as policies from pg_policies where tablename = 'workspace_onboarding_profiles';
select grantee, privilege_type from information_schema.role_table_grants where table_name = 'workspace_onboarding_profiles';
-- C4  not-valid constraints (expected: brand_brains_project_id_fkey only)
select conrelid::regclass, conname from pg_constraint where connamespace = 'public'::regnamespace and not convalidated;
-- C5  row counts of customer-facing tables (counts only, no content)
```

Then run the **backend's own preflight read-only** (`src/workspace-onboarding/preflight.js` performs catalog SELECTs only) with a small script that opens one connection and calls `preflight(client)`; expected `PREFLIGHT-OK`. Record the outcome as [V].

### 6.4 Applying migrations (Gate C2) — **not authorised here**

If C2–C4 show onboarding objects absent: take a pre-migration backup (section 7), review the exact SQL diff, apply to **staging only** in the order proven in 6.2 using one mechanism (the Supabase CLI so the ledger stays truthful), run the preflight, then the repository's onboarding PostgreSQL tests against a *copy*, not staging. Production is out of scope until Gate G. Stop conditions: ledger drift, any unvalidated constraint other than the known one, preflight failure, lock wait over an agreed threshold on a micro instance.

## 7. Recovery and restore runbook

### 7.1 What recovery means here

* **RPO/RTO are undefined.** [U] No target has been set. Proposed starting targets for founder decision: RPO ≤ 24 h (daily backup) until PITR is confirmed, RTO ≤ 4 h for staging. Targets are only meaningful after a timed rehearsal (D3).
* Three recovery shapes: (a) **forward row recovery** — copy lost rows from a restored copy back into the live database, no downtime; (b) **point-in-time restore** — managed by Supabase, replaces or clones the project; (c) **logical dump/restore** — `pg_dump`/`pg_restore` into a separate empty database.

### 7.2 Local rehearsal [L]

Script: `docs/studio/rehearsal/bg016_restore_rehearsal.sh` (run after the migration rehearsal). Results:

| Step | Result |
|---|---|
| `pg_dump -Fc` of the migrated database | ~0.1 s, ~282 KB (synthetic, tiny; not a performance forecast) |
| `pg_restore` into a **separate empty database** (never over the source) | ~0.3 s |
| Row counts for all 39 tables identical | pass |
| Structure, indexes, RLS policies, table ACLs, functions and triggers fingerprints identical (constraint text compared ignoring parentheses and whitespace; ACLs normalised against the default ACL) | pass |
| NOT VALID constraints identical before and after (`brand_brains_project_id_fkey`, by design) | pass |
| Onboarding constraints validated; RLS enabled; anon/authenticated/service_role still have no privilege | pass |
| **Backend onboarding preflight on the restored copy** | **FINDING — rejected** (see 7.4) |
| Candidate repair: re-issue the one constraint with its migration text, re-run preflight | pass (restored copy only) |
| Simulated accidental loss → copy rows back from restored copy → count recovered | pass |
| **Total** | **14 pass / 0 fail / 1 finding** |

### 7.3 Staging recovery rehearsal (Gate D) — NOT EXECUTED — REQUIRES APPROVAL

Never restore over an existing environment. Targets: a **new, staging-only** Supabase project or a local/loopback database; never production's project and never the live staging database.

1. **D1 (read-only):** dashboard review of backup list, type (daily/PITR), retention, last successful backup time for both projects; record screenshots-as-text, no keys.
2. **D2:** founder takes a manual logical backup of staging (`pg_dump -Fc` from a trusted terminal using the pooler's direct-connection string) — a read operation on the database.
   ```bash
   # NOT EXECUTED — REQUIRES APPROVAL (founder terminal; connection string from the dashboard, never pasted into chat)
   pg_dump --format=custom --no-owner --no-privileges --schema=public --file=staging-$(date -u +%Y%m%dT%H%MZ).dump "$STAGING_DB_URL"
   ```
3. **D3 (timed):** restore that dump into a *new empty* target, with a stopwatch: dump time, restore time, row-count comparison, structural fingerprint (`30_fingerprint.sql`), backend preflight (7.4), RLS and privilege checks (`20_rls_roles.sql`). Record RTO as measured, with the instance size noted.
4. **D4:** Supabase-managed restore (PITR or backup restore) to a *new* project **if** the plan supports restore-to-new-project; confirm whether restoring creates a clone or overwrites. If it can only overwrite, record "managed restore unsafe to rehearse on the live project" and stop.
5. Abort conditions: any step that would write to staging's or production's live database; a target that is not provably empty and separate; connection strings pointing at production's project ref (`uvgblmejpbswkvlqvqmz`).

### 7.4 Finding: onboarding preflight rejects a logically restored database [L]

* **What happens:** the migration declares `check (length(x) between 1 and 128 and x ~ '…')`. In the source database `pg_get_constraintdef` renders `((((length(x) >= 1) AND (length(x) <= 128)) AND (x ~ '…'::text)))`; after `pg_dump | pg_restore` it renders `(((length(x) >= 1) AND (length(x) <= 128) AND (x ~ '…'::text)))`. Meaning is identical. The preflight compares text against `schemaContract.json`, so it throws `OnboardingPersistenceError` and onboarding answers 503. Only `workspace_onboarding_profiles_last_idempotency_key_check` differs.
* **Impact:** a logical restore is "successful" by every data check yet leaves onboarding unavailable. Fail-closed is the designed behaviour; this is a recovery-procedure gap, not a security defect.
* **Remediation A (procedure, proven locally on a restored copy, a write, so needs approval when run on any real database):** after a logical restore, drop and re-add that one constraint with its exact migration text, then run the preflight:
  ```sql
  -- NOT EXECUTED — REQUIRES APPROVAL (restored target only; never the live database)
  begin;
  alter table public.workspace_onboarding_profiles drop constraint workspace_onboarding_profiles_last_idempotency_key_check;
  alter table public.workspace_onboarding_profiles add constraint workspace_onboarding_profiles_last_idempotency_key_check
    check (length(last_idempotency_key) between 1 and 128 and last_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$');
  commit;
  ```
* **Remediation B (code, proposal only):** make the preflight compare a normalised constraint expression (strip redundant parentheses) with tests. This is a change to a security-relevant fail-closed guard, so it needs a reviewed backend PR and founder approval; **not** done here.
* **Expected scope [U]:** physical/PITR restores on the same major version keep the original catalog entries and are not expected to be affected; restoring to a different major version might re-render other expressions. Confirm with D3/D4 before relying on either.
* **Standing rule:** after *any* restore, run the preflight and the section 6.3 checks before routing traffic.

### 7.5 Incident decision tree [P]

Data wrong but database up → forward row recovery from a restored copy (7.3). Database lost or corrupted → managed restore to a new project, repoint `BRAND_BRAIN_DATABASE_URL` through a **new secret version** and a no-traffic revision, preflight, then traffic. Credential exposure → section 4 pattern, rotate affected secrets, review audit logs. Always freeze writes first when the cause is unknown.

## 8. Safe staging configuration (Gate E)

Startup rules [R]: activation flags must be exactly `"true"` or `"false"` (empty/unset is false; any other value throws); `BIZGENIE_ENVIRONMENT` must be `staging` or `production`; production additionally needs `PRODUCTION_ACTIVATION_ENABLED=true`; image/video generation require `MEDIA_STORAGE_ENABLED`; Stripe in staging requires `STRIPE_MODE=test`; `BILLING_DURABLE_ENABLED=true` requires `BILLING_APPROVED_POLICY_IDS` and `BILLING_APPROVED_EXECUTION_CLASSES`.

| Variable | Current staging [F] | Proposed baseline for isolation and the first E2E pass [P] | Reason |
|---|---|---|---|
| `BIZGENIE_ENVIRONMENT` | staging (presumed) | `staging` | required |
| `PRODUCTION_ACTIVATION_ENABLED` | false | **false** | must stay false in staging |
| `IMAGE_GENERATION_ENABLED` | true | **false** | no paid provider call until Gate F2 approval |
| `VIDEO_GENERATION_ENABLED` | true | **false** | highest-cost provider |
| `MEDIA_STORAGE_ENABLED` | true | **false** until a media-only test is approved (then true with an isolated bucket) | avoid public/durable storage by default |
| `STRIPE_BILLING_ENABLED` | true | **false** for F-01–F-07; **true only** with `STRIPE_MODE=test` and test price ids for F-08 | test mode only; production must not share webhook secret |
| `STRIPE_MODE` | unknown | `test` | enforced in code |
| `BILLING_DURABLE_ENABLED` | unknown | false unless entitlement/ledger reads are in scope | smaller blast radius |
| `PAID_BETA_LAUNCH_PROOF_ENABLED` | unknown | **false** | launch-proof router must stay off |
| Provider keys (`OPENAI_API_KEY`, Veo output URI) | unknown | **not bound** while the matching flag is false | a missing key cannot be spent |
| `CORS_ENABLED` / `CORS_ALLOWED_ORIGINS` | unknown | one exact staging frontend origin; no wildcard | origin allow-list |
| `SUPABASE_*`, `BRAND_BRAIN_DATABASE_URL`, `ADMIN_KEY` | bound | all staging-only secrets (section 4) | isolation |

Order of change [P]: no-traffic tagged revision with the new flags, verify startup (the service refuses inconsistent flags), exercise `GET /health` and read-only routes on the tag, then shift traffic. Rollback: traffic to the previous revision.

## 9. Real end-to-end acceptance matrix (Gate F — design only)

**Principles:** three synthetic customers on staging only; test-mode Stripe only; no real person's data; run only after Gates A–E pass and the founder approves each class. No test in this plan is run by this session.

| Customer | Purpose |
|---|---|
| **A** | Owner of a workspace; full journey |
| **B** | Member of A's workspace (non-owner) — exercises DEC-021/022 write restriction |
| **C** | Separate tenant — isolation / cross-tenant negative tests |

Classes: **R** read-only · **S** synthetic staging write · **$** potentially billable (own approval) · **X** prohibited (never executed, even in staging).

| ID | Maps to | Scenario | Actor | Class | Expected result | Evidence |
|---|---|---|---|---|---|---|
| E01 | F-01 | Sign-in, session refresh, `GET /customer` | A | R | 200, `private, no-store`, `Vary: Authorization` | response headers, status |
| E02 | F-01 | Missing/expired token on `/customer/*` | none | R | 401 `AUTHENTICATION_REQUIRED` | status/code |
| E03 | F-02 | Bootstrap new workspace, idempotent repeat | A | S | 201 then reuse; one tenant row; revoked membership is **not** re-granted | row counts in staging DB |
| E04 | F-03 | Onboarding save and resume | A | S | 200; resume after reload; incomplete → 422 `ONBOARDING_INCOMPLETE` where applicable | onboarding row, preflight OK |
| E05 | F-04 | Brand Brain read | A, B | R | 200 with stored values | body shape |
| E06 | F-05 | Brand Brain edit by owner (name/description) | A | S | 200; new version | DB version row |
| E07 | F-05 | Brand Brain edit by member of other fields | B | S | 200; identity unchanged | DB row |
| E08 | F-06 | Member changes name/description | B | S | 403 `BRAND_BRAIN_WRITE_FORBIDDEN`, nothing saved | DB unchanged |
| E09 | F-06 | Concurrent edits | A + B | S | one 200, other 409 `BRAND_BRAIN_VERSION_CONFLICT` or later write wins per contract; no corruption | DB version |
| E10 | F-07 | Cross-tenant read/write | C → A's workspace | R/S | 403 / 400 `trusted_scope`; zero data returned | status, body, DB unchanged |
| E11 | F-07 | Revoked member keeps old token | B after revoke | S | 403 `BRAND_BRAIN_WRITE_FORBIDDEN` or workspace-unavailable | status |
| E12 | F-08 | Checkout session creation (test mode) | A | $ | 200 with Stripe **test** URL; no charge | Stripe test dashboard event |
| E13 | F-08d | Customer A upgrades with a Stripe test card; webhook verified | A | $ | entitlement updated once; duplicate event idempotent | ledger rows, webhook log |
| E14 | F-08e | Webhook replay / bad signature / unknown event type | none | S | 400 on bad signature; replay returns same result; **no deliberate mid-processing interruption** (known `processing` claim limitation) | status, claim row |
| E15 | F-09 | Generation job: one text/image preview at the lowest tier | A | $ | requires E-approval; single job, no concurrency (known exclusivity gap); one reservation, one debit | provider usage, ledger |
| E16 | F-10 | Campaign create/list/update (PATCH) | A | S | 2xx; CORS preflight allows PATCH from the exact origin | status, headers |
| E17 | F-11 | Browser cache/CORS behaviour from disallowed origin | none | R | no CORS headers; no caching of customer bodies | headers |
| E18 | F-12 | Rate/failure handling: 503 when persistence unavailable (simulated locally, not in staging) | — | local only | fail-closed 503, no partial write | local test |
| X1–X4 | — | Production endpoints/data; real card numbers; video generation; load testing | — | **X** | never executed in this programme | — |

Per-test record: request id, timestamp, status, error code, the DB rows touched (read-only SELECT), cost line (if class $). A test that deviates stops the run; no retries that could double-spend.

## 10. Cost controls

Figures below are **unknown [U]**; the founder supplies the budget. Controls proposed [P]:

* Hard ceiling for the whole programme and per class; proposal: S/R unlimited within free tier; **$ tests capped per test and in total** (suggested starting caps: single image preview ≤ a founder-set amount; video not in scope).
* Budget alert thresholds at 50 / 80 / 100 % on the billing account and on the Stripe test account (no money moves in test mode); Vertex quota set low; provider keys restricted to the staging project and spend-limited in each provider's console.
* Lifetimes: synthetic accounts deleted or deactivated within 7 days; the isolated bucket and any restore target project are deleted when Gate D ends; the new project, if created, is paused immediately after use.
* Cleanup list per test: synthetic users, tenants, workspaces, jobs, media objects, Stripe test customers.
* Abort thresholds: any unexpected provider call; spend at 80 % of the ceiling; a cross-tenant leak (stop and escalate); the preflight failing unexpectedly.
* Expected costs: staging Supabase micro and a temporary restore project are small, but exact monthly and per-use figures are **not verified here**.

## 11. Change sequence, gates and stop conditions

| Gate | Purpose | Evidence required to pass | Owner | Effort | Depends on | Cost | Approval | Stop conditions |
|---|---|---|---|---|---|---|---|---|
| **A** | Read-only discovery (4.1) | A1–A6 outputs recorded as [V] | Founder + Claude | 1–2 h | — | none | Founder: run read-only commands | any command that would write; credentials printed |
| **B** | Credential isolation (4.2–4.3) | no shared secrets; staging cannot read production's; bootstrap works on staging; production unchanged | Founder runs, Claude reviews | 2–4 h | A | negligible | Founder: create secret, deploy no-traffic revision, switch traffic, remove binding | tagged revision unhealthy; production behaviour changes |
| **C** | Database readiness (6.3) | catalog queries + preflight OK on staging | Founder + Claude | 1–2 h | A | none | Founder: read-only DB role/connection | preflight fails; ledger drift; unexpected objects |
| **C2** | Staging migrations (only if C shows gaps) | applied via CLI; preflight OK | Founder | 1–2 h | C, D2 | small | Founder: apply to staging | lock wait; any unvalidated constraint beyond the known one |
| **D** | Recovery rehearsal (7.3) | measured RTO; fingerprint, preflight and RLS checks on the restored target | Founder + Claude | 0.5–1 day | A, C | small (temporary project) | Founder: dump, create separate target, restore | target not provably separate; any pointer at production |
| **E** | Safe configuration (8) | tagged revision starts cleanly with the baseline flags | Founder | 1 h | B | none | Founder: deploy no-traffic revision | startup refuses flags; unexpected provider reference |
| **F** | E2E programme (9) | each class result recorded; leaks = 0; costs within ceiling | Founder + Claude | 1–2 days | B, C, D, E; budgets set | capped | Founder per class: R/S, then $ | any cross-tenant leak; unexpected spend or provider call |
| **G** | Production hardening (5, key rotation if U2 requires) | tagged production revision healthy; traffic window; rollback ready | Founder | 0.5–1 day | A–F | none | Founder: explicit, window-specific | any production health regression |

## 12. Rollback, abort and the founder approval matrix

**Global abort:** stop immediately and report if (1) a command would write to production, (2) a secret value appears in output or a log, (3) a provider call occurs that was not planned, (4) data crosses a tenant boundary, (5) a restore target is not provably separate and empty, (6) the budget ceiling is reached.

**Rollback summary:** Cloud Run changes are reversible by routing traffic back to the previous revision (staging `00029-wtc`, production `00126-vaw`). Secret bindings are reversible by re-adding the IAM binding. Data writes in staging are limited to synthetic accounts and are cleaned up (section 10). Production is not touched until Gate G.

| Decision / action | Founder approval needed | Notes |
|---|---|---|
| Run Gate A read-only commands | Yes (identity with read access) | A3 and the fingerprint comparison read secret bytes into a pipe: explicit yes |
| Create new secrets, bindings, revisions, traffic changes (Gate B, E) | Yes, per gate | staging only |
| Remove staging's access to the shared secret | Yes | after soak |
| Production key rotation | Yes, separate | only if U2 indicates exposure |
| Production IAM hardening | Yes, separate | window and rollback agreed |
| Apply staging migrations | Yes | after backup |
| Create temporary restore project; run restore | Yes | cost and deletion date stated |
| Stripe test-mode flows | Yes | test mode only |
| Any provider-billable test | Yes, per test and cap | |
| Backend preflight normalisation change (7.4 B) | Yes, plus code review | separate PR; no change here |
| PR merges, flag activation, production traffic | Not requested; remain prohibited | |

## 13. Top three next actions and first safe executable step

1. **Gate A (read-only discovery)** — resolve U1–U3, U8–U10; this is the only thing that can change the plan's shape.
2. **Gate B (credential isolation)** — do not run any billable or real-customer test while a shared service-role secret exists.
3. **Gate D (restore rehearsal)** — measure the real RTO and confirm whether the restored database passes the preflight, before relying on recovery.

**First safe executable step:** with a read-only gcloud identity, run A1 and A2's `get-iam-policy` and `versions list` commands (metadata only) and send back the YAML with any plain-text `value:` entries redacted. Nothing is written, no secret is read.

## 14. Verification performed in this task

| What | How | Class |
|---|---|---|
| Reference heads | GitHub MCP pull-request listing; remote branch listing | [R] |
| Live cloud state | not accessible (no credentialed `gcloud` account) | not verified |
| Configuration semantics | read `src/activation/config.js`, `src/activation/productionComposition.js`, `src/billing/stripe/productionComposition.js`, `src/billing/productionComposition.js`, `index.js`, onboarding preflight/contract, 22 migrations | [R] |
| Migration rehearsal | `docs/studio/rehearsal/bg016_migration_rehearsal.sh`, local PG 16.15 loopback | [L] 20/20 |
| Restore rehearsal | `docs/studio/rehearsal/bg016_restore_rehearsal.sh` | [L] 14 pass / 0 fail / 1 finding |
| Repo onboarding PostgreSQL tests on PG 16.15 | `npm run test:onboarding:postgres` | [L] 19/19 |
| Focused integration set | brand-brain-write-policy, customer-workspace-reliability, postgres-billing, postgres-campaign | [L] 60 of 61; the failure is the known PG17 version assertion |
| Secrets | no secret read, created, rotated or printed; no IAM, deployment, database or provider action performed | — |

The local scripts refuse to run against anything but loopback. The disposable cluster and scratch databases were stopped/dropped at the end of the task.

## 15. Files in this change

* `docs/studio/BG_STUDIO_016_STAGING_ISOLATION_RECOVERY_PLAN.md` (this document)
* `docs/studio/rehearsal/` — `bg016_migration_rehearsal.sh`, `bg016_restore_rehearsal.sh`, `00_supabase_stub.sql`, `10_seed_violation.sql`, `20_rls_roles.sql`, `30_fingerprint.sql`, `31_rowcounts.sql`

No application code, migration, workflow, package or lockfile changed.
