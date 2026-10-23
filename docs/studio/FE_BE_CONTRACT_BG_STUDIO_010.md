# Frontend / backend contract `workspace-onboarding.v1` (BG-STUDIO-010-BE)

Status: **implemented on branch `bg-studio-010-be-onboarding-persistence`, draft only, not deployed, migration not applied anywhere.** Authority: the Google Sheets Mission Control Register v1.0 (DEC-015). This answers gaps G1–G6 in the frontend's `FE_BE_CONTRACT_BG_STUDIO_008.md`. It is additive: no existing endpoint, schema field or response shape changes.

## Endpoints
Both require `Authorization: Bearer <access token>` carrying the **trusted workspace scope** (the same token the Brand Brain routes use). Tenant, project and brand are read from that verified scope; the request never names them. Membership is re-checked on every call.

| Method | Path | Purpose |
|---|---|---|
| GET | `/customer/workspace/onboarding` | Read saved onboarding. Never creates a row. |
| PUT | `/customer/workspace/onboarding` | Merge-save answers/progress (compare-and-set, idempotent). |

### Response (both)
```json
{
  "status": "ready | saved",
  "replayed": false,                     // PUT only; true when an identical retry was recognised
  "brand_name_placeholder": false,       // G4, see below
  "onboarding": {
    "contract_version": "workspace-onboarding.v1",
    "tenant_id": "…", "project_id": "…", "brand_id": "…",
    "version": 0,                        // 0 = nothing saved yet
    "status": "not_started | in_progress | completed",
    "sector":   { "key": null, "source": null },        // source: "customer" | "inferred"
    "industry_text": null,
    "channels": { "values": [], "source": null },
    "current_step": null,
    "draft": {},
    "completeness": { "sector": false, "channels": false, "ready_to_complete": false, "missing": ["sector_key","channels"] },
    "completed_at": null,
    "updated_at": null
  }
}
```
No actor ids, idempotency keys or hashes are returned.

### PUT body (`strict`; unknown fields are rejected)
| Field | Rules |
|---|---|
| `idempotency_key` | required, 1–128 chars, `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| `expected_version` | required integer ≥ 0. Use `0` for the first save, then the `version` last read/returned. |
| `sector_key` | `leasing, perfume, aesthetics, beverage, charity, takeaway, neutral`, or `null` to clear |
| `sector_source` | `customer` (default when `sector_key` is set) or `inferred` |
| `industry_text` | optional free text ≤ 200 chars, or `null` |
| `channels` | unique subset of `instagram, tiktok, facebook, linkedin, email, website` (lower case); `[]` clears |
| `channels_source` | `customer` (default) or `inferred` |
| `current_step` | integer 0–20 or `null` (frontend stage index) |
| `draft` | partial object, keys: `business_name`(200) `website_or_social_profile`(500) `primary_marketing_challenge`(1000) `description`(2000) `audience_summary`(2000) `primary_cta`(500) `goal`(2000). A key set to `null` is removed. |
| `complete` | `true` → mark completed (requires a sector and ≥ 1 channel); `false` → reopen |

Omitted fields are left unchanged. Nothing here ever writes to the Brand Brain.

### Errors
| HTTP | `error.code` | Meaning / frontend action |
|---|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | Re-authenticate. |
| 403 | `WORKSPACE_NOT_AUTHORIZED` | Token has no trusted scope, or the customer is not (or no longer) a member. Re-run workspace selection. |
| 400 | `ONBOARDING_VALIDATION_ERROR` | `details[]` has `path/code/message`. Nothing was saved. Includes "an inferred value cannot replace one the customer chose". |
| 422 | `ONBOARDING_INCOMPLETE` | `complete: true` (or editing a completed profile) without sector/channels. `details[].path` names what is missing. |
| 409 | `VERSION_CONFLICT` | Stale `expected_version`; `details.current_version` given. GET, merge in the UI, retry with a new key. |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Same key reused with different content. Use a new key. |
| 503 | `ONBOARDING_UNAVAILABLE` | Storage unavailable. **Treat as not saved**; keep the local draft and retry with the **same** key. |

### Retry rules
* Generate one `idempotency_key` per user action and reuse it for every retry of that action.
* An identical retry of the **latest** save returns `200` with `replayed: true` and the unchanged version, so an interrupted response is safe to resend. A retry of an older save sees `VERSION_CONFLICT`; re-read before deciding.
* Treat only a `200 saved` response as saved. Any other outcome means the server state is what GET returns.

## Gap resolutions
| Gap | Outcome |
|---|---|
| G1 sector | **Built.** `sector.key` (+ `source`) and optional `industry_text`. The 7 keys are the frontend's own. |
| G2 channels | **Built.** `channels.values` (+ `source`). Saved channels are preferences for planning only; nothing is connected or published. They reorder recommendations, see below. |
| G3 progress | **Built.** `status`, `current_step`, bounded `draft`, `completeness`, `version`. Completion is decided by the server from saved answers, never by a client flag alone. Brand-name/description completeness remains a Brand Brain concern. |
| G4 placeholders | **Scoped fix.** The backend only ever generates `BizGenie Workspace` (and `<name> Workspace` / `<name> Campaign Workspace` for tenant/project). `Customer Campaign Workspace` is **not** generated by this API; it comes from the frontend's legacy `businessNameFromGoal` path. `brand_name_placeholder` is `true` when the Brand Brain name is either string, so the frontend can stop hard-coding it. No name is rewritten. |
| G5 multi-workspace | **Existing contract confirmed and tested, no code change.** `GET /customer/workspace` returns `selection_required` with `workspaces[]` (`tenant_id, tenant_name, project_id, project_name, brand_id, brand_name, brand_status, membership_role`); `POST /customer/workspace/select` with the three ids returns the chosen workspace (+ `requires_session_refresh` when provisioning is configured). An unowned brand is rejected (400 `WORKSPACE_VALIDATION_ERROR`). After selecting, refresh the session so the token's trusted scope matches, then call onboarding. |
| G6 campaign list | **Stable fields confirmed and pinned by tests:** `GET /customer/campaigns` returns rows ordered `updated_at` descending (ties by `campaign_id`), excluding archived campaigns, with `campaign_id, tenant_id, project_id, brand_id, name, goal, display_timezone, version, status, counts, archived_at, created_at, updated_at, next_action` and no item detail. |

## Recommendations (workstream D)
`POST /customer/campaign-recommendations` is unchanged in shape. When the workspace's onboarding is **completed**, its saved channels put matching candidates first in `suggested_items` (stable sort). Items are never added, removed or rewritten, so a channel with no supported format (for example `tiktok`, `website`) simply has no effect. Sector is stored and returned but is **not** used by the engine yet (no sector-specific templates exist; inventing them would be fabrication). No model or provider call is made. Caveat: because `suggested_items` order is part of the recommendation hash, replaying an old `idempotency_key` after the preferences changed returns `IDEMPOTENCY_KEY_CONFLICT`; use a fresh key per request, as the frontend already does.

## Not changed / out of scope
Revoked-media recovery and the Instagram video profile are documented, not changed, in the report. A sector-aware strategy engine is a separate work order.
