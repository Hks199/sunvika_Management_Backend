# Production Deployment

## Container image

Build from the repository root with `docker build -t sunvika-management-backend:latest .`. The image uses a multi-stage Node 22 Alpine build, installs only production dependencies in the runtime stage, runs as the unprivileged `node` user, and uses `dumb-init` for signal forwarding. It exposes port 5000 and has a readiness health check at `/api/v1/health`.

Run behind a TLS-terminating reverse proxy or load balancer. Configure `PORT` and `API_PREFIX` to match the deployment. The app trusts one proxy hop; place only a trusted proxy directly in front of it and prevent clients from reaching the container port directly.

## Configuration and secrets

Inject settings through the platform secret manager; do not bake `.env` or credentials into the image. Production startup requires HTTPS values for `PUBLIC_API_URL`, `FRONTEND_URL`, and each `CORS_ORIGINS` entry, a non-placeholder `JWT_ACCESS_SECRET`, and TLS for a `mongodb://` connection. `mongodb+srv://` connections enable TLS by default. Set `MONGODB_MAX_POOL_SIZE` to a value that fits the MongoDB cluster's connection budget across all replicas (default 50 per app instance).

Use a dedicated MongoDB database user with only the application database permissions. Keep S3 buckets private and grant the task/pod identity the minimum required access to profile, customer-document, and quotation buckets. Configure SMTP credentials only in the secret manager. Restrict inbound traffic to the reverse proxy and configure the exact frontend origins in `CORS_ORIGINS`.

## Release procedure

1. Build and run `npm test`, `npm run typecheck`, and `npm run build` in CI.
2. Publish the image with an immutable commit or release tag and deploy it to a staging environment.
3. Verify the readiness endpoint, login and refresh flows, uploads, quotation generation, and scoped dashboard/AMC endpoints with staging credentials.
4. Run `npm run seed:system-roles` as a one-off release task when new system permissions are introduced. Run `npm run bootstrap:md` only for the first installation; it refuses a second MD bootstrap. Both scripts are compiled into `dist/scripts` by the image build and can be invoked with the same image and production secrets.
5. Promote the tested image, monitor application logs, MongoDB health, request latency, and S3/email failures, and retain the previous image for rollback.

The API's health endpoint is a readiness check and returns 503 while MongoDB is disconnected. Configure the platform to stop routing traffic to unhealthy containers. The built-in rate limiter uses in-memory storage; use a shared rate-limit store before scaling across replicas if consistent cross-instance limits are required.

## Performance and security checks

Production startup creates the declared Mongoose indexes. Review query plans with representative data using MongoDB `explain('executionStats')`, especially hierarchy-scoped dashboard aggregations, customer lists, due follow-ups, AMC renewals, and schedule queries. Load-test with realistic hierarchy sizes and verify the database pool budget before increasing replicas. This repository does not claim a throughput target without environment-specific load-test results.

The test suite includes pure validation/token unit tests and HTTP integration checks for readiness, authentication, malformed input, security headers, and denied origins. The HTTP integration suite intentionally does not connect to a database; run staging persistence, role/hierarchy access, and S3 tests against disposable infrastructure before release.
