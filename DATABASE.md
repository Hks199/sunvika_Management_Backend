# Sunvika Database Design

## Conventions

MongoDB is accessed through Mongoose. Schemas use timestamps, explicit field validation, ObjectId references, and strict DTO-to-model mapping. Collections use singular domain model names unless the configured Mongoose collection naming convention dictates otherwise. All dates are stored as UTC instants. Soft deletion is used only where recovery/business history requires it; deactivation is preferred for employees and reference data. Large histories are separate documents rather than unbounded embedded arrays.

All indexes below are logical design requirements; exact names and partial-index expressions are finalized with each module implementation and verified against actual queries. Unique indexes must account for inactive records and normalization rules to enforce the duplicate-account policy safely.

## Entity relationships

```text
Role 1---* Employee
Role *---* Permission
Role *---* Role (parent/allowed child role references)
Employee 1---* Employee (reportingTo); Employee stores ancestor hierarchyPath
State 1---* District 1---* Branch
Employee 1---* Lead (createdBy/owner/assignee as domain rules specify)
Lead 1---* LeadStatusHistory
Lead 1---* Visit
Lead 0..1---1 Customer (converted customer reference; customer also references source lead)
Customer 1---* CustomerDocument
Customer 1---* AMCContract
Lead/Customer 1---* Quotation (quotation may reference both customer and source lead)
Employee 1---* RefreshToken / Invitation / PasswordResetToken / AuditLog
```

The employee `hierarchyPath` contains ancestor employee IDs from the top down to the direct manager, excluding the employee itself. The MD path is empty. Updates to reporting relationships are performed through a service that checks for self-reference/cycles, recomputes descendant paths atomically where possible, and applies role-transition rules. `reportingTo` is the direct edge; the path is a query optimization and must be maintained from that edge.

## Collections and key fields

### `employees`

`employeeCode`, normalized `email`, normalized `mobileNumber`, first/middle/last name, profile image object key, address with `state` and `district` references, `role`, optional `reportingTo`, `hierarchyPath`, optional `branch`, `isActive`, `isVerified`, optional password hash, `createdBy`, timestamps. Authentication counters/lock state may be separate fields or a dedicated auth state record depending on the chosen lifecycle. Never return password hashes.

Indexes: unique `employeeCode`; unique normalized email and mobile for active accounts using partial indexes as applicable; `{ reportingTo: 1, isActive: 1 }`; `{ hierarchyPath: 1 }`; `{ role: 1, isActive: 1 }`; `{ branch: 1, isActive: 1 }`. Validate duplicate active accounts at the database index layer as well as in services.

### `roles` and `permissions`

Role: `name`, unique `code`, description, numeric `level`, optional `parentRole`, permission ID list, allowed child role ID list, system/active flags, creator, timestamps, and permission version. Permission: `module`, `action`, unique `code`, description. Role references are validated server-side; clients cannot grant arbitrary IDs or protected system capabilities.

Indexes: unique role `code`; unique permission `code`; `{ isActive: 1, level: 1 }`; role parent and allowed-child lookup as needed. Permission updates increment a version/cache generation.

### `states`, `districts`, and `branches`

State has name, optional code, active flag. District has name, state reference, active flag. Branch has name, district reference (and state where useful for direct filtering), address/contact fields as required, active flag.

Indexes: unique normalized state name/code; unique `{ state: 1, normalizedName: 1 }` for district; unique `{ district: 1, normalizedName: 1 }` for branch; parent/active lookup indexes.

### `leads`

Lead profile/contact and site address, solar requirement, status, owner/creator and assignment references, optional follow-up date, source, optional linked customer, timestamps, and activity metadata. Status history is not stored as an unbounded embedded array.

Indexes: `{ owner: 1, status: 1, createdAt: -1 }`; `{ assignedTo: 1, status: 1 }`; `{ followUpAt: 1, status: 1 }`; `{ status: 1, updatedAt: -1 }`; normalized phone/email search indexes according to search behavior; `{ customer: 1 }` unique/partial to prevent multiple conversions where appropriate.

### `lead_status_histories`

Lead reference, old/new status, actor, timestamp, optional reason and minimal safe metadata. Index `{ lead: 1, createdAt: 1 }` and `{ actor: 1, createdAt: -1 }`.

### `visits`

Lead and optional customer references, employee, visit date, purpose/outcome, notes, location if required, and timestamps. Index `{ lead: 1, visitAt: -1 }`, `{ employee: 1, visitAt: -1 }`, and `{ customer: 1, visitAt: -1 }`.

### `customers`

Customer profile and contact data, solar project details, source lead reference, owner/creator and assignment references, status, timestamps, and update metadata. Conversion is idempotent and transactionally links the source lead; a unique partial source-lead index prevents duplicate customers from one lead.

Indexes: unique partial `{ sourceLead: 1 }`; `{ owner: 1, status: 1, createdAt: -1 }`; `{ assignedTo: 1, updatedAt: -1 }`; normalized contact search indexes as needed.

### `customer_documents`

Customer reference, private S3 object key, original safe display name, detected MIME type, byte size, document category, uploader, verification state/actor/time, and timestamps. Store no public object URL. Index `{ customer: 1, createdAt: -1 }` and `{ customer: 1, verificationStatus: 1 }`.

The implementation uses unique `s3Key` and upload reservation IDs, plus `{ customer: 1, documentType: 1, uploadedAt: -1 }`. `customer_document_uploads` reserve single-use, expiring signed uploads and retain verification state. `customer_activities` stores conversion, profile update, document upload, and verification events separately from the customer profile.

### `quotations`

Unique quotation number, lead/customer references, version, customer/site snapshot needed for historical accuracy, capacity, rate, calculated total, payment and panel details, terms/template version, private PDF object key, creator, and timestamps. Store monetary values using a consistent decimal representation (for example Decimal128 with currency) and validate total from capacity × rate in service logic.

Indexes: unique quotation number; `{ lead: 1, createdAt: -1 }`; `{ customer: 1, createdAt: -1 }`; unique `{ lead: 1, version: 1 }` where versioning is per lead.

The implemented quotation stores immutable project/contact/terms snapshots, Decimal128 capacity/rate/total values, a private S3 key, version, and creator. `quotation_sequences` atomically allocates yearly numbers. `brochures` stores generated brochure PDF metadata. `public_share_links` stores only SHA-256 token hashes with resource, expiry, access count, and revocation state. `quotation_shares` records Click-to-Chat link creation without claiming delivery.

### `quotation_shares`

Quotation reference, share channel/type, actor, timestamp, and outcome such as link generated/opened when known. Do not record a delivery confirmation for a Click-to-Chat link. Index `{ quotation: 1, createdAt: -1 }`.

### `amc_contracts`

Customer reference, unique generated contract number, date range, Decimal128 amount and currency, status, renewal state, optional renewed-from reference, assigned maintenance employee, next service date, creator, and timestamps. Index `{ customer: 1, status: 1 }`, `{ expiryDate: 1, renewalStatus: 1 }`, and `{ assignedEmployee: 1, nextServiceAt: 1 }`.

### `amc_schedules` and `amc_service_histories`

Schedules reference a contract, scheduled date, assigned employee, lifecycle status, notes, creator, and timestamps. Service histories are append-only records tied to a contract and optionally a completed schedule, with service date, performer, outcome, notes, parts used, and creator. Index schedules by `{ contract: 1, scheduledAt: 1 }` and `{ assignedEmployee: 1, scheduledAt: 1 }`; index histories by `{ contract: 1, serviceDate: -1 }`.

### `amc_sequences`

Stores an atomic yearly contract-number counter using an ID such as `AMC-2026` and a monotonically increasing value.

### Identity, audit, and operational collections

- `refresh_tokens`: employee/session reference, hashed token, expiry, rotation/revocation/reuse state, device metadata. Index unique token hash, `{ employee: 1, revokedAt: 1 }`, and TTL on expiry where compatible with audit needs.
- `invitations`: employee reference, hashed single-use token, expiry, used/revoked state, creator. Index unique token hash and TTL on expiry.
- `password_reset_tokens`: employee reference, hashed single-use token, expiry, used state. Index unique token hash and TTL on expiry.
- `audit_logs`: append-only action/module, actor, resource type/ID, optional sanitized old/new snapshots, request ID, IP/user-agent, response status, and timestamp. The application writes only metadata by default and never stores request/response bodies. Index `{ resourceType: 1, resourceId: 1, createdAt: -1 }`, `{ performedBy: 1, createdAt: -1 }`, and `{ module: 1, action: 1, createdAt: -1 }`. Restrict mutation/deletion through database permissions and application design.
- `bootstrap_states`: unique bootstrap key, status, lock timestamp, completion timestamp. The unique `initial-md` state makes the protected MD CLI one-time and permits recovery of a stale in-progress attempt without creating a second MD.
- `hierarchy_locks`: unique lock key, owner token, lease expiration. The `reporting-hierarchy` lock serializes employee creation and reporting moves across application instances.
- `profile_image_uploads`: uploader/owner employee, private object key, declared content type/size, expiry, claim/use state. Index unique object key and `{ owner: 1, expiresAt: 1, claimedAt: 1, employee: 1 }`. Expired upload records are retained for a storage cleanup job so their object keys remain available for deletion.
- Optional `sessions` can be represented by refresh-token family records or a separate session collection if session listing/revocation requires it.

## Transactions and consistency

Use MongoDB transactions for multi-document workflows such as lead conversion and reporting hierarchy changes when the deployment runs on a transaction-capable replica set. Handle unsupported deployment configuration explicitly; do not silently claim atomicity. Unique indexes and idempotency checks remain necessary even with transactions. External effects are issued after committed database state or through an outbox when reliable retry is required.

## Query and access patterns

Every list/read query receives server-derived authorization scope. Typical employee/downline queries use `hierarchyPath` and direct `reportingTo` indexes. Leads, customers, visits, and reports scope by owner/assignee or the authorized employee ID set, with Admin Head policy handled separately. Validate pagination bounds, use projections and lean reads for read paths, and aggregate dashboards with scope filters applied at the start of the pipeline. Avoid unbounded `$in` lists by using indexed hierarchy fields or bounded/optimized aggregation strategies.

## Data protection and retention

Do not persist plaintext passwords, invitation/reset secrets, refresh tokens, or public S3 URLs. Minimize personal data in logs and audit before/after snapshots. Use private storage keys, short-lived presigned access, validated uploads, and documented retention/deletion policies. TTL indexes are suitable only for expired ephemeral tokens; business and audit histories follow explicit retention requirements.
