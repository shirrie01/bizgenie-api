# BG-STUDIO-010-BE — persistent customer onboarding and frontend contract

Evidence date: **23 October 2026**. [Google Sheets BizGenie Mission Control Register v1.0](https://docs.google.com/spreadsheets/d/1N4Yf4hgi5a-ZB_VXZ7WSteLyTVWsX14wxmESvCzMtcc/edit) remains sole operational authority under DEC-015. #128 launch, #191 engineering index and #197 Studio are parent references, not a competing register. No deployment, merge or founder acceptance is claimed.

## Authority and smallest integration base

Fetched canonical main before edits: **`ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f`**. This independent branch `bg-studio-010-be-persistent-onboarding` starts directly there and targets **main**. Existing customer-workspace, Brand Brain, authorization and campaign-list APIs already exist on main. No #208–#212 video/preview/runtime commits, toolchain dependencies, Docker changes or inspection activation are needed or inherited.

Live Git refs also verified #208 `bf12050939817ae6da3f696808fc5a7f054d74ab`, #209 `6911ffc2aaa8687432b6e28fd34bdca59a40be90`, #210 `e26b79d273fe2a906245b1ce52fd6d7e67df4250`, #211 `fb9edce8c17e363a3bf13c77dc5ffa00231fe302` and #212 `b60e380479d36f206e68697ed0fd2f57b2b04b07`; original branches remain unchanged. Founder independently verifies #212 GREEN at run `39930273781`; this authorizes continuation, not a green verdict for this new branch.

GitHub API reads for the open-PR list, issues #128/#191/#197 and run `39930273781` returned Forbidden, so live open/draft/issue decisions and CI cannot be independently verified. No broader credentials requested. Native Git read of frontend **PR #47**, exact head **`412ede3388c405ac013b44cf9b514ec6a97b5415`**, succeeded. Read `docs/studio/FE_BE_CONTRACT_BG_STUDIO_008.md`, PremiumOnboarding and PremiumStudio at that head. Its requirements are frontend-owned input, not presumed agreement. No frontend branch changed.

## G1–G6: backend resolution and ownership

| Gap | Verified backend result / integration contract |
| --- | --- |
| **G1 sector** | Additive `brand_brain.identity.sector`: optional free text, trimmed 1–200 chars, or explicit null to clear. Persisted in existing identity JSONB, no schema migration. Store a customer-confirmed selection, not an inference relabelled as fact. Frontend may persist its chosen taxonomy key as text; preserve custom values on read rather than silently replacing them. |
| **G2 preferred channels** | Additive `brand_brain.commercial.preferred_channels`: optional ordered unique array of canonical IDs, max 8. Saved in existing commercial JSONB, no schema migration. `[]` clears. These are **planning preferences, not connected accounts or publishing entitlements**. Existing recommendation request remains unchanged; no claim these preferences filter recommendations. |
| **G3 Save and exit / Resume** | New identity-authenticated GET/PUT `/customer/workspace/onboarding`, private user-owned scratchpad with atomic optimistic versioning. Separate from canonical Brand Brain, workspace provisioning, campaign creation and entitlements. Dedicated table is a **proposal only**, tested in a disposable DB; shared availability requires approved schema provisioning. Until then return 503, never pretend the draft saved. |
| **G4 placeholder names** | Canonical backend does not contain the `businessNameFromGoal` heuristic or generate `Customer Campaign Workspace`. It uses supplied `business_name`, or legacy generic **`BizGenie Workspace`**; derived tenant/project labels add Workspace/Campaign Workspace. Bootstrap is idempotent and does not overwrite an existing name. Do not claim the frontend's exact placeholder is the only possible missing name. Remove/repair frontend heuristics in its own branch; require explicit real customer name rather than treating the backend fallback as onboarding completion. No legacy record rewritten here. |
| **G5 multiple workspaces** | Existing GET `/customer/workspace` returns `selection_required`, `workspace:null`, `workspaces:[...]` when multiple. Frontend must show a chooser, then POST `/customer/workspace/select` with exact tenant/project/brand IDs from an authorized row. Selection independently checks membership and approved brand; draft brands may appear in discovery but cannot be selected until approved. Honor `requires_session_refresh` and refresh session before scoped Brain/campaign APIs. Members may read/select where permitted, but preference corrections and workspace-bound draft writes require owner role. No guessing or automatic first-workspace choice. |
| **G6 campaigns** | Existing GET `/customer/campaigns?tenant_id&project_id` returns `{campaigns:[...]}`. `campaign_id`, `name`, derived `status`, `archived_at`, `updated_at` already exist on main's safe DTO. Both repository implementations exclude archived campaigns and order `updated_at` descending. Ties have no contractual secondary order. Frontend may add a local ID tie-break, and must tolerate extra fields; failure is unavailable, not empty. No pagination or new ordering promise invented. |

Preferred channel IDs: `instagram`, `tiktok`, `facebook`, `linkedin`, `email`, `website`, `youtube`, `other`. PR #47 labels map explicitly: Instagram→instagram, TikTok→tiktok, Facebook→facebook, LinkedIn→linkedin, Email→email, Website→website. Backend rejects title-case/unknown/duplicate IDs; it does not reinterpret labels or connect any provider. Website is a planning channel, not a new campaign publishing platform.

## Persisted Brand Brain contract

Use existing authenticated GET and explicit PUT `/customer/workspace/brand-brain` after workspace selection/session refresh. PUT still takes the existing Brand Brain editable shape with required `name`; frontend should merge new values into the **latest complete editable Brain**, strip server ownership/metadata, and preserve approved claims/other sections. Example additions to that existing body:

```json
{
  "name": "Customer-chosen business",
  "identity": { "description": "Customer description", "sector": "leasing" },
  "commercial": { "preferred_channels": ["instagram", "website"] }
}
```

This fragment illustrates the new fields; do not use it to erase other existing fields/sections. The existing PUT replacement semantics for older sections are unchanged. For backwards compatibility, omitting **the new** sector/channel fields preserves their previous saved values even when an older client sends another correction. Explicit `sector:null` and `preferred_channels:[]` clear them. Empty sector text is invalid in canonical Brain data; partial blank text belongs in the draft.

Owner check added to the existing correction boundary, consistent with project-write policy. Existing selected scope/ownership checks, approved/draft/archive metadata rules, creation timestamps and version increment remain. No client can choose another Brand Brain or supply trusted metadata. The route preserves the current record's status; saving is **not** a new publish approval and does not necessarily change an already-approved Brain to draft. PR #47's blanket “draft until approved” copy must follow actual returned metadata, not claim a status transition this endpoint does not perform.

Existing Brand Brain corrections remain non-CAS; multi-tab edits retain the existing last-write behavior. Serialize saves and reload current data before merging; a broader conditional Brain-update contract is separate work. Draft CAS below does not silently upgrade those semantics.

## Save and exit / Resume HTTP contract

Both new endpoints require the existing verified session Bearer header. They use verified identity, supporting accounts without workspace claims yet. No token-in-query, client auth-user ID, cookies-as-authority or admin key. Responses set `Cache-Control: private, no-store` and vary by Authorization. GET accepts no query parameters.

Missing draft:

```json
{"status":"missing","version":0,"draft":null}
```

Explicit Save (PUT):

```json
{
  "expected_version": 0,
  "draft": {
    "workspace": null,
    "step": "channels",
    "answers": {
      "business_name": "Customer-chosen business",
      "sector_choice": "leasing",
      "industry_text": "Vehicle leasing",
      "preferred_channels": ["instagram", "website"],
      "goal": "Reach local customers"
    }
  }
}
```

Successful response (also GET shape): `{"status":"saved","version":1,"draft":{...},"updated_at":"<server ISO timestamp>"}`. Save is a **complete draft snapshot**, not an answer patch; omitted answers are omitted from the stored snapshot. Always retain the returned version. No autosave, completion flag or automatic application to Brain/campaigns is introduced.

- `workspace` is required: null means personal pre-workspace setup intent; otherwise exact `{tenant_id,project_id,brand_id}`. IDs are untrusted input and independently checked against current owner membership, project/brand and approved status. Server never derives auth-user ID from the body. The selected draft target must be shown explicitly before applying answers; an unbound draft must not silently populate a different existing business.
- One active scratchpad per verified user, **not one per workspace**. Concurrent tabs share its version. Changing target intentionally replaces that user's draft; frontend must not silently retarget or overwrite it during workspace selection.
- Steps are `welcome`, `identity`, `about`, `customers`, `channels`, `brain`, `recommendation`, matching PR #47 IDs (frontend currently indexes its stages; map indexes to IDs explicitly).
- Optional answers, all trimmed and bounded: business_name 200; website_or_social_profile 500; primary_marketing_challenge 1000; sector_choice/industry_text 200 each; description/audience/primary_cta/goal 2000 each; preferred_channels as above. Blank strings are valid unfinished answers. Whole normalized draft <=16,000 UTF-8 bytes. Unknown fields, user IDs, metadata, entitlement/completion flags or oversized/duplicate choices reject with 400.
- Read/Save use verified identity and current authorization for bound drafts. Members/foreign users, revoked membership or archived/unselectable target fail closed with 400; another user sees only their own row. Do not show that failure as an empty draft or fall back to another workspace. An explicit future discard/retarget recovery UX after loss of membership remains to be agreed; no private answers are returned through denial.
- 409 `ONBOARDING_VERSION_CONFLICT`: retain local text, GET current draft and ask the user to reconcile before explicit retry. Never overwrite automatically. If an earlier response was lost after commit, GET can verify what actually saved; stale replay is not success coercion.
- 401: established login/session refresh. 400: validation/target-owner failure. 503: persistence unavailable (including proposal not installed); keep unsaved UI state and explain Save failed. Never label “saved” until HTTP success plus returned version. No separate offline/localStorage trust flag.

Saving does not bootstrap a workspace, create a customer profile, provision trusted claims, mutate Brain data, create campaigns, reserve/debit credits, grant entitlements, complete onboarding or call providers. Existing explicit flows perform those actions under their unchanged safeguards. A step is navigation progress only; completion must derive from actual saved business data and explicit subsequent workflow.

## Persistence proposal and safe rollout

[SQL proposal](migrations/BG-STUDIO-010-onboarding-drafts.proposed.sql) creates `customer_onboarding_drafts`, keyed by verified auth.users UUID so it works before customer-profile/workspace bootstrap. It has positive integer version, bounded object JSONB and server timestamps. Account deletion cascades. RLS is enabled; PUBLIC, anon, authenticated and service_role direct access is revoked; no browser policy/grant/admin endpoint added. Backend uses the existing trusted PostgreSQL pool and parameterized queries.

The file is deliberately **outside `supabase/migrations`**, not startup-applied or initialized against any shared DB. Real tests execute it only after constructing their disposable test database. The API does not pretend memory is production persistence: normal production composition uses the existing PostgreSQL workspace repository; missing table yields 503 on new draft operations without blocking existing workspace reads.

Version-0 creation is insert-on-conflict-do-nothing; later writes update only exact auth-user/version and increment atomically. Failed writes return 409 and roll back. For bound writes, current owner/project/approved-brand rows are share-locked in the same transaction before CAS, preventing concurrent membership/brand changes from racing that write. Reads recheck current owner access before returning saved answers.

G1/G2 need no SQL column change, but their new nested fields require schema-capable readers everywhere: older strict Brand Brain readers reject unknown JSON keys. Review rollout order before enabling writes; do not blindly roll back old strict readers after sector/channels have been persisted. Keep compatible readers or plan an explicitly approved data-preserving rollback. Draft rollback should disable frontend writes/route use and retain the private table/data; do not drop user drafts to roll back code. Retention/erasure policy beyond auth-account deletion needs owner review before shared provisioning.

Founder approval remains required for shared schema provisioning/deployment. Review target DB/role, privacy retention, owner access and rollback first. No table, role, profile, entitlement, provider or deployment was changed outside disposable local tests.

## Executed regression evidence

Node v22.23.3 and local PostgreSQL 17; no live or paid provider calls.

| Exact command | Observed result |
| --- | --- |
| `node --test test/customer-onboarding.test.js test/customer-workspace.test.js test/customer-brand-brain-correction.test.js test/brand-brain-schema.test.js test/customer-campaigns.test.js` | **40 passed**, 0 failed/skipped |
| `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres npm test` | **644 passed**, 0 failed/cancelled/skipped |
| Same disposable URL, `npm run test:billing:postgres` | **24 passed**, 0 failed/skipped |
| Same disposable URL, `npm run test:campaign:postgres` | **24 passed**, 0 failed/skipped |
| JavaScript syntax / diff whitespace | Passed |

The lower full-suite count than #212 is intentional **base independence**, not test filtering/skipping: the complete suite runs from canonical main plus onboarding, without video-stack tests/code. PostgreSQL proof covers durable JSON preferences across repository recreation, draft persistence across new repository instances, auth users without profiles, concurrent creation/stale update CAS, cross-user isolation, owner loss, RLS and direct-role denial. HTTP tests cover private caching, missing/unavailable states, auth spoofing, foreign/revoked/member scope, validation bounds, no Brain/scope-provision side effects, legacy preference preservation and explicit clears. Existing bootstrap/selection/campaign and billing regression tests remain unchanged in behavior.

Local evidence is not GitHub CI or deployed frontend/staging E2E. Exact-head publication and access status are recorded below. No runtime/video activation or paid generation occurred.

## Claude integration order and outstanding contracts

1. Implement G1/G2 read/save/hydration first against the existing Brain endpoints, mapping channel labels to canonical IDs and preserving current Brain fields. Show “saved” only after server response. This needs code integration, not a SQL migration.
2. Add the existing workspace chooser/session-refresh flow and correct placeholder/status wording; use the confirmed main campaign-list shape and safe unavailable states.
3. Review/apply the draft SQL **only after separate founder approval**. Then wire GET/PUT drafts with workspace binding, step IDs, full snapshots and conflict reconciliation. A 503 or absent endpoint must leave the UI honestly unsaved; do not ship a fake Save and exit.
4. Frontend owns actual chooser/onboarding UI, refresh/restart and multi-tab/accessibility QA in its separate branch. Draft recovery after lost membership and privacy retention remain explicit decisions. Recommendation channels remain optional future contract work, not silently added to current requests.

No frontend repository code, existing source PR branch, main, entitlements, campaign approval or media-runtime flow was edited. This is a reviewable implementation and migration proposal, not launch acceptance.
