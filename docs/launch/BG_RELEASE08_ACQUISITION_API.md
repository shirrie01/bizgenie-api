# Early-access acquisition API

The opt-in `POST /public/early-access-interest` route implements the website's `early-access-interest.v1` contract independently of paid beta. It commits one canonical normalized-email record and a per-submission consent and attribution receipt in the same database transaction. Identical retries replay the receipt. Reusing a submission ID with different answers or consent evidence returns 409. A new submission for the same address gets a fresh receipt without receiving prior lead information. The first profile is preserved and founding-customer interest can promote the canonical intention. Each consent decision remains on its own receipt.

The wire response is HTTP 202 with only `status: "received"` and `reference_id`. The route is write-only and default off. It uses a 16 KiB JSON limit, exact site CORS, five attempts per 15-minute window per HMAC-pseudonymized connection address, approved consent-copy hashes, and generic errors without submitted data. The rate limiter uses the socket address and ignores arbitrary forwarding headers. Verify the effective trusted client identity and upstream rate limiting in the intended topology before opening intake. Exact-origin CORS protects browser access and does not authenticate non-browser requests.

The acquisition migration creates separate RLS-protected lead, receipt and rate-bucket tables. The paid-beta tables use a different schema, intent and consent contract. The acquisition route requires a privileged private database connection with only the needed permissions on these tables. The repository startup check rejects missing protection or public grants. Keep existing checkout, provider, billing and scanner flags in their approved states. This route accepts JSON only and has no upload functionality.

## Configuration for later authorised activation

- `EARLY_ACCESS_CAPTURE_ENABLED` defaults off.
- `EARLY_ACCESS_SITE_ORIGIN` is the exact approved website origin. Production requires HTTPS and rejects the loopback development origins. Staging can use loopback HTTP.
- `EARLY_ACCESS_RETENTION_DAYS` must be an approved positive integer. Expiry is set on initial registration and repeat submissions do not extend it.
- `EARLY_ACCESS_CLIENT_HASH_SECRET` and `EARLY_ACCESS_SUBMISSION_HASH_SECRET` are distinct runtime-managed secrets.
- Reuse existing activation configuration through `BIZGENIE_ENVIRONMENT` and the production activation gate. The site uses `SITE_API_URL` for the approved API origin. Keep optional `SITE_MEASUREMENT` off until there is an approved aggregate events service.

Private repository hooks support deletion by a verified internal lead ID and bounded expiry batches for leads, receipts and rate buckets. Receipts and draft content are removed with the corresponding lead. Before opening intake, approve and operate a schedule for expiry checks and a verified subject-identity and deletion procedure, including backups. A separate maintenance process must call the hooks. The API does not expose them. Operator privileges, monitoring, rate limits at the edge and the approved retention schedule remain activation dependencies.

## Demonstration

Run `node --test test/early-access.postgres.test.js` with `TEST_DATABASE_URL` set to a disposable loopback PostgreSQL 17 instance with the standard Supabase roles. The test creates and drops its own database. It checks configuration refusal, CORS, strict consent validation, atomic receipts, concurrent retry, conflict, duplicate email, private grants, rate limiting, outage rollback, retention and deletion. It prepares the seven-slide draft through a private repository operation. The template uses a synthetic profile and has no provider calls, messaging, automatic invitation or public rendering. It is an internal review draft.

The matching website browser regression simulates an invalid receipt followed by a real request to the local PostgreSQL-backed API. The browser confirms success only after the valid committed receipt. The test run used local ports 4370 and 4371 for the site and API respectively.
