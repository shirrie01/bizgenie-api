# BG-SCALE-001 load-test harness

This harness provides the first safe, reproducible capacity baseline for Issue #156.

## Safety

- An explicit `TARGET_URL` is mandatory.
- The script refuses known production-looking BizGenie hosts unless the exact production override is supplied.
- **Do not use the production override for the #156 baseline.**
- The initial scenario is deliberately read-only and does not invoke paid AI/media, Stripe actions, billing writes or destructive customer mutations.
- Authenticated/write/generation pressure requires isolated synthetic fixtures and must be added as a separate bounded scenario rather than reusing real customer identities.

## Prerequisite

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the load generator.

## Low-load proof

```bash
TARGET_URL="https://<isolated-candidate-host>" \
PROFILE=smoke \
k6 run load-tests/bg-scale-001.js
```

Do not progress if the smoke proof fails.

## Staged 2,000 VU baseline

Only after the low-load proof is GREEN:

```bash
TARGET_URL="https://<isolated-candidate-host>" \
PROFILE=staged2000 \
k6 run --summary-export=load-summary.json load-tests/bg-scale-001.js
```

Ramp profile: 100 → 250 → 500 → 1,000 → 1,500 → 2,000 VUs, with holds at each tier.

## Initial thresholds

- HTTP request failures < 1%; severe failure automatically aborts after the evaluation window.
- BG application error rate < 1%; severe failure automatically aborts.
- non-generation p95 < 1.5 seconds.

These are Issue #156's initial SLO proposal, not a final production SLO contract.

## Interpretation

A GREEN run proves only the endpoint/workload exercised by this script. It does **not** prove:
- 2,000 simultaneous paid generations;
- authenticated tenant/write capacity;
- billing/credit contention capacity;
- provider quota;
- the final BizGenie capacity ceiling.

Record the target revision/SHA, environment configuration, k6 version, timestamps, summary JSON and infrastructure telemetry alongside every result.
