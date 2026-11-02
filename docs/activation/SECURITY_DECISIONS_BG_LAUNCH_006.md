# Production security decisions: recommendations (BG-LAUNCH-006)

1 Nov 2026. These are recommendations for founder decision, not decisions. Every production media and social feature stays **fail-closed** until its gate below is met and recorded in Issue #191. Facts from this repository are stated as facts; anything about a provider's or platform's behaviour that I could not verify from the preparing session is marked **unverified**.

## 1. Token-vault key management and revoked-token retention
**State.** Credentials are encrypted AES-256-GCM, bound (as authenticated data) to reference, tenant/project/brand/platform/account, revision and key id; tampering is detected. The only key provider is an environment variable (`envKeyProvider`) that **refuses production**. There is no production provider and no retention rule: revoked rows keep their ciphertext and audit history indefinitely.
**Recommendation: envelope encryption with Google Cloud KMS.**
- One symmetric KMS key (software protection level) in a project separate from the application project, rotation every 90 days. The app's service account gets **only** `roles/cloudkms.cryptoKeyEncrypterDecrypter` on that one key; nobody gets key export (KMS keys are not exportable anyway).
- At startup the app decrypts a data-encryption key (DEK) that is stored only in wrapped form (a KMS-encrypted blob in Secret Manager) and holds it in memory. A small `kmsKeyProvider` implements the existing `getKey(id)` / `keyId` interface; nothing else in the vault changes because each row already records its `key_id`. Estimated effort: about a day plus a review.
- Rotation: create a new DEK id, new credentials use it, old DEKs stay decryptable until every row using them is re-encrypted or revoked and purged. Never delete a DEK while any row references its id.
- Backups: a database dump alone cannot restore credentials; the wrapped DEKs and KMS access must be restorable together. Test a restore in a disposable project before launch.
**Revoked-credential retention (needs your and legal's decision).** Recommendation: when a connection is revoked **and** the provider confirmed revocation, replace the ciphertext, IV and tag with a tombstone within 24 hours (keep reference, binding hash, timestamps); if provider confirmation is `unknown`, keep the ciphertext for 30 days so an operator can retry revocation, then tombstone it. Keep the append-only audit rows (event type, hashes, references, timestamps; no secrets) for 24 months. This needs a small purge job and a migration-free `update` guarded by the existing triggers (about half a day) and is **not built**.
**Gate to enable social publishing in production:** a KMS provider reviewed, restore tested, retention rule approved and the purge job running.

## 2. Media isolation, given the bubblewrap results in CI
**State.** The pinned toolchain runs and the startup self-test fails closed. Hardened bubblewrap isolation could not be established under any container profile on a hosted runner (errors recorded in #225). Production video is therefore disabled; `local` isolation (the container as the sandbox) is allowed only in disposable staging with BizGenie-generated files.
**Recommendation: stop trying to nest bubblewrap inside a managed container; isolate at the service level.** Move inspection and decoding into a separate, locked-down service:
- A dedicated `media-inspector` service built from the same pinned image, **ingress internal only** (callable only by the API with an ID token), a **service account with no roles at all**, **no outbound network** (deny-all egress), concurrency 1, 1 vCPU / 1 GiB, a 30 s request timeout, and the existing per-process `prlimit` limits. The API sends bytes, receives measurements. The existing `videoInspector` / `videoDecode` seams make this an HTTP adapter (about a day) with the same fail-closed behaviour (unreachable means unavailable).
- On Cloud Run the first-generation execution environment runs workloads under gVisor, a sandboxed kernel, so the managed platform provides the isolation bubblewrap cannot. **Unverified from here.** Acceptance is empirical: deploy the self-test image there with `VIDEO_INSPECTION_ISOLATION=local`, run `node scripts/staging/toolchain-selftest.js`, and confirm it can reach nothing (no metadata server credentials, no network).
- Alternative if that fails: a GKE Sandbox (gVisor) node pool, or a separate small VM per job. Heavier; same interface.
**Gate for production video:** the inspector service deployed, its isolation properties demonstrated, and the founder accepts "platform sandbox + no credentials + no egress" as the isolation model.

## 3. Customer uploads: defer
**Recommendation: keep `MEDIA_INTAKE_ENABLED` off for launch.** Launch needs none (Hybrid UGC is post-launch). It stays off in the API (it refuses to compose without a scanner-backed inspector, and refuses `UNSCANNED` outside disposable staging), and the Studio gate `VITE_CUSTOMER_MEDIA_INTAKE_API` stays unset.
**Conditions to enable later, all required:** a real scanner deployed (ClamAV on its own internal service with its signature feed, or a managed scanning API after a privacy decision); the isolated inspector in section 2; the scanner health check (the adapter already refuses a signature database older than 72 h); approved rights wording; a lifecycle rule that deletes rejected and abandoned quarantine objects after 7 days; per-tenant rate and size limits; and a fresh adversarial test pass with real scanner and EICAR.

## 4. Pinned ffmpeg and bubblewrap: security review checklist
Pins (`runtime/video-inspection-toolchain.v1.json`, `pinned_to_production_base_image_pending_security_review`): ffmpeg `7:5.1.9-0+deb12u1`, ffprobe `5.1.9-0+deb12u1`, bubblewrap `0.8.0-2+deb12u1`, on `node:22-slim@sha256:de170b39...` (Debian 12).
To approve: (1) check each package against the Debian security tracker for open CVEs at the pinned version (the tracker was not reachable from the preparing session); (2) confirm Debian 12 security support covers ffmpeg 5.1.x for the planned launch period; (3) decide the update policy: rebuild weekly, and a version bump is a reviewed change to the toolchain file (the image build fails if the pin is unavailable, so a silent change cannot happen); (4) accept that ffmpeg parses untrusted bytes, which is why decoding is H.264-only (`-c:v h264`), protocol- and format-whitelisted, resource-limited, and moved out of the API process by section 2. Applied hardening this week: forced H.264 decoder on the full-decode check, so exotic codecs never reach complex decoders.

## 5. Platform media constraints
**Verified in code and tests:** generated video is H.264 MP4, no audio, 720p, 4/6/8 s, 9:16 or 16:9, at most 32 MiB; generated images are checked from their bytes; unsuitable media cannot reach preview, approval or scheduling.
**Not verified (operator-configured, shown to customers as "BizGenie's check; the platform decides"):** the Instagram, Facebook, LinkedIn and TikTok limits in `src/media/platformMediaProfiles.js`. The platform documentation hosts are not reachable from the preparing session (`developers.facebook.com`, `learn.microsoft.com`, `developers.tiktok.com`).
**Recommendation:** the TikTok sandbox run records what TikTok actually accepts (video without audio, size, duration) and, if different, raises the profile version through `MEDIA_PROFILE_OVERRIDES` (a version bump is required). Do not publish any platform-limit claim externally until each is read from the platform's current documentation by a person who can reach it. Instagram, Facebook and LinkedIn connectors do not exist yet, so their constraints are not on the critical path.

## 6. Fail-closed matrix (what stays off, and what turns it on)
| Capability | Off by default | Turns on only when |
|---|---|---|
| Quoted generation, worker | yes (flags) | flags set in a staging or approved production environment |
| Video generation | startup self-test | the self-test passes in the configured isolation; `local` refused outside staging |
| Customer uploads | yes | scanner + isolated inspector + rights wording (section 3) |
| TikTok connector | yes | KMS key provider, upload policy values, portal scopes, callback routed (sections 1, 5) |
| Direct Post | always off | not a configuration; the connector rejects it and the database forbids a draft being a publication |
| Hybrid UGC | unsupported | a real compositor exists and is approved |
| Production deployment, DNS, shared migrations | not performed | explicit founder authorisation |
