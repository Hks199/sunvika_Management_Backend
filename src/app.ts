import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.config.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { notFoundMiddleware } from './middleware/not-found.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { apiRouter } from './routes/index.js';
import { logger } from './services/logger.service.js';
import { auditMiddleware } from './middleware/audit.middleware.js';

const app = express();
const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Sunvika Management API',
    version: '1.0.0',
    description: 'Versioned API for Sunvika office and solar business management.'
  },
  servers: [{ url: env.apiPrefix }],
  paths: {
    '/health': {
      get: {
        summary: 'Check API and database readiness',
        responses: { '200': { description: 'API is ready' }, '503': { description: 'Database is unavailable' } }
      }
    },
    '/auth/login': { post: { summary: 'Sign in', responses: { '200': { description: 'Signed in; refresh token is set as an HTTP-only cookie' }, '401': { description: 'Invalid credentials' } } } },
    '/auth/logout': { post: { summary: 'Revoke the current session', responses: { '200': { description: 'Signed out' } } } },
    '/auth/refresh-token': { post: { summary: 'Rotate refresh token', responses: { '200': { description: 'New access token issued' } } } },
    '/auth/set-password': { post: { summary: 'Complete an employee invitation', responses: { '200': { description: 'Password set' } } } },
    '/auth/forgot-password': { post: { summary: 'Request password reset instructions', responses: { '202': { description: 'Request accepted' } } } },
    '/auth/reset-password': { post: { summary: 'Reset password with a single-use link', responses: { '200': { description: 'Password reset' } } } },
    '/auth/me': { get: { summary: 'Get current employee', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Employee profile' } } } },
    '/auth/sessions': { get: { summary: 'List active sessions', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Active sessions' } } } },
    '/auth/sessions/{sessionId}': { delete: { summary: 'Revoke a session', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'sessionId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Session revoked' } } } },
    '/employees': { get: { summary: 'List accessible employees', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Accessible employees' } } }, post: { summary: 'Create an authorized downline employee', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Employee created; onboarding status is included' } } } },
    '/employees/creatable-roles': { get: { summary: 'List roles the current employee can assign to new employees', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Available employee roles' } } } },
    '/employees/{employeeId}': { get: { summary: 'Get an accessible employee', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Employee' } } }, patch: { summary: 'Update an accessible employee', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated employee' } } } },
    '/employees/{employeeId}/hierarchy': { get: { summary: 'Get reporting chain', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Reporting chain' } } } },
    '/employees/{employeeId}/profile-image-url': { get: { summary: 'Get a short-lived private profile image URL', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Private image URL' } } } },
    '/employees/profile-image-upload': { post: { summary: 'Reserve a profile image upload', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Profile image upload reservation' } } } },
    '/employees/profile-image-upload/{uploadId}': { put: { summary: 'Upload a profile image through the authenticated API', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'uploadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Profile image uploaded' } } } },
    '/employees/profile-image-upload-url': { post: { summary: 'Create a short-lived profile image upload URL', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Presigned S3 upload URL' } } } },
    '/employees/{employeeId}/reporting-manager': { patch: { summary: 'Change reporting manager with cycle checks', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Reporting manager changed' } } } },
    '/employees/{employeeId}/activate': { post: { summary: 'Activate an accessible employee', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Employee activated' } } } },
    '/employees/{employeeId}/deactivate': { post: { summary: 'Deactivate an accessible employee', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Employee deactivated' } } } },
    '/employees/{employeeId}/resend-invitation': { post: { summary: 'Resend onboarding invitation', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Invitation delivery status' } } } },
    '/employees/downline': { get: { summary: 'List downline employees', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Downline employees' } } } },
    '/geography/states': { get: { summary: 'List active states', responses: { '200': { description: 'States' } } }, post: { summary: 'Create a state (MD only)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'State created' } } } },
    '/geography/states/{stateId}': { patch: { summary: 'Update a state (MD only)', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'stateId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'State updated' } } } },
    '/geography/states/{stateId}/districts': { get: { summary: 'List active districts in a state', parameters: [{ in: 'path', name: 'stateId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Districts' } } } },
    '/geography/districts': { post: { summary: 'Create a district (MD only)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'District created' } } } },
    '/geography/districts/{districtId}': { patch: { summary: 'Update a district (MD only)', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'districtId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'District updated' } } } },
    '/geography/districts/{districtId}/branches': { get: { summary: 'List active branches in a district', parameters: [{ in: 'path', name: 'districtId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Branches' } } } },
    '/geography/branches': { post: { summary: 'Create a branch (MD only)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Branch created' } } } },
    '/geography/branches/{branchId}': { patch: { summary: 'Update a branch (MD only)', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'branchId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Branch updated' } } } },
    '/leads': { get: { summary: 'List hierarchy-accessible leads', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated leads' } } }, post: { summary: 'Create a lead', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Lead created' } } } },
    '/leads/follow-ups': { get: { summary: 'List upcoming lead follow-ups', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Upcoming follow-ups' } } } },
    '/leads/follow-ups/overdue': { get: { summary: 'List overdue lead follow-ups', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Overdue follow-ups' } } } },
    '/leads/{leadId}': { get: { summary: 'Get an accessible lead', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Lead details' } } }, patch: { summary: 'Update an accessible lead', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Lead updated' } } } },
    '/leads/{leadId}/history': { get: { summary: 'Get lead status history', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Status history' } } } },
    '/leads/{leadId}/status': { patch: { summary: 'Change lead status', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Status updated' } } } },
    '/leads/{leadId}/assignment': { patch: { summary: 'Assign a lead within the authorized hierarchy', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Lead assigned' } } } },
    '/visits': { get: { summary: 'List visits for accessible leads', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated visits' } } }, post: { summary: 'Record a site visit', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Visit recorded' } } } },
    '/visits/follow-ups': { get: { summary: 'List upcoming visit follow-ups', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Upcoming visit follow-ups' } } } },
    '/visits/follow-ups/overdue': { get: { summary: 'List overdue visit follow-ups', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Overdue visit follow-ups' } } } },
    '/visits/leads/{leadId}': { get: { summary: 'List visits for an accessible lead', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Lead visit history' } } } },
    '/visits/employees/{employeeId}': { get: { summary: 'List visits by an accessible employee', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Employee visit history' } } } },
    '/visits/{visitId}': { get: { summary: 'Get an accessible visit', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'visitId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Visit details' } } }, patch: { summary: 'Update an accessible visit', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'visitId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Visit updated' } } } },
    '/customers': { get: { summary: 'List hierarchy-accessible customers', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated customers' } } } },
    '/customers/from-lead/{leadId}/document-upload-urls': { post: { summary: 'Reserve uploads for all required lead-conversion documents', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Upload reservations for PAN, Aadhaar, electricity bill, and bank passbook' } } } },
    '/customers/from-lead/{leadId}/document-uploads/{uploadId}': { put: { summary: 'Upload a lead-conversion document through the authenticated API', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }, { in: 'path', name: 'uploadId', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } }, 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } }, 'image/webp': { schema: { type: 'string', format: 'binary' } } } }, responses: { '200': { description: 'Document uploaded to private storage' } } } },
    '/customers/from-lead/{leadId}': { post: { summary: 'Convert a lead after verifying all four required customer documents', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'leadId', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Customer and verified required documents created' } } } },
    '/customers/{customerId}': { get: { summary: 'Get an accessible customer profile', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Customer profile' } } }, patch: { summary: 'Update an accessible customer', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Customer updated' } } } },
    '/customers/{customerId}/timeline': { get: { summary: 'Get combined customer activity timeline', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Customer timeline' } } } },
    '/customers/{customerId}/documents': { get: { summary: 'List customer document metadata', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Customer documents' } } } },
    '/customers/{customerId}/documents/upload-url': { post: { summary: 'Create a private document upload URL', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Upload URL and upload ID' } } } },
    '/customers/{customerId}/documents/complete': { post: { summary: 'Verify and complete a document upload', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Document upload completed' } } } },
    '/customers/{customerId}/documents/{documentId}/download-url': { get: { summary: 'Get an authorized short-lived document URL', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }, { in: 'path', name: 'documentId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Short-lived download URL' } } } },
    '/customers/{customerId}/documents/{documentId}/verification': { patch: { summary: 'Verify or reject a customer document', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'customerId', required: true, schema: { type: 'string' } }, { in: 'path', name: 'documentId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Verification status updated' } } } },
    '/quotations': { get: { summary: 'List accessible quotation history', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated quotations' } } }, post: { summary: 'Generate a versioned quotation PDF', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Quotation created' } } } },
    '/quotations/brochures': { post: { summary: 'Generate a company brochure PDF', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Brochure generated' } } } },
    '/quotations/brochures/{brochureId}/download-url': { get: { summary: 'Get a short-lived brochure download URL', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'brochureId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Short-lived download URL' } } } },
    '/quotations/brochures/{brochureId}/share': { post: { summary: 'Create a WhatsApp brochure share link', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'brochureId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Expiring share link; message is not sent' } } } },
    '/quotations/{quotationId}': { get: { summary: 'Get an accessible quotation snapshot', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Quotation' } } } },
    '/quotations/{quotationId}/download-url': { get: { summary: 'Get a short-lived quotation download URL', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Short-lived download URL' } } } },
    '/quotations/{quotationId}/file': {
      get: {
        summary: 'Download an accessible quotation PDF',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Quotation PDF file',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
          }
        }
      }
    },
    '/quotations/{quotationId}/shares': { get: { summary: 'List quotation share activity', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Share activity' } } } },
    '/quotations/{quotationId}/share': { post: { summary: 'Create an expiring WhatsApp quotation share link', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Expiring share link; message is not sent' } } } },
    '/public/shares/{token}': { get: { summary: 'Resolve a time-limited public share token', parameters: [{ in: 'path', name: 'token', required: true, schema: { type: 'string' } }], responses: { '302': { description: 'Redirect to a short-lived private file URL' }, '404': { description: 'Share token is invalid or expired' } } } },
    '/dashboard/summary': { get: { summary: 'Get hierarchy-scoped dashboard metrics', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Dashboard summary' } } } },
    '/reports/employee-performance': { get: { summary: 'Report employee performance', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Employee performance report' } } } },
    '/reports/branch-performance': { get: { summary: 'Report branch performance', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Branch performance report' } } } },
    '/reports/district-performance': { get: { summary: 'Report district performance', security: [{ bearerAuth: [] }], responses: { '200': { description: 'District performance report' } } } },
    '/reports/state-performance': { get: { summary: 'Report state performance', security: [{ bearerAuth: [] }], responses: { '200': { description: 'State performance report' } } } },
    '/reports/lead-conversion': { get: { summary: 'Report lead conversion by status', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Lead conversion report' } } } },
    '/reports/customers': { get: { summary: 'Report hierarchy-scoped customers', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Customer report' } } } },
    '/reports/follow-ups': { get: { summary: 'Report hierarchy-scoped follow-ups', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Follow-up report' } } } },
    '/reports/quotations': { get: { summary: 'Report hierarchy-scoped quotations', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Quotation report' } } } },
    '/amc': { get: { summary: 'List accessible AMC contracts', security: [{ bearerAuth: [] }], responses: { '200': { description: 'AMC contracts' } } }, post: { summary: 'Register an AMC contract', security: [{ bearerAuth: [] }], responses: { '201': { description: 'AMC contract registered' } } } },
    '/amc/renewals/upcoming': { get: { summary: 'List upcoming AMC renewals', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Upcoming renewals' } } } },
    '/amc/schedules/upcoming': { get: { summary: 'List upcoming maintenance schedules', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Upcoming maintenance' } } } },
    '/amc/{contractId}': { get: { summary: 'Get a contract with schedules and service history', security: [{ bearerAuth: [] }], responses: { '200': { description: 'AMC contract details' } } } },
    '/amc/{contractId}/renew': { post: { summary: 'Renew an AMC contract', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Renewal contract registered' } } } },
    '/amc/{contractId}/cancel': { post: { summary: 'Cancel an AMC contract', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Contract cancelled' } } } },
    '/amc/{contractId}/renewal-status': { patch: { summary: 'Update AMC renewal status', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Renewal status updated' } } } },
    '/amc/{contractId}/schedules': { post: { summary: 'Schedule maintenance', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Maintenance scheduled' } } } },
    '/amc/{contractId}/schedules/{scheduleId}': { patch: { summary: 'Update a maintenance schedule', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Schedule updated' } } } },
    '/amc/{contractId}/service-history': { get: { summary: 'List AMC service history', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Service history' } } }, post: { summary: 'Record AMC service', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Service recorded' } } } },
    '/audit-logs': { get: { summary: 'List audit records (MD only)', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Audit log records' } } } },
    '/roles': { get: { summary: 'List roles (MD only)', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Roles' } } }, post: { summary: 'Create role (MD only)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Role created' } } } },
    '/roles/{roleId}': { patch: { summary: 'Update role permissions (MD only)', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Role updated' } } } },
    '/roles/permissions': { get: { summary: 'List permissions (MD only)', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Permissions' } } }, post: { summary: 'Create permission (MD only)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Permission created' } } } }
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
  }
};

app.disable('x-powered-by');
app.set('trust proxy', env.nodeEnv === 'production' ? 1 : false);
app.use(requestIdMiddleware);
app.use(pinoHttp({ logger, customProps: (_req, res) => ({ requestId: res.locals.requestId }) }));
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token']
}));
app.use(hpp());
app.use(express.json({ limit: env.jsonBodyLimit, strict: true }));
app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));
app.use(cookieParser());
app.use(rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many requests', errors: [], meta: null })
}));
app.use(auditMiddleware);

if (env.swaggerEnabled) {
  app.get('/api-docs/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
}
app.use(env.apiPrefix, apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
