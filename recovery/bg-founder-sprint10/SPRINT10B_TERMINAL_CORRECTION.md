# BG-FOUNDER-SPRINT-10B — terminal correction only

Base: 8d6a62d8ed5c0d837772076199e238ce2bc5374b.
Previous supplement SHA256:373e2c9f818454acc1fce32ef868c4ecf3929fcf3d86fc91929517863adfee61.

Founder-reported locked PASS: funding100 available/zero reserved; operator TLS; expanded immutable-image provenance; private Sprint10 preparation. Approval #191/7120513768 remains recorded; no new approval is fabricated. Prior failed activation did not reach its approval prompt and has no attempt directory/journal (founder-reported). This correction is for independent review and fresh execution authorisation; it does NOT execute or retry activation.

## Exact scope

Only sprint10_operator.py changes runtime logic: override loaded S09B tty in the supplement with separate /dev/tty read/write descriptors. The installed bg017c-s09b.py is read and hash-checked, never rewritten. Hidden entry disables and verifies ECHO/ECHONL before displaying its prompt; no getpass or stdin/stdout visible fallback. Original terminal attributes are restored and checked in finally, including interrupt/failure. Failed echo suppression prevents credential reading. /dev/tty unavailable means HOLD.

Fixed-stage/category error output contains no raw exception message, paths, tokens, identifiers, connection strings or stack. Only literal reviewed guard codes can escape. No authentication, private binding, route, image, IAM, TLS, attempt, single-invocation, cleanup or response-contract policy changes. Existing targeted response/template/traffic safeguards remain intact.

## Controlled local-only migration

New mode: migrate-profile ABSOLUTE_PREVIOUS_SUPPLEMENT_PATH. Does not load S09B definitions or call any subprocess/cloud/SQL/provider API.

Requires the original profile's supplement hash AND the preserved previous source bytes to equal373e2c9f818454acc1fce32ef868c4ecf3929fcf3d86fc91929517863adfee61. Verifies actual S09B source against the old profile hash, existing candidate hash against accepted evidence, no final activation evidence and no attempt directory. No re-creation of accepted binding/evidence.

Preserves original profile bytes (including whitespace) in bg017c-sprint10-profile.private.json.before-sprint10b, mode600. Records a private migration intent/receipt before profile replacement. Only supplementSha256 changes in the profile; baseOperatorSha256 is retained. Candidate and evidence bytes are compared before/after, not changed. The original installed supplement is separately preserved by the installation wrapper. A partial INTENT receipt blocks activation/cleanup until explicitly reconciled. Repeated migration is refused; no automatic repair/retry.

Successful output: LOCAL_INTEGRITY_MIGRATION_PASS, previousHashesVerified=true, originalProfilePreserved=true, candidateAndEvidenceUnchanged=true, sprint09bUnchanged=true, activationExecuted=false. No private values printed.

## Verification

33/33 offline tests PASS, zero skips: 15 new tests plus18 existing supplement regressions. Actual pseudo-terminals cover nonseekable r+, separate read/write ordinary prompts, hidden input without echo, sequential ordinary/hidden input, attributes restored after read/interrupt, unavailable tty, failed echo disable/control without fallback, and sanitised exception stages. Synthetic migration cases cover wrong old source/base/candidate, existing activation state, exact original-profile preservation, unchanged private files, completed/nonrepeatable migration, and incomplete receipt blocking execution. No cloud/SQL/provider/actual operator activation was performed. Original accepted tests/builds not reopened.

Tests:
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s recovery/bg-founder-sprint10 -p 'test_*.py' -v

## Operator boundary

Retrieve the exact new published operator source, verify its published SHA256, privately preserve the currently installed supplement (old SHA above), then install the corrected source and run only migrate-profile. Do NOT run prepare, activate or cleanup as part of correction. Do not reinstall dependencies or change original S09B, credentials, config or accepted founder bindings.

The existing private preparation remains compatible; real Cloud Shell migration must confirm preservation. Terminal code and migration are locally verified, not a claim of actual diagnostic invocation or runtime database acceptance. Independent review and fresh execution authorisation remain the next gate, using recorded approval7120513768 as existing authority context rather than requesting it again.
