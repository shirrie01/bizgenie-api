# BG-LAUNCH-RUNTIME-09 / #246 — PostgreSQL fixture teardown

13 November 2026; base main5cd1d774e04fcbfb0745d9bd5c7a0b974cd982f5. Source/test correction only, no financial policy or production schema change.

Root cause reproduced on Node22.23.3/PostgreSQL17.11: pg-pool3.14.0 `_remove` removes a client from its tracked list before asynchronous `client.end(callback)` completes. `Pool.end()` resolves when the tracked list is empty. The fixture then force-dropped its database while a socket was still closing. PostgreSQL sends57P01; the idle pool error can escape in the async context of the last test (customer11 in hosted evidence). There is no demonstrated unawaited financial query in that case.

The deterministic regression uses a real PostgreSQL client with an explicitly gated end callback. Raw Pool.end resolves with its socket still live; plain DROP rejects55006; intentional FORCE reproduces57P01, explicitly asserted by the regression. The fixed pool remains pending until the gate releases and client emits end; plain DROP then succeeds. No sleeps, cleanup retries, global suppression or ignored exception handlers. The regression's one expected error listener observes the deliberate injected server termination, not ordinary fixture failures.

Test-only createDrainedPool registers every client from the connect event before use and awaits all end events, including clients already retired from pool tracking. The provider-spend owner/runtime/admin/extra-worker pools and spawned child use this factory. Fixture teardown drains owned pools before ordinary DROP (FORCE removed) and closes admin in finally. All original financial assertions remain unchanged.

Ten repeated focused runs at two-file concurrency passed before full-suite verification. Exact full2/full4/billing/campaign results, tested SHA and hosted CI belong in the final checkpoint. Local proof is not hosted CI or permission to mark issue246 definitively closed; independent review and fresh exact-head CI remain required. Nothing deployed or run against a shared database. Previous accepted main evidence remains valid; the intermittent lifecycle defect is explicitly tracked.
