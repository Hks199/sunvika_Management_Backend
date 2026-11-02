# PROJECT: SUNVIKA PRIVATE LIMITED — OFFICE MANAGEMENT & SOLAR BUSINESS MANAGEMENT SYSTEM

## 1. YOUR ROLE

Act as a Senior Backend Architect and Senior Node.js Engineer with extensive experience designing enterprise-level, secure, scalable, maintainable backend systems.

Your responsibility is to design and implement a production-ready backend for **Sunvika Private Limited**, a company operating in:

- Solar Panel Installation
- Residential and Commercial Solar Projects
- Solar Lead Management
- Customer Relationship Management (CRM)
- Annual Maintenance Contracts (AMC)
- Employee and Organizational Management
- Sales and Business Development

Do not build this application like a beginner-level CRUD project.

Follow enterprise software engineering practices, maintain separation of concerns, use reusable services, implement proper authorization, validate every request, handle errors consistently, and write maintainable code.

Think carefully about architecture and business rules before implementation.

---

# 2. TECHNOLOGY STACK

Use the following technologies:

### Core Backend
- Node.js (LTS)
- Express.js
- TypeScript (strict mode)
- MongoDB
- Mongoose

### Validation
- Joi

### Authentication and Security
- JWT
- Access Token
- Refresh Token
- HTTP-only secure cookies where applicable
- Password hashing using Argon2id or bcrypt
- Helmet
- CORS
- Express Rate Limit
- HPP protection
- MongoDB query sanitization
- XSS input/output protection
- CSRF protection where cookie-based authentication requires it

### File Management
- AWS S3
- AWS SDK v3
- Presigned URLs

### Logging
- Pino or Winston
- Structured JSON logging
- Request ID / Correlation ID
- Error logging
- Audit logging

### Email
- Nodemailer
- Gmail SMTP
- SMTP host: smtp.gmail.com
- Port and credentials from environment variables

### Documentation and Testing
- Swagger / OpenAPI
- Jest or Vitest
- Supertest
- ESLint
- Prettier

Use the latest stable, mutually compatible package versions.

---

# 3. ARCHITECTURAL PRINCIPLES

Follow these principles:

1. SOLID principles.
2. DRY (Don't Repeat Yourself).
3. Separation of concerns.
4. Dependency inversion where appropriate.
5. Reusable services.
6. Centralized error handling.
7. Centralized validation.
8. Centralized authorization.
9. Secure-by-default implementation.
10. Modular and domain-driven organization.

Use a modular monolithic architecture.

Do not unnecessarily introduce microservices.

Every module should be independently understandable and maintainable.

Controllers must not contain complex business logic.

Business logic must reside in services.

Database queries should be handled through repositories or well-defined data-access services.

All API responses must follow a consistent structure.

---

# 4. REQUIRED PROJECT STRUCTURE

Create a clean, enterprise-level project structure.

Use the following structure as the architectural reference. You may improve it if a better separation of concerns is justified.

```text
sunvika-backend/
│
├── src/
│   │
│   ├── config/
│   │   ├── env.config.ts
│   │   ├── database.config.ts
│   │   ├── aws.config.ts
│   │   ├── mail.config.ts
│   │   ├── cors.config.ts
│   │   ├── security.config.ts
│   │   └── index.ts
│   │
│   ├── constants/
│   │   ├── app.constants.ts
│   │   ├── auth.constants.ts
│   │   ├── role.constants.ts
│   │   ├── permission.constants.ts
│   │   ├── lead.constants.ts
│   │   └── error.constants.ts
│   │
│   ├── database/
│   │   ├── connection.ts
│   │   ├── indexes.ts
│   │   ├── plugins/
│   │   └── seeders/
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/
│   │   │   ├── models/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── routes/
│   │   │   ├── validations/
│   │   │   ├── interfaces/
│   │   │   └── auth.module.ts
│   │   │
│   │   ├── employees/
│   │   ├── roles/
│   │   ├── permissions/
│   │   ├── organization/
│   │   ├── geography/
│   │   ├── branches/
│   │   ├── leads/
│   │   ├── customers/
│   │   ├── visits/
│   │   ├── quotations/
│   │   ├── documents/
│   │   ├── dashboards/
│   │   ├── notifications/
│   │   ├── audit-logs/
│   │   ├── reports/
│   │   └── amc/
│   │
│   ├── middleware/
│   │   ├── authenticate.middleware.ts
│   │   ├── authorize.middleware.ts
│   │   ├── validate.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   ├── upload.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── not-found.middleware.ts
│   │   └── audit.middleware.ts
│   │
│   ├── services/
│   │   ├── email.service.ts
│   │   ├── s3.service.ts
│   │   ├── whatsapp.service.ts
│   │   ├── pdf.service.ts
│   │   └── notification.service.ts
│   │
│   ├── utils/
│   │   ├── api-response.util.ts
│   │   ├── async-handler.util.ts
│   │   ├── jwt.util.ts
│   │   ├── password.util.ts
│   │   ├── token.util.ts
│   │   ├── pagination.util.ts
│   │   ├── date.util.ts
│   │   ├── encryption.util.ts
│   │   └── hierarchy.util.ts
│   │
│   ├── types/
│   │   ├── express.d.ts
│   │   ├── auth.types.ts
│   │   ├── common.types.ts
│   │   └── pagination.types.ts
│   │
│   ├── templates/
│   │   ├── emails/
│   │   ├── quotations/
│   │   └── pdf/
│   │
│   ├── routes/
│   │   └── index.ts
│   │
│   ├── app.ts
│   └── server.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── scripts/
│   ├── create-first-md.ts
│   ├── seed-permissions.ts
│   └── seed-geography.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API_DOCUMENTATION.md
│   ├── RBAC.md
│   ├── HIERARCHY.md
│   └── SECURITY.md
│
├── uploads/
├── logs/
├── .env.example
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── jest.config.ts
├── package.json
├── tsconfig.json
├── README.md
└── Dockerfile
```

Every module should follow a consistent internal structure:

```text
module-name/
├── models/
├── controllers/
├── services/
├── repositories/
├── routes/
├── validations/
├── interfaces/
├── dtos/
└── module-name.module.ts
```

Create only the folders and files required by the module. Avoid empty or unnecessary files.

---

# 5. BUSINESS HIERARCHY AND EMPLOYEE MANAGEMENT

This is the most important part of the application.

Implement a hierarchical employee management system.

## 5.1 Organizational Hierarchy

The reporting hierarchy is:

MD → BDO → MH → DC → RM → CP

Role definitions:

1. MD – Managing Director
2. BDO – Business Development Officer
3. MH – Marketing Head
4. DC – District Coordinator
5. RM – Relationship Manager
6. CP – Channel Partner

### MD — Managing Director

- Highest authority.
- Has access to all employees.
- Can view all leads and customers.
- Can access all reports and dashboards.
- Can create BDO.
- Can create and manage roles and permissions.
- Can manage districts, states, and branches.
- Can manage the entire organization.
- Can view all downline employee activities.
- Can access all business records.

### BDO — Business Development Officer

- Reports to MD.
- Can access all data belonging to their downline.
- Can create MH.
- Can create employees under their permitted hierarchy.
- Can manage leads and customers under their hierarchy.
- Can access their team's dashboards and reports.
- Can manage Admin Head accounts.
- Cannot access unrelated BDO teams or their data.

### MH — Marketing Head

- Reports to BDO.
- Can create DC.
- Can view and manage all employees under their hierarchy.
- Can access all their downline leads and customers.
- Can monitor employee performance.

### DC — District Coordinator

- Reports to MH.
- Can create RM.
- Can access all downline employees.
- Can monitor their team's leads, customers, visits, and performance.

### RM — Relationship Manager

- Reports to DC.
- Can create CP.
- Can access all their downline CP employees.
- Can monitor their leads, visits, customers, and performance.

### CP — Channel Partner

- Reports to RM.
- Can add new leads.
- Can access only their own leads.
- Can access their own customers.
- Can update their lead statuses.
- Can record customer visits.
- Can view their own performance.
- Cannot access another CP's private data.

## 5.2 Hierarchy Data Model

Design the employee model with the following fields:

```typescript
Employee {
  _id: ObjectId;

  employeeCode: string;

  firstName: string;
  middleName?: string;
  lastName: string;

  email: string;
  mobileNumber: string;

  profileImage?: {
    key: string;
    url?: string;
  };

  address: {
    addressLine: string;
    state: ObjectId;
    district: ObjectId;
    city?: string;
    pincode?: string;
  };

  role: ObjectId;

  reportingTo?: ObjectId;

  hierarchyPath: ObjectId[];

  branch?: ObjectId;

  isActive: boolean;
  isVerified: boolean;

  passwordHash?: string;

  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

Use `hierarchyPath` or an equivalent well-designed hierarchy representation to identify all ancestors and descendants.

Example:

```text
MD
 └── BDO
      └── MH
           └── DC
                └── RM
                     └── CP
```

For a CP employee, the hierarchy path should contain:

```text
[MD_ID, BDO_ID, MH_ID, DC_ID, RM_ID]
```

For an MD, the path can be empty.

Implement reusable hierarchy services:

- getAncestors()
- getDescendants()
- getDownlineEmployeeIds()
- getReportingChain()
- isInMyHierarchy()
- canAccessEmployee()
- canAccessResource()

Do not trust employee IDs supplied by the frontend for authorization.

Always calculate accessible records from the authenticated employee and database hierarchy.

Ensure hierarchy updates cannot introduce circular reporting relationships.

---

# 6. DYNAMIC ROLE AND PERMISSION MANAGEMENT

Roles and permissions must be manageable from the MD dashboard.

Do not hardcode all authorization rules inside controllers.

Create the following collections:

### Role

```typescript
Role {
  _id: ObjectId;
  name: string;
  code: string;
  description?: string;

  level: number;

  parentRole?: ObjectId;

  permissions: ObjectId[];

  allowedChildRoles: ObjectId[];

  isSystemRole: boolean;
  isActive: boolean;

  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

### Permission

```typescript
Permission {
  _id: ObjectId;
  module: string;
  action: string;
  code: string;
  description?: string;
}
```

Examples:

```text
employees.create
employees.read
employees.update
employees.delete

leads.create
leads.read
leads.update
leads.delete
leads.assign

customers.create
customers.read
customers.update

visits.create
visits.read

quotations.create
quotations.read
quotations.share

reports.read

roles.create
roles.update

geography.create
geography.update

dashboard.read
```

### Authorization Requirements

Implement two separate authorization layers:

1. Permission-based authorization.
2. Hierarchy-based data access.

Having `leads.read` permission does not automatically mean an employee can read every lead.

For example:

- MD can read all leads.
- BDO can read leads belonging to their downline.
- MH can read leads belonging to their downline.
- DC can read leads belonging to their downline.
- RM can read leads belonging to their downline.
- CP can read only their own leads.

The same principle applies to customers, visits, employees, and reports.

### Dynamic Permission Management

MD should be able to:

- Create custom roles.
- Edit role permissions.
- Activate or deactivate roles.
- Define which roles can create which downline roles.
- Configure access to modules and actions.

Protect critical system rules.

The frontend must never be able to grant permissions simply by submitting arbitrary role IDs.

Prevent privilege escalation.

System-level permissions and hierarchy boundaries must remain protected by backend policies even when role configurations are changed.

Use permission versioning or cache invalidation when role permissions change.

---

# 7. ADMIN HEAD — SEPARATE ROLE

Admin Head is a special role outside the primary reporting hierarchy.

Admin Head is not a child of MH, DC, RM, or CP.

### Access

- Can view all leads.
- Can view all customers.
- Can access lead and customer documents.
- Can access lead statuses and visit histories.
- Can access customer information.
- Can generate reports.
- Can manage permitted administrative operations.

### Restrictions

- Cannot access MD or BDO employee-management privileges.
- Cannot manage the organizational hierarchy.
- Cannot automatically access every system configuration.
- Cannot modify roles or permissions unless explicitly authorized.

### Creation

Only MD and BDO can create Admin Head accounts.

Admin Head data visibility should be restricted according to their assigned permissions, not the regular employee reporting hierarchy.

MD and BDO can view and manage Admin Head activities.

Create a separate authorization policy for Admin Head.

---

# 8. EMPLOYEE REGISTRATION AND ONBOARDING

All roles must log in through the same authentication system and API.

There must be no separate login system for MD, BDO, MH, DC, RM, CP, or Admin Head.

### Employee Registration Flow

1. An authorized employee logs in.
2. They open the employee creation section.
3. The backend checks their permission and hierarchy.
4. They select the employee role.
5. The backend validates whether the creator is allowed to create that role.
6. They submit employee details.
7. Profile image is uploaded to AWS S3.
8. Employee record is created.
9. An onboarding email is sent to the employee.
10. Employee receives a secure password setup link.

### Registration Information

- First Name
- Middle Name
- Last Name
- Mobile Number
- Email / Gmail
- Address
- State
- District
- Branch
- Profile Photo
- Role
- Reporting Manager

Generate a unique employee code.

Validate mobile numbers and email addresses.

Prevent duplicate active employee accounts using appropriate unique indexes and database-level checks.

### Password Setup Email

Use Gmail SMTP through Nodemailer.

SMTP configuration must come from `.env`.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Generate a cryptographically secure, single-use onboarding token.

Store only its hash in MongoDB.

Requirements:

- Token expiration.
- Single-use token.
- Secure password setup.
- Token invalidation after successful password setup.
- Rate limiting.
- No password in email.
- No plaintext password storage.

Email should contain a frontend URL such as:

```text
https://your-frontend-domain.com/set-password?token=...
```

Use an environment variable for the frontend URL.

Also implement resend invitation functionality.

---

# 9. STATE, DISTRICT AND BRANCH MANAGEMENT

MD should be able to dynamically manage states, districts, and branches.

Create three separate models.

### State

```typescript
State {
  name: string;
  code?: string;
  isActive: boolean;
}
```

### District

```typescript
District {
  name: string;
  state: ObjectId;
  isActive: boolean;
}
```

### Branch

```typescript
Branch {
  name: string;
  code: string;
  state: ObjectId;
  district: ObjectId;
  address?: string;
  isActive: boolean;
}
```

### Functional Requirements

- MD can create, update, and deactivate states.
- MD can create, update, and deactivate districts.
- MD can create and manage branches.
- District must belong to a state.
- Branch must belong to a district and state.
- Prevent duplicate districts within the same state.
- Prevent duplicate branch codes.

### Dynamic Dropdowns

Implement dependent dropdown APIs.

Example:

```text
GET /api/v1/geography/states

GET /api/v1/geography/states/:stateId/districts

GET /api/v1/geography/districts/:districtId/branches
```

If the user selects Chhattisgarh, the frontend should receive only districts belonging to Chhattisgarh.

Use database relationships to enforce consistency.

---

# 10. LEAD MANAGEMENT SYSTEM

CP is the primary source of business leads.

Every CP should be able to create and manage their own leads.

Their upline employees should be able to access these leads according to the hierarchy.

### 10.1 Lead Model

```typescript
Lead {
  _id: ObjectId;

  leadCode: string;

  customerName: string;
  mobileNumber: string;
  alternateNumber?: string;

  branch: ObjectId;

  state: ObjectId;
  district: ObjectId;

  blockOrTehsil?: string;

  siteAddress: string;

  status: LeadStatus;

  creatorId: ObjectId;

  assignedTo?: ObjectId;

  createdAt: Date;
  updatedAt: Date;
}
```

Initial status:

```text
PENDING
```

Allowed statuses:

```text
INTERESTED
NOT_INTERESTED
SITE_VISITED
PENDING
NEED_FOLLOWUP
LOST
QUOTATION_SENT
CONVERTED
```

Use enums/constants and centralize status transition rules.

### 10.2 Lead Creation

When CP creates a lead:

- Automatically set creatorId to authenticated employee ID.
- Automatically assign initial status to PENDING.
- Generate a unique lead code.
- Validate customer mobile number.
- Save state, district, and branch references.
- Record creation timestamp.

Never accept creatorId directly from the frontend.

### 10.3 Lead Status Management

CP can change the status of their own leads.

Upline employees can view and manage downline leads according to their permissions.

Every status change must be recorded.

Create a separate LeadStatusHistory collection.

```typescript
LeadStatusHistory {
  lead: ObjectId;

  previousStatus: string;
  newStatus: string;

  remark: string;

  changedBy: ObjectId;
  changedAt: Date;

  nextFollowUpDate?: Date;
}
```

Whenever a status changes:

1. Validate the transition.
2. Update the lead.
3. Create a status history record.
4. Record the employee who changed the status.
5. Record the remark.
6. Update timestamps.

### Follow-up Logic

When status becomes NEED_FOLLOWUP:

- Next follow-up date is mandatory.
- Remark is mandatory.
- Save the next visit date.
- Show upcoming follow-ups in dashboards.
- Show overdue follow-ups.
- Maintain complete follow-up history.

### Site Visit Logic

Whenever an employee visits a customer site, create a visit record.

Do not overwrite previous visits.

Store:

- Lead ID
- Customer ID if converted
- Visited By
- Visit Date
- Visit Remark
- Next Visit Date
- Location if available
- Created At

All previous visit records must remain accessible.

CP should see their complete visit history.

All authorized upline employees should also be able to view it.

---

# 11. LEAD CONVERSION INTO CUSTOMER

When a lead status changes to CONVERTED, execute a controlled conversion workflow.

Do not simply update the lead status.

Collect the additional solar project information.

### Customer Information

```typescript
Customer {
  _id: ObjectId;

  customerCode: string;

  sourceLead: ObjectId;

  customerName: string;
  mobileNumber: string;
  alternateNumber?: string;

  branch: ObjectId;

  state: ObjectId;
  district: ObjectId;

  blockOrTehsil?: string;

  siteAddress: string;

  requiredCapacityKW: number;

  ratePerKW: number;

  paymentMode: string;

  panelBrand: string;

  panelTechnology: string;

  status: string;

  creatorId: ObjectId;

  createdAt: Date;
  updatedAt: Date;

  updatedBy: ObjectId;
}
```

### Required Documents

Collect:

1. PAN Card
2. Aadhaar Card
3. Electricity Bill
4. Bank Passbook

Create a separate CustomerDocument collection.

```typescript
CustomerDocument {
  _id: ObjectId;

  customer: ObjectId;

  documentType: string;

  fileName: string;

  s3Key: string;

  mimeType: string;

  fileSize: number;

  uploadedBy: ObjectId;

  uploadedAt: Date;

  verificationStatus: string;
}
```

Upload documents to private AWS S3 storage.

Important security requirements:

- Do not use public S3 buckets.
- Use private object access.
- Generate short-lived presigned URLs.
- Verify file type and size.
- Do not trust file extensions.
- Restrict document access to authorized employees.
- Avoid exposing permanent S3 URLs.

Because Aadhaar and PAN are sensitive identity documents, implement strict access controls, encryption where appropriate, audit logs, data retention policies, and applicable Indian data-protection requirements.

### Conversion Transaction

Implement a reliable conversion service.

When conversion is successful:

1. Create the customer.
2. Link the customer with the original lead.
3. Update the lead status to CONVERTED.
4. Save conversion history.
5. Preserve all lead information.
6. Preserve all status history.
7. Preserve all visits.
8. Make the customer visible in the customer module.

Use MongoDB transactions where supported by the deployment configuration.

Handle duplicate conversion requests idempotently.

A lead should not create multiple customers accidentally.

### Customer Page

Create APIs so the frontend can show:

- Complete customer profile.
- Solar project information.
- Uploaded documents.
- Document verification status.
- Original lead details.
- Lead status history.
- Complete site visit history.
- Follow-up history.
- Created By.
- Updated By.
- Customer activity timeline.

Upline employees should see all customer information belonging to their downline.

---

# 12. QUOTATION AND BROCHURE MANAGEMENT

Implement a quotation module.

When a lead reaches QUOTATION_SENT status, provide functionality to generate a quotation.

Do not confuse QUOTATION_SENT with CONVERTED.

The lead becomes a customer only after the CONVERTED workflow succeeds.

### Quotation Information

Include:

- Company Name: Sunvika Private Limited
- Customer Name
- Customer Mobile
- Site Address
- Required Capacity (kW)
- Rate Per kW
- Total Project Amount
- Payment Mode
- Panel Brand
- Panel Technology
- Quotation Date
- Quotation Number
- Terms and Conditions
- Authorized Company Details

Calculate total project value using:

```text
Total Amount = Required Capacity (kW) × Rate Per kW
```

Design a reusable PDF quotation template.

Support:

- PDF generation.
- Quotation history.
- Unique quotation numbers.
- Download quotation.
- Generate brochure PDF.
- Store generated PDFs in S3.
- Maintain quotation versions.

### WhatsApp Sharing

Provide a WhatsApp sharing option.

Use WhatsApp Click-to-Chat with a properly encoded message and an authorized quotation/brochure link.

Example:

```text
https://wa.me/<mobileNumber>?text=<encodedMessage>
```

Provide options to:

- Share quotation.
- Share brochure.
- Share quotation and brochure together.

Do not claim that a message has been delivered merely because a WhatsApp link was opened.

For automated WhatsApp delivery in the future, keep the architecture ready for WhatsApp Business Cloud API integration.

Record sharing activity where possible.

---

# 13. DASHBOARD AND ANALYTICS

Every role must use the same frontend application.

The backend should return role-specific dashboard information based on permissions and hierarchy.

Do not create separate authentication systems for different roles.

### MD Dashboard

Show:

- Total Employees
- Total BDO
- Total MH
- Total DC
- Total RM
- Total CP
- Total Leads
- Total Customers
- Pending Leads
- Interested Leads
- Follow-ups
- Converted Leads
- Lost Leads
- Total Solar Capacity (kW)
- Total Quotation Value
- Branch-wise Performance
- State-wise Performance
- District-wise Performance
- Employee Performance
- Lead Conversion Rate

### BDO Dashboard

Show information for their own hierarchy.

### MH Dashboard

Show information for their downline.

### DC Dashboard

Show information for their downline.

### RM Dashboard

Show their CP employees and their performance.

### CP Dashboard

Show only personal information:

- My Leads
- My Customers
- Pending Leads
- Interested Leads
- Follow-ups
- Overdue Follow-ups
- Site Visits
- Converted Leads
- Lost Leads
- Quotation Sent

### Admin Head Dashboard

Show all authorized lead and customer information across the organization.

### Dashboard Filters

Provide reusable filtering functionality:

- Date Range
- Branch
- State
- District
- MH
- DC
- RM
- CP
- Lead Status
- Customer Status

Filters must respect the logged-in employee's hierarchy.

For example, an RM should not be able to filter for another unrelated RM's records.

Use optimized MongoDB aggregation pipelines for dashboard statistics.

Avoid unnecessary database queries.

---

# 14. AUTHENTICATION AND SESSION MANAGEMENT

Implement a secure authentication system.

### APIs

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh-token
POST /api/v1/auth/set-password
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:sessionId
```

### Security Requirements

- Hash passwords using Argon2id or bcrypt.
- Short-lived access tokens.
- Rotating refresh tokens.
- Refresh token stored securely.
- Refresh token reuse detection.
- Token revocation on logout.
- Secure HTTP-only cookies where applicable.
- Login rate limiting.
- Account activation/deactivation.
- Login attempt tracking.
- Prevent brute-force attacks.
- Validate all authentication inputs.
- Never expose password hashes or tokens in responses.

Implement proper session management.

---

# 15. COMPLETE SECURITY IMPLEMENTATION

Security is mandatory.

Implement security at the application, API, database, and file-storage levels.

### HTTP Security

- Helmet.
- Strict CORS allowlist.
- Content Security Policy where applicable.
- Request size limits.
- HTTP method restrictions.
- Secure cookie configuration.
- HPP protection.
- Rate limiting.

### Input Security

- Joi validation on every input.
- MongoDB operator injection protection.
- Safe query construction.
- Output encoding where required.
- Prevent mass assignment.
- Strict DTOs.
- File upload validation.

### Authentication Security

- Secure password hashing.
- JWT validation.
- Refresh token rotation.
- Session revocation.
- Secure password reset.
- Secure invitation links.

### Authorization Security

- RBAC.
- Hierarchical authorization.
- Resource-level access control.
- Ownership validation.
- Prevent IDOR vulnerabilities.
- Prevent privilege escalation.
- Never trust role, creatorId, reportingTo, or hierarchyPath from the frontend.

### Database Security

- Environment-based database credentials.
- Least-privilege database user.
- Proper indexing.
- Secure MongoDB connection.
- Avoid logging sensitive database information.
- Prevent unauthorized database access.

### File Security

- Private S3 buckets.
- Presigned URLs.
- MIME type validation.
- File size limits.
- Safe file names.
- Restrict permitted document formats.
- Audit file access.
- Never expose private documents publicly.

### Sensitive Information

Never log:

- Passwords.
- JWT tokens.
- Refresh tokens.
- SMTP credentials.
- AWS credentials.
- Aadhaar numbers.
- PAN numbers.
- Bank account information.
- Sensitive uploaded document contents.

Use data minimization and appropriate encryption for sensitive information.

---

# 16. LOGGING AND AUDIT TRAIL

Implement two separate logging systems.

### Application Logging

Use Pino or Winston.

Log:

- Incoming requests.
- API response time.
- HTTP status codes.
- Exceptions.
- Database errors.
- Authentication failures.
- External service failures.

Include:

- Timestamp.
- Request ID.
- Method.
- Endpoint.
- Status code.
- Execution time.
- User ID where available.

Use log rotation and production-appropriate log retention.

### Audit Logging

Create an AuditLog collection.

Record important business activities:

- Employee created.
- Employee updated.
- Employee deactivated.
- Role created.
- Permission updated.
- Lead created.
- Lead status changed.
- Lead converted.
- Customer updated.
- Document uploaded.
- Document accessed.
- Quotation generated.
- Quotation shared.
- Geography updated.

Audit logs must include:

```typescript
AuditLog {
  action: string;
  module: string;

  performedBy: ObjectId;

  resourceType: string;
  resourceId: ObjectId;

  oldValue?: object;
  newValue?: object;

  ipAddress?: string;
  userAgent?: string;

  requestId?: string;

  createdAt: Date;
}
```

Avoid storing sensitive document contents or unnecessary personal information in audit logs.

Audit records should be protected against unauthorized modification and deletion.

---

# 17. API RESPONSE STRUCTURE

Every API must follow a consistent response structure.

Success:

```json
{
  "success": true,
  "message": "Employee created successfully",
  "data": {},
  "meta": null
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "mobileNumber",
      "message": "Invalid mobile number"
    }
  ],
  "meta": null
}
```

Pagination:

```json
{
  "success": true,
  "message": "Leads fetched successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Use appropriate HTTP status codes.

Never return internal stack traces in production.

---

# 18. API MODULES

Create complete REST APIs for the following modules.

### Authentication

- Login
- Logout
- Refresh token
- Password setup
- Forgot password
- Reset password
- Current user
- Sessions

### Employee Management

- Create employee
- Update employee
- Get employee
- Get all accessible employees
- Get downline employees
- Get reporting hierarchy
- Activate employee
- Deactivate employee
- Resend invitation
- Change reporting manager where permitted

### Role Management

- Create role
- Update role
- Get roles
- Assign permissions
- Remove permissions
- Configure allowed child roles
- Activate/deactivate role

### Geography Management

- Create state
- Create district
- Create branch
- Update state
- Update district
- Update branch
- Get states
- Get districts by state
- Get branches by district

### Lead Management

- Create lead
- Get leads
- Get lead by ID
- Update lead
- Change lead status
- Assign lead where permitted
- Get lead history
- Get follow-ups
- Get overdue follow-ups
- Get lead statistics

### Visit Management

- Create visit
- Get visit history
- Update permitted visit details
- Get visits by lead
- Get visits by employee

### Customer Management

- Convert lead into customer
- Get customers
- Get customer by ID
- Update customer
- Upload documents
- Get customer documents
- Verify documents
- Get customer timeline

### Quotation Management

- Generate quotation
- Generate brochure
- Get quotations
- Get quotation by ID
- Download quotation
- Share quotation
- Record sharing activity

### Dashboard and Reports

- Dashboard summary
- Employee performance
- Branch performance
- District performance
- Lead conversion reports
- Customer reports
- Follow-up reports
- Quotation reports

### AMC Module

Prepare an extensible AMC module for solar customers.

Design it to support:

- AMC registration.
- AMC start date.
- AMC expiry date.
- Contract amount.
- Maintenance schedule.
- Service history.
- Renewal status.
- Assigned maintenance employee.
- Upcoming AMC renewals.

Keep AMC independent from lead management while maintaining customer relationships.

---

# 19. DATABASE DESIGN AND PERFORMANCE

Create properly designed Mongoose schemas.

Requirements:

- Appropriate ObjectId references.
- Required fields.
- Enum validation.
- Schema-level validation.
- Timestamps.
- Compound indexes.
- Unique indexes.
- Text indexes where required.
- Soft deletion where appropriate.
- Pagination.
- Lean queries for read-heavy operations.
- Optimized aggregation pipelines.

Avoid unnecessarily embedding large histories in employee, lead, and customer documents.

Use separate collections for:

- Employees
- Roles
- Permissions
- States
- Districts
- Branches
- Leads
- LeadStatusHistory
- Customers
- CustomerDocuments
- Visits
- Quotations
- AuditLogs
- RefreshTokens
- Invitations
- PasswordResetTokens
- AMCContracts

Create a DATABASE.md documenting all relationships and indexes.

---

# 20. ENVIRONMENT CONFIGURATION

Create a complete `.env.example`.

Include:

```env
NODE_ENV=development
PORT=5000

API_PREFIX=/api/v1

MONGODB_URI=

JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=

JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=

FRONTEND_URL=
CORS_ORIGINS=

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=

AWS_S3_DOCUMENT_BUCKET=

LOG_LEVEL=debug

BCRYPT_SALT_ROUNDS=12

MAX_FILE_SIZE=
```

Validate environment variables at application startup.

Never hardcode credentials.

Do not commit `.env`.

Provide clear instructions for setting up AWS S3, Gmail SMTP, and MongoDB.

Use separate configurations for development, testing, and production.

---

# 21. FIRST MD CREATION — INITIAL BOOTSTRAP

There must be no public API that allows anyone to create an MD account.

Implement a secure bootstrap mechanism.

Requirements:

1. Developer executes a protected CLI script.
2. Script creates the initial MD.
3. Seed required system roles.
4. Seed required permissions.
5. Seed role hierarchy.
6. Assign MD all authorized system permissions.
7. Prevent duplicate MD creation.
8. Prevent the bootstrap script from being used to create additional MD accounts.

The initial MD credentials must be supplied securely through environment variables or an interactive CLI.

Never commit initial credentials.

All subsequent employee creation must follow the configured authorization and hierarchy rules.

---

# 22. TESTING REQUIREMENTS

Write unit, integration, and end-to-end tests.

Priority test cases:

### Authentication

- Valid login.
- Invalid login.
- Expired access token.
- Refresh token rotation.
- Logout.
- Password setup.
- Password reset.

### Hierarchy

- MD can access all downline data.
- BDO can access only their own hierarchy.
- MH can access only their own hierarchy.
- DC can access only their own hierarchy.
- RM can access their CP employees.
- CP cannot access another CP's data.
- Unrelated employees cannot access each other's resources.
- Circular reporting relationships are rejected.

### Admin Head

- MD can create Admin Head.
- BDO can create Admin Head.
- Other roles cannot create Admin Head.
- Admin Head can view authorized leads and customers.
- Admin Head cannot access unauthorized employee-management operations.

### Leads

- CP can create leads.
- Initial lead status is PENDING.
- Status history is recorded.
- Follow-up date is mandatory for NEED_FOLLOWUP.
- Site visit history is preserved.
- Unauthorized employees cannot update leads.

### Customer Conversion

- Valid conversion creates one customer.
- Original lead remains linked.
- All history remains available.
- Duplicate conversion is prevented.
- Missing required conversion data is rejected.

### Documents

- Valid documents upload to private S3.
- Invalid file types are rejected.
- Unauthorized document access is rejected.
- Presigned URLs expire.

### Roles and Permissions

- MD can configure roles.
- Unauthorized roles cannot grant themselves permissions.
- Dynamic permissions do not bypass hierarchy restrictions.

---

# 23. DEVELOPMENT AND IMPLEMENTATION STRATEGY

Do not attempt to implement the entire project in one unstructured code-generation operation.

Work in clearly defined phases.

### Phase 1 — Foundation

- Project setup.
- TypeScript configuration.
- Folder structure.
- Environment validation.
- MongoDB connection.
- Express application.
- Global error handling.
- Logger.
- Security middleware.
- Swagger.

### Phase 2 — Authentication

- Employee model.
- Login.
- JWT.
- Refresh tokens.
- Logout.
- Password hashing.
- Email integration.
- Invitation workflow.

### Phase 3 — Organization and Hierarchy

- Role model.
- Permission model.
- Employee management.
- Hierarchy service.
- Dynamic RBAC.
- Admin Head role.
- First MD bootstrap.

### Phase 4 — Geography

- State management.
- District management.
- Branch management.
- Dependent dropdown APIs.

### Phase 5 — Lead Management

- Lead model.
- Lead CRUD.
- Lead statuses.
- Status history.
- Follow-ups.
- Hierarchical access.

### Phase 6 — Visit Management

- Visit records.
- Visit timeline.
- Follow-up tracking.

### Phase 7 — Customer Management

- Conversion workflow.
- Customer model.
- S3 documents.
- Document access.
- Customer history.

### Phase 8 — Quotations

- PDF generation.
- Brochure.
- Quotation history.
- WhatsApp sharing.

### Phase 9 — Dashboards and Reports

- Role-based dashboard.
- Aggregation pipelines.
- Filters.
- Employee performance.
- Branch and district reports.

### Phase 10 — AMC

- AMC contracts.
- Maintenance schedules.
- Renewals.
- Service history.

### Phase 11 — Testing and Production Readiness

- Unit tests.
- Integration tests.
- Security testing.
- Performance optimization.
- Docker.
- Deployment documentation.

---

# 24. STRICT CODEX INSTRUCTIONS

Follow these instructions throughout development.

1. First inspect the existing repository before modifying anything.
2. If the repository is empty, initialize the project properly.
3. Before implementation, prepare ARCHITECTURE.md and DATABASE.md.
4. Explain the proposed architecture and important design decisions.
5. Implement one phase at a time.
6. Do not skip phases.
7. Do not create unnecessary files.
8. Do not duplicate business logic.
9. Never write complex business logic inside controllers.
10. Use TypeScript strict mode.
11. Avoid `any` wherever possible.
12. Use proper interfaces, DTOs, and types.
13. Validate all request parameters, query parameters, and request bodies.
14. Use centralized error handling.
15. Implement authorization in reusable middleware and services.
16. Never trust frontend-supplied hierarchy information.
17. Never expose private S3 URLs.
18. Never store plaintext passwords or tokens.
19. Do not leave security-sensitive TODOs or fake implementations.
20. Write tests for critical business logic.
21. Run TypeScript compilation, linting, and tests after each phase.
22. Fix errors before moving to the next phase.
23. Update README.md and API documentation as implementation progresses.
24. Keep the implementation aligned with actual business requirements.
25. Do not silently change business rules. Ask questions when a requirement is genuinely ambiguous.

### IMPORTANT ARCHITECTURAL EXPECTATION

The most critical requirement is that the application must understand the complete organizational hierarchy.

Every employee should see information according to:

- Their assigned permissions.
- Their reporting position.
- Their organizational hierarchy.
- Their resource ownership.
- Their assigned branch or organizational scope.

Implement this as a centralized and reusable authorization architecture.

Do not write separate hierarchy queries in every controller.

Create reusable hierarchy-aware repository methods and authorization policies.

The final backend must be secure, maintainable, scalable, well-documented, testable, and ready for frontend integration.

**Start by inspecting the repository, preparing the architecture, defining the database relationships, and presenting Phase 1 implementation steps. Do not generate the entire backend in a single response.**