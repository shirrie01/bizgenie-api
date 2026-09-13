# BG-LAUNCH-003B4 — Content-item persistence diagnostic

Status: IN PROGRESS

## Objective
Expose the exact safe PostgreSQL failure metadata for the first `create_content_item` command without changing the customer-facing 503 contract or leaking secrets.

## Locked evidence
- Campaign recommendation returns 201.
- Campaign creation returns 201 and persists.
- First content-item POST returns 503 `CAMPAIGN_TEMPORARILY_UNAVAILABLE`.
- The failed content-item transaction rolls back cleanly: no item, variant, revision, event or receipt survives.
- 003B1, 003B2 and 003B3 are proven and must not be reopened without new evidence.

## Diagnostic contract
Log only:
- failure stage;
- command type;
- PostgreSQL `code`;
- `constraint`;
- `schema`;
- `table`;
- `routine`;
- bounded message text.

Never log request bodies, bearer tokens, SQL parameters, connection strings, Supabase keys or service-role secrets.

The customer response must remain the existing generic 503.

## Acceptance
1. safe metadata is emitted before wrapping persistence failures;
2. client contract is unchanged;
3. tests prove sensitive values are absent from emitted diagnostics;
4. exact merged `main` is built and deployed only as a 0%-traffic candidate;
5. one browser retry captures the real failing database guard/constraint;
6. only then is an exact defect fix implemented.
