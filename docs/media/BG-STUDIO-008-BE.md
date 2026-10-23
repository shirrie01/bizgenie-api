# BG-STUDIO-008-BE — trusted byte inspection and delivery checkpoint

**Evidence date: 23 October 2026.** Engineering implementation only. Under DEC-015 the [Google Sheets BizGenie Mission Control Register v1.0](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains the single operational authority. GitHub #191 and repository evidence are engineering indexes, not competing Mission Control registers. Parent #128 launch authority and #197 Premium Studio remain referenced, not reinterpreted.

## Canonical stack and isolation

Before edits, fetched main and PR #208/#209/#210 head refs. Live Git refs verified:

| Authority | Exact SHA |
| --- | --- |
| main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| #208 consolidated backend | `bf12050939817ae6da3f696808fc5a7f054d74ab` |
| #209 readiness | `6911ffc2aaa8687432b6e28fd34bdca59a40be90` |
| #210 candidate contract / exact base for this branch | `e26b79d273fe2a906245b1ce52fd6d7e67df4250` |
| Isolated implementation branch | `bg-studio-008-be-video-inspection` |

Read [BG-STUDIO-007-BE](BG-STUDIO-007-BE.md), its [candidate JSON](contracts/instagram-feed-video-preview.v1.proposed.json), and incorporated #208/#209 evidence. No source branch or historical migration changed. Stack target is `bg-studio-007-be-instagram-video-contract`, not main or a duplicated #209. Exact implementation/publication SHAs are recorded in the publication checkpoint below.

Requests for PR #210, run `39918069787`, and issues #128/#191/#197 returned GitHub API **Forbidden**. The supplied successful-CI/draft assertion is founder-provided, not independently verified. Git refs establish exact commits but not CI status, target, draft state, issue contents or acceptance. No permissions/secrets were broadened. This work follows the supplied bounded order where external authority cannot be reread; it makes no launch acceptance claim.

## A. Official Meta evidence and uncertainty

Direct official source retrieval on 2026-10-23:

`https://developers.facebook.com/docs/instagram-platform/content-publishing/`

Result: `curl: (56) CONNECT tunnel failed, response 403`, HTTP code `000`. The preceding work also encountered this restriction and its permission retry was cancelled. No network bypass, proxy workaround or repeated credential request was attempted. No public-web connector is installed. These remain the authorized official follow-up sources, with **content not retrieved**:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/
- https://developers.facebook.com/docs/instagram-api/reference/ig-user/media/

No current page excerpts, update dates or applicable API version can be established here. **All requested Meta facts remain unverified**: publishing media types/destinations and operation names; MP4 codecs/audio; aspect/dimensions; frame rate/bitrate; duration/size; feed versus Reels mapping and Login-path differences. Do not infer those requirements from browser support, the existing provider, old snippets or the candidate. Current source evidence must be obtained and dated by an authorized reviewer before any compliance/provisioning claim. Actual publishing requirements and private Studio preview policy are separate contracts.

## B. Substantive byte-inspection implementation

`src/media/videoInspection.js` exports `createVideoInspector` and `assessInstagramVideoCandidate`. It is deliberately **not imported by application composition, routes or approval**, and does not fetch storage, run generation, persist rows or register a profile. No npm dependency or container dependency was added. Actual local FFprobe 7.1.5-0+deb13u1 and Linux util-linux `prlimit` are reused. The production Dockerfile/Buildpack do not establish availability of these tools; runtime packaging/patching needs separate approval before future wiring. Missing tooling returns sanitized unavailable, with no weaker fallback.

The inspector accepts only a bounded Buffer, never a filename, URL, bucket key or request-provided command. The caller must already possess authorized bytes; this utility introduces no new tenant/media access path. Future generation/storage integration must use existing scoped rights/lineage checks and generation-pinned reads, not accept arbitrary client inspection JSON. Its current scope is byte inspection, not a new production asset inspection endpoint or durable inspection authority.

Outputs are deliberately distinct:

| Status | Meaning |
| --- | --- |
| `measured` | Local tool demuxed actual input bytes and returned complete bounded stream metadata. Includes SHA-256, exact byte size, container/MIME, codec/profile/level, dimensions, pixel/display aspect, rational average frame rate, stream/format durations, available bitrate, audio codec/channels/sample rate, rotation/display transform and pixel format. |
| `unsupported` | Input exceeds the 32 MiB inspection ceiling, unsupported MP4 brand/stream layout, ambiguous transform or required stream metadata unavailable. Unsupported codec can still be measured and then rejected by candidate assessment. |
| `invalid` | Non-byte/short input, invalid MP4 header, corrupt/truncated media or invalid tool JSON/container. |
| `unavailable` | Tool/IO/resource failure, timeout, cancellation, output amplification, busy slots or cleanup failure. No private paths, stderr or video content in returned errors. |

`metadata_basis=demuxed_stream_headers_not_full_decode`: these are observations of the actual file's demuxed headers, not original request claims. Headers can still misdescribe malformed frame payloads. This module does not decode every frame, prove frame-accurate duration or attest platform acceptance. Bitrate fields are optional container/stream declarations, not a measured transport-throughput benchmark. Display matrices are inspected; nonidentity transformation is denied by the candidate rather than silently rotating/cropping. Missing frame/aspect/duration metadata is unsupported, not invented.

Results are deeply frozen and recognized in-process through a private WeakSet. Candidate assessment refuses forged/deserialized objects. This is an internal object-provenance guard, **not a signature, persisted attestation, authorization token or cross-process cache**. A trusted operator controls the executable; a malicious tool/operator or compromised host is outside that guard. Client-supplied results cannot authorize media, receipts or approvals.

### Threat model and resource controls

- Snapshot bytes before the first await, preventing caller-buffer mutation from changing inspected content or its digest.
- Require a bounded first `ftyp` box and recognized ISO MP4 brand before tool IO. This is intentionally narrower than all possible MP4 layouts; unsupported layouts are not transcoded.
- Private random temporary directory and exclusive 0600 file; no caller filename. Cleanup finishes before resolution; cleanup failure returns unavailable. SIGKILL/process crash can still leave files: an approved isolated ephemeral temp volume/lifecycle policy is required before activation, not added here.
- Spawn without a shell, fixed argument vector, absolute operator-controlled tool path; child receives only locale environment. No inherited cloud tokens, credentials or application env.
- FFprobe protocol whitelist `file`, demuxer whitelist `mov`, external data references disabled and absolute reference paths disabled. No network protocols/playlists/remote URLs. These reduce parser access; they are **not an OS security sandbox**. Patched tooling and hardened nonproduction isolation remain necessary for hostile inputs.
- `prlimit`: 1 GiB address space, 5 CPU seconds, 64 file descriptors, zero core dumps. FFprobe: one decoder thread, 16 MiB maximum single allocation, 32 MiB probing and 5-second analysis setting. Wall-clock subprocess deadline defaults to 5 seconds (operator configuration max 10), SIGKILL on timeout/abort. Temp IO is outside the subprocess timer; this is not a whole-request DB/storage timeout.
- Stdout <=256 KiB, stderr discarded, bounded normalized DTO; max 8 streams, exactly one non-attached-picture video. Two active operations per inspector instance, excess fails fast; create one shared inspector in a future service. This is not a distributed tenant quota or a memory bound on caller-provided buffers. Each active task copies <=32 MiB plus tool/kernel overhead.
- No raw FFprobe filename/tags, signed URLs, bucket identifiers or error stderr are returned/logged. Test captures contain synthetic data only. Inspection does not grant playback rights or bypass revocation.

Parser exploitation remains **High impact** if activated without patched tooling and isolation; limits constrain resources but not filesystem syscalls after code execution. No unsafe runtime activation is hidden in this isolated module. Linux/tool dependence and a reviewed deployment image are explicit blockers.

## C. Candidate compatibility matrix — identity unchanged

The proposed profile remains `proposal_not_provisionable`, with unchanged registry identity hash `858e82f419c2efba01d40052076895e6e86c1fa1e82c05a18c5046769492babb` and full proposal digest `3438970ac117a87dfd2393f7a808ec332e41831bb3948cf824cc4c179b8444ef`. No historical identity, receipt, acknowledgement or approval semantics changed.

| Candidate field | Byte evidence / implementation | Authority |
| --- | --- | --- |
| MP4 / H.264 AVC | MP4 brand/demux, codec/profile/level measured; non-H.264 denied in assessment | Narrow BizGenie policy; Meta unverified |
| No audio track | Actual audio streams measured; any audio denies candidate | BizGenie silent-preview choice, not a Meta audio rule |
| 720×1280 or 1280×720 | Actual stream dimensions; other dimensions denied | Existing provider envelope/internal policy; not Meta acceptance proof |
| Square pixels / no rotation | Stream SAR and matrix/rotation measured; nonsquare or nonidentity rejected | Internal representation policy |
| 4/6/8 seconds | Demuxed video and format durations must both equal an exact candidate value; no automatic tolerance widening | Internal policy; full payload duration still needs decode proof |
| <=32 MiB | Exact input bytes measured; larger inspection input unsupported | Studio client budget, not Meta/backend object cap |
| Frame rate/bitrate/profile/pixel format | Observed where present; no new acceptance limits invented | Meta and final playback envelope unresolved |
| Original asset + escaped copy, unrendered platform artifact | Existing UI/receipt contract; no transcode or simulated Instagram render | Representation policy and frontend QA |
| Accessibility/acknowledgement | Not inferable from file headers | Existing explicit human/UI obligations |
| Scope, lineage, current rights, revision/version | Must remain repository/media-delivery authority | Existing security contract; never derived from inspection |

Assessment returns `candidate_constraints_met` or `unsupported` with bounded reason codes; forged/non-measured input returns unavailable. **Every assessment returns `provisionable:false` and `platform_compliance:unverified`.** A constraint match is not codec payload verification, Meta compliance, successful real-user playback or approval eligibility. Nothing provisions the profile or bypasses current 409 behavior.

## D. Authenticated delivery and Claude handoff

Existing #208 delivery implementation remains unchanged. Existing adversarial tests cover tenant/brand/job/revision/version, rights, GCS generation/ifGenerationMatch, ranges, exact lengths, cancellation, stalled/late bodies and per-process slot release. The new test-only fixture accepts synthetic real MP4 bytes, allowing actual H.264 decode/playback through the existing authenticated private storage path.

`node scripts/video-inspection-browser-smoke.js /usr/bin/chromium` proves: exact HEAD size 5716 bytes, authenticated completed GET, actual Chromium 1280×720 / 4-second H.264 decode, seek and playback to end, 206 range bytes 0–7, then revoked 404 with zero additional storage access. The asset passed existing mocked generation/lineage/storage infrastructure; provider/GCS transports are synthetic. The variant uses the existing supported video profile, not an activated Instagram candidate. This proves one controlled fixture/browser, not broad mobile codec performance or deployed E2E. Browser requests are restricted to local test origins.

No new customer endpoint/DTO is exposed. Claude must not expect inspection fields from existing metadata responses yet. Future endpoint review should expose only normalized measurements and an explicitly non-authorizing conformance state, bind results to asset and exact GCS generation/digest plus current campaign scope/version/revision, and reauthorize before returning them. Never send raw FFprobe output or rely on client JSON for approval.

Retain the [#210 frontend states](BG-STUDIO-007-BE.md#claude-contract--existing-apis-unchanged) and [#208 transport contract](BG-MEDIA-INTEGRATION-003.md#claude-frontend-integration-contract): Bearer headers on metadata/HEAD/GET, no query tokens/public URLs/cookie fallback; total-size budget before transfer, explicit <=8 MiB ranges, exact size/completion verification, cancellation/discard/revoke blob URLs on version/scope changes, refresh through the established session flow, accessible video controls/description, no autoplay and no automatic acknowledgement/approval. Show unsupported/invalid/unavailable separately when a reviewed API exists. Unknown inspection is not H.264 proof. Approval publishes nothing and still requires the same actor's current receipt acknowledgement.

Delivery limits are unchanged: backend object <=1 GiB video, <=8 MiB per response, four operations per storage instance/process, 30-second storage deadline. Studio's 32 MiB limit remains a client-policy gate, not a backend total-object guarantee. Repeated/multi-instance requests have no aggregate egress budget. In-flight revocation cannot retract already delivered bytes; subsequent authorized operations fail after revocation. Both are explicit staging blockers pending reviewed owner controls/acceptance. No new quota, pricing or infrastructure is introduced.

## E. Validation

Node v22.23.3, local PostgreSQL 17, FFprobe/FFmpeg 7.1.5-0+deb13u1, local Chromium. Synthetic blue-frame/sine-wave fixtures and exact reproduction commands are in `test/fixtures/video-inspection/README.md`; no private/customer/provider media or paid calls.

| Exact command / evidence | Result |
| --- | --- |
| `node --test test/video-inspection.test.js` | **25 focused tests passed**, 0 failed/skipped |
| `node --test test/video-inspection.test.js test/instagram-video-preview-contract.test.js test/campaign-preview-registry.test.js test/media-integration.test.js test/media-preview-delivery.test.js test/media-preview-streaming.test.js` | **86 passed**, 0 failed/skipped |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **735 passed**, 0 failed/cancelled/skipped |
| Same disposable local URL, `npm run test:billing:postgres` | **24 passed**, 0 failed/skipped |
| Same disposable local URL, `npm run test:campaign:postgres` | **24 passed**, 0 failed/skipped |
| `node scripts/video-inspection-browser-smoke.js /usr/bin/chromium` | Actual local H.264 playback-to-end and authenticated range/revocation proof passed |
| `node scripts/media-integration-browser-smoke.js /usr/bin/chromium` | Existing PNG/auth/CORS/synthetic range proof passed |
| `node --check` for index/src/test/scripts; `git diff --check` | Passed |

Real-byte tests explicitly report skip if local FFprobe is absent; **none skipped here**. Missing FFprobe/prlimit in CI or a future image is not validated by a passing subset and must be treated as a tool-availability blocker. Resource tests use tiny trusted fake executables to assert subprocess flags, hard limits, empty credential environment, output caps, cancellation, timeout, private file mode and cleanup. Production input can never configure those executables. Initial rotation test exposed that the first generated fixture lacked a matrix; regenerated using FFmpeg `-display_rotation 90`, then measured/denied correctly. No production safeguard was bypassed to make tests pass.

Disposable PostgreSQL test harnesses initialize existing schema in throwaway fixture databases; no application/shared database migration or live row provisioning occurred. CI/container/deployed proof is separate from local tests. Logs: `/workspace/.onboarding/bg-studio-008-{focused,security,full,billing,campaign,browser,existing-browser,docker}.log`.

## Remaining blockers and safe next work order

1. Obtain current official Meta evidence/API-version mapping, including feed versus Reels; no compliance claim until then.
2. Review/pin/patch the toolchain and hardened runtime for hostile-byte inspection. Current Dockerfile/Buildpack do not install inspection tools; no activation or dependency installation was performed here.
3. Implement a separately reviewed authenticated internal inspection orchestration using existing rights/lineage and exact generation-pinned reads with total <=32 MiB bounds. Decide cache/persistence authority and revocation freshness before any schema or live provisioning proposal. No unscoped endpoint or client attestation shortcut.
4. Complete full-decode/expanded browser/mobile/audio/accessibility proof and accepted renderer semantics. Preserve the silent/narrow candidate unless a new version is explicitly reviewed.
5. Review egress/rate/instance budgets and revocation residual; obtain founder approval before staging, provisioning or any spending/infra action. Live inspection cannot itself enable profile resolution.

**Assessment:** GREEN for executed local deterministic and one synthetic playback proof; AMBER for isolated reusable inspection implementation; RED for live profile provisioning, deployment and Meta-compliance claims. No merge, deployment, live database change, IAM change, production traffic change, provider activation, publishing or paid generation occurred.

### Container/artifact evidence

- Initial Docker invocation could not write default buildx state under read-only `/home/agent/.docker`. Repeated using a new empty `docker --config /tmp/...` directory within permitted workspace storage; no existing credentials or permissions were modified.
- Canonical Dockerfile build from a sanitized source-only context (tracked sources plus intended new files, no host credentials) was attempted. A network-disabled attempt was cancelled after 45 seconds at npm installation; the canonical default-network attempt failed after ~112 seconds at `RUN npm install --omit=dev` with **`npm error Exit handler never called!`**, exit 1. This is the observed npm/build failure, not a diagnosed application defect or proof of registry denial. No canonical image/smoke success is claimed.
- A separately labelled **offline dependency-copy evidence image**, `bizgenie-api:bg-studio-008-offline-evidence`, was built from the same current source and existing local Node dependencies using a temporary Dockerfile (`FROM node:22-slim; WORKDIR /app; COPY . .; ENV PORT=8080; CMD ["npm","start"]`). It is not the canonical production build or a release artifact. `docker build --network=none --pull=false -f <temporary-context>/Dockerfile.offline-evidence ...` passed.
- `docker run --rm bizgenie-api:bg-studio-008-offline-evidence node --version`: **v22.23.4**. `bash scripts/smoke-container.sh bizgenie-api:bg-studio-008-offline-evidence bizgenie-studio-008-offline` passed root 200, unauthorized admin 403, authorized admin 200 and empty generation 400. The script used disposable synthetic local auth/database fixtures and cleaned up its containers/network; no application/shared schema changed.
- Direct isolated inspection inside that Node image returned **`unavailable / INSPECTION_TOOL_UNAVAILABLE`**, proving runtime packaging remains unresolved rather than assuming host FFprobe exists in containers.
- Buildpack: `command -v pack` found no CLI; no Buildpack result claimed and no installer/infrastructure change attempted.

Additional logs: `/workspace/.onboarding/bg-studio-008-docker-online.log`, `bg-studio-008-docker-offline.log`, `bg-studio-008-docker-smoke.log`. Temporary context holds only source plus the local dependency-copy test tree. No image was pushed or deployed. The canonical build error and missing Buildpack/toolchain remain separate artifact gates.
