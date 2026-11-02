# Sunvika Backend Architecture

## Purpose and scope

Sunvika's backend will be a modular monolith for solar lead management, customer lifecycle, employee organization, and office operations. It will expose a versioned REST API from a single Node.js/Express application, use TypeScript strict mode, and persist domain data in MongoDB through Mongoose. Modules remain independently understandable while sharing infrastructure and cross-cutting policies. This document describes the target architecture; implementation is delivered in the phases defined in `GUIDE.md`.

## Runtime structure

```text
HTTP client
  -> Express app (request ID, security, CORS, parsing, rate limits)
  -> versioned routes
  -> authentication, validation, permission, and resource-scope middleware
  -> controllers (HTTP mapping only)
  -> domain services (business rules and transactions)
  -> repositories (Mongoose access and scope-aware query construction)
  -> MongoDB

Domain services -> email/S3/PDF/notification adapters
All requests -> structured application logs
Business mutations -> append-only audit records
```

The application starts only after environment configuration has been validated and the database connection is ready. `app.ts` constructs middleware and routes without opening sockets; `server.ts` owns startup, shutdown, and connection lifecycle. `/api/v1` is the initial API prefix.

## Source organization

```text
src/
  config/       validated environment and service configuration
  constants/    stable domain constants
  database/     connection, shared plugins, indexes, seed support
  modules/      auth, employees, roles, geography, leads, visits,
                customers, quotations, documents, dashboards, AMC, etc.
  middleware/   request context, authentication, validation, authorization,
                rate limiting, not-found, and error handling
  services/     shared email, S3, PDF, and notification adapters
  utils/        response, async, pagination, date, and crypto helpers
  types/        Express augmentation and shared API types
  routes/       API composition
  app.ts
  server.ts
scripts/        controlled bootstrap and explicit seed commands
tests/          unit, integration, and end-to-end tests
docs/           architecture, database, API, RBAC, hierarchy, security
```

Each domain module owns its models, DTOs/interfaces, validation schemas, repository, service, controller, routes, and module composition as needed. Create only files that have a concrete responsibility. Controllers translate HTTP input/output; they do not contain business workflows or construct unrestricted database queries.

## Main domain boundaries

- **Identity and access:** employees, password setup/reset, sessions and refresh-token rotation, roles, permissions, and authorization policy.
- **Organization:** employee lifecycle and reporting relationships; states, districts, and branches.
- **Sales lifecycle:** leads, status history and follow-ups, visits, conversion, customers, and customer activity.
- **Commercial documents:** quotations and generated PDFs; private document metadata and access.
- **Insights and service:** scoped dashboards/reports and AMC contracts/maintenance history.
- **Platform:** configuration, database, logging, email, S3, API response/error format, and audit trail.

Cross-module workflows are orchestrated by services. For example, lead conversion validates the lead and caller scope, creates/links the customer, changes status and records history in a MongoDB transaction when supported, and returns an idempotent result on retry. External side effects (email, S3, WhatsApp link generation) sit behind adapters; database state is not reported as delivered merely because a provider link was opened.

## Authentication and authorization

All employee roles use one login and session system. Passwords use Argon2id or bcrypt. Access tokens are short-lived; refresh credentials are stored and rotated server-side, revoked on logout, and checked for reuse. Invitation and password-reset secrets are cryptographically random, stored only as hashes, expire, and are single use. Secrets are never logged or returned from APIs.

Authorization has two independent checks:

1. **Capability:** the authenticated employee's active role has the required permission.
2. **Data scope:** the requested resource falls within policy for that employee, role, hierarchy, ownership, and any assigned organizational scope.

Repositories accept a server-derived scope/policy rather than trusting a frontend employee ID, role, `reportingTo`, or hierarchy path. The reusable hierarchy service resolves ancestors/descendants and checks reporting cycles. Admin Head has a distinct organization-wide leads/customers policy controlled by assigned permissions; this does not confer employee hierarchy or role-management privileges. Critical platform rules remain enforced in backend policy even if role permissions are edited. Permission changes invalidate or version cached authorization data.

The MD bootstrap is a protected CLI operation, never a public endpoint. It seeds required system roles/permissions and creates at most one initial MD using securely supplied credentials.

## API and error conventions

All endpoints are versioned and use a consistent envelope:

```json
{"success":true,"message":"...","data":{},"meta":null}
```

Errors use `success: false`, a safe message, field-level validation errors where applicable, and `meta: null`. Pagination metadata carries page, limit, total, and totalPages. Central error middleware maps known domain/validation/database failures to appropriate status codes and hides stack traces in production. Request IDs flow through logs and audit events.

## Security and operational controls

- Validate environment at startup; keep credentials out of source control.
- Helmet, explicit CORS allowlist, request-size limits, method restrictions, rate limits, HPP protection, safe Mongo query construction, and Joi validation for every external input.
- Cookie-based auth uses secure, HTTP-only, appropriately scoped cookies and CSRF defenses where required.
- Private S3 objects are accessed through short-lived presigned URLs after resource authorization; upload type and size are checked.
- Pino/Winston structured logs exclude passwords, tokens, provider credentials, and sensitive identity/banking/document data.
- Audit business mutations in a separately protected, append-only collection with actor, resource, request context, and minimal before/after data.
- Database indexes, pagination, lean reads, and aggregation pipelines are designed with access patterns and tenant/organization scope in mind.

## Delivery phases

1. **Foundation:** package/TypeScript setup, validated environment, Mongo connection, Express app/server, response/error handling, logger, security middleware, and Swagger.
2. **Authentication:** employee identity, login, token/session lifecycle, password setup/reset, email and invitations.
3. **Organization and hierarchy:** roles/permissions, employee management, hierarchy policy, Admin Head, and MD bootstrap.
4. **Geography:** state, district, and branch management.
5. **Leads:** scoped CRUD, status history, follow-ups, and statistics.
6. **Visits:** visit records and timeline.
7. **Customers:** conversion, document workflows, and customer history.
8. **Quotations:** quotation versions/PDF, brochure, sharing records.
9. **Dashboards and reports:** scoped aggregations and performance reporting.
10. **AMC:** customer-linked contracts, schedules, service and renewal flows.
11. **Production readiness:** tests, security/performance review, Docker, and deployment documentation.

Each phase is implemented and reviewed before moving to the next, with documentation updated alongside the implementation.
