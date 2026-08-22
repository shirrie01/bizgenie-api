# Generation-job service boundary

BG-AUTH-002C uses one global BizGenie internal execution principal. The
principal represents the trusted internal worker, not a customer tenant. Its
strict actor contract contains only:

- `kind: "service"`;
- an immutable server-configured `service_id`;
- immutable server-configured bounded `scopes`.

It deliberately has no tenant, project, brand, customer, execution-class, or
billing authority. The credential and actor are constructed only from server
environment/secrets; request headers, query values, and bodies cannot add
authority to them.

## Ownership authority

Tenant ownership is established before the service boundary. The verified
customer authorization chain creates one immutable generation job binding the
tenant, project, optional brand, customer actor correlation, execution class,
idempotency identity, and allowed downstream scope.

The service route accepts only a verified global worker, the server-configured
required scope, and an opaque existing `job_id`. It does not accept a tenant,
project, brand, actor, or execution class as route authority. A request that
supplies those values in a header, query, or body cannot reinterpret or mutate
the selected job. The response remains limited to:

- `job_id`;
- the job's immutable `execution_class`;
- sanitized `execution_input`.

## Cross-tenant interpretation

The global worker is neither Tenant A nor Tenant B. When it retrieves a valid
Tenant B job by opaque identity, it executes the authority already fixed in
that Tenant B job; it does not cross from a Tenant A service context because
no such service context exists.

For Issue #32, a cross-tenant service-boundary attempt is an attempt to inject,
replace, or reinterpret a job's tenant/project/brand/customer/execution-class
authority. Such request data is ignored and never appears in the bounded
payload. Customer attempts to create or access another tenant's job remain
denied by the existing customer authorization boundary.

Unknown jobs, wrong service credentials, missing service scope, and jobs that
do not authorize the required scope all return the same `403 Forbidden`
response, without resource enumeration.

## Execution status

This route is a future server-to-server execution seam. BG-AUTH-002C does not
activate Make or any provider dispatch. Existing in-process Text/Image
generation remains the active adapter and may run only after the authoritative
generation job has been persisted successfully.
