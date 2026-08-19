# Customer identity and authorization foundation

BG-AUTH-002A establishes the durable ownership graph without activating customer
token verification or changing any route authentication:

```text
auth.users.id
  -> customer_profiles.auth_user_id
  -> tenant_memberships.auth_user_id
  -> tenants.tenant_id
  -> projects.tenant_id
  -> brand_brains.project_id
```

## Principals and trust boundaries

- A customer actor is created only from a verified Supabase Auth UUID. A body,
  query, or route `user_id` is never identity evidence.
- A service actor has a distinct `service_id` and explicit scopes. This
  foundation defines the principal shape only; BG-AUTH-002C will define and
  enforce the credential and generation-job boundary.
- An administrator remains authenticated by the existing `ADMIN_KEY` and
  `x-admin-key` middleware. Customer actors and service actors do not inherit
  administrator authority.

`src/authorization/` is provider-neutral. Token verification in BG-AUTH-002B
must pass a verified UUID into `createCustomerActorFromVerifiedIdentity` and
then call `AuthorizationService`; it must not pass the request's `user_id`.

## Authorization contract

The service fails closed and resolves each link independently:

1. Validate a trusted actor.
2. Resolve the customer profile by the verified Auth UUID.
3. Resolve membership in the requested tenant and check the minimal role
   policy (`owner` or `member`) for the requested action.
4. Resolve the requested project and compare its immutable `tenant_id`.
5. Resolve a Brand Brain by the existing `(project_id, brand_id)` pair.

Every client-supplied identifier is a requested resource only. A missing
resource, non-membership, cross-tenant project, disallowed role, and
project/brand mismatch all return the same `RESOURCE_NOT_AVAILABLE` denial so
the contract does not disclose cross-tenant existence.

The database enables RLS and installs read policies as defense in depth, but
keeps `anon` and `authenticated` table privileges revoked in this task. No
route may rely on RLS alone: the server database role can own tables or bypass
RLS, so server-side authorization remains mandatory.

## Migration and rollout

The migration is version-controlled at
`supabase/migrations/20260818010000_create_customer_tenant_authorization_foundation.sql`.
It was not applied to any database by this task.

Before a future authorized application:

1. Back up the target and verify point-in-time recovery.
2. Inventory existing `brand_brains.project_id` values.
3. Create reviewed customer profile, tenant, membership, and project rows for
   each known owner. Do not invent owners for orphaned projects.
4. Apply the migration in a staging branch/database first.
5. Confirm new Brand Brain writes require a real project.
6. After every existing Brand Brain has a project, run
   `alter table public.brand_brains validate constraint brand_brains_project_id_fkey;`.
7. Run Supabase security and performance advisors, then the two-tenant
   acceptance suite before production rollout.

The Brand Brain foreign key is created `not valid`: it protects new writes
immediately while allowing existing rows to be mapped deliberately before the
constraint is validated.

Rollback should be forward-fix first. If application code must be rolled back,
remove only the new Brand Brain foreign key initially:

```sql
alter table public.brand_brains
  drop constraint if exists brand_brains_project_id_fkey;
```

Keep the ownership tables and data during investigation. Dropping them is a
destructive operation and must happen only after a verified backup, an empty
dependency check, and separate authorization.

## Forward ownership references

Future subscription and credit-account rows should reference `tenant_id`.
Credit reservations and generation requests should reference both `tenant_id`
and `project_id`; generated assets should also retain the originating
generation request and project. Those systems are intentionally not created by
BG-AUTH-002A.
