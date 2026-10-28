# BG-STUDIO-019 — bounded dependency repair

26 October 2026. Registry audit is time-dependent, not a security certification.

The previous checkpoint's 11 reported findings were not reproduced as 11 in the current registry response. Before this change: 7 affected dependency nodes (1 critical, 2 high, 4 moderate). After compatible updates and targeted `qs` override: 2 moderate nodes, zero high/critical in that response. Parent/metavulnerability nodes are not separate independent exploits.

Lockfile changes: zod 4.4.3 -> 4.6.7; body-parser 1.20.6 -> 1.20.9; proxy-addr 2.0.7 -> 2.0.8; qs 6.15.3 -> 6.16.1. Express pins its query parser, so a package-level `qs:6.16.1` override is explicit/reviewable. No lifecycle scripts were run. Registry resolution used npm on host Node 24; application validation used required Node 22.23.3. Full suite with disposable PostgreSQL: 731/731, zero skips. No provider/network/authentication code was activated.

Remaining: Vertex AI SDK's older google-auth-library chain contains gaxios 6.7.1 -> uuid 9.0.1. Advisory https://github.com/advisories/GHSA-w5hq-g745-h8pq concerns uuid buffer bounds in v3/v5/v6; fixed versions are >=11.1.1. Do not force an unreviewed major transitive change. Requires a supported SDK/auth migration and credential-free runtime contract tests; existing passing provider mocks do not prove production reachability or exploitability. `qs` references: https://github.com/advisories/GHSA-x5fp-wj9c-mxmx and https://github.com/advisories/GHSA-4mjr-xmp4-gh2g.

No clean-audit, staging-readiness or launch acceptance claim. Saved raw local registry JSON: `/workspace/.onboarding/bg019-audit-before.json`, `bg019-audit-after.json`, `bg019-audit-final.json`; reproduce using `npm audit --omit=dev --json` against this lockfile. Exact-head GitHub CI remains unverified while API access is Forbidden.
