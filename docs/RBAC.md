# Role-Based Access Control

Sunvika authorization has a capability check and a separate resource-scope check. Routes first authenticate an active employee session, then `requirePermission()` resolves the employee's active role and permission code. Services/repositories still apply employee ownership and hierarchy scope; possessing `leads.read` alone never grants organization-wide lead access.

## Seeded system roles

| Code | Category | Parent | Allowed children |
| --- | --- | --- | --- |
| MD | PRIMARY | — | BDO, Admin Head |
| BDO | PRIMARY | MD | MH, Admin Head |
| MH | PRIMARY | BDO | DC |
| DC | PRIMARY | MH | RM |
| RM | PRIMARY | DC | CP |
| CP | PRIMARY | RM | — |
| ADMIN_HEAD | ADMIN_HEAD | — | — |

Admin Head is outside the reporting tree. Only MD/BDO can create it, and the creator's configured allowed-child policy must permit it. Admin Head data access is an explicit policy for permitted leads/customer operations and does not imply employee/role administration.

## Protected policy

- Only an employee whose active role code is `MD` can call role/permission administration routes.
- The MD role is immutable through API updates. The bootstrap command creates it once.
- `roles.manage`, `permissions.manage`, and `employees.bootstrap` cannot be assigned through ordinary role configuration. MD authorization is enforced by backend policy.
- Reserved system role codes cannot be created as custom roles. BDO can only be created by MD. Admin Head can only be created by MD or BDO.
- A role can only create a direct configured child role. Employee creation accepts a role code, not client-supplied role IDs or hierarchy paths.
- Custom role permission updates increment `permissionVersion`; local permission caches are invalidated, and version checks catch updates across application instances within the short cache TTL.
- Deactivating a custom role revokes its employees' refresh sessions. Authentication also checks role activity.

Permission administration accepts permission codes and child role codes. A custom role must be created with its reporting parent first, then explicitly added to that parent's `allowedChildRoles`. Primary hierarchy child relationships must match `parentRole` and descend in level.

## Admin Head data policy

Admin Head uses its assigned capability list plus a distinct organization-wide resource policy for leads, customers, visits, and quotations. It has no general employee downline and cannot administer role configuration. MD can access all employees. BDO employee scope includes its hierarchy and Admin Head accounts created by its downline.
