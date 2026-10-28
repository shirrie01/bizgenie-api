# BG-MEDIA-HYBRID-001 — Implementation contract and acceptance gates

Status: engineering preparation, not implemented. Founder-authorised 20 October 2026. GitHub #188; Mission Control CP-71–CP-75. No production deployment, migrations, paid generation, or image/video provider activation authorised.

## Verified reuse points

- `src/campaigns/router.js`: `generationBody` accepts `execution_mode: "hybrid"` and `supplied_assets` (max 10, unique UUIDs, role primary/supporting); rejects hybrid without assets.
- `src/campaigns/generation.js`: checks each supplied asset through `findAuthorizedReference` using tenant, project, brand, right and image kind; requires `source_kind=reference`; preserves asset refs in content.
- `src/media/repository.js`: active tenant/project/brand-scoped reference authority.
- `src/media/storage.js`: private GCS object-key design, object upload/download and durable media store; do not confuse internal storage methods with an authenticated customer upload endpoint.
- `bizgenie-web/src/App.jsx`: hybrid selector is disabled; generate request currently omits `supplied_assets`.
- Image/video provider activation flags are intentionally OFF by founder decision. Keep OFF.

## Delivery sequence

### PR A: secure reference ingestion API
Before writing code, inspect existing HTTP routes and reuse any current authenticated customer asset endpoint. If none exists, implement an authenticated customer reference upload/list endpoint using existing media repository/storage abstractions, bounded image types and size, content sniffing and validation, private storage, server-assigned tenant/project/brand/rights, user rights attestation and safe failures. Reject untrusted `storage_key`, `allowed_uses`, `tenant_id` or `brand_id` supplied as authority by clients. Enforce authorization and active asset status for list/download. Ensure database/storage partial failure cleanup and idempotency. Define explicit malware handling and retention policy.

### PR B: customer picker and generation wiring
Only after PR A contract is available: authenticated brand-scoped asset list, image thumbnails/selection, accessible loading/errors, primary/supporting roles, selection reset on scope changes. Enable hybrid only when at least one eligible asset is selected. Pass `supplied_assets: [{asset_id,role}]` to existing `POST /customer/campaigns/:campaignId/variants/:variantId/generate`; preserve `execution_brief`, expected version, idempotency and credit handling. Do not activate paid image/video providers.

### PR C: review and proof
Display chosen source media and generated draft with clear provenance, preview and approval. Do not imply composited media output where only text has been generated. Add cross-tenant, cross-brand, revoked rights, malformed MIME, oversized upload, duplicate, retries, billing settlement and UI tests. CI green plus bounded staging proof and founder acceptance before rollout.

## Completion definition
A customer can upload an approved image, find and select it for their brand, generate an AI-assisted campaign draft with verified supplied-asset provenance, review and approve safely. This does not imply full video editing or autonomous publishing.

## Gates
Frozen launch Issue #128 remains authority. Every PR is reviewable and separate. No migration, production traffic, provider activation, or paid call without distinct approval.
