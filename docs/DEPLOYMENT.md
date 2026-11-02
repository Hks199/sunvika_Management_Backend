# Production Deployment

## EC2 deployment with GitHub Actions

The `main` branch workflow in [`.github/workflows/deploy.yaml`](../.github/workflows/deploy.yaml) runs `npm test` and, on success, transfers the source to EC2 and runs Docker Compose. It writes `.env.production` on EC2 over the encrypted SSH connection using the configured GitHub Actions secrets and variables. Local `.env` files are never included in the release archive.

### One-time EC2 setup

1. Point an `A` record for `sunvikamanagement.niakylie.com` to the instance's public IPv4 address. Allow inbound TCP ports 80 and 443 in the EC2 security group; restrict SSH (port 22) to trusted addresses.
2. Install Docker Engine with the Docker Compose plugin, and install Certbot on the instance.
3. Configure GitHub repository **Settings → Secrets and variables → Actions**. The workflow requires these exact names:

   - **Required secrets:** `EC2_SSH_KEY`, `EC2_KNOWN_HOSTS`, `MONGODB_URI`, `JWT_ACCESS_SECRET`.
   - **Variables:** `EC2_HOST` (defaults to `18.60.61.219`), `EC2_USER` (defaults to `ubuntu`), `FRONTEND_URL`, `CORS_ORIGINS`, and any desired non-default runtime settings.
   - `EC2_HOST` is the instance public IP or DNS name. `EC2_SSH_KEY` is the PEM private-key contents, not a local file path. `EC2_KNOWN_HOSTS` is the verified SSH host-key line for the instance.
   - `MONGODB_URI` must be the full production connection string with its password URL-encoded and TLS enabled. `JWT_ACCESS_SECRET` must be a unique random value of at least 32 characters. Do not send either value in chat or commit them.
   - `FRONTEND_URL` must be the deployed frontend's HTTPS origin (no path); `CORS_ORIGINS` must contain the allowed HTTPS frontend origins, comma-separated if there is more than one. The workflow fails before deployment if required values are missing. `http://localhost:3000` is development-only and will not work in production.
   - The deploy workflow maps the runtime settings from `.env.example` to Actions values. Store credentials (`MONGODB_URI`, `JWT_ACCESS_SECRET`, `SMTP_PASSWORD`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`) as **Secrets**. Other runtime settings are **Variables**; `SMTP_USER` and `SMTP_FROM` may be stored as either, with Secrets taking precedence. Optional S3 access keys can be omitted when the instance uses an IAM role. Configure both AWS access-key secrets or neither.
   - Development-only and one-time bootstrap values (`INITIAL_MD_*`) are intentionally not written to the persistent production environment file. Do not copy real credentials or administrator passwords into `.env.example`; use GitHub Actions Secrets and rotate any credentials that have been exposed.
4. The TLS certificate must be issued before the first deployment. Port 80 must be reachable from the internet and not already in use:

   ```sh
   sudo certbot certonly --standalone \
     --agree-tos --non-interactive \
     --email YOUR_CERTIFICATE_CONTACT_EMAIL \
     -d sunvikamanagement.niakylie.com
   ```

   The Nginx config expects the resulting files under `/etc/letsencrypt/live/sunvikamanagement.niakylie.com/`. Install the included renewal hooks after the first deployment so Certbot can use port 80 and restart Nginx after renewal:

   ```sh
   sudo install -m 755 deploy/certbot/stop-nginx.sh \
     /etc/letsencrypt/renewal-hooks/pre/stop-sunvika-nginx
   sudo install -m 755 deploy/certbot/start-nginx.sh \
     /etc/letsencrypt/renewal-hooks/post/start-sunvika-nginx
   sudo certbot renew --dry-run
   ```

   Ensure the instance's Certbot renewal timer is enabled for your installation.
5. Push the deployment files to `main` or run the workflow manually. The instance must be able to build the Docker image locally. The app container is only exposed on the private Compose network; Nginx handles public HTTP-to-HTTPS redirection and proxies HTTPS requests to it.

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
