# BG-STUDIO-009-BE — secure inspection integration checkpoint

Engineering evidence, **23 October 2026**. DEC-015: [Google Sheets BizGenie Mission Control Register v1.0](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) is the sole operational authority. #191 is an engineering index; #128 is frozen launch authority and #197 is the Studio workstream. No acceptance or deployment decision is made here.

## Authority and exact stack

Fetched main and PR heads before edits; no newer pull head numbered above #211 was observed through Git refs. API reads of #211, CI run `39921308358`, and issues #128/#191/#197 returned `Forbidden`. Current draft state, superseding issue decisions and successful CI cannot be independently verified; the supplied CI/#348 success is founder-reported. No credentials were broadened.

| Git ref | Verified exact SHA |
| --- | --- |
| main | `ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f` |
| #208 | `bf12050939817ae6da3f696808fc5a7f054d74ab` |
| #209 | `6911ffc2aaa8687432b6e28fd34bdca59a40be90` |
| #210 | `e26b79d273fe2a906245b1ce52fd6d7e67df4250` |
| #211 / exact base | `fb9edce8c17e363a3bf13c77dc5ffa00231fe302` |
| New branch | `bg-studio-009-be-secure-video-runtime` |

This branch targets `bg-studio-008-be-video-inspection`, preserving #208 → #209 → #210 → #211. Original branches/main remain unchanged. Read [#210 contract](BG-STUDIO-007-BE.md), [#211 inspection evidence](BG-STUDIO-008-BE.md), campaign/media delivery/storage/registry/approval code and CI workflow. Exact validated implementation and publication heads are recorded below after committing.

## A. Build discrepancy: established facts and uncertainty

| Boundary | Observed evidence |
| --- | --- |
| Host default | Node v24.19.0, npm 11.9.0, x86_64. Tests explicitly select Node v22.23.3; host npm remains 11.9.0. |
| Previously built Node image | Node v22.23.4, npm 10.9.9, Debian 12 bookworm, x86_64. |
| Registry reachability | Public `fetch` to `https://registry.npmjs.org/express` failed with `EAI_AGAIN` both on host Node 22 and inside the Node image. No token or private registry used. This demonstrates a local DNS/network limitation. |
| Existing CI source | `.github/workflows/ci.yml` uses setup-node 22 and `npm ci` for host tests, **the same canonical `docker build ... .` Dockerfile path** for the Docker job, and Google-22 builder via pack 0.40.8 for Buildpack. Exact executed job logs/npm versions/cache cannot be read because API access is Forbidden. |
| Prior Docker path | Floating `node:22-slim`; `npm install --omit=dev`; no `.dockerignore`. The prior failure happened at npm install before application COPY. Host node_modules contamination is a separate reproducibility hazard, not established as that failure's cause. |
| New reproducible path | Same observed Node base pinned to digest `de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`; `npm ci --omit=dev --no-audit --no-fund` consumes the unchanged lockfile. `.dockerignore` excludes host dependencies, Git state and environment/credential directories. |
| New canonical build | Reproduced npm **“Exit handler never called!”**, exit 1, after ~106 seconds at npm ci. The install-command change is **not** a claim that the local failure is repaired. |

Root finding: local registry DNS failure is proven; differing npm/cache/network environments can explain why reported remote CI succeeds, but the precise npm internal exit-handler failure mechanism remains **unproven**. Neither architecture mismatch nor dependency mismatch was established. CI success must not be used to erase the local failure. No DNS, registry, proxy, permission, IAM or production configuration was modified.

`node scripts/check-container-build-contract.js` and its regression test enforce a digest-pinned Node 22 base, lockfile-driven install, matching dependency/engine declarations and protected build context without network access. No lockfile/dependency version changed. This verifies reproducibility prerequisites, not package availability or a successful image build. Build context was sanitized; writable temporary Docker config avoids touching the protected home directory. Buildpack CLI remains absent, so no new Buildpack execution/success is claimed. Existing #211 offline-image evidence is historical and not relabelled as this branch's canonical build.

## B. Hardened runtime: isolated, fail-closed preparation

`createHardenedVideoInspector` is added alongside the existing explicit local-test inspector. Nothing is imported into application composition, public routes or approval. The new internal service defaults to the hardened constructor; it never silently selects the unsandboxed probe. Test-only constructor injection allows transport/authority proofs without representing them as successful namespace isolation.

Hardened path:

- Fixed `/usr/bin/prlimit` → `/usr/bin/bwrap` → `/usr/bin/ffprobe`, no shell, user command, URL or inherited application environment.
- Explicit unshared network/user namespaces plus unshared PID/IPC/UTS namespaces; no share-net or unshare-try fallback. Further user namespaces disabled/asserted disabled, capabilities dropped, sandbox UID/GID 65534, new session and die-with-parent.
- Read-only `/usr`, `/lib`, `/lib64` and the one generated input-file bind. No app root, home, credentials, bucket mounts or host `/etc` exposed. Private proc/dev mounts and <=1 MiB sandbox tmpfs. System-library mounts are trusted OS content and need a curated runtime review; this is not a claim of an accepted minimal filesystem image.
- Host temp parent remains 0700. Local probe files remain 0600; hardened input is explicitly 0444 under that private parent so the isolated non-root UID can read its one read-only bind. No host directory becomes public. Failed cleanup poisons the inspector instance, denying future work rather than accumulating files; concurrent in-flight work is still limited to two. Crash leftovers need approved ephemeral-volume cleanup/quota policy before activation.
- Inherited #211 limits: <=32 MiB input, two jobs per inspector instance, 1 GiB subprocess address space, 5 CPU seconds, 64 FDs, no core dumps, 16 MiB single allocator cap, one decoder thread, <=256 KiB stdout, <=5-second default subprocess wall deadline. Only <=4 KiB stderr prefix retained privately for sandbox-failure classification, never returned/logged.
- FFprobe protocol/demuxer restrictions and external-data-reference denial retained. Program-version JSON must match the candidate toolchain's exact FFprobe version; missing/mismatched tool or sandbox setup fails closed. Normalized output and in-process result guard retained.

`runtime/video-inspection-toolchain.v1.json` records observed Linux/Debian 13 package pins: FFmpeg package `7:7.1.5-0+deb13u1`, bubblewrap `0.12.0-1~deb13u1`, util-linux `2.41.5-0+deb13u1`. FFprobe program version is enforced; Debian package provenance, ancillary tool versions and security-support/advisory review are **not attested by that JSON**. It is a review candidate, not a signed SBOM or approved production dependency set.

**Actual runtime result:** local `bwrap` reports `setting up uid map: Read-only file system`; hardened inspection returns `INSPECTION_SANDBOX_UNAVAILABLE`. No namespace permissions, seccomp profile, host setting or container privilege was broadened. There is no positive sandbox isolation/network-denial proof here. The default Node 22 bookworm image lacks this toolchain; copying Debian 13 host binaries into it is not safe/reproducible packaging. No parser package was installed in the application image.

Architecture decision remains before activation/packaging: review either a dedicated pinned, non-networked inspection worker/image with bounded IPC/volume and cgroup limits, or a demonstrably compatible unprivileged namespace runtime. A reviewed distro/security lifecycle, image digest/package source, isolation tests and deployment resource budget are necessary. This order authorizes preparation, not selecting/activating new infrastructure. No privileged Docker, host networking changes, worker provisioning or parser dependency installation occurred.

## C. Scoped generation-pinned internal inspection service

`src/media/scopedVideoInspection.js` adds `createScopedVideoInspectionService`. It is not an HTTP endpoint, profile provisioner or approval operation. Dependencies are existing repository, configured private storage, token verifier and AuthorizationService, with one shared hardened inspector by default.

The bounded strict request contains only access token, tenant/project/brand/campaign/variant/revision/asset IDs and expected campaign version. Extra client inspection/attestation data is rejected. Token is never put in a URL, logged or returned.

1. Verify token through existing verifier; authorize project+brand with `project:read`; use the canonical campaign authorization context. Check the campaign actually belongs to the requested authorized brand; authorization to a second brand is insufficient.
2. Reuse `getMediaPreviewAsset` for scoped membership, current campaign version/revision/reference, active preview rights, generated source/job/manifest lineage and canonical storage key. Match the configured bucket before storage access. No client chooses bucket/key/generation.
3. Validate stat MIME, safe positive size, recorded size where available and bounded numeric generation. Reject >32 MiB before retrieval; reserve the whole object against an instance-local byte budget.
4. Read sequential <=8 MiB closed ranges, always setting the **same generation and ifGenerationMatch** through the existing adapter. Validate 206, exact MIME/content-length/content-range/encoding and exact streamed byte counts; never fall back to an unpinned download. One fixed <=32 MiB buffer bounds accumulation before/during transfer.
5. Reauthorize before every range and after inspection; restat the current object and compare generation/size. Recheck authorization again before return. Rights/membership revocation, generation replacement or campaign revision/version changes discard results. Result is point-in-time evidence, not instantaneous continuous revocation.
6. Independently hash the exact fully retrieved bytes and verify genuine inspector result size/digest and in-process provenance. Return only frozen normalized measurements, non-provisionable candidate assessment and scoped identity with content SHA-256 plus an opaque source-binding hash. Bucket/key/raw generation/token/tool stderr never enter the DTO.

The source-binding hashes tenant/project/brand/campaign/variant/revision/asset/version, configured bucket/key, actual storage generation and actual digest. It binds the inspected bytes at this observation, **not historical byte provenance** that was never persisted. It is neither a signature nor durable cross-process authorization. No cache/persistence migration or receipt identity is introduced. Returned observations cannot approve or provision anything; later use requires fresh authorization and an explicitly reviewed authority model.

### Deadlines, cleanup and budgets

- Two in-flight service operations maximum; default total response deadline 15 seconds, operator configuration <=30 seconds. Cancellation aborts transport/probe and cleans current or late response bodies.
- Noncancellable auth/DB/transport/inspector work retains its concurrency slot until underlying promises settle. A hung dependency can exhaust the service, but cannot be replaced by unlimited timed-out orphan work. DB cancellation is not invented; deployment DB/pool timeouts remain needed.
- Per service instance: default 8 attempts and <=64 MiB reserved retrieval per 60-second window; failures/retries do not refund byte reservations. Backward clock movement does not restore budget. These are isolated technical safety defaults, not billing or approved production commercial quotas. Unauthorized attempts can consume shared request capacity; fairness/distributed tenant budgeting still requires owner review.
- Read buffers, inspector copies and active subprocess limits are bounded per instance, not global cgroups/RSS limits. Multiple instances or recreated factories do not share budgets. No dollar/aggregate deployment egress cap is claimed.
- Inspection result/error serialization uses a fixed allowed reason set; raw exceptions, upstream diagnostics and even arbitrary uppercase callback reasons are rejected. No secrets, URLs or storage IDs leak through failure text.

## D. Security evidence and residual risks

Tests use real auth service and campaign/media authority with synthetic provider/GCS transports, real FFprobe only when explicitly injected for local positive paths. The real PostgreSQL test uses actual authorization/campaign/media tables and changes media rights during probing, proving final reauthorization discards the result. This is not real GCS or positive sandbox proof.

| Threat | Implemented control / evidence | Residual / severity before activation |
| --- | --- | --- |
| Cross-tenant/brand/campaign/forged IDs | Token + project/brand authorization + campaign binding + existing repository lineage; denied before storage | High impact if miswired; no public endpoint provided |
| Revoked/expired/stale evidence | Fresh token and rights/version checks per range and after probe; revocation/membership/revision races tested | Point-in-time race after final check remains; no instantaneous revocation claim |
| Replaced object | Exact-generation reads plus final restat; replacement race denied, no fallback | Historical overwrite before observation remains inherited trust assumption |
| Malformed/oversize stream | Stat and streaming caps, exact lengths/headers; inspector malformed states | Full payload decode is not implemented; parsed metadata is not Meta compliance |
| Parser exploit/network access | Opt-in namespace architecture, readonly input/system mounts, no env, hard limits | **High / activation blocker**: sandbox setup cannot run here; toolchain/image support/provenance and isolation must be verified |
| Resource/egress abuse | Per-instance slots/window request/byte reservations and retained orphan-work slots | Multi-instance cost/fairness, DB timeout and approved operational budgets unresolved |
| Tool missing/unapproved | Default service returns unavailable, no local fallback | **Activation blocker** until packaged/pinned/hardened runtime proven |
| Approval/publishing | Service only reads; same-actor receipt/acknowledgement/version guards untouched | Candidate remains non-provisionable; no new preview capability enabled |

## E. Validation and readiness matrix

Exact local command results and publication evidence are recorded below. No shared/application schema was changed: PostgreSQL harnesses initialize existing schema only in disposable fixture databases. Local logs are `/workspace/.onboarding/bg-studio-009-{focused,full,billing,campaign,browser,existing-browser,docker}.log`.

| Gate | Assessment / evidence scope |
| --- | --- |
| Canonical Docker | RED locally: npm ci reproduces install error; pinned base/lock/context regression passes, not a successful image build |
| Buildpack | UNKNOWN: pack CLI unavailable; actual reported remote run inaccessible |
| Inspection-tool packaging | RED: observed pins documented, no reviewed parser image or compatible deployed runtime |
| Security isolation | RED for activation: default fails closed, namespace setup denied; positive containment proof absent |
| Memory/CPU/temp bounds | AMBER: hard process limits and per-instance bounds tested; deployment cgroups/ephemeral quota/crash cleanup unverified |
| Storage/egress budgets | AMBER: bounded ranges + local reserved-byte/request windows; distributed/dollar budgets absent |
| Tenant and lineage isolation | Local deterministic + real PostgreSQL proof green; no deployed two-tenant claim |
| Real GCS | UNKNOWN: transports mocked; live IAM/generation/latency/interoperability untested |
| Browser playback | Existing local synthetic H.264 decode/seek/end plus CORS/auth tests; no broad mobile/staging proof |
| Meta specifications | RED/unresolved per #210/#211; no compliance or feed/Reels operation assertion |
| Staging prerequisites | RED: founder approval, reviewed runtime image/isolation/budgets and real staged auth/storage/E2E still required |

## Claude handoff and next safe work order

No customer API or frontend branch changed. Existing metadata and byte routes still carry no inspection fields. Internal measurement/identity is not a client attestation or approval token. Preserve #210/#211 frontend states: unknown/unsupported/invalid/unavailable must not be shown as approved media; retain 32 MiB total object ceiling, explicit <=8 MiB ranges, authenticated completion checks, cancellation/blob cleanup, session refresh, accessible controls/description and explicit acknowledgement/approval. Approval publishes nothing.

Next safe work: review the bounded internal API and race tests; diagnose npm in a permitted registry-capable environment and rerun canonical Docker/Buildpack; select/review a compatible pinned inspection runtime, then prove namespace filesystem/network/UID/temp/cgroup isolation with adversarial samples. Separately resolve official Meta evidence and inspection persistence/refresh semantics. Founder decisions are needed before any deployment, provisioning, new infrastructure/budget or activation; no founder decision is inferred from this engineering report. Do not add a public inspection endpoint or provision Instagram until those gates are explicitly cleared.

### Executed local validation

| Command | Result |
| --- | --- |
| `node --test test/container-build-contract.test.js test/scoped-video-inspection.test.js test/video-inspection.test.js` | **61 passed**, 0 failed/skipped |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **772 passed**, 0 failed/cancelled/skipped |
| Same disposable URL, `npm run test:billing:postgres` | **24 passed**, 0 failed/skipped |
| Same disposable URL, `npm run test:campaign:postgres` | **25 passed**, 0 failed/skipped, including new real PostgreSQL rights-race proof |
| `node scripts/video-inspection-browser-smoke.js /usr/bin/chromium` | Local synthetic H.264 seek/decode/play-to-end, authenticated 206 range, revoked 404 with no further storage IO passed |
| `node scripts/media-integration-browser-smoke.js /usr/bin/chromium` | Existing local PNG/auth/CORS/range/foreign/stale/revoked proof passed |
| `node scripts/check-container-build-contract.js` | Pinned base, matching lockfile and isolated context contract passed |
| JS syntax checks / `git diff --check` | Passed |
| Canonical `docker build --pull=false --tag bizgenie-api:bg-studio-009 <sanitized-context>` | **Failed** at npm ci, `Exit handler never called!`; no image/deployment success claimed |
| Buildpack | Not executed: pack unavailable |

The initial combined focused run caught a pre-existing cleanup test that scanned global `/tmp` and mistook another test process's live inspection directory for an orphan. It now records/asserts cleanup of only its own directories. Final focused/full runs pass. A separate isolated child-process test deliberately fails cleanup and verifies the instance becomes poisoned without creating a second temp directory. No genuine file leak or sandbox restriction was bypassed to make tests pass.

### Ready-to-post engineering checkpoint comments

For **#191** (engineering index, cross-reference #128/#197):

> BG-STUDIO-009-BE continues #211 on `bg-studio-009-be-secure-video-runtime`. Scoped authenticated generation-pinned video inspection now rechecks rights/version before returning a digest-bound measurement; no public route, approval/profile activation or migration. Local tests: 772 full, 61 focused, PostgreSQL billing 24/campaign 25; local synthetic browser playback passed. Docker is now base/lock pinned with context protection, but npm install failure persists and registry DNS fails locally. Hardened namespace default fails closed because UID mapping is blocked; no positive isolation/runtime packaging acceptance. Evidence: `docs/media/BG-STUDIO-009-BE.md`. CI and source run 39921308358 remain unverified because GitHub API is Forbidden. DEC-015: canonical Google Sheets Mission Control remains sole operational authority, not this index. No merge/deploy/provisioning/paid call.

For **#197** (Studio integration):

> Backend BG-STUDIO-009-BE adds an internal authenticated inspection service with brand/campaign/revision/asset binding, bounded pinned-range retrieval, digest checks and post-inspection revocation/version rejection. Existing frontend endpoints/DTOs are unchanged: Claude must not expect inspection fields or treat measurements as acknowledgement/approval. Instagram remains non-provisionable. See the versioned report for supported/failure states, 32 MiB budget, runtime/network isolation blockers and deployment readiness matrix. Local synthetic playback and PostgreSQL rights-race proofs pass; real GCS/staging/mobile/Meta and toolchain packaging remain open. No deployment or frontend-branch changes authorized. Canonical governance remains the DEC-015 Google Sheets register.

## Publication checkpoint

Validated implementation head **`b3af444beeb7f848d6471a89ec3f290462cf71b9`** was pushed to `bg-studio-009-be-secure-video-runtime`, exact parent/base **`fb9edce8c17e363a3bf13c77dc5ffa00231fe302`**. The subsequent publication-evidence-only commit leaves tested code, tests, runtime pins and Docker inputs unchanged.

Draft creation against `bg-studio-008-be-video-inspection` returned **`Post "https://api.github.com/graphql": Forbidden`**. No draft PR number/URL is claimed. [Exact stacked comparison](https://github.com/shirrie01/bizgenie-api/compare/bg-studio-008-be-video-inspection...bg-studio-009-be-secure-video-runtime?expand=1); prepared body `/workspace/.onboarding/bg-studio-009-pr.md`. CI is **unverified**, not inferred from push success or the reported #211 run. An authorized owner should create the draft and verify exact final-head tests and canonical artifact jobs.

Issue API reads and draft writes are forbidden; no #191/#197 issue update is claimed. Ready-to-post comments above carry this checkpoint and canonical governance reference. The existing repository engineering index is updated on this isolated branch; no external Mission Control sheet or competing register was created/modified. No source PR branch or main changed.

## BG-STUDIO-009-BE-CI-REPAIR — 23 October 2026

### Original failure and visibility

PR #212 and `bg-studio-009-be-secure-video-runtime` were fetched and both verified at `4437d5f3ae36eeeae37e7b2b6464fcfee5b48c06` before repair. No newer branch head was observed. The founder reports run #349 / `39929032684` failed at **Run automated tests**. `gh pr view 212` returned GraphQL `Forbidden`; `gh run view 39929032684 --log-failed` failed while reading the run API with REST `Forbidden`. **The original run's exact failed assertions/logs cannot be confirmed here.** No broader credentials or permission bypass was attempted.

### Confirmed reproduction versus CI hypothesis

- Baseline exact CI command `TEST_DATABASE_URL=<disposable PostgreSQL 17 URL> npm test`, Node **22.23.3**, passed **772/772** with FFprobe installed.
- Supplemental stress `TEST_DATABASE_URL=<same URL> taskset -c 0 node --test --test-concurrency=16` passed **772/772** in ~40 seconds. This did not reproduce a timing failure and is not claimed to match CI resources.
- Closest available official Node container: **22.23.4**, npm **10.9.9**, Debian 12/x86_64, with no FFprobe. Running the unchanged scoped-inspection tests through a read-only source mount, no network and bounded tmpfs reproduced **31 passes / 3 failures / 0 skips**:

| Test in `test/scoped-video-inspection.test.js` | Reproduced assertion |
| --- | --- |
| `scoped real byte inspection pins generation and digest, returns no storage authority and mutates nothing`, line 30 | actual `unavailable`, expected `measured` |
| `actual malformed MP4 bytes return invalid, never an approval`, line 102 | actual `unavailable`, expected `invalid` |
| `per-instance request and reserved-byte budgets do not silently refund failed reads`, line 132 | actual `unavailable`, expected `measured` |

Container command: `docker run --rm --network none --read-only --tmpfs /tmp:rw,size=256m --mount type=bind,src=/workspace/bizgenie-api,dst=/app,readonly --workdir /app bizgenie-api:bg-studio-008-offline-evidence node --test test/scoped-video-inspection.test.js`.

**Confirmed root cause of this reproduction:** the tests require a real FFprobe, while the container lacks it. The workflow previously installed Node packages only, relying on ambient runner OS tools. #211's real-byte tests treated absent FFprobe as optional; #212 introduced mandatory scoped/PostgreSQL positive inspection tests. A Node dependency install does not provide FFprobe/prlimit. **Missing tools in the actual GitHub run remain a hypothesis until its logs are available**; the container is a controlled reproduction of the dependency gap, not a claimed copy of the Ubuntu runner. Runtime resource/security checks behaved correctly by returning unavailable.

### Fix and unchanged safeguards

The existing Node 22 test job now explicitly installs the test-only `ffmpeg` and `util-linux` packages from the runner distribution repositories and executes `scripts/check-video-test-toolchain.js` before the unchanged `npm test` step. The preflight checks executable FFprobe/prlimit versions with bounded subprocess calls and reports them in CI; absence fails with an actionable message. Two new tests check availability and explicit missing-tool failure.

This is prerequisite setup, **not skipping, weakening or concealing assertions**. No `continue-on-error`, retry masking, test exclusion, success coercion or reduced test selection was added. No runtime modules, sandbox limits, authorization, retrieval, revocation, digest, billing, approval or publishing code changed. CI test-package availability is not approved runtime packaging, sandbox acceptance or activation. No sandbox privileges/capabilities, IAM, app dependencies, Dockerfile or database schema were changed by this repair. Existing runtime/provisioning readiness gates remain open.

### Repair validation

| Command under Node 22.23.3 | Result |
| --- | --- |
| `node scripts/check-video-test-toolchain.js` | FFprobe 7.1.5-0+deb13u1 and util-linux prlimit 2.41.5 available |
| `node --test test/video-test-toolchain.test.js test/scoped-video-inspection.test.js test/video-inspection.test.js test/container-build-contract.test.js` | **63 passed**, 0 failed/skipped |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **774 passed**, 0 failed/cancelled/skipped |
| Same disposable local URL, `npm run test:billing:postgres` | **24 passed**, 0 failed/skipped |
| Same disposable local URL, `npm run test:campaign:postgres` | **25 passed**, 0 failed/skipped |
| `node scripts/check-container-build-contract.js` | Passed |
| Syntax and diff whitespace checks | Passed |

No shared/application schema migrations were applied; existing PostgreSQL tests use disposable fixtures. The CI package-install step itself cannot be executed/observed in GitHub from this session. Original canonical Docker/network/buildpack blockers are not relabelled resolved. Logs: `/workspace/.onboarding/bg-studio-009-repair-{baseline,stress-before,missing-tool,focused,full,billing,campaign}.log`.

### Verification boundary

Repair is on the existing branch/PR #212 only; no duplicate PR is requested. Exact repair commit and final published head are recorded in the following checkpoint. New exact-head GitHub Actions must complete successfully before calling this gate GREEN. Until verified, the original CI root cause remains unconfirmed and remote repair status remains **UNVERIFIED**, regardless of local passes. BG-STUDIO-010-BE is not started.
