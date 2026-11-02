# Employee Hierarchy

The primary reporting chain is MD → BDO → MH → DC → RM → CP. Admin Head is a separate organizational category and has no `reportingTo` or hierarchy ancestors.

`reportingTo` is the authoritative direct manager edge. `hierarchyPath` is a materialized ancestor list, ordered top-down and excluding the employee. MD has an empty path; a CP path contains MD, BDO, MH, DC, and RM IDs. Admin Head has an empty path.

The `hierarchyService` centralizes ancestor, descendant, reporting-chain, ownership, and employee access decisions. Resource access checks first allow MD, then self/downline ownership. Admin Head access is a separate policy for business resources. Controllers do not accept a frontend-supplied hierarchy path or downline scope.

Employee creation derives `reportingTo` from the authenticated creator, checks the role's configured direct child policy, and builds the path server-side. Admin Head creation is restricted to MD/BDO and is recorded outside the tree. Reassignment rejects self/cycle moves, checks both employee and manager visibility, validates the manager's allowed-child role, and recomputes descendant paths. It uses a MongoDB transaction when available; on a standalone MongoDB development server, it applies an ordered bulk update after validation.

Hierarchy path indexes support scoped descendant queries. Employee creation and reassignment share a database-backed hierarchy mutation lock, so concurrent subtree moves cannot validate against the same stale path. Lists are paginated. On replica sets, reassignment runs in a transaction; on a standalone development server, it uses an ordered bulk update under the same lock.
