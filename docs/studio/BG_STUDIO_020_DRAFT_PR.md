## Revenue safety and integrated creative backend

Dependent draft on #216 (`bg-studio-019-backend-integration`, f8d81bf07977b57496d97db0df75e984bc8c425f). Original #213–216 and #208–212 branches remain unchanged. No merge/deployment/shared migration or activation.

Adds durable actor/workspace/request/profile/price/version-bound quotes; atomic confirmation via the existing ledger; fenced generation claims; pre-call cancellation; conservative ambiguous-outcome recovery and atomic settlement. Adds opt-in fenced Stripe processing-claim recovery, disabled owner invoice read, and combines existing private creative-preview/media/runtime code with onboarding and financial drafts. New bridge reuses existing image/video services and private storage. A PostgreSQL mock-provider image lifecycle reaches revision, actual receipt/acknowledgement/approval and authenticated delivery; revoked assets are refused before storage.

## Validation

Node22 + disposable PostgreSQL17:918/918 pass, zero skipped;274 syntax checks pass. Local logical restore preserves onboarding and quotes/jobs/claims/ledger, queued state and reservation. Local Chromium media/CORS/auth/range/revocation and synthetic H.264 seek/playback pass. Video toolchain/container contract passes; no fresh image build/deployment claim. npm audit retains2 moderate transitive findings, no high/critical in current response.

Hosted exact-head CI must be read before GREEN; API reads/dispatch are currently Forbidden. Local tests are not hosted CI or staging evidence.

## Limits / review gates

All new SQL remains unapplied outside disposable tests. Financial mutation adapter remains unmounted; no provider profile, worker runtime, social connection or feature flag activated. Pricing/terms canon remains unresolved and catalogue fail-closed. Legacy paid routes are not yet universally quote-gated. Full UGC intake/composition, quoted video lifecycle, durable social publishing and production Learning Brain remain open mandatory requirements. Social/performance additions are explicitly reference contracts, not production connectors. Stripe recovery cannot overlap old unfenced workers.

Frontend #52 must reconcile actual contracts before enabling gates: calendar limit100, catalogue/management shape/path, nonce-based complete quote request and explicit confirm/status, authenticated private media instead of unrestricted signed URLs. See `docs/studio/BG_STUDIO_020_BACKEND_FRONTEND_CONTRACT.md` and `BG_STUDIO_020_EXECUTION_CHECKPOINT.md` for exact schemas, evidence, safety limits and separate branch SHAs.

S1 security documentation is separate at16c1d71fd32a5240d531585f22afd38ad6c66195. Founder operator, reviewer pending, £1 ceiling proposed/unapproved; staging RED, launch NO-GO. Sole Mission Control remains authority; no duplicate tasks/register created.
