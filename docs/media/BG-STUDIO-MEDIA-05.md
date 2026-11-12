# BG-STUDIO-MEDIA-05 — source integration acceptance

Authority: [Issue #191 comment 6839114123](https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-6839114123), issued 12 November 2026. Mission Control remains programme authority; this is source engineering evidence, not operational approval. Historical reports retained below are timestamped checkpoints, not current deployment claims.

## Verified baseline and source disposition

Main/base `2251e54bbe8a5265d753fbe27621318dadff57fd` is the #232 merge; its head was `e996db505bb3c011869cfedfb9084accb47c7887`. Native Git and public GitHub metadata agree. #207/#208 are superseded per the current work order; no previous delivery implementation is replayed.

| Original PR | Verified original head | Unique source integrated | Current disposition |
| --- | --- | --- | --- |
| #209 | `6911ffc2aaa8687432b6e28fd34bdca59a40be90` | BG-STUDIO-006 readiness report and registry-boundary tests | Still draft/open; close only after verified incorporation on main |
| #210 | `e26b79d273fe2a906245b1ce52fd6d7e67df4250` | Proposed JSON contract, negative/receipt/version/PG tests and BG-STUDIO-007 evidence | Still draft/open; candidate NOT PROVISIONABLE |
| #211 | `fb9edce8c17e363a3bf13c77dc5ffa00231fe302` | Bounded byte inspector, synthetic media/browser proof and BG-STUDIO-008 evidence | Still draft/open pending reviewed integration merge |
| #212 | `b60e380479d36f206e68697ed0fd2f57b2b04b07` | Scoped generation-pinned inspection, final authority rechecks, fail-closed sandbox candidate, build/test prerequisite checks and BG-STUDIO-009 evidence | Still draft/open pending reviewed integration merge; activation remains blocked |

Fresh isolated branch `bg-studio-media-05` replays these nine unique commits parent-first with `cherry-pick -x`, all cleanly. Original branches untouched. #209 base is historical #208, then #210 → #209, #211 → #210 and #212 → #211. Their historical CI is not fresh integration CI.

Only two new internal src modules are introduced: videoInspection.js and scopedVideoInspection.js. Existing campaign routes/repositories, preview registry, preview delivery/storage, image/video generation services and index.js are byte-identical to main. This retains merged #205/#206 reference rights and immutable brand provenance, plus #232 generation pinning, version checks and stronger late-response cancellation. Shared helper changes are test-only options for injected profiles/platform/video bytes; existing defaults remain unchanged.

## Safety and scope

No production composition/route imports the new inspector. No persisted attestation, registry seed, profile provisioning, migration, receipt bypass or approval/publication authority is added. The JSON profile remains `proposal_not_provisionable`; successful measurements still return `provisionable: false`. Synthetic registry entries exist only in tests. No Meta contract is asserted by local measurements.

The scoped service verifies bearer actor, tenant/project/brand, campaign/current version, revision attachment, generation lineage and rights before bytes, between chunks, and after inspection; reads remain generation/ifGenerationMatch pinned and digest-bound. Maximum object32MiB, chunks8MiB, two concurrent inspections, bounded deadlines/output/resource limits and per-instance request/byte budgets. Noncancellable pending work retains its slot. Invalid tools, aborts, incomplete data, forged measurements and sandbox failure fail closed. No unsandboxed fallback in the default scoped service. Local inspector mode is used explicitly for deterministic developer fixture tests, not wired to customer requests.

Imported #212 Docker changes pin the existing Node22 base digest, use npm ci with the existing unchanged lockfile and exclude sensitive/dependency build context. They do not install/activate inspection tooling in the application image. CI alone installs ffmpeg/util-linux as test prerequisites; missing tools fail explicitly rather than skip tests. No live software installation or resource activation was performed. The historical digest/toolchain candidate is not a current advisory or SBOM attestation.

Activation blockers remain: independently accepted sandbox/image/toolchain isolation and security lifecycle, Meta contract/provisioning/renderer approval, real deployment/browser acceptance and multi-instance resource/egress policy. Per-instance budgets are not cluster quotas. Existing delivery permits completion of an already-authorized bounded transfer after revocation; future requests recheck rights. The added scoped inspection performs final reauthorization and does not extend delivery semantics.

## Local verification

Node22.23.3; existing disposable loopback PostgreSQL17.11. No shared SQL.

| Command/check | Verified result |
| --- | --- |
| `npm test` with disposable TEST_DATABASE_URL | 844/844 PASS, zero skipped/cancelled/failures |
| Focused registry/proposal/inspection/media suites | 125/125 PASS |
| `npm run test:billing:postgres` | 24/24 PASS |
| `npm run test:campaign:postgres` | 25/25 PASS |
| JS syntax for index.js and all src/test files; diff whitespace | PASS |
| Offline container contract and test-tool prerequisite checker | PASS; not a published image |
| Chromium synthetic H.264 browser smoke | PASS: seek1s, 1280x720, duration4s, playedToEnd,5716bytes, range206/8bytes; revoked404 before storage |

Counts overlap. The browser uses only local mocked storage/provider fixtures and network allowlisting; no real generation, GCS, credentials, deployment or Meta acceptance. It demonstrates this fixture's decode/playback, not all provider outputs. Historical reports remain unchanged; their old local install failures and historical CI are not today's test results.

## Release and handover

Frontend/API contracts are unchanged. Instagram-feed video remains unavailable/409 under locked registry until separately approved provisioning; do not treat inspection success as receipt, acknowledgement, approval or permission to publish. Existing GET/HEAD delivery contract from #232 remains authoritative.

New draft PR, exact-head hosted CI and independent review/protection are required before any merge. Do not close #209–#212 until their required unique changes are verified on main. If API publishing is unavailable, retain ready-to-post evidence; do not claim PR/CI/Issue/Sheets writes succeeded. Source rollback is reviewed revert; no SQL rollback or operational change is needed.

#213 effective application-pool privileges/RLS/preflight and migration checks remain HOLD; R2/metadata NOT RUN, staging NO-GO. No diagnostic Job, shared SQL, IAM/secrets, deployment, traffic, customer writes, social or paid operations are authorized.
