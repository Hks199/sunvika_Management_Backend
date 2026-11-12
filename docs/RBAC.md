# Role-Based Access Control

Sunvika authorization has a capability check and a separate resource-scope check. Routes first authenticate an active employee session, then `requirePermission()` resolves the employee's active role and permission code. Services/repositories still apply employee ownership and hierarchy scope; possessing `leads.read` alone never grants organization-wide lead access.

## Seeded system roles

| Code | Category | Parent | Allowed children |
| --- | --- | --- | --- |
| MD | PRIMARY | - | MIS, CP Head |
| MIS | PRIMARY | MD | - |
| CP Head | PRIMARY | MD | RM |
| RM | PRIMARY | CP Head | CP |
| CP | PRIMARY | RM | — |

Admin Head (`ADMIN_HEAD`) is retired. It is excluded from role lists, employee creation and announcement audiences. The reserved code cannot be recreated.

## Protected policy

- Only an employee whose active role code is `MD` can call role/permission administration routes.
- The MD role is immutable through API updates. The bootstrap command creates it once.
- `roles.manage`, `permissions.manage`, and `employees.bootstrap` cannot be assigned through ordinary role configuration. MD authorization is enforced by backend policy.
- Reserved system role codes cannot be created as custom roles. MIS can only be created by MD. Admin Head cannot be created or reactivated.
- A role can only create a direct configured child role. Employee creation accepts a role code, not client-supplied role IDs or hierarchy paths.
- Custom role permission updates increment `permissionVersion`; local permission caches are invalidated, and version checks catch updates across application instances within the short cache TTL.
- Deactivating a custom role revokes its employees' refresh sessions. Authentication also checks role activity.

Permission administration accepts permission codes and child role codes. A custom role must be created with its reporting parent first, then explicitly added to that parent's `allowedChildRoles`. Primary hierarchy child relationships must match `parentRole` and descend in level.

## Retired Admin Head references

Startup and role seeding deactivate legacy Admin Head roles, remove allowed-child links and revoke their refresh sessions. Authentication also explicitly rejects the retired role. Existing role/employee/business-history references are preserved; no accounts or historical records are deleted. MD keeps full access and MIS keeps organization-wide business viewing with its existing management restrictions.

System role codes are `MIS` (Management Information System) and `CP_HEAD` (Channel Partner Head). On startup and when running `npm run seed:system-roles`, existing BDO/DC roles are renamed in place, preserving their IDs, employee assignments, permissions, and hierarchy references. Conflicting legacy/new codes stop migration for manual resolution. Legacy codes remain reserved and cannot be recreated as custom roles.


MIS has organization-wide read visibility for employee/CP lists, employee details and reporting chains, leads and status histories, customers and timelines/documents, visits and follow-ups, quotations/downloads/share histories, AMC details/service histories, and dashboard/report data. Its business `.read` permissions are enforced by runtime policy and included in `/auth/me`, so existing MIS roles work without a database reseed. Read paths explicitly use `read` access; management paths default to `manage` and retain the original hierarchy checks. Customer-to-CP conversion, account creation, role management and query/inbox privacy retain their existing policies. No database ownership or reporting paths change.
