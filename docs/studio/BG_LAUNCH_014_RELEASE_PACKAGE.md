# BG-LAUNCH-014 — release and rollback package (preparation only)

## Scope and source

Candidate branch: bg-launch-014-integration-closure, based on d44b29f185f20b1ac6b23df439c14cfaec8c906b. This contains #226 plus #227 plus the tested LinkedIn composition correction. **Do not apply #227 again.** Original integration candidates and Claude's Web branches remain unchanged. Final tested/published SHA is recorded in the evidence manifest/final checkpoint, not inferred from a mutable branch.

No application endpoint behavior, provider flag default, credentials, pricing or database schema change in BG-LAUNCH-014. Additions are an executable read-only runner, customer contract revision 2, reusable synthetic local fixture and tests. Required declared runtime remains Node 22; existing PostgreSQL/media tools and lockfile dependencies reused, no installation.

## Database requirements — no execution here

**New migrations: none.** Do not rerun completed migration work. Existing source dependencies include onboarding 20261023100000 and 20261024090000, professional-sector 20261025090000, quote/claims and job links 20261026100000/120000, social lifecycle 20261026140000, OAuth binding 20261027180000, launch profiles 20261031120000, draft lifecycle 20261031190000 and private connector runtime 20261031200000, plus their existing dependency chain. Names are SOURCE REQUIREMENTS, not a claim they are applied live.

Current staging migration completion is recorded by founder/other checkpoints but unavailable for independent read here. Attach that existing exact schema/preflight/effective-role/RLS evidence; do not classify it as missing or execute migrations to rediscover it. Runner never connects to PostgreSQL. Local contract command uses the existing test harness's fresh disposable UUID database and fixture schema setup only, never staging.

## Public configuration / hosted browser compatibility

Existing backend supports the exact origin by configuration, with no code widening:

- BIZGENIE_ENVIRONMENT=staging
- CORS_ENABLED=true
- CORS_ALLOWED_ORIGINS=https://staging-app.getbizgenie.com (plus only separately approved origins)
- SUPABASE_URL must identify zrczojyxebwjgpymbmgu, never production.

These are proposed/required values, **not changes made**. Approved media requests permit Authorization and Range, expose range/length headers, and allow GET/HEAD. Normal customer requests permit authorization/content-type and existing methods. Exact origins, error privacy and refusal of arbitrary/admin/serverless browser headers are tested. No wildcard origin or credentials-in-browser workaround.

Web #66 uses **VITE_BIZGENIE_API_URL**, not VITE_API_BASE_URL; its default localhost:8080 is unsuitable for a hosted build. VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are browser-public only. Never include service-role keys, Cloud Run IAM tokens, DB URLs, provider/Stripe secrets or encryption keys in VITE values or the static bundle. Verify the actual staged build config through Claude's existing BG-LAUNCH-013 process; no frontend file/config was changed here.

**Private Cloud Run IAM is a separate hosting blocker.** Browser CORS preflight carries no application bearer token or server invoker identity, and the customer Supabase JWT is not a Cloud Run IAM invoker token. App-level CORS success cannot make an invoker-protected tag usable directly by a public static Studio. Do not make the API public to pass acceptance, embed an IAM token, allow x-serverless-authorization from the browser or assume CORS changes solve IAM.

Smallest secure supported arrangement: use an existing approved server-capable hosted Studio/BFF/reverse-proxy runtime, if present. Browser calls its same-origin allowlisted API path, passing the customer Supabase bearer. The trusted server uses its own authorized invoker identity for X-Serverless-Authorization and preserves the customer's Authorization for backend verification. Strip/overwrite client-supplied IAM/admin headers, forbid arbitrary upstream URLs, bound body/response size/time, preserve private cache headers, reject redirects and never log tokens. It is transport only: tenant/owner/credits/consent remain backend-enforced.

If the hosted Studio is static-only and no approved trusted server exists, this requires an EXTERNAL founder infrastructure/IAM decision; it is not implemented or provisioned here. Likewise the provider callback reachability remains Claude's existing TikTok work, not permission to expose the whole private API. No speculative proxy architecture or duplicate frontend implementation is added.

## Review / preflight / smoke sequence

1. Authorized reviewer opens a Draft against bg-launch-005-integration (#226), or reviews the dependent diff against BG-LAUNCH-012. Verify exact source SHA, ancestry, source hashes and hosted CI; do not merge. Native Git evidence is separate from CI.
2. Reconcile existing isolation, runtime identity/key, completed schema/RLS, exact image/source provenance, private storage and backup/restore evidence. Keep current serving revision and traffic unchanged.
3. Confirm hosted browser/private-IAM path with Claude; validate public configuration names and backend origin allowlist. No deployment or IAM changes in this package.
4. Local independent checks, using disposable TEST_DATABASE_URL only:

```bash
npm run test:customer-contracts
node --test test/staging-acceptance.test.js test/customer-campaign-cors.test.js
```

The synthetic fixture uses local ffmpeg only to encode a small color test PNG and a deterministic stand-in provider; it never touches the accepted Northgate image or calls a paid API. It uses the real quote, worker, encrypted social lifecycle, attachment, receipt/approval, calendar, tenancy and ledger paths.

5. In an ALREADY-authorized environment, after metadata/fixtures are approved, run only:

```bash
node scripts/staging/acceptance.js /secure/operator/approved-staging-acceptance.json > staging-acceptance.json
```

Expected healthy responses: root 200; application no-session 401; authorized positive workspace/campaign/metadata/image/credits 200 with correct schema/binding/digest/balance; foreign same known resource 404 RESOURCE_NOT_AVAILABLE. /health 404 is unsupported, not a PASS. An unconfigured, stale or inaccessible fixture is not permission to seed/attach/refresh it live. See runner report for NOT RUN versus FAIL.

6. Only after separate founder approval may an operator plan deployment of the exact reviewed image to isolated staging at zero traffic. **No deployment command is issued or executed by this package.** A future new revision requires updating the runner's explicit target lock through review; do not silently follow latest. Test its exact tag before considering any promotion.

## Abort and non-destructive rollback

Abort on any identity/provenance/traffic/production-reference mismatch; failing positive/negative auth; changed campaign/balance; unsafe GET side effect; missing backup/schema/key evidence; unsupported browser IAM path; provider flags unexpectedly on; token/PII leak; or failed exact-head CI. No launch acceptance on mocked/local PASS alone.

This task made no live change, so no rollback is needed or authorized now. Preserve the recorded 00029-wtc revision/image/config at its recorded 100%, and candidate 00030-pob at recorded 0%, until independently verified. For a later approved isolated release: retain old image digest, runtime identity and configuration/secret VERSION references, backups and additive-schema compatibility; stop testing if unsafe, and ask the already-approved operator to restore the prior traffic/revision only under explicit founder authority. Do not run down-migrations, delete new records/assets, reset credits, rotate secrets or overwrite the accepted image as rollback. Recovery/restore must use an approved disposable target and existing evidence, not a shared restore during this task.
