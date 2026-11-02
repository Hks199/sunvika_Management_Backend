# Dashboards and Reports

All endpoints use the existing bearer-token authentication and permission checks. Employee scope is derived from the signed-in employee's hierarchy; callers cannot submit an owner ID to widen that scope. MD and Admin Head dashboard/report permissions are organization-wide. Reports require `reports.read`; dashboard summary requires `dashboard.read`.

## Endpoints

All routes are under `/api/v1`.

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /dashboard/summary` | `dashboard.read` | Role counts, lead status totals, conversion rate, follow-ups, customers, capacity, quotation value, visits, and branch/state/district performance |
| `GET /reports/employee-performance` | `reports.read` | Employee lead totals and conversions; RM results are limited to CP employees |
| `GET /reports/branch-performance` | `reports.read` | Lead totals and conversions grouped by branch |
| `GET /reports/district-performance` | `reports.read` | Lead totals and conversions grouped by district |
| `GET /reports/state-performance` | `reports.read` | Lead totals and conversions grouped by state |
| `GET /reports/lead-conversion` | `reports.read` | Lead totals grouped by status |
| `GET /reports/customers` | `reports.read` | Scoped customer records |
| `GET /reports/follow-ups` | `reports.read` | Scoped leads with a scheduled follow-up |
| `GET /reports/quotations` | `reports.read` | Quotations whose related lead is in scope |

## Filters

Supported query parameters: `dateFrom`, `dateTo` (ISO dates), `branchId`, `stateId`, `districtId`, one of `mhId`, `dcId`, `rmId`, `cpId`, `leadStatus`, `customerStatus`, `page`, and `limit`. Date bounds are inclusive by day. Geography IDs must exist and related state/district/branch selections must agree. Role selectors must identify the requested role and fall within the caller's hierarchy; out-of-scope selectors return 403.

Dashboard and report aggregations apply the employee and geographic scope before grouping. Customer capacity is measured in kW. Quotation value sums the stored project amount. Conversion rate is converted leads divided by scoped leads.
