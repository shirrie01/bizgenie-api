# BG-STUDIO-020 — consolidated media integration draft

26 October 2026. BACKEND INTEGRATED locally; provider/storage calls mocked. Staging RED, launch NO-GO.

Starting financial branch c656264 (quotes/Stripe drafts), #216 f8d81bf preserved. Replayed the13 original non-merge commits from #205/#206/#207/#208/#209 and subsequent profile/inspection/runtime work through #212 b60e380479d36f206e68697ed0fd2f57b2b04b07. Original PR branches and main unchanged. Two adjacency conflicts in campaign PostgreSQL reader were resolved by retaining new creative/media methods **and** the16-command batched list/hydrator, rather than reverting to N+1. Exact original commits remain in the cherry-pick sequence/source reports. No profile provisioning, runtime activation, deployment or migration to shared infrastructure.

## Reused architecture and new bridge

`ExistingCreativeServicesAdapter` bridges confirmed immutable jobs to existing ImageGenerationService and VideoGenerationService; no new external provider adapter or alternate media store. It checks immutable request/profile hashes, scope, operation, verified job actor and model selection. Image model must equal existing provider.model; Veo uses the repository's modelForQuality contract. Server profile owns aspect ratio and video duration, validated by existing schemas. No unsupported image.premium contract invented. Media quotes require an explicit creative brief. Existing reference loaders retain additional generation-use rights checks; preview right alone is insufficient for an edit.

Outputs must be active, generated private media records owned by the exact job/tenant/project/generation. Worker outcome exposes asset identity/provenance, not gs:// or bucket keys. Image reconciliation finds at most2 scoped persisted assets: exactly1 is recoverable; none/multiple stays unknown, never another submit. Video submission stores a provider reference and returns pending; reconciliation calls existing scoped get/poll, never submit. Only authoritative provider-operation failure releases; uncertain errors remain held. Existing services' process-local image execution record is not represented as durable provider recovery. Actual provider idempotency and ambiguous acceptance still need provider-specific evidence.

New local PostgreSQL image lifecycle: quote -> confirm/reserve -> fenced worker -> existing image service/provider seam -> existing DurableMediaAssetStore/PostgresMediaAssetRepository -> existing save_revision -> actual PostgreSQL preview receipt -> same-actor acknowledgement -> approval -> authenticated generation-pinned byte delivery. Revocation then returns404 **before storage access**. One mock provider invocation; no real generation. This demonstrates backend integration, not an active customer-facing creative-jobs API or full video/UGC flow.

## Validation

Full Node22 + disposable PostgreSQL: **904/904 pass, zero skipped**. Includes integrated historical media/runtime security, tenant/brand/version/revision/rights, pinned reads, ranges, cancellation, billing/onboarding and new quote/worker/creative bridge tests. ffprobe7.1.5 and prlimit2.41.5 tooling checks pass; container-build **contract** passes (not an image build/deployment).

Actual local Chromium synthetic browser scripts pass:
* Media transport: metadata/head200, private image displayed, anonymous401/foreign404/stale409, MP4 byte range206, foreign origin blocked, revoked404, unrelated cookies omitted.
* Real synthetic H.264 decode/playback:1280x720,4seconds, seek and playedToEnd, bounded range206, revoked404. This is neither staging nor Meta compliance; no live service/storage/provider used.

## Explicit remaining gaps

* Frontend #52 generic creative-jobs/upload/revision/approval API is not silently aliased to these routes. It must adopt authenticated bytes rather than unrestricted signed output/upload URLs. Customer intake/rights attestations, quarantine, byte-bound inspection, malware/unsafe-content authority, retention/deletion and durable job UI mapping remain incomplete. Reference assets must already exist with scoped rights. No live uploads authorized.
* Image bridge is proven across the local lifecycle. Video bridge submit/poll is mock-tested and existing private video playback is tested, but the complete quoted PostgreSQL video-to-approval lifecycle is not yet proven. Instagram feed-video profile remains proposed/not provisionable; no409 bypass or provider capability fabricated.
* Hybrid here means existing image edit inputs are passed as rights-checked asset IDs to an existing provider; it is **not an implemented audiovisual composition pipeline**. No full-hybrid acceptance claim.
* Legacy generation paths are not yet universally gated by quote/confirm. Keep every relevant capability gate off until routing, worker scheduling, policy profiles and durable reconciliation are reviewed. No paid execution authorization follows from this branch.
* Revocation is checked before delivery/start, not a guarantee of cancelling in-flight bytes/external calls. Per-process preview concurrency4 and8MiB video transfer ceilings do not bound aggregate multi-instance egress. Frontend32MiB object ceiling and actual measured load/network/codec support remain release evidence requirements.

Future rollout must review the combined migration set/role model and restore compatibility in an isolated approved environment. Keep old binaries/workers quiesced before fenced financial recovery. Preserve all durable claims, reservations, receipts and media lineage on rollback; never drop evidence or retry ambiguous paid operations to recover availability.
