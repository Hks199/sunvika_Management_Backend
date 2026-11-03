# Sunvika Management Backend

TypeScript and Express modular monolith for Sunvika Private Limited's office and solar business management system. The target architecture and database relationships are documented in [ARCHITECTURE.md](ARCHITECTURE.md) and [DATABASE.md](DATABASE.md).

## Requirements

- Node.js 20 or later (LTS recommended)
- MongoDB 6+ reachable from the application

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` and `CORS_ORIGINS` for your environment.
3. Start MongoDB.
4. Run `npm run dev` for the development server.
5. Open `http://localhost:5000/api-docs` for Swagger UI or `http://localhost:5000/api-docs/openapi.json` for the OpenAPI document. See [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for API conventions and module guides. `GET /api/v1/health` reports readiness and returns HTTP 503 until MongoDB is connected.

Use `npm run build` to compile to `dist/` and `npm start` to run the compiled server. `npm run typecheck` checks TypeScript without emitting files. Swagger UI can be disabled with `SWAGGER_ENABLED=false`.

## Configuration

All environment values are validated on startup. See `.env.example` for the Phase 1 settings. `CORS_ORIGINS` accepts a comma-separated explicit allowlist. Do not commit `.env` or credentials. Production should use a least-privilege MongoDB user, TLS, an explicit frontend origin allowlist, and a managed secret store.

## API conventions

Endpoints are mounted at `API_PREFIX` (default `/api/v1`). Responses use `{ success, message, data, meta }` for success and `{ success, message, errors, meta }` for errors. Every request receives or generates an `X-Request-Id`; it is returned in the response and included in request logs.

## Phase status

Phase 1 provides strict TypeScript configuration, validated environment, MongoDB connection management, Express app/server separation, common response/error handling, structured Pino logging, request correlation, HTTP security middleware, health check, and OpenAPI/Swagger UI.

Phase 2 adds employee identity, bcrypt password hashing, short-lived JWT access tokens, rotating opaque refresh tokens in HTTP-only cookies, session listing/revocation and reuse detection, invitation/password setup, password recovery, login lockout, and Gmail SMTP delivery. To deliver email, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Invitation issuance is exposed as a service for the authorized employee onboarding workflow in Phase 3; there is no public employee-creation route.

Phase 3 adds role/permission management, employee onboarding and scoped management endpoints, hierarchy services, Admin Head separation, private S3 profile-image upload/download, and the one-time MD bootstrap. Set the `INITIAL_MD_*` values in a local ignored `.env` file and run `npm run bootstrap:md` once after MongoDB is available. `INITIAL_MD_EMPLOYEE_CODE` is optional; when omitted, the bootstrap generates a code. The bootstrap creates the initial MD and refuses to run again after completion; an active MD can invite additional MD employees through the normal employee onboarding flow. Every MD has the full MD role permissions and can access employee records regardless of who created them. Run `npm run seed:system-roles` after deploying new system permissions so existing role records receive additive updates; it does not create an employee account. Review [docs/RBAC.md](docs/RBAC.md) and [docs/HIERARCHY.md](docs/HIERARCHY.md) for the policy boundaries. Configure `AWS_REGION`, `AWS_S3_BUCKET_NAME` (or `AWS_S3_PROFILE_BUCKET`), and AWS credentials or an instance role; the backend role needs `s3:PutObject` and `s3:GetObject` for the private profile-image bucket. The S3 client follows bucket-region redirects. Keep the bucket private. Customer-document browser uploads use presigned URLs and require frontend `PUT` access from the exact CORS origins in `CORS_ORIGINS`; employee profile images are uploaded through the authenticated API.

Phase 4 adds state, district, and branch management with active-only dependent dropdowns. Any signed-in employee can read dropdown data; only the MD can create, update, or deactivate geography records. See [docs/GEOGRAPHY.md](docs/GEOGRAPHY.md).

Phase 5 adds lead creation, hierarchy-scoped listing and access, updates and assignment, centralized status rules, immutable status history, and upcoming/overdue follow-up queries. Lead conversion is reserved for Phase 7. See [docs/LEADS.md](docs/LEADS.md).

Phase 6 adds append-only site visit records, hierarchy-scoped visit timelines by lead and employee, permitted visit detail updates, and upcoming/overdue next-visit queries. See [docs/VISITS.md](docs/VISITS.md).

Phase 7 adds idempotent lead conversion, customer profiles and activity timelines, customer hierarchy scoping, and private verified S3 document uploads/downloads. Configure the private S3 bucket and `CUSTOMER_DOCUMENT_MAX_SIZE_BYTES` for document storage. See [docs/CUSTOMERS.md](docs/CUSTOMERS.md).

Phase 8 adds versioned quotation PDFs, reusable quotation/brochure templates, private S3 storage, short-lived downloads, and WhatsApp Click-to-Chat links backed by expiring share tokens. Configure `AWS_S3_QUOTATION_BUCKET` (or `AWS_S3_BUCKET_NAME`) and `PUBLIC_API_URL`. Click-to-Chat creates a link only; it does not send or confirm a message. See [docs/QUOTATIONS.md](docs/QUOTATIONS.md).

Phase 9 adds hierarchy-scoped dashboard summaries and employee, branch, district, lead conversion, customer, follow-up, and quotation reports. Dashboard filters support dates, geography, one role-level employee selector, and lead/customer statuses. See [docs/ANALYTICS.md](docs/ANALYTICS.md).

Phase 10 adds customer-linked AMC contracts, renewal and upcoming renewal tracking, assigned maintenance schedules, upcoming service schedules, and service history. AMC access follows the linked customer's hierarchy scope. See [docs/AMC.md](docs/AMC.md).

Phase 11 adds Node test-runner unit and HTTP integration coverage, production HTTPS/TLS configuration checks, pooled database connections, a non-root multi-stage Docker image, and deployment guidance. Run `npm test`, `npm run typecheck`, and `npm run build`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Phase 12 completes the documented audit trail with append-only event records for successful authenticated mutations and sensitive file reads, a Managing Director-only audit query endpoint, and audit metadata retention guidance. See [docs/AUDIT.md](docs/AUDIT.md).

Phase 13 strengthens hierarchy authorization by extracting employee and owned-resource decisions into pure policy functions and testing self, downline, MD, BDO-created Admin Head, unrelated employee, and Admin Head resource access boundaries. The GUIDE phase plan ends at Phase 11; Phase 13 addresses the security-testing requirements already listed there. Run `npm test` and `npm run typecheck`.

Phase 14 completes the OpenAPI route inventory for geography, leads, visits, customers and documents, quotations and sharing, dashboards, reports, and public share links. OpenAPI JSON is available at `/api-docs/openapi.json` when `SWAGGER_ENABLED=true`. Field-level request rules and workflow examples remain in the linked module guides under `docs/`.
