# BG-STUDIO-021 — universal generation enforcement

26 October2026. Draft only. Existing #21723f49038f36acf8414a079e27a8d5ffc8d302f2b preserved. New policy is **server composition only**, no environment/frontend flag enables it. Default legacy mode preserves production behaviour. No activation, paid call or shared migration.

## Route/call graph inventory

| Entry | Paid call path | Legacy authority/ledger | quoted_v1 compatibility |
|---|---|---|---|
| POST /generate-script (admin) | handler -> scriptGenerator -> Vertex generateContent | admin key; no customer reservation | blocked428 after admin verification |
| /generate-image (admin) | image router -> ImageGenerationService -> OpenAI provider | admin key; no customer job/ledger | blocked428, no admin bypass |
| /generate-video (admin) | video router -> VideoGenerationService -> Veo submit; poll/status | admin key; no customer ledger | all legacy subpaths blocked |
| POST /customer/generate-script | auth -> immutable job recorder -> script handler -> orchestrator.execute -> generator | tenant/brand auth; existing ledger; process-local execution Map | blocked428 after authentication; use quote/confirm/job |
| /customer/generate-image | auth -> job recorder -> image service/provider | existing reservation/debit orchestration | blocked428 |
| /customer/generate-video and poll/status | auth -> job; submit -> provider; poll can persist/settle | existing ledger/immutable video job; legacy status contract | legacy paths blocked428, preventing mixed-generation polling/settlement |
| POST /customer/campaigns/:id/variants/:id/generate | auth -> CampaignVariantGenerationService -> strategy + draft script calls -> save_revision | immutable text job + existing ledger, two provider calls under old orchestration | blocked428; never silently turn into a synchronous quoted request |
| Regeneration/revision through any above | same paths/new request identity | same legacy authority | blocked; fresh complete quote/confirmation required |
| /_service/generation-jobs/...execution-payload | returns bounded payload only | service principal/immutable job; no provider call | remains read-only, no dispatch/provider capability |
| Campaign recommendations | deterministic goal registry/measurement strategy | scoped read, no model call in inspected router | unchanged; provider-generating strategy path is campaign generate above |
| Internal ImageGenerationService/VideoGenerationService | provider.generate/submit | server-owned injected dependencies | provider wrappers require current worker capability and exact generation_job_id |
| Internal scriptGenerator | supplied generator function -> Vertex SDK | server-only function | guarded generator refuses calls outside durable worker capability |
| FencedGenerationWorker | claim -> start -> provider adapter -> existing services | existing quote/job/account/ledger | sole admitted new provider boundary; holds DB fence share lock over submit |

Repository search covered `.generate`, `.submit`, scriptGenerator and generateContent calls in src/index. No scheduled/background dispatcher invokes generation in current production composition; new workers are explicit/injected and inactive.

## Enforcement and recovery

`GenerationExecutionPolicy` validates mode and same quote-service composition. `quoted_v1` blocks legacy routes with428 `DURABLE_CONFIRMATION_REQUIRED`; forged quote fields do not authorize them. Provider/generator wrappers reject internal calls outside an active, same-job capability. Each capability admits one provider boundary and expires when submit returns; late async descendants cannot reuse it. Worker holds the current calling fence/token row lock through submit, so concurrent finalization/recovery cannot settle before the actual submit boundary.

An important bypass was found: OpenAIImageProvider internally retries timeout/network/5xx. In quoted composition its per-job provider view forces **maxAttempts1**, preserving the legacy instance unchanged. No automatic retry of uncertain paid execution. SDK transport/provider integration must also be reviewed before activation; no unsupported two-stage strategy pipeline is silently admitted under a one-call profile. Multi-stage campaign strategy remains mandatory and requires an explicitly priced, durable step contract before quoted-mode launch, not fallback to legacy.

Two quoted-mode PostgreSQL regressions cover one provider boundary/no hidden retries and failed settlement holding the reservation until reconciliation without another call. Existing quote concurrency/exhaustion/expiry/intent/version/snapshot/revocation/timeout/crash/restart/cancellation tests are retained. Unit tests cover every exposed legacy route, composition denial and internal bypass. Focused24/24 at first checkpoint. Full-suite evidence recorded at final head.

Activation prerequisites: review/apply no shared SQL without approval; wire the same policy into app, worker and existing creative/text adapter; finish supported job APIs/step orchestration; drain legacy executions; validate profiles/prices, provider reconciliation and spend/rate/egress controls; separately approve deployment and capability activation. Unsupported combinations fail closed. This is not a production-financial-safety certification or launch acceptance.
