# Employee Hierarchy

The sales reporting chain is MD -> CP Head -> RM -> CP. MIS reports separately to MD. Admin Head is retired and cannot be created or assigned.

`reportingTo` is the authoritative direct manager edge. `hierarchyPath` is a materialized ancestor list, ordered top-down and excluding the employee. MD has an empty path; a CP path contains MD, CP Head, and RM IDs.

The `hierarchyService` centralizes ancestor, descendant, reporting-chain, ownership, and employee access decisions. Resource access checks first allow MD, then self/downline ownership. Controllers do not accept a frontend-supplied hierarchy path or downline scope.

Employee creation derives `reportingTo` from the authenticated creator, checks the role's configured direct child policy, and builds the path server-side. Reassignment rejects self/cycle moves, checks both employee and manager visibility, validates the manager's allowed-child role, and recomputes descendant paths. It uses a MongoDB transaction when available; on a standalone MongoDB development server, it applies an ordered bulk update after validation.

Hierarchy path indexes support scoped descendant queries. Employee creation and reassignment share a database-backed hierarchy mutation lock, so concurrent subtree moves cannot validate against the same stale path. Lists are paginated. On replica sets, reassignment runs in a transaction; on a standalone development server, it uses an ordered bulk update under the same lock.

## Removing the former MH layer

MH is retired from role lists, employee invitations and analytics. Its code stays reserved. Business ownership is preserved. Existing MH accounts can be reassigned to MIS, deactivated, or explicitly deleted with --delete-mh; leads and customers are never reassigned or deleted by this migration.

Before deploying this hierarchy to an existing database, stop API writes and take a backup. Run `npm run build`, then preview `npm run migrate:direct-md -- --mh-to-mis` or `npm run migrate:direct-md -- --deactivate-mh`. The account treatment must be chosen explicitly when MH employees exist. Add `--apply` only after reviewing the dry-run plan. The migration uses the shared hierarchy lock and a MongoDB transaction (replica set required), moves CP Head to its existing MD ancestor, rebuilds descendant paths, retires the MH role and revokes former MH refresh sessions. It refuses cycles, orphaned managers, inactive MD ancestors and custom roles still parented by MH before writing. Stop all API instances during rollout and restart them afterward to clear permission caches. Multiple MD roots are preserved; the migration never chooses an unrelated MD.

Validation (10 November 2026): backend build, 25 unit tests and 6 HTTP integration tests passed; the Sunvika web build and mobile TypeScript check passed. Migration planning is tested with in-memory employee graphs and database model fixtures. The configured sunvika_management database migration was applied on 10 November 2026 after the user selected MH-account deletion. One MH employee and the retired MH role were deleted, three surviving reporting paths were rebuilt, and former MH sessions were removed. Verification found no missing managers or hierarchy ancestors. All 131 historical audit entries and the one MH-owned profile-upload history record were preserved unchanged; no storage assets or business records were deleted.

The `--delete-mh` option is explicit and mutually exclusive with the account-reassignment/deactivation options. Its preview checks for linked business records and refuses deletion when ownership needs resolution. Audit and creator references retain their original actor IDs; profile-upload history and storage assets are preserved.


Employees and Channel Partners are separate directories in web/mobile. Employees requests `directory=staff` to exclude CP; Channel Partners requests `directory=cp` to include only CP accounts, including inactive accounts in the all-records view. Both `/employees` and `/employees/downline` accept this optional filter before pagination and counting, retaining their existing scope. Omitting it keeps the all-role API behavior for reports and other consumers. CP account details, reporting hierarchy, source-customer history, activation and invitations still use the existing employee endpoints and permissions.


Channel Partner list filters are shared by web and mobile on `/employees?directory=cp` and `/employees/downline?directory=cp`:

- `stateId`, `districtId`, `branchId`: filter the CP employee address/branch; district and branch can be selected independently; selecting a state narrows districts and branches, and selecting a district narrows branches. Authenticated `/geography/districts` and `/geography/branches` supply options when no parent is selected; branches also accepts optional `stateId`.
- `dateFrom`, `dateTo`: CP employee creation date, with an inclusive end date. Reversed ranges are rejected.
- `cpType`: `all` (default), `cp_only` (no source customer), or `customer_cp` (linked source customer from customer-to-CP conversion).
- `employeeName`: literal case-insensitive partial upline name or employee code. Matches that employee and their hierarchy descendants, always intersected with the caller's existing employee access and CP directory. Multiple matching uplines combine their teams; no match returns an empty page.

Filters combine before pagination and counting. Clear filters restores the entire permitted CP directory. These filters do not grant additional hierarchy access.

MIS organization-wide viewing is independent of its reporting path. Business reads use an explicit read policy; employee administration and business mutations keep the original management policy. MD retains full access. See [RBAC.md](RBAC.md) for the covered read operations.
