# Reusable synthetic customer package

`test/helpers/launch-customer.js` exports customerDataset({pool,billing,campaigns,now}). It is used by the existing disposable quote-proof fixture in `test/generation-quotes.integration.test.js`; no second database lifecycle or shared seed CLI is added. It refuses non-loopback PostgreSQL and any DB not named quote_proof_<32 hex>. The parent harness creates/destroys that fresh DB; never run it with staging credentials.

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm run test:customer-contracts
```

Use the existing local test role/configuration; this example contains no password. No installations, providers or shared writes. Existing ffmpeg locally encodes the synthetic color PNG; production image-byte validation remains on. The simulated worker's callback stores that fixture, not an AI output, and the real ledger debits the synthetic quote once. Fixture prices are not commercial canon.

Primary fictional business: Cedar and Finch Studio, one primary tenant/owner, approved Brand Brain, customer-confirmed sector/channel onboarding, campaign/image quote, succeeded simulated image job and attached revision, real review receipt/ack/approval, scheduled calendar item, one disconnected LinkedIn account and one expired account requiring reconnect, dynamic exact credit balance and this job's reservation/debit ledger history. An auxiliary member and unrelated tenant/user are security fixtures only. All data is fictional; no customer PII or external accounts.

The returned descriptor uses bizgenie.synthetic-customer.v1 and includes actual generated test IDs/clock/state/balance/history, making it reusable by frontend/contract tests through its in-memory HTTP app. It intentionally contains no tokens, storage keys or credentials. IDs are fresh per disposable run; do not hardcode them into live acceptance. Fixed local tokens owner/member/foreign are test-verifier labels, NOT Supabase login credentials or proof of real sign-in.

The suite follows the real customer routers for Brand Brain, onboarding, campaign/content creation, missing-brief refusal, quote/replayed confirmation, job status/attach, review/render/ack/approve/schedule, calendar, social list and credit read. It checks versioned response fields/types and strict request/error/ownership outcomes. It proves wrong tenant cannot retrieve the known campaign/media and member cannot change identity or attach; invalid session is 401 and a fresh valid fixture session can resume. Broader existing suites retain actual JWT claim-validation, provider recovery/failure, media ranges, payment-failure/webhook idempotency and rollback coverage.

Schema map remains `docs/contracts/BG_LAUNCH_012_CUSTOMER_API.json`, contract_version bizgenie.customer-launch.v1, contract_revision 2. Fixes from executable verification: workspaces is conditional for selection_required, not a literal required field named "workspaces (selection_required)"; image/video quote execution_brief is conditionally required (422 CREATIVE_BRIEF_REQUIRED). No backend API was weakened to match a fixture.
