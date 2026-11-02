import assert from 'node:assert/strict';
import test from 'node:test';
import { createContractSchema } from '../dist/modules/amc/validations/amc.validation.js';
import { auditListSchema } from '../dist/modules/audit/validations/audit.validation.js';
import { analyticsFilterSchema } from '../dist/modules/analytics/validations/analytics.validation.js';
import { loginSchema, tokenPasswordSchema } from '../dist/modules/auth/validations/auth.validation.js';
import { createEmployeeSchema } from '../dist/modules/employees/validations/employee.validation.js';
import { changeLeadStatusSchema, followUpQuerySchema, leadListQuerySchema } from '../dist/modules/leads/validations/lead.validation.js';
import { visitQuerySchema } from '../dist/modules/visits/validations/visit.validation.js';
import { quotationListQuerySchema } from '../dist/modules/quotations/validations/quotation.validation.js';
import { createOpaqueToken, hashToken } from '../dist/utils/token.util.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sunvika_phase12_test';
process.env.JWT_ACCESS_SECRET = 'phase-twelve-unit-test-secret-at-least-32-characters';
process.env.FRONTEND_URL = 'http://localhost:3000';
const { resolveAuditResourceId } = await import('../dist/middleware/audit.middleware.js');
const { canAccessEmployeeByPolicy, canAccessOwnedResourceByPolicy } = await import('../dist/modules/employees/services/hierarchy-policy.js');
const { convertLeadSchema, createLeadConversionUploadsSchema, customerListQuerySchema } = await import('../dist/modules/customers/validations/customer.validation.js');

test('opaque tokens are URL-safe, high entropy, and hashed with SHA-256', () => {
  const token = createOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{64}$/);
  assert.match(hashToken(token), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), hashToken(createOpaqueToken()));
});

test('login validation normalizes email and rejects malformed credentials', () => {
  const valid = loginSchema.validate({ email: '  USER@EXAMPLE.COM ', password: 'secret' });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.email, 'user@example.com');
  assert.ok(loginSchema.validate({ email: 'not-an-email', password: '' }).error);
});

test('password setup requires a valid opaque token and strong password', () => {
  assert.equal(tokenPasswordSchema.validate({ token: createOpaqueToken(), password: 'LongPassword123' }).error, undefined);
  assert.ok(tokenPasswordSchema.validate({ token: 'bad token', password: 'LongPassword123' }).error);
  assert.ok(tokenPasswordSchema.validate({ token: createOpaqueToken(), password: 'weak' }).error);
});

test('employee creation normalizes manual employee codes and rejects invalid formats', () => {
  const employee = {
    employeeCode: ' svk-emp_001 ',
    firstName: 'Sun',
    lastName: 'Vika',
    email: 'employee@example.com',
    mobileNumber: '+919876543210',
    roleCode: 'RM',
    address: {
      addressLine: '1 Main Road',
      state: '0123456789abcdef01234567',
      district: '1123456789abcdef01234567'
    }
  };
  const normalized = createEmployeeSchema.validate(employee);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.value.employeeCode, 'SVK-EMP_001');
  assert.equal(createEmployeeSchema.validate({ ...employee, employeeCode: 'X' }).error !== undefined, true);
  assert.equal(createEmployeeSchema.validate({ ...employee, employeeCode: 'SVK EMP 001' }).error !== undefined, true);
  const { employeeCode: _employeeCode, ...legacyEmployee } = employee;
  assert.equal(createEmployeeSchema.validate(legacyEmployee).error, undefined);
});

test('quotation details are optional only for leads entering quotation stage', () => {
  const quotation = {
    requiredCapacityKW: 5,
    ratePerKW: 42000,
    paymentMode: 'Bank transfer',
    panelBrand: 'Sunvika',
    panelTechnology: 'Mono PERC',
    termsAndConditions: 'Valid for 30 days.'
  };
  assert.equal(changeLeadStatusSchema.validate({ status: 'QUOTATION_SENT', remark: 'Ready to quote' }).error, undefined);
  assert.equal(changeLeadStatusSchema.validate({ status: 'QUOTATION_SENT', remark: 'Ready to quote', quotation }).error, undefined);
  assert.ok(changeLeadStatusSchema.validate({ status: 'INTERESTED', remark: 'Interested', quotation }).error);
  assert.ok(changeLeadStatusSchema.validate({
    status: 'QUOTATION_SENT',
    remark: 'Ready to quote',
    quotation: { ...quotation, termsAndConditions: 'short' }
  }).error);
});

test('lead conversion requires exactly one upload reservation for each mandatory customer document', () => {
  const documentUploadIds = [
    '0123456789abcdef01234567',
    '1123456789abcdef01234567',
    '2123456789abcdef01234567',
    '3123456789abcdef01234567'
  ];
  const conversion = {
    requiredCapacityKW: 5,
    ratePerKW: 42000,
    paymentMode: 'Bank transfer',
    panelBrand: 'Sunvika',
    panelTechnology: 'Mono PERC',
    remark: 'Documents received',
    documentUploadIds
  };
  assert.equal(convertLeadSchema.validate(conversion).error, undefined);
  assert.ok(convertLeadSchema.validate({ ...conversion, documentUploadIds: documentUploadIds.slice(0, 3) }).error);
  assert.ok(convertLeadSchema.validate({ ...conversion, documentUploadIds: [...documentUploadIds.slice(0, 3), documentUploadIds[0]] }).error);

  const documents = ['PAN', 'AADHAAR', 'ELECTRICITY_BILL', 'BANK_PASSBOOK'].map((documentType) => ({
    documentType,
    fileName: `${documentType}.pdf`,
    mimeType: 'application/pdf',
    fileSize: 1024
  }));
  assert.equal(createLeadConversionUploadsSchema.validate({ documents }).error, undefined);
  assert.ok(createLeadConversionUploadsSchema.validate({ documents: documents.slice(0, 3) }).error);
  assert.ok(createLeadConversionUploadsSchema.validate({ documents: [...documents.slice(0, 3), { ...documents[3], documentType: 'PAN' }] }).error);
});

test('record list filters accept branch, date range, and employee name while rejecting reversed dates', () => {
  const filters = {
    branchId: '0123456789abcdef01234567',
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    employeeName: 'District Coordinator'
  };
  for (const schema of [leadListQuerySchema, followUpQuerySchema, visitQuerySchema, quotationListQuerySchema, customerListQuerySchema]) {
    assert.equal(schema.validate(filters).error, undefined);
    assert.ok(schema.validate({ ...filters, dateFrom: '2026-02-01', dateTo: '2026-01-31' }).error);
    assert.ok(schema.validate({ ...filters, unexpectedScope: 'untrusted' }).error);
  }
});

test('AMC contract validation requires a customer, positive amount, and ordered dates', () => {
  const valid = createContractSchema.validate({ customerId: '0123456789abcdef01234567', startDate: '2026-01-01', expiryDate: '2027-01-01', amount: 12500 });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.currency, 'INR');
  assert.ok(createContractSchema.validate({ customerId: 'bad', startDate: '2026-01-02', expiryDate: '2026-01-01', amount: 0 }).error);
});

test('analytics filters reject multiple employee selectors, reversed dates, and caller-supplied scope', () => {
  const valid = analyticsFilterSchema.validate({ cpId: '0123456789abcdef01234567', dateFrom: '2026-01-01', dateTo: '2026-01-31' });
  assert.equal(valid.error, undefined);
  assert.ok(analyticsFilterSchema.validate({ cpId: '0123456789abcdef01234567', rmId: '0123456789abcdef01234568' }).error);
  assert.ok(analyticsFilterSchema.validate({ dateFrom: '2026-02-01', dateTo: '2026-01-01' }).error);
  assert.ok(analyticsFilterSchema.validate({ creatorId: '0123456789abcdef01234567' }).error);
});

test('audit resource resolution accepts canonical resource IDs and ignores caller ownership fields', () => {
  const responseId = '0123456789abcdef01234567';
  const pathId = '1123456789abcdef01234567';
  assert.equal(resolveAuditResourceId({}, {}, { _id: responseId })?.toString(), responseId);
  assert.equal(resolveAuditResourceId({ customerId: pathId }, {}, {}).toString(), pathId);
  assert.equal(resolveAuditResourceId({}, { creatorId: responseId }, {}), null);
});

test('audit listing filters validate dates, ObjectIds, and pagination bounds', () => {
  assert.equal(auditListSchema.validate({ module: 'LEADS', page: 1, limit: 50 }).value.module, 'leads');
  assert.ok(auditListSchema.validate({ performedBy: 'invalid' }).error);
  assert.ok(auditListSchema.validate({ dateFrom: '2026-04-01', dateTo: '2026-03-01' }).error);
  assert.ok(auditListSchema.validate({ limit: 101 }).error);
});

test('hierarchy employee policy allows only self, downline, and explicit MD access', () => {
  const base = { actorId: 'actor', actorRoleCode: 'CP', actorRoleCategory: 'PRIMARY', targetId: 'other', targetRoleCategory: 'PRIMARY', targetCreatorIsInActorHierarchy: false, targetHierarchyPath: [] };
  assert.equal(canAccessEmployeeByPolicy({ ...base, targetId: 'actor' }), true);
  assert.equal(canAccessEmployeeByPolicy({ ...base, targetHierarchyPath: ['root', 'actor'] }), true);
  assert.equal(canAccessEmployeeByPolicy(base), false);
  assert.equal(canAccessEmployeeByPolicy({ ...base, actorRoleCode: 'MD', targetRoleCategory: 'ADMIN_HEAD' }), true);
});

test('Admin Head employee visibility is restricted to BDO-created accounts in its downline', () => {
  const base = { actorId: 'bdo', actorRoleCode: 'BDO', actorRoleCategory: 'PRIMARY', targetId: 'admin', targetRoleCategory: 'ADMIN_HEAD', targetCreatorIsInActorHierarchy: false, targetHierarchyPath: [] };
  assert.equal(canAccessEmployeeByPolicy(base), false);
  assert.equal(canAccessEmployeeByPolicy({ ...base, targetCreatorIsInActorHierarchy: true }), true);
  assert.equal(canAccessEmployeeByPolicy({ ...base, actorRoleCode: 'MH', targetCreatorIsInActorHierarchy: true }), false);
  assert.equal(canAccessEmployeeByPolicy({ ...base, actorRoleCategory: 'ADMIN_HEAD', targetCreatorIsInActorHierarchy: true }), false);
});

test('resource policy limits primary employees to self or hierarchy owners', () => {
  const base = { actorId: 'cp', actorRoleCode: 'CP', actorRoleCategory: 'PRIMARY', ownerId: 'other', ownerIsInActorHierarchy: false, resourceType: 'lead' };
  assert.equal(canAccessOwnedResourceByPolicy(base), false);
  assert.equal(canAccessOwnedResourceByPolicy({ ...base, ownerIsInActorHierarchy: true }), true);
  assert.equal(canAccessOwnedResourceByPolicy({ ...base, ownerId: 'cp' }), true);
  assert.equal(canAccessOwnedResourceByPolicy({ ...base, actorRoleCode: 'MD' }), true);
  assert.equal(canAccessOwnedResourceByPolicy({ ...base, actorRoleCategory: 'ADMIN_HEAD', resourceType: 'customer' }), true);
});
