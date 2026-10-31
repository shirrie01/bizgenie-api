# Hybrid UGC compositor: implementation-ready contract (proposed, NOT operational)

31 Oct 2026, BG-LAUNCH-002. Status: **post-launch capability pending founder scope approval.** Hybrid UGC is not represented as working anywhere: `HybridCompositionAdapter` (orchestration, rights re-checks, fencing) is real; the only compositor is `FixtureHybridCompositor` (`fixtureMode`, one synthetic input hash, drawbox overlay). `premiumComposition` leaves hybrid unsupported and the quote service rejects it (`OPERATION_UNSUPPORTED`) unless a profile names a compositor id.

## What exists and is reused unchanged
Quote/confirm and credit reservation; `intake.referenceForComposition` (re-checks rights and pins sha256 + object generation before and after the AI storyboard step); fenced worker; `DurableMediaAssetStore.saveComposed` (inspects the output, requires H.264, no audio, <= 60 s); the new `validateGeneratedVideo` and platform suitability checks; preview/approval gating.

## The contract a real compositor must satisfy
`compose({ source: Buffer, storyboard, profile }) -> Buffer` with `id` = `profile.composition_engine`.

| Area | Requirement |
|---|---|
| Inputs | Exactly one customer clip (`supplied_assets.length === 1`) that passed intake; storyboard from the AI planning step (JSON: ordered shots, on-screen text, trim points). No other network or file input. |
| Rights / consent | Customer attestation with the rights-policy version recorded at intake; `allowed_uses` must include `video.generate.reference`; people-in-footage consent is part of the attestation text (wording needs founder/legal approval, none exists). Rights are re-read immediately before compose and before save (already enforced by the adapter). |
| Rendering | Deterministic, offline, sandboxed process (no shell, no network, CPU/memory/time limits, bubblewrap as the existing inspector uses). Output MP4 H.264, no audio unless a separate music-rights decision is made, target 9:16 or 16:9 as quoted, duration equal to the quoted duration. |
| Storage | Output bytes saved only through `saveComposed`; private bucket; lineage = job id; the customer's source object is never modified or exposed. |
| Validation | Pre-save: real ffprobe measurement and `validateGeneratedVideo` against the quoted aspect/duration (same boundary as Veo). Post-save: platform suitability through the existing preview-profile gate. |
| Approval | Same review path as any video: preview render, acknowledgement, current-version approval. Provenance shows `origin: hybrid` and the supplied asset id; nothing is auto-approved or published. |
| Failure | Compose/inspection failure is final for the job: reservation released, nothing charged (same as `VIDEO_OUTPUT_INVALID`). |

## Preconditions that are not built (why it is not in launch scope)
1. Real upload scanner/decoder adapters (the intake service only has a synthetic inspector; #221 says so).
2. A product decision on what "hybrid" produces (overlay on the customer clip, b-roll insertion, captions, or AI-generated scenes around it).
3. Rights/consent wording approved by the founder.
4. A sandboxed render environment in the worker image (ffmpeg and bwrap availability on the target runtime).

## Decision needed from the founder
Keep Hybrid UGC post-launch (recommended: launch scope above is already large and depends on items 1 and 3), or schedule the four preconditions before launch.
