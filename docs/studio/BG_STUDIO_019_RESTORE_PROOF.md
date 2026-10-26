# BG-STUDIO-019 — disposable logical restore proof

26 October 2026. **PASS locally**, not staging backup/restore acceptance.

Rehearsal: `BIZGENIE_DISPOSABLE_RESTORE_PROOF=1 node scripts/local-onboarding-restore-proof.cjs`. It is intentionally fixed to the existing local `bizgenie-dev-postgres17` container and PostgreSQL loopback port 5433. It creates two uniquely named disposable databases, applies draft SQL only there, seeds a synthetic owner/workspace/Brand Brain and `professional_services` record, dumps with pg_dump 17.11 custom format, restores with `--exit-on-error --no-owner`, deep-compares the onboarding rows, and runs strict preflight. It then drops only its two databases. No connection to an existing application database; no managed restore or staging data. Existing local test-role bootstrap is a prerequisite. Do not repoint this script to a shared environment.

Result: one synthetic row preserved, `sector_key:professional_services`, preflight `{professional:true}`, dump 284494 bytes. The known PostgreSQL rendering difference is accepted by the exact allowlist from `22c8642`; weakened constraints remain rejected by automated integration tests. No universal CHECK equivalence is claimed.

Production/staging gaps remain: actual backup inventory, retention, RPO/RTO, restore into isolated approved resources, owner/role mapping (this rehearsal uses local superuser), Supabase managed auth/storage restoration, encryption keys, real schema drift and restore-time cost. Founder must approve any operational rehearsal independently. A local dump is not proof that a hosted backup is usable.
