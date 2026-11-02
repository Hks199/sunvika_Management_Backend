# API Documentation

The interactive Swagger UI is served from `/api-docs` when `SWAGGER_ENABLED=true`. The OpenAPI 3.0.3 document is available at `/api-docs/openapi.json`. Both paths are served by the API origin. The OpenAPI document lists the implemented route groups and path parameters; workflow rules, request examples, filtering, permissions, and storage behavior are documented in the module references below.

## API conventions

- The default API base is `/api/v1`; deployments can change it with `API_PREFIX`.
- Successful responses use `{ "success": true, "message": "...", "data": ..., "meta": null }`. Paginated endpoints include pagination metadata.
- Errors use `{ "success": false, "message": "...", "errors": [], "meta": null }`.
- Authenticated routes require `Authorization: Bearer <access-token>`. Login and refresh also use an HTTP-only refresh-token cookie.
- Employee ownership and organizational scope come from the authenticated account. A caller cannot widen access by submitting an employee ID or hierarchy path in a query.
- Presigned S3 URLs are temporary. WhatsApp share endpoints create links but do not send messages.

## Module references

| Area | Reference | Main route prefix |
| --- | --- | --- |
| Authentication and sessions | Auth endpoints are described in Swagger | `/auth` |
| Employees and hierarchy | [HIERARCHY.md](HIERARCHY.md), [RBAC.md](RBAC.md) | `/employees` |
| Geography | [GEOGRAPHY.md](GEOGRAPHY.md) | `/geography` |
| Leads | [LEADS.md](LEADS.md) | `/leads` |
| Site visits | [VISITS.md](VISITS.md) | `/visits` |
| Customers and documents | [CUSTOMERS.md](CUSTOMERS.md) | `/customers` |
| Quotations and sharing | [QUOTATIONS.md](QUOTATIONS.md) | `/quotations` and `/public/shares` |
| Dashboards and reports | [ANALYTICS.md](ANALYTICS.md) | `/dashboard`, `/reports` |
| AMC | [AMC.md](AMC.md) | `/amc` |
| Audit log | [AUDIT.md](AUDIT.md) | `/audit-logs` |

The health/readiness endpoint is `GET /health`. It returns HTTP 503 until MongoDB is connected.
