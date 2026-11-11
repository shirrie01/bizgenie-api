# BG-017C-07 — read-only application-pool diagnostic: PROPOSAL FOR REVIEW (not approved, not deployed, not run)

11 Nov 2026 (Claude). This directory is documentation only. **No Cloud Run Job, revision, IAM change, secret access, traffic move or SQL has been authorised or performed.** Codex is asked to review the file below for **safety and equivalence**, not to recreate it.

## 1. The file
- Path in this branch: `docs/staging/pool-diagnostic/pool-diagnostic.proposal.cjs`
- SHA-256: `b86db00b3a4edb05178a32b2d9e8292d0bc17ccf9a1fd34f4b1748b5bcc282be` (verify with `sha256sum` on the file below)
- Behaviour: opens ONE connection from a `pg` Pool built from `BRAND_BRAIN_DATABASE_URL` (`max: 1`, 5 s connect timeout), runs `begin read only`, then six read-only statements (current_user/session_user; `rolsuper/rolbypassrls` for current_user; for the four tables `has_table_privilege(current_user, …, select|insert|update)`, `relrowsecurity`, `relforcerowsecurity`, policy count, ownership flag; then the **unmodified** `preflight(client)` from `src/workspace-onboarding/preflight.js`), prints ONE JSON line and `rollback`s. It prints role **names**, booleans and the preflight result; it never prints the connection string, a stack trace or any application row. On any error it prints only `{"error": <code|class name>}` and exits 1.
- Stubbed run only (stub `pg`): values from that run are not evidence.

## 2. Provenance the reviewer must confirm (and what is known today)
| Item | Value / how to obtain (read-only) |
|---|---|
| Source commit of the tagged revision | `f1fc2f51502793d9fb03617f30fd72b5a61c1e2e` (tag `f1fc2f51`; #226 integration head at build time) |
| Onboarding + preflight source | `src/workspace-onboarding/` is byte-identical at that commit, at #213 `a6ba6c02` and at the current heads of #214, #215, #220 and #230 (git diff of the directory is empty) |
| Container image digest of `bizgenie-api-staging-00030-pob` | **UNKNOWN to the author.** `gcloud run revisions describe bizgenie-api-staging-00030-pob --project bizgenie-backend --region europe-west1 --format='value(spec.containers[0].image)'` (name + digest, no secret) |
| Source → image attestation | still the open manifest item (Cloud Build source fields null). Image digest ↔ build id check is the R5 evidence. The Job must use that exact digest |
| Pool construction in the app | `index.js` `createProductionApp`: `createPostgresBrandBrainRepositoryFromEnv({env})` builds the Pool from `BRAND_BRAIN_DATABASE_URL`; `PostgresWorkspaceOnboardingRepository({pool: brandBrainRepository.pool})` shares it; startup runs `initialize()` = `SELECT brand_id FROM public.brand_brains LIMIT 0` **before** `listen()` |
| Pool options in the app | `src/brand-brain/postgresRepository.js` (`new Pool({connectionString,…})`); the diagnostic deliberately uses `max:1`, i.e. NOT identical pool options — it proves role/privilege/catalog behaviour, not pool sizing |
| DB URL secret | `bizgenie-staging-database-url`, version 5 (alias `latest` resolved in the earlier manifest); the Job must pin the same version, never `latest` |
| Runtime service account | `bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com` (already holds accessor on that secret) |
| Project / region | `bizgenie-backend` / `europe-west1` |
| Not bound | `SUPABASE_SERVICE_ROLE_KEY`, any Stripe/provider secret |

## 3. Controls
- **No network exposure / endpoint:** a Cloud Run **Job** (no HTTP listener, no ingress, no public invoker); not a service revision; no traffic touched.
- **No application rows:** statements touch `pg_roles`, `pg_class`, `pg_policy`, `pg_catalog` functions only; `preflight` reads catalog only.
- **Transaction/timeouts:** `begin read only` + `rollback`; connect timeout 5 s; Job task timeout 60 s; `--max-retries 0`; one task.
- **Logging redaction:** one JSON line; connection errors reported as code only.
- **One-time policy:** create → execute once → read logs → delete the Job; re-run needs a new approval.
- **Stop conditions:** wrong image digest; secret version other than 5; service account other than the staging runtime SA; any output containing a URL or `@`; non-JSON output.
- **Rollback:** delete the Job (no other state changed).

## 4. Expected output schema
`{"who":{"current_user_name":"…","session_user_name":"…"},"role":{"rolsuper":bool,"rolbypassrls":bool},"grants":[{"table_name","can_select","can_insert","can_update","rls_enabled","rls_forced","policies","is_owner"}×4],"preflight":{"professional":bool}|{"error":"OnboardingPersistenceError"}}`
Healthy for the staging DB seen in R1: role `postgres` (or the role the URL maps to), all privileges true, `rls_enabled` true, `policies` 0 on onboarding, `preflight.professional` true.

## 5. Limits (must be stated in any report that uses it)
A separate Job process is **not the live 00030-pob process**. Its role/privilege findings equal `00030-pob`'s **only if** image digest, `BRAND_BRAIN_DATABASE_URL` secret version, connection mechanism (pooler vs direct, same user) and target database are shown equivalent. It does not prove the Auth-admin key, load behaviour, other migrations or 00029 isolation. Do not describe its output as a direct observation of an existing process.

## 6. Existing evidence that needs no new facility (metadata/log reads only)
Because `startServer()` awaits `createProductionApp` (which awaits `initialize()`) before `listen()`, a revision that is **Ready** and logged `Listening on <port>` has already connected with its pool and run `SELECT … FROM public.brand_brains LIMIT 0` as the pool role. Read-only checks: `gcloud run revisions describe bizgenie-api-staging-00030-pob --format='value(status.conditions)'` (Ready=True) and Cloud Logging for that revision: `textPayload:"Listening on"` or `"Startup failed"`. This shows connectivity and SELECT on `brand_brains` for the real pool; it does **not** show INSERT/UPDATE, the onboarding table, RLS effect or the preflight result.
