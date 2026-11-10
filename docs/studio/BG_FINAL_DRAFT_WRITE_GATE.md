# Existing draft workflow bridge gate — source preparation only

BG-API-FINAL-INTEGRATION-04, 10 November 2026. Reuses the bridge-only change
previously reviewed locally at 435ed195; does not import that branch's older
campaign recommendation implementation. No deployed flag or configuration changes.

`BG_BRIDGE_ALLOW_DRAFT_WORKFLOW` defaults OFF. When explicitly configured, it
admits only exact PUT workspace Brand Brain/onboarding and POST campaign
recommendation/create/content-item/review/preview-render/acknowledgement/approval/
schedule/reschedule/unschedule routes, with a 16 KiB byte cap. Queries, suffixes
and alternate methods do not acquire write authority. Bootstrap stays separately
gated at 2 KiB. Broad writes, generation confirmation, social and Stripe remain OFF.

The bridge verifies the customer identity and selected tenant/project/brand scope;
it does not mint an owner claim or replace backend authorization. Onboarding and
campaign mutations retain existing owner checks and transaction/revocation/CAS
controls. Brand Brain identity remains owner-only, with unrelated member edits
preserved under DEC-021/022. Recommendations remain existing project-read behavior;
a draft bridge gate does not turn recommendations into approval or paid execution.
Scheduling here records existing workflow state; social dispatch remains denied.

Both the all-off release validator and the separately approved workspace-bootstrap
release validator reject this gate when true. This source change is NOT a draft-write
release approval or a deployment manifest. Enabling it requires a separately reviewed
release specification, the #213 actual-runtime pool gate, and founder authorization.
Rollback: leave this flag false and retain the current all-off revision/configuration.

Tests cover twelve allowed paths, 24 denied writes, absent/expired tokens, foreign
scope, exact paths, request identities, body limits and both release validators.
These mocked/local tests are not hosted customer acceptance.
