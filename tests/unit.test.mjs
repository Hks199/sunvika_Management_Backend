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
    employeeName: 'Channel Partner Head'
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
  assert.equal(canAccessEmployeeByPolicy({ ...base, actorRoleCode: 'MD', targetId: 'another-md' }), true);
});

test('Admin Head employee visibility is restricted to MIS-created accounts in its downline', () => {
  const base = { actorId: 'mis', actorRoleCode: 'MIS', actorRoleCategory: 'PRIMARY', targetId: 'admin', targetRoleCategory: 'ADMIN_HEAD', targetCreatorIsInActorHierarchy: false, targetHierarchyPath: [] };
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


test('CP Head analytics selector accepts the new name and prevents mixed hierarchy selectors', () => {
  const employeeId = '0123456789abcdef01234567';
  assert.equal(analyticsFilterSchema.validate({ cpHeadId: employeeId }).error, undefined);
  assert.equal(analyticsFilterSchema.validate({ dcId: employeeId }).error, undefined);
  for (const selector of ['dcId', 'mhId', 'rmId', 'cpId']) {
    assert.ok(analyticsFilterSchema.validate({ cpHeadId: employeeId, [selector]: employeeId }).error);
  }
});

test('system role migration preserves role IDs and assignments and is safe to repeat', async (t) => {
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { migrateSystemRoleNames } = await import('../dist/modules/roles/services/role-name-migration.js');
  const roles = [
    { _id: 'mis-id', code: 'BDO', name: 'Business Development Officer', isSystemRole: true, permissions: ['p1'], parentRole: 'md-id' },
    { _id: 'head-id', code: 'DC', name: 'District Coordinator', isSystemRole: true, permissions: ['p2'], parentRole: 'mh-id' }
  ];
  t.mock.method(RoleModel, 'find', () => ({ select: () => ({ lean: async () => roles.map((role) => ({ ...role })) }) }));
  const update = t.mock.method(RoleModel, 'updateOne', async (filter, mutation) => {
    assert.deepEqual(Object.keys(mutation.$set).sort(), ['code', 'name']);
    Object.assign(roles.find((role) => role._id === filter._id && role.code === filter.code), mutation.$set);
    return { matchedCount: 1 };
  });
  await migrateSystemRoleNames();
  assert.deepEqual(roles.map(({ _id, code, name }) => ({ _id, code, name })), [
    { _id: 'mis-id', code: 'MIS', name: 'Management Information System' },
    { _id: 'head-id', code: 'CP_HEAD', name: 'Channel Partner Head' }
  ]);
  assert.deepEqual(roles.map(({ permissions, parentRole }) => ({ permissions, parentRole })), [
    { permissions: ['p1'], parentRole: 'md-id' }, { permissions: ['p2'], parentRole: 'mh-id' }
  ]);
  await migrateSystemRoleNames();
  assert.equal(update.mock.callCount(), 2);
});

test('role migration rejects conflicting or custom codes before making any updates', async (t) => {
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { migrateSystemRoleNames } = await import('../dist/modules/roles/services/role-name-migration.js');
  let roles = [];
  t.mock.method(RoleModel, 'find', () => ({ select: () => ({ lean: async () => roles }) }));
  const update = t.mock.method(RoleModel, 'updateOne', async () => { throw new Error('Unexpected update'); });
  for (const conflicting of [
    [{ code: 'DC', isSystemRole: true }, { code: 'CP_HEAD', isSystemRole: true }],
    [{ code: 'CP_HEAD', isSystemRole: false }],
    [{ code: 'DC', isSystemRole: false }]
  ]) {
    roles = [{ code: 'BDO', isSystemRole: true }, ...conflicting];
    await assert.rejects(migrateSystemRoleNames(), /conflicting role codes/);
    assert.equal(update.mock.callCount(), 0);
  }
  roles = [];
  await migrateSystemRoleNames();
  assert.equal(update.mock.callCount(), 0);
});

test('direct-MD hierarchy bypasses MIS/MH, rebuilds descendants and preserves employee identities', async () => {
  const { planDirectMdHierarchy } = await import('../dist/modules/employees/services/direct-md-hierarchy.js');
  const employees = [
    { id: 'md', roleCode: 'MD', hierarchyPath: [], isActive: true },
    { id: 'mis', roleCode: 'MIS', reportingTo: 'md', hierarchyPath: ['md'], isActive: true },
    { id: 'mh', roleCode: 'MH', reportingTo: 'mis', hierarchyPath: ['md', 'mis'], isActive: true },
    { id: 'head', roleCode: 'CP_HEAD', reportingTo: 'mh', hierarchyPath: ['md', 'mis', 'mh'], isActive: true },
    { id: 'rm', roleCode: 'RM', reportingTo: 'head', hierarchyPath: ['md', 'mis', 'mh', 'head'], isActive: true },
    { id: 'cp', roleCode: 'CP', reportingTo: 'rm', hierarchyPath: ['md', 'mis', 'mh', 'head', 'rm'], isActive: true },
  ];
  const before = structuredClone(employees);
  const changes = planDirectMdHierarchy(employees, 'mis');
  const head = changes.find(change => change.id === 'head');
  assert.equal(head.reportingTo, 'md');
  assert.deepEqual(head.hierarchyPath, ['md']);
  assert.deepEqual(changes.find(change => change.id === 'cp').hierarchyPath, ['md', 'head', 'rm']);
  assert.equal(changes.find(change => change.id === 'mh').roleCode, 'MIS');
  assert.deepEqual(employees, before);
  const merged = employees.map(employee => changes.find(change => change.id === employee.id) ?? employee);
  assert.deepEqual(planDirectMdHierarchy(merged, 'mis'), []);
});

test('MH removal requires an explicit account disposition and supports preserving inactive accounts', async () => {
  const { planDirectMdHierarchy } = await import('../dist/modules/employees/services/direct-md-hierarchy.js');
  const employees = [
    { id: 'md', roleCode: 'MD', hierarchyPath: [], isActive: true },
    { id: 'mh', roleCode: 'MH', reportingTo: 'md', hierarchyPath: ['md'], isActive: true },
  ];
  assert.throws(() => planDirectMdHierarchy(employees), /require --mh-to-mis or --deactivate-mh/);
  const [change] = planDirectMdHierarchy(employees, 'deactivate');
  assert.equal(change.id, 'mh');
  assert.equal(change.isActive, false);
  assert.equal(change.roleCode, 'MH');
  assert.deepEqual(change.hierarchyPath, ['md']);
});

test('direct-MD migration rejects missing managers, cycles and missing or inactive MDs before any writes', async () => {
  const { planDirectMdHierarchy } = await import('../dist/modules/employees/services/direct-md-hierarchy.js');
  const head = { id: 'head', roleCode: 'CP_HEAD', reportingTo: 'missing', hierarchyPath: [], isActive: true };
  assert.throws(() => planDirectMdHierarchy([head]), /Missing reporting manager/);
  assert.throws(() => planDirectMdHierarchy([{ ...head, reportingTo: 'head' }]), /Circular/);
  assert.throws(() => planDirectMdHierarchy([{ ...head, reportingTo: undefined }]), /No MD ancestor/);
  assert.throws(() => planDirectMdHierarchy([{ id: 'md', roleCode: 'MD', hierarchyPath: [], isActive: false }, { ...head, reportingTo: 'md' }]), /Inactive MD/);
});

test('retired MH analytics selectors are rejected while CP Head remains supported', () => {
  const employeeId = '123456789012345678901234';
  assert.ok(analyticsFilterSchema.validate({ mhId: employeeId }).error);
  assert.equal(analyticsFilterSchema.validate({ cpHeadId: employeeId }).error, undefined);
});

test('role seeding removes MH and configures MD as the direct CP Head parent', async (t) => {
  const { Types } = await import('mongoose');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { PermissionModel } = await import('../dist/modules/roles/models/permission.model.js');
  const { seedSystemRoles } = await import('../dist/modules/roles/services/role.service.js');
  const codes = ['MD', 'MIS', 'CP_HEAD', 'RM', 'CP', 'ADMIN_HEAD'];
  const ids = new Map(codes.map(code => [code, new Types.ObjectId()]));
  t.mock.method(PermissionModel, 'findOneAndUpdate', async () => ({ _id: new Types.ObjectId() }));
  const insert = t.mock.method(RoleModel, 'findOneAndUpdate', async () => ({}));
  t.mock.method(RoleModel, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(RoleModel, 'find', (filter) => ({ select: () => ({ lean: async () => filter.$or || filter.code.$in.includes('BDO') ? [] : codes.map(code => ({ _id: ids.get(code), code })) }) }));
  const updates = t.mock.method(RoleModel, 'updateOne', async () => ({}));
  await seedSystemRoles();
  assert.equal(insert.mock.calls.some(call => ['MH','ADMIN_HEAD'].includes(call.arguments[0].code)), false);
  const head = updates.mock.calls.find(call => call.arguments[0].code === 'CP_HEAD').arguments[1].$set;
  assert.equal(String(head.parentRole), String(ids.get('MD')));
  assert.equal(head.level, 1);
  const md = updates.mock.calls.find(call => call.arguments[0].code === 'MD').arguments[1].$set;
  assert.ok(md.allowedChildRoles.some(id => id.equals(ids.get('CP_HEAD'))));
  const mis = updates.mock.calls.find(call => call.arguments[0].code === 'MIS').arguments[1].$set;
  assert.equal(mis.allowedChildRoles.some(id => id.equals(ids.get('CP_HEAD'))), false);
  assert.equal(md.allowedChildRoles.some(id => id.equals(ids.get('ADMIN_HEAD'))), false);
  assert.deepEqual(mis.allowedChildRoles, []);
});

test('only MD can create CP Head and no actor can create retired MH accounts', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { canCreateRole } = await import('../dist/modules/employees/services/employee.service.js');
  const actorId = new Types.ObjectId(), roleId = new Types.ObjectId(), headId = new Types.ObjectId();
  let actorCode = 'MIS';
  const target = { _id: headId, code: 'CP_HEAD', category: 'PRIMARY' };
  t.mock.method(EmployeeModel, 'findById', () => ({ select: () => ({ lean: async () => ({ role: roleId, isActive: true }) }) }));
  t.mock.method(RoleModel, 'findOne', async filter => filter.code ? target : ({ code: actorCode, category: 'PRIMARY', allowedChildRoles: [headId] }));
  for (const code of ['MIS', 'MH', 'RM', 'CP']) {
    actorCode = code;
    await assert.rejects(canCreateRole(actorId, 'CP_HEAD'), error => error.statusCode === 403);
  }
  actorCode = 'MD';
  assert.equal((await canCreateRole(actorId, 'CP_HEAD')).targetRole, target);
  target.code = 'MH';
  await assert.rejects(canCreateRole(actorId, 'MH'), error => error.statusCode === 400);
  target.code = 'ADMIN_HEAD';
  await assert.rejects(canCreateRole(actorId, 'ADMIN_HEAD'), error => error.statusCode === 400);
});

test('CP Head migration preserves each team\'s existing MD root', async () => {
  const { planDirectMdHierarchy } = await import('../dist/modules/employees/services/direct-md-hierarchy.js');
  const changes = planDirectMdHierarchy([
    { id: 'md-1', roleCode: 'MD', hierarchyPath: [], isActive: true },
    { id: 'md-2', roleCode: 'MD', hierarchyPath: [], isActive: true },
    { id: 'mis-2', roleCode: 'MIS', reportingTo: 'md-2', hierarchyPath: ['md-2'], isActive: true },
    { id: 'head-2', roleCode: 'CP_HEAD', reportingTo: 'mis-2', hierarchyPath: ['md-2', 'mis-2'], isActive: true },
  ]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].reportingTo, 'md-2');
  assert.deepEqual(changes[0].hierarchyPath, ['md-2']);
  assert.equal(canAccessEmployeeByPolicy({ actorId: 'mis-2', actorRoleCode: 'MIS', actorRoleCategory: 'PRIMARY', targetId: 'head-2', targetRoleCategory: 'PRIMARY', targetCreatorIsInActorHierarchy: false, targetHierarchyPath: changes[0].hierarchyPath }), false);
});

test('MH deletion planning removes only MH accounts and reparents their surviving team to MD', async () => {
  const { planDirectMdHierarchy } = await import('../dist/modules/employees/services/direct-md-hierarchy.js');
  const employees = [
    { id: 'md', roleCode: 'MD', hierarchyPath: [], isActive: true },
    { id: 'mis', roleCode: 'MIS', reportingTo: 'md', hierarchyPath: ['md'], isActive: true },
    { id: 'mh', roleCode: 'MH', reportingTo: 'mis', hierarchyPath: ['md', 'mis'], isActive: true },
    { id: 'head', roleCode: 'CP_HEAD', reportingTo: 'mh', hierarchyPath: ['md', 'mis', 'mh'], isActive: true },
    { id: 'rm', roleCode: 'RM', reportingTo: 'head', hierarchyPath: ['md', 'mis', 'mh', 'head'], isActive: true },
  ];
  const changes = planDirectMdHierarchy(employees, 'delete');
  assert.equal(changes.some(employee => employee.id === 'mh'), false);
  assert.equal(changes.find(employee => employee.id === 'head').reportingTo, 'md');
  assert.deepEqual(changes.find(employee => employee.id === 'rm').hierarchyPath, ['md', 'head']);
  assert.equal(employees.length, 5);
  const survivors = employees.filter(employee => employee.roleCode !== 'MH').map(employee => changes.find(change => change.id === employee.id) ?? employee);
  assert.deepEqual(planDirectMdHierarchy(survivors, 'delete'), []);
});


test('calling list policy allows MD globally, MIS own uploads and only the assigned RM', async () => {
  const { canManageCallingList, canReadCallingList, canConvertCallingCandidate } = await import('../dist/modules/calling-lists/calling-list.policy.js');
  for (const role of ['CP_HEAD', 'CP', 'ADMIN_HEAD', 'MH', 'CUSTOM']) {
    assert.equal(canReadCallingList(role, 'actor', 'actor', 'actor'), false);
    assert.equal(canConvertCallingCandidate(role, 'actor', 'actor'), false);
  }
  assert.equal(canManageCallingList('MD', 'md', 'mis'), true);
  assert.equal(canReadCallingList('MIS', 'mis', 'mis', 'rm'), true);
  assert.equal(canReadCallingList('MIS', 'mis-2', 'mis', 'rm'), false);
  assert.equal(canManageCallingList('RM', 'rm', 'mis'), false);
  assert.equal(canReadCallingList('RM', 'rm', 'mis', 'rm'), true);
  assert.equal(canReadCallingList('RM', 'old-rm', 'mis', 'rm'), false);
  assert.equal(canConvertCallingCandidate('MIS', 'mis', 'rm'), false);
  assert.equal(canConvertCallingCandidate('RM', 'rm', 'rm'), true);
  assert.equal(canConvertCallingCandidate('MD', 'md', 'rm'), true);
  assert.equal(canConvertCallingCandidate('MD', 'md', null), false);
});

test('Excel preview preserves every header and candidate value including phone strings and literal HTML', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const { parseCallingWorkbook } = await import('../dist/modules/calling-lists/calling-list.excel.js');
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Candidates');
  sheet.addRow(['First name', 'Last name', 'Mobile number', 'Notes', 'Custom field']);
  sheet.addRow(['Asha', 'Patel', '+919876543210', '<script>alert(1)</script>', 'All details retained']);
  sheet.addRow([]); sheet.addRow(['Ravi', 'Shah', '9876543211', '', 'Other']);
  const result = await parseCallingWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(result.headers.length, 5);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].values[2], '+919876543210');
  assert.equal(result.rows[0].values[3], '<script>alert(1)</script>');
  assert.equal(result.rows[1].rowNumber, 4);
  assert.equal(result.rows[1].values.length, 5);
});

test('Excel uploads reject malformed, encrypted/legacy, empty, duplicate-header and multi-sheet workbooks', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const { parseCallingWorkbook } = await import('../dist/modules/calling-lists/calling-list.excel.js');
  for (const bytes of [Buffer.from('bad'), Buffer.alloc(50), Buffer.alloc(5 * 1024 * 1024 + 1)]) await assert.rejects(parseCallingWorkbook(bytes), error => error.statusCode === 400);
  for (const kind of ['duplicate', 'empty', 'multiple', 'missing-header', 'too-many-columns']) {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Candidates');
    sheet.addRow(kind === 'duplicate' ? ['Name', 'name'] : kind === 'missing-header' ? ['Name', ''] : kind === 'too-many-columns' ? Array.from({length: 51}, (_, i) => `Column ${i}`) : ['Name']);
    if (kind !== 'empty') sheet.addRow(['Candidate', 'Data']);
    if (kind === 'multiple') workbook.addWorksheet('Another');
    await assert.rejects(parseCallingWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())), error => error.statusCode === 400, kind);
  }
});

test('calling list upload validation permits only bounded XLSX files and active-RM-shaped IDs', async () => {
  const { reserveCallingListSchema } = await import('../dist/modules/calling-lists/calling-list.routes.js');
  const base = { title: 'Candidates', fileName: 'candidates.xlsx', size: 100 };
  assert.equal(reserveCallingListSchema.validate(base).error, undefined);
  for (const bad of [{ fileName: 'file.xls' }, { fileName: '../file.xlsx' }, { fileName: 'file.xlsx\n' }, { size: 5 * 1024 * 1024 + 1 }, { assignedTo: 'bad' }, { title: '' }]) assert.ok(reserveCallingListSchema.validate({ ...base, ...bad }).error);
});

test('unassigned RMs cannot obtain previews or download links, and reassignment revokes former RM access', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { CallingListModel, CallingCandidateModel } = await import('../dist/modules/calling-lists/calling-list.model.js');
  const { callingListStorage } = await import('../dist/modules/calling-lists/calling-list.storage.js');
  const { callingListService } = await import('../dist/modules/calling-lists/calling-list.service.js');
  const actorId = new Types.ObjectId(), owner = new Types.ObjectId(), listId = new Types.ObjectId();
  const list = { _id: listId, uploadedBy: owner, assignedTo: new Types.ObjectId(), state: 'READY', headers: ['Name'], rowCount: 1, bucket: 'private-bucket', key: 'private-key', fileName: 'list.xlsx' };
  const query = value => ({ select: () => ({ lean: async () => value }) });
  t.mock.method(EmployeeModel, 'findOne', () => query({ role: new Types.ObjectId() }));
  t.mock.method(RoleModel, 'findOne', () => query({ code: 'RM' }));
  t.mock.method(CallingListModel, 'findById', () => ({ select: async () => list }));
  const rows = t.mock.method(CallingCandidateModel, 'find', () => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }) }));
  const download = t.mock.method(callingListStorage, 'download', async () => 'https://example.com/private');
  await assert.rejects(callingListService.preview(actorId, String(listId), 1, 25), error => error.statusCode === 404);
  await assert.rejects(callingListService.download(actorId, String(listId)), error => error.statusCode === 404);
  assert.equal(rows.mock.callCount(), 0); assert.equal(download.mock.callCount(), 0);
  list.assignedTo = actorId;
  await callingListService.preview(actorId, String(listId), 1, 25);
  await callingListService.download(actorId, String(listId));
  assert.equal(rows.mock.callCount(), 1); assert.equal(download.mock.callCount(), 1);
  list.assignedTo = new Types.ObjectId();
  await assert.rejects(callingListService.download(actorId, String(listId)), error => error.statusCode === 404);
  assert.equal(download.mock.callCount(), 1);
});

test('candidate conversion rejects duplicate rows and always releases its assignment lock', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { CallingListModel, CallingCandidateModel } = await import('../dist/modules/calling-lists/calling-list.model.js');
  const { employeeService } = await import('../dist/modules/employees/services/employee.service.js');
  const { callingListService } = await import('../dist/modules/calling-lists/calling-list.service.js');
  const rm = new Types.ObjectId(), listId = new Types.ObjectId(), rowId = new Types.ObjectId();
  const query = value => ({ select: () => ({ lean: async () => value }) });
  t.mock.method(EmployeeModel, 'findOne', () => query({ _id: rm, role: new Types.ObjectId() }));
  t.mock.method(RoleModel, 'findOne', () => query({ code: 'RM', _id: new Types.ObjectId() }));
  t.mock.method(CallingListModel, 'findById', () => ({ select: async () => ({ _id: listId, uploadedBy: new Types.ObjectId(), assignedTo: rm }) }));
  t.mock.method(CallingListModel, 'findOneAndUpdate', async () => ({}));
  const release = t.mock.method(CallingListModel, 'updateOne', async () => ({}));
  t.mock.method(CallingCandidateModel, 'findOne', async () => ({ _id: rowId, employee: new Types.ObjectId() }));
  const create = t.mock.method(employeeService, 'create', async () => { throw new Error('Should not create'); });
  await assert.rejects(callingListService.createCp(rm, String(listId), String(rowId), {}), error => error.statusCode === 409);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(release.mock.callCount(), 1);
  assert.equal(release.mock.calls[0].arguments[1].$set.busy, false);
});


test('reviewed candidate creates exactly one CP under the assigned RM and records the created account', async (t) => {
  await mockCallingTransactions(t);
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { CallingListModel, CallingCandidateModel } = await import('../dist/modules/calling-lists/calling-list.model.js');
  const { employeeService } = await import('../dist/modules/employees/services/employee.service.js');
  const { callingListService } = await import('../dist/modules/calling-lists/calling-list.service.js');
  const rm = new Types.ObjectId(), md = new Types.ObjectId(), listId = new Types.ObjectId(), rowId = new Types.ObjectId(), employeeId = new Types.ObjectId();
  const query = value => ({ select: () => ({ lean: async () => value }) });
  t.mock.method(EmployeeModel, 'findOne', filter => query(filter.employeeCode ? null : { _id: rm, role: new Types.ObjectId() }));
  t.mock.method(RoleModel, 'findOne', filter => query({ code: filter.code ?? 'MD', _id: new Types.ObjectId() }));
  t.mock.method(CallingListModel, 'findById', () => ({ select: async () => ({ _id: listId, uploadedBy: new Types.ObjectId(), assignedTo: rm }) }));
  const lock = t.mock.method(CallingListModel, 'findOneAndUpdate', async () => ({}));
  t.mock.method(CallingListModel, 'updateOne', async () => ({}));
  t.mock.method(CallingCandidateModel, 'findOne', async () => ({ _id: rowId, employee: null }));
  const record = t.mock.method(CallingCandidateModel, 'updateOne', async () => ({}));
  const create = t.mock.method(employeeService, 'create', async () => ({ employee: { _id: employeeId }, invitationSent: true }));
  const reviewed = { firstName: 'Reviewed', lastName: 'Candidate', email: 'candidate@example.invalid', mobileNumber: '+919999999999', address: { addressLine: 'Reviewed address', state: String(new Types.ObjectId()), district: String(new Types.ObjectId()) }, roleCode: 'MIS', employeeCode: 'CUSTOM' };
  const result = await callingListService.createCp(md, String(listId), String(rowId), reviewed);
  const [input, creator] = create.mock.calls[0].arguments;
  assert.equal(input.roleCode, 'CP');
  assert.equal(input.employeeCode, `CP-${rowId}`.toUpperCase());
  assert.equal(input.firstName, 'Reviewed');
  assert.ok(creator.equals(rm));
  assert.ok(lock.mock.calls[0].arguments[0].assignedTo.equals(rm));
  assert.ok(record.mock.calls[0].arguments[1].$set.employee.equals(employeeId));
  assert.equal(result.invitationSent, true);
});

test('failed S3 writes leave no candidate rows and return the reservation to retryable state', async (t) => {
  const { Types } = await import('mongoose');
  const { default: ExcelJS } = await import('exceljs');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { CallingListModel, CallingCandidateModel } = await import('../dist/modules/calling-lists/calling-list.model.js');
  const { callingListStorage } = await import('../dist/modules/calling-lists/calling-list.storage.js');
  const { callingListService } = await import('../dist/modules/calling-lists/calling-list.service.js');
  const mis = new Types.ObjectId(), listId = new Types.ObjectId();
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Candidates'); sheet.addRow(['Name']); sheet.addRow(['Test']);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const query = value => ({ select: () => ({ lean: async () => value }) });
  t.mock.method(EmployeeModel, 'findOne', () => query({ role: new Types.ObjectId() }));
  t.mock.method(RoleModel, 'findOne', () => query({ code: 'MIS' }));
  t.mock.method(CallingListModel, 'findById', () => ({ select: async () => ({ _id: listId, uploadedBy: mis, bucket: 'private-bucket', key: 'private-key', size: bytes.length }) }));
  t.mock.method(CallingListModel, 'findOneAndUpdate', async () => ({}));
  const update = t.mock.method(CallingListModel, 'updateOne', async () => ({}));
  const insert = t.mock.method(CallingCandidateModel, 'insertMany', async () => []);
  const cleanup = t.mock.method(CallingCandidateModel, 'deleteMany', async () => ({}));
  t.mock.method(callingListStorage, 'put', async () => { throw new Error('Storage denied'); });
  await assert.rejects(callingListService.upload(mis, String(listId), bytes), /Storage denied/);
  assert.equal(insert.mock.callCount(), 0);
  assert.equal(cleanup.mock.callCount(), 1);
  assert.equal(update.mock.calls[0].arguments[1].$set.state, 'RESERVED');
});


test('blank calling-list template contains only supported headers and filled copies pass upload parsing', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const { buildCallingListTemplate, CALLING_TEMPLATE_HEADERS, parseCallingWorkbook } = await import('../dist/modules/calling-lists/calling-list.excel.js');
  const bytes = await buildCallingListTemplate();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes);
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 1);
  assert.deepEqual(sheet.getRow(1).values.slice(1), [...CALLING_TEMPLATE_HEADERS]);
  assert.equal(sheet.getColumn(4).numFmt, '@');
  assert.equal(sheet.getColumn(7).numFmt, '@');
  await assert.rejects(parseCallingWorkbook(bytes), /at least one candidate/);
  sheet.addRow(['Asha', 'Patel', 'asha@example.invalid', '+919999999999', 'Example address', 'Mumbai', '012345', 'Call next week']);
  const parsed = await parseCallingWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values[3], '+919999999999');
  assert.equal(parsed.rows[0].values[6], '012345');
});

test('only MD and MIS can download the blank upload template', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { callingListService } = await import('../dist/modules/calling-lists/calling-list.service.js');
  let code = 'RM';
  t.mock.method(EmployeeModel, 'findOne', () => ({ select: () => ({ lean: async () => ({ role: new Types.ObjectId() }) }) }));
  t.mock.method(RoleModel, 'findOne', () => ({ select: () => ({ lean: async () => ({ code }) }) }));
  for (const denied of ['RM', 'CP_HEAD', 'CP', 'ADMIN_HEAD']) {
    code = denied; await assert.rejects(callingListService.template(new Types.ObjectId()), error => error.statusCode === 403);
  }
  for (const allowed of ['MD', 'MIS']) {
    code = allowed; const result = await callingListService.template(new Types.ObjectId());
    assert.equal(result.fileName, 'CP-candidate-template.xlsx');
    assert.ok(Buffer.from(result.base64, 'base64').length > 22);
    assert.equal(result.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
});


test('customer-to-CP policy permits MD, CP Head and RM with the correct manager boundaries', async () => {
  const { canConvertCustomerToCp, canChooseCpManager } = await import('../dist/modules/customers/services/customer-cp.policy.js');
  for (const role of ['MIS', 'CP', 'ADMIN_HEAD', 'MH', 'CUSTOM']) assert.equal(canConvertCustomerToCp(role), false);
  for (const role of ['MD', 'CP_HEAD', 'RM']) assert.equal(canConvertCustomerToCp(role), true);
  assert.equal(canChooseCpManager('MD', 'md', 'rm', []), true);
  assert.equal(canChooseCpManager('CP_HEAD', 'head', 'rm', ['md', 'head']), true);
  assert.equal(canChooseCpManager('CP_HEAD', 'head', 'other-rm', ['md', 'other-head']), false);
  assert.equal(canChooseCpManager('RM', 'rm', 'rm', ['md', 'head']), true);
  assert.equal(canChooseCpManager('RM', 'rm', 'other-rm', ['md', 'head']), false);
});

test('customer conversion requires explicit confirmation, valid account details and a CP role', async () => {
  const { customerCpSchema } = await import('../dist/modules/customers/services/customer-cp.service.js');
  const input = { firstName: 'Asha', lastName: 'Patel', email: 'asha@example.com', mobileNumber: '+919999999999', address: { addressLine: 'Example address', state: '0123456789abcdef01234567', district: '0123456789abcdef01234568' }, confirmed: true };
  assert.equal(customerCpSchema.validate(input).error, undefined);
  assert.equal(customerCpSchema.validate(input).value.roleCode, 'CP');
  for (const bad of [{ confirmed: false }, { confirmed: 'true' }, { confirmed: undefined }, { email: '' }, { roleCode: 'MD' }, { employeeCode: 'BYPASS' }, { profileImageUploadId: '0123456789abcdef01234567' }]) assert.ok(customerCpSchema.validate({ ...input, ...bad }).error);
});

test('linked customer history is visible to the CP upline without exposing unrelated creator records', async (t) => {
  const { Types } = await import('mongoose');
  const { CustomerModel } = await import('../dist/modules/customers/models/customer.model.js');
  const { hierarchyService } = await import('../dist/modules/employees/services/hierarchy.service.js');
  const { assertCustomerAccess } = await import('../dist/modules/customers/services/customer-access.service.js');
  const { canAccessConvertedLead } = await import('../dist/modules/customers/services/customer-linked-access.service.js');
  const actorId = new Types.ObjectId(), cp = new Types.ObjectId(), creator = new Types.ObjectId(), customerId = new Types.ObjectId(), leadId = new Types.ObjectId();
  let linked = true;
  const customer = { _id: customerId, creatorId: creator, cpEmployee: cp };
  t.mock.method(CustomerModel, 'findById', async () => customer);
  t.mock.method(hierarchyService, 'canAccessResource', async () => false);
  t.mock.method(hierarchyService, 'canAccessEmployee', async (_actor, employee) => linked && employee.equals(cp));
  t.mock.method(CustomerModel, 'findOne', filter => ({ select: () => ({ lean: async () => filter.sourceLead.equals(leadId) ? { cpEmployee: cp } : null }) }));
  assert.equal(await assertCustomerAccess(actorId, customerId), customer);
  assert.equal(await canAccessConvertedLead(actorId, leadId), true);
  assert.equal(await canAccessConvertedLead(actorId, new Types.ObjectId()), false);
  linked = false;
  await assert.rejects(assertCustomerAccess(actorId, customerId), error => error.statusCode === 404);
  assert.equal(await canAccessConvertedLead(actorId, leadId), false);
});

test('confirmed customer conversion saves one employee under the RM, preserves historical creators and sends one invitation', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { HierarchyLockModel } = await import('../dist/modules/employees/models/hierarchy-lock.model.js');
  const { CustomerModel } = await import('../dist/modules/customers/models/customer.model.js');
  const { CustomerActivityModel } = await import('../dist/modules/customers/models/customer-activity.model.js');
  const { hierarchyService } = await import('../dist/modules/employees/services/hierarchy.service.js');
  const { geographyService } = await import('../dist/modules/geography/services/geography.service.js');
  const { authService } = await import('../dist/modules/auth/services/auth.service.js');
  const { customerCpService } = await import('../dist/modules/customers/services/customer-cp.service.js');
  const actorId = new Types.ObjectId(), rm = new Types.ObjectId(), cpRole = new Types.ObjectId(), rmRole = new Types.ObjectId(), roleId = new Types.ObjectId(), customerId = new Types.ObjectId(), originalCreator = new Types.ObjectId(), newEmployeeId = new Types.ObjectId();
  const customer = { _id: customerId, creatorId: originalCreator, cpEmployee: null };
  const query = value => ({ select: () => ({ lean: async () => value }) });
  let existing = null;
  t.mock.method(HierarchyLockModel, 'findOneAndUpdate', async () => ({}));
  t.mock.method(HierarchyLockModel, 'deleteOne', async () => ({}));
  t.mock.method(EmployeeModel, 'findOne', filter => query(filter.sourceCustomer ? existing : filter.role ? { _id: rm, hierarchyPath: [actorId] } : { role: roleId }));
  t.mock.method(RoleModel, 'findOne', filter => query(filter.code === 'RM' ? { _id: rmRole } : filter.code === 'CP' ? { _id: cpRole } : { code: 'MD' }));
  t.mock.method(CustomerModel, 'findById', async () => customer);
  t.mock.method(hierarchyService, 'canAccessResource', async () => true);
  t.mock.method(geographyService, 'validateEmployeePlacement', async () => undefined);
  const create = t.mock.method(EmployeeModel, 'create', async data => { existing = { ...data, _id: newEmployeeId }; return { toObject: () => existing }; });
  const update = t.mock.method(CustomerModel, 'updateOne', async (_filter, update) => { customer.cpEmployee = update.$set.cpEmployee; return { matchedCount: 1 }; });
  const activity = t.mock.method(CustomerActivityModel, 'findOneAndUpdate', async () => ({}));
  const invite = t.mock.method(authService, 'createInvitation', async () => true);
  const input = { confirmed: true, reportingManagerId: String(rm), firstName: 'Asha', lastName: 'Patel', email: 'asha@example.com', mobileNumber: '+919999999999', address: { addressLine: 'Example address', state: String(new Types.ObjectId()), district: String(new Types.ObjectId()) } };
  const result = await customerCpService.convert(actorId, String(customerId), input);
  assert.equal(result.invitationSent, true);
  assert.ok(existing.sourceCustomer.equals(customerId));
  assert.ok(existing.reportingTo.equals(rm));
  assert.deepEqual(existing.hierarchyPath, [actorId, rm]);
  assert.ok(existing.createdBy.equals(actorId));
  assert.ok(existing.role.equals(cpRole));
  assert.equal(existing.isVerified, false);
  assert.equal('passwordHash' in existing, false);
  assert.ok(customer.creatorId.equals(originalCreator));
  assert.equal('creatorId' in update.mock.calls[0].arguments[1].$set, false);
  assert.equal(activity.mock.callCount(), 1);
  const repeated = await customerCpService.convert(actorId, String(customerId), input);
  assert.equal(repeated.alreadyConverted, true);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(invite.mock.callCount(), 1);
});

test('new CP cannot log in before setting a password and can sign in as CP after invitation setup', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { PermissionModel } = await import('../dist/modules/roles/models/permission.model.js');
  const { InvitationModel } = await import('../dist/modules/auth/models/invitation.model.js');
  const { RefreshTokenModel } = await import('../dist/modules/auth/models/refresh-token.model.js');
  const { authService } = await import('../dist/modules/auth/services/auth.service.js');
  const employee = { _id: new Types.ObjectId(), employeeCode: 'CP-TEST', firstName: 'Asha', lastName: 'Patel', email: 'asha@example.com', mobileNumber: '+919999999999', role: new Types.ObjectId(), isActive: true, isVerified: false, failedLoginAttempts: 0, passwordHash: undefined, save: async () => undefined };
  t.mock.method(EmployeeModel, 'findOne', () => Object.assign(Promise.resolve(employee), { select: async () => employee }));
  t.mock.method(InvitationModel, 'findOneAndUpdate', async () => ({ employee: employee._id }));
  t.mock.method(RoleModel, 'exists', async () => true);
  t.mock.method(RoleModel, 'findOne', () => ({ select: () => ({ lean: async () => ({ code: 'CP', name: 'Channel Partner', level: 3, category: 'PRIMARY', permissions: [] }) }) }));
  t.mock.method(PermissionModel, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(RefreshTokenModel, 'create', async () => ({ _id: new Types.ObjectId() }));
  await assert.rejects(authService.login(employee.email, 'StrongPassword123', {}), error => error.statusCode === 401);
  await authService.setPassword('valid-invitation-token', 'StrongPassword123');
  assert.equal(employee.isVerified, true);
  assert.notEqual(employee.passwordHash, 'StrongPassword123');
  const login = await authService.login(employee.email, 'StrongPassword123', {});
  assert.equal(login.employee.role.code, 'CP');
  assert.ok(login.accessToken);
});


test('employee directory validation preserves all-role API defaults and accepts staff/CP selection', async () => {
  const { paginationSchema } = await import('../dist/modules/employees/validations/pagination.validation.js');
  assert.equal(paginationSchema.validate({}).value.directory, 'all');
  for (const directory of ['all', 'staff', 'cp']) assert.equal(paginationSchema.validate({ directory }).error, undefined);
  assert.ok(paginationSchema.validate({ directory: 'MD' }).error);
});

test('staff and CP directories apply role filtering before pagination/counts and retain RM hierarchy scope', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { employeeService } = await import('../dist/modules/employees/services/employee.service.js');
  const cpRole = new Types.ObjectId(), staffRole = new Types.ObjectId(), md = new Types.ObjectId(), rm = new Types.ObjectId(), otherRm = new Types.ObjectId();
  let actorCode = 'MD';
  const records = [
    { _id: md, role: staffRole, hierarchyPath: [], isActive: true },
    { _id: rm, role: staffRole, hierarchyPath: [md], isActive: true },
    { _id: otherRm, role: staffRole, hierarchyPath: [md], isActive: true },
    { _id: new Types.ObjectId(), role: cpRole, hierarchyPath: [md, rm], isActive: true },
    { _id: new Types.ObjectId(), role: cpRole, hierarchyPath: [md, rm], isActive: false },
    { _id: new Types.ObjectId(), role: cpRole, hierarchyPath: [md, otherRm], isActive: true }
  ];
  const equal = (a, b) => String(a) === String(b);
  const matchScope = (row, clause) => clause._id ? equal(row._id, clause._id) : clause.hierarchyPath ? row.hierarchyPath.some(id => equal(id, clause.hierarchyPath)) : true;
  const evaluate = query => query.$and ? records.filter(row => query.$and.every(clause => evaluate(clause).includes(row))) : records.filter(row => (!query.$or || query.$or.some(clause => matchScope(row, clause))) && (!query.hierarchyPath || row.hierarchyPath.some(id => equal(id, query.hierarchyPath))) && (query.isActive === undefined || row.isActive === query.isActive) && (!query.role || (query.role.$in ? query.role.$in.some(id => equal(id, row.role)) : !query.role.$nin.some(id => equal(id, row.role)))));
  t.mock.method(EmployeeModel, 'findById', () => ({ select: () => ({ lean: async () => ({ role: staffRole, isActive: true }) }) }));
  t.mock.method(RoleModel, 'findOne', async () => ({ code: actorCode, category: 'PRIMARY' }));
  t.mock.method(RoleModel, 'find', () => ({ distinct: async () => [cpRole] }));
  const finds = [];
  t.mock.method(EmployeeModel, 'find', query => {
    finds.push(query); let offset = 0, limit = Infinity;
    const chain = { select: () => chain, populate: () => chain, sort: () => chain, skip: n => { offset = n; return chain; }, limit: n => { limit = n; return chain; }, lean: async () => evaluate(query).slice(offset, offset + limit) };
    return chain;
  });
  const counts = [];
  t.mock.method(EmployeeModel, 'countDocuments', async query => { counts.push(query); return evaluate(query).length; });
  const staff = await employeeService.listAccessible(md, { page: 1, limit: 2 }, 'staff');
  assert.equal(staff.meta.total, 3);
  assert.equal(staff.data.length, 2);
  assert.ok(staff.data.every(row => !row.role.equals(cpRole)));
  const cpPage = await employeeService.listAccessible(md, { page: 2, limit: 1 }, 'cp');
  assert.equal(cpPage.meta.total, 3);
  assert.equal(cpPage.data.length, 1);
  assert.ok(cpPage.data[0]._id.equals(records[4]._id));
  assert.equal(cpPage.data[0].isActive, false);
  const all = await employeeService.listAccessible(md, { page: 1, limit: 20 });
  assert.equal(all.meta.total, 6);
  actorCode = 'RM';
  const scoped = await employeeService.listAccessible(rm, { page: 1, limit: 20 }, 'cp');
  assert.equal(scoped.meta.total, 2);
  assert.ok(scoped.data.every(row => row.hierarchyPath.some(id => id.equals(rm))));
  const staffDownline = await employeeService.getDownline(rm, { page: 1, limit: 20 }, 'staff');
  assert.equal(staffDownline.meta.total, 0);
  const cpDownline = await employeeService.getDownline(rm, { page: 1, limit: 20 }, 'cp');
  assert.equal(cpDownline.meta.total, 1);
  assert.deepEqual(finds, counts);
});


test('employee details resolve display references with limited projections and retain access checks', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { hierarchyService } = await import('../dist/modules/employees/services/hierarchy.service.js');
  const { employeeService } = await import('../dist/modules/employees/services/employee.service.js');
  const actor = new Types.ObjectId(), cp = new Types.ObjectId();
  let allowed = true;
  t.mock.method(hierarchyService, 'canAccessEmployee', async () => allowed);
  const record = { _id: cp, role: { code: 'CP', name: 'Channel Partner' }, reportingTo: { firstName: 'RM', lastName: 'Example' }, branch: { name: 'Example branch' } };
  let references, projection;
  const lookup = t.mock.method(EmployeeModel, 'findById', () => {
    const chain = { select: value => { projection = value; return chain; }, populate: value => { references = value; return chain; }, lean: async () => record };
    return chain;
  });
  assert.equal(await employeeService.getById(actor, String(cp)), record);
  for (const path of ['role', 'reportingTo', 'createdBy', 'hierarchyPath', 'branch', 'address.state', 'address.district', 'sourceCustomer']) assert.ok(references.some(entry => entry.path === path), path);
  for (const reference of references) assert.equal(/password|token|secret|email|mobile/i.test(reference.select), false);
  assert.match(projection, /-passwordHash/);
  assert.match(projection, /-failedLoginAttempts/);
  allowed = false;
  await assert.rejects(employeeService.getById(actor, String(cp)), error => error.statusCode === 404);
  assert.equal(lookup.mock.callCount(), 1);
});


test('CP list filters validate geography, type and inclusive creation date ranges', async () => {
  const { paginationSchema } = await import('../dist/modules/employees/validations/pagination.validation.js');
  const id = '0123456789abcdef01234567';
  const input = { directory: 'cp', stateId: id, districtId: id, branchId: id, cpType: 'customer_cp', dateFrom: '2026-01-01', dateTo: '2026-01-02', employeeName: '  Team Lead  ' };
  const valid = paginationSchema.validate(input);
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.employeeName, 'Team Lead');
  assert.ok(valid.value.dateFrom instanceof Date);
  for (const change of [{ stateId: 'bad' }, { districtId: 'bad' }, { branchId: 'bad' }, { cpType: 'customer' }, { dateFrom: '2026-01-03' }]) assert.ok(paginationSchema.validate({ ...input, ...change }).error);
});

test('CP filters combine team, geography, customer link and dates before pagination without widening RM access', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { employeeService } = await import('../dist/modules/employees/services/employee.service.js');
  const id = () => new Types.ObjectId();
  const md=id(), head=id(), rm=id(), otherRm=id(), cpRole=id(), staffRole=id(), state=id(), district=id(), branch=id(), otherBranch=id();
  const customer=id();
  let actorCode='MD';
  const make = (manager, extra={}) => ({ _id:id(), role:cpRole, hierarchyPath:[md, head, manager], isActive:true, address:{state, district}, branch, createdAt:new Date('2026-01-02T23:59:59.999Z'), ...extra });
  const rows=[make(rm), make(rm,{sourceCustomer:customer}), make(otherRm,{sourceCustomer:customer}), make(rm,{branch:otherBranch, sourceCustomer:customer}), make(rm,{createdAt:new Date('2026-01-03T00:00:00Z'), sourceCustomer:customer})];
  const equal=(a,b)=>a == null && b == null || String(a)===String(b);
  const matches=(row, query)=>Object.entries(query).every(([key,condition])=>{
    if(key==='$and')return condition.every(part=>matches(row,part));
    if(key==='$or')return condition.some(part=>matches(row,part));
    const value=key.split('.').reduce((obj,k)=>obj?.[k],row);
    const values=Array.isArray(value)?value:[value];
    if(condition && typeof condition==='object' && !(condition instanceof Types.ObjectId) && !(condition instanceof Date)) {
      if('$in' in condition)return values.some(v=>condition.$in.some(id=>equal(id,v)));
      if('$ne' in condition)return !equal(value,condition.$ne);
      return (!condition.$gte || value>=condition.$gte) && (!condition.$lte || value<=condition.$lte);
    }
    return values.some(v=>equal(v,condition));
  });
  t.mock.method(EmployeeModel,'findById',()=>({select:()=>({lean:async()=>({role:staffRole,isActive:true})})}));
  t.mock.method(RoleModel,'findOne',async()=>({code:actorCode,category:'PRIMARY'}));
  t.mock.method(RoleModel,'find',()=>({distinct:async()=>[cpRole]}));
  const queries=[], counts=[];
  t.mock.method(EmployeeModel,'find',query=>{
    let offset=0,limit=Infinity;
    if(!query.$and) {
      // Name lookup returns an upline; the final query must intersect it with actor access.
      const pattern=query.$or[0].employeeCode.$regex;
      const selected=pattern==='Head'?[head]:pattern==='RM.1'.replace('.', String.fromCharCode(92)+'.')?[rm]:[];
      return {select:()=>({lean:async()=>selected.map(_id=>({_id}))})};
    }
    queries.push(query);
    const chain={select:()=>chain,populate:()=>chain,sort:()=>chain,skip:n=>{offset=n;return chain;},limit:n=>{limit=n;return chain;},lean:async()=>rows.filter(row=>matches(row,query)).slice(offset,offset+limit)};
    return chain;
  });
  t.mock.method(EmployeeModel,'countDocuments',async query=>{counts.push(query);return rows.filter(row=>matches(row,query)).length;});
  const filters={stateId:String(state),districtId:String(district),branchId:String(branch),dateFrom:new Date('2026-01-01'),dateTo:new Date('2026-01-02'),cpType:'customer_cp',employeeName:'Head'};
  const all=await employeeService.listAccessible(md,{page:1,limit:1},'cp',filters);
  assert.equal(all.meta.total,2); assert.equal(all.data.length,1);
  const next=await employeeService.listAccessible(md,{page:2,limit:1},'cp',filters);
  assert.equal(String(next.data[0]._id),String(rows[2]._id));
  actorCode='RM';
  const own=await employeeService.listAccessible(rm,{page:1,limit:20},'cp',filters);
  assert.deepEqual(own.data.map(x=>String(x._id)),[String(rows[1]._id)]);
  const downline=await employeeService.getDownline(rm,{page:1,limit:20},'cp',filters);
  assert.equal(downline.meta.total,1);
  const only=await employeeService.listAccessible(rm,{page:1,limit:20},'cp',{...filters,cpType:'cp_only'});
  assert.deepEqual(only.data.map(x=>String(x._id)),[String(rows[0]._id)]);
  const none=await employeeService.listAccessible(rm,{page:1,limit:20},'cp',{...filters,employeeName:'Unknown'});
  assert.equal(none.meta.total,0);
  const escaped=await employeeService.listAccessible(rm,{page:1,limit:20},'cp',{...filters,employeeName:'RM.1'});
  assert.equal(escaped.meta.total,1);
  const wrongState=await employeeService.listAccessible(rm,{page:1,limit:20},'cp',{...filters,stateId:String(id())});
  assert.equal(wrongState.meta.total,0);
  assert.deepEqual(queries,counts);
});


test('independent geography options keep inactive parents out and support state-scoped branches', async (t) => {
  const { Types } = await import('mongoose');
  const { StateModel } = await import('../dist/modules/geography/models/state.model.js');
  const { DistrictModel } = await import('../dist/modules/geography/models/district.model.js');
  const { BranchModel } = await import('../dist/modules/geography/models/branch.model.js');
  const { geographyService } = await import('../dist/modules/geography/services/geography.service.js');
  const state=new Types.ObjectId(), district=new Types.ObjectId();
  const stateQueries=[], districtQueries=[], branchQueries=[];
  const chain = result => { const q={sort:()=>q,select:()=>q,lean:async()=>result,distinct:async()=>result}; return q; };
  t.mock.method(StateModel,'find',query=>{stateQueries.push(query);return chain([state]);});
  t.mock.method(DistrictModel,'find',query=>{districtQueries.push(query);return chain([district]);});
  t.mock.method(BranchModel,'find',query=>{branchQueries.push(query);return chain([{_id:new Types.ObjectId(),name:'Central',state,district}]);});
  await geographyService.listAllDistricts();
  await geographyService.listAllBranches();
  await geographyService.listAllBranches(String(state));
  assert.ok(stateQueries.every(query=>query.isActive===true));
  assert.equal(String(stateQueries[2]._id),String(state));
  assert.ok(districtQueries.every(query=>query.isActive===true && query.state.$in[0].equals(state)));
  assert.ok(branchQueries.every(query=>query.isActive===true && query.state.$in[0].equals(state) && query.district.$in[0].equals(district)));
  await assert.rejects(geographyService.listAllBranches('bad'), error=>error.statusCode===400);
});


test('query policy limits senders and conversations while MD can read and reply globally', async () => {
  const { canRaiseQuery, canAccessQuery, notificationRecipients } = await import('../dist/modules/queries/query.policy.js');
  for (const role of ['RM','CP','MD']) assert.equal(canRaiseQuery(role),true);
  for (const role of ['MIS','CP_HEAD','ADMIN_HEAD','MH','CUSTOM']) assert.equal(canRaiseQuery(role),false);
  assert.equal(canAccessQuery('rm','RM','rm','head'),true);
  assert.equal(canAccessQuery('head','CP_HEAD','rm','head'),true);
  assert.equal(canAccessQuery('mis','MIS','rm','head'),false);
  assert.equal(canAccessQuery('other','CP','rm','head'),false);
  assert.equal(canAccessQuery('director','MD','rm','head'),true);
  assert.equal(canAccessQuery('rm','CUSTOM','rm','head'),false);
  assert.deepEqual(notificationRecipients('head',['rm','head'],['md1','md2']),['rm','md1','md2']);
  assert.deepEqual(notificationRecipients('rm',['rm','head'],['head','md']),['head','md']);
  assert.deepEqual(notificationRecipients('md',['rm','head'],['md']),['rm','head','md']);
});

test('query validation requires a recipient, content and bounded visible message IDs', async () => {
  const { createQuerySchema, replyQuerySchema, seenQuerySchema } = await import('../dist/modules/queries/query.validation.js');
  const id='0123456789abcdef01234567';
  const valid={title:'  Need assistance  ',body:'  Please review  ',recipientRole:'MIS',recipientId:id};
  assert.equal(createQuerySchema.validate(valid).value.title,'Need assistance');
  for(const change of [{title:' '},{body:' '},{body:'x'.repeat(5001)},{recipientRole:'MD'},{recipientId:'bad'}]) assert.ok(createQuerySchema.validate({...valid,...change}).error);
  assert.ok(replyQuerySchema.validate({body:''}).error);
  assert.equal(seenQuerySchema.validate({messageIds:[id]}).error,undefined);
  assert.ok(seenQuerySchema.validate({messageIds:[id,id]}).error);
  assert.ok(seenQuerySchema.validate({messageIds:[]}).error);
});

test('query recipients restrict CP Head to the actual upline but permit active MIS and MD choice', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { queryService } = await import('../dist/modules/queries/query.service.js');
  const sender=new Types.ObjectId(),head=new Types.ObjectId(),headRole=new Types.ObjectId(),misRole=new Types.ObjectId();
  let code='CP',selection;
  t.mock.method(EmployeeModel,'findOne',()=>({select:()=>({lean:async()=>({_id:sender,role:new Types.ObjectId(),hierarchyPath:[head]})})}));
  t.mock.method(RoleModel,'findOne',()=>({select:()=>({lean:async()=>({code})})}));
  t.mock.method(RoleModel,'find',()=>({select:()=>({lean:async()=>[{_id:headRole,code:'CP_HEAD'},{_id:misRole,code:'MIS'}]})}));
  t.mock.method(EmployeeModel,'find',query=>{selection=query;return {select:()=>({sort:()=>({lean:async()=>[{_id:head,role:headRole,firstName:'Head',employeeCode:'HEAD'}]})})};});
  const result=await queryService.recipients(sender);
  assert.equal(result[0].roleCode,'CP_HEAD');
  assert.equal(selection.isActive,true);
  assert.deepEqual(selection.$or[1]._id.$in,[head]);
  assert.deepEqual(selection.$or[0].role.$in,[misRole]);
  code='MD';await queryService.recipients(sender);
  assert.equal(selection.$or[1]._id,undefined);
  code='MIS';await assert.rejects(queryService.recipients(sender),error=>error.statusCode===403);
});

test('query creation and replies persist messages and every MD notification in the same transaction', async (t) => {
  const { default: mongoose, Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { QueryThreadModel, QueryMessageModel, QueryNotificationModel } = await import('../dist/modules/queries/query.models.js');
  const { queryService } = await import('../dist/modules/queries/query.service.js');
  const sender=new Types.ObjectId(), head=new Types.ObjectId(), md1=new Types.ObjectId(), md2=new Types.ObjectId(), headRole=new Types.ObjectId(), mdRole=new Types.ObjectId();
  const thread={_id:new Types.ObjectId(),title:'Question',createdBy:sender,assignedTo:head};
  const session={testSession:true};let code='RM',deliveries=[],fail=false,transactions=0;
  const chain=value=>{const q={select:()=>q,sort:()=>q,session:passed=>{assert.equal(passed,session);return q;},lean:async()=>value};return q;};
  t.mock.method(mongoose.connection,'transaction',async operation=>{transactions++;return operation(session);});
  t.mock.method(EmployeeModel,'findOne',()=>chain({_id:sender,role:new Types.ObjectId(),hierarchyPath:[head]}));
  t.mock.method(RoleModel,'findOne',()=>chain({code}));
  t.mock.method(RoleModel,'find',query=>chain(query.code==='MD'?[{_id:mdRole}]:[{_id:headRole,code:'CP_HEAD'}]));
  t.mock.method(EmployeeModel,'find',query=>chain(query.$or?[{_id:head,role:headRole,firstName:'Head'}]:[{_id:md1},{_id:md2}]));
  t.mock.method(QueryThreadModel,'findById',()=>chain(thread));
  t.mock.method(QueryThreadModel,'create',async (rows,options)=>{assert.equal(options.session,session);assert.equal(String(rows[0].assignedTo),String(head));return [thread];});
  t.mock.method(QueryMessageModel,'create',async (rows,options)=>{assert.equal(options.session,session);assert.equal(String(rows[0].thread),String(thread._id));return [{_id:new Types.ObjectId()}];});
  t.mock.method(QueryThreadModel,'updateOne',async (_filter,_update,options)=>{assert.equal(options.session,session);});
  t.mock.method(QueryNotificationModel,'insertMany',async (rows,options)=>{assert.equal(options.session,session);if(fail)throw new Error('Notification write failed');deliveries=rows;return rows;});
  await queryService.create(sender,{title:'Question',body:'Help',recipientRole:'CP_HEAD',recipientId:String(head)});
  assert.deepEqual(deliveries.map(row=>String(row.recipient)),[head,md1,md2].map(String));
  assert.ok(deliveries.every(row=>String(row.thread)===String(thread._id)));
  code='CP_HEAD';await queryService.reply(head,String(thread._id),'Answer');
  assert.deepEqual(deliveries.map(row=>String(row.recipient)),[sender,md1,md2].map(String));
  assert.ok(deliveries.every(row=>row.title.startsWith('Query reply:')));
  code='MD';await queryService.reply(md1,String(thread._id),'MD response');
  assert.deepEqual(deliveries.map(row=>String(row.recipient)),[sender,head,md1,md2].map(String));
  fail=true;await assert.rejects(queryService.reply(md1,String(thread._id),'Retry'),/Notification write failed/);
  assert.equal(transactions,4);
  code='RM';await assert.rejects(queryService.reply(new Types.ObjectId(),String(thread._id),'Unauthorized'),error=>error.statusCode===404);
  await assert.rejects(queryService.create(sender,{title:'Question',body:'Help',recipientRole:'CP_HEAD',recipientId:String(md1)}),error=>error.statusCode===400);
});

test('query seen operations only clear the viewer notifications for visible messages and deny other inboxes', async (t) => {
  const { Types } = await import('mongoose');
  const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
  const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
  const { QueryThreadModel, QueryNotificationModel } = await import('../dist/modules/queries/query.models.js');
  const { queryService } = await import('../dist/modules/queries/query.service.js');
  const viewer=new Types.ObjectId(),head=new Types.ObjectId(),threadId=new Types.ObjectId(),messageId=new Types.ObjectId(),notificationId=new Types.ObjectId();
  const chain=value=>{const q={select:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:async()=>value};return q;};
  t.mock.method(EmployeeModel,'findOne',()=>chain({role:new Types.ObjectId()}));
  t.mock.method(RoleModel,'findOne',()=>chain({code:'RM'}));
  t.mock.method(QueryThreadModel,'findById',()=>chain({_id:threadId,createdBy:viewer,assignedTo:head}));
  let readFilter, seenFilter; const countFilters=[];
  t.mock.method(QueryNotificationModel,'updateMany',async filter=>{seenFilter=filter;});
  t.mock.method(QueryNotificationModel,'findOneAndUpdate',filter=>{readFilter=filter;return chain(null);});
  t.mock.method(QueryNotificationModel,'find',filter=>{assert.equal(String(filter.recipient),String(viewer));return chain([]);});
  t.mock.method(QueryNotificationModel,'countDocuments',async filter=>{countFilters.push(filter);return filter.readAt===null?3:8;});
  await queryService.seen(viewer,String(threadId),[String(messageId)]);
  assert.equal(String(seenFilter.recipient),String(viewer));assert.equal(String(seenFilter.thread),String(threadId));assert.deepEqual(seenFilter.message.$in.map(String),[String(messageId)]);assert.equal(seenFilter.readAt,null);
  await assert.rejects(queryService.readNotification(viewer,String(notificationId)),error=>error.statusCode===404);
  assert.equal(String(readFilter.recipient),String(viewer));assert.equal(String(readFilter._id),String(notificationId));
  const inbox=await queryService.notifications(viewer,{page:1,limit:20});
  assert.equal(inbox.unreadCount,3);assert.equal(inbox.meta.total,8);assert.ok(countFilters.every(filter=>filter.recipient.equals(viewer)));
});


test('MIS can read employees and business records organization-wide without widening management policy', () => {
  const employee={actorId:'mis',actorRoleCode:'MIS',actorRoleCategory:'PRIMARY',targetId:'cp',targetRoleCategory:'PRIMARY',targetCreatorIsInActorHierarchy:false,targetHierarchyPath:['md','head','rm']};
  assert.equal(canAccessEmployeeByPolicy({...employee,accessMode:'read'}),true);
  assert.equal(canAccessEmployeeByPolicy({...employee,targetRoleCategory:'ADMIN_HEAD',accessMode:'read'}),true);
  assert.equal(canAccessEmployeeByPolicy(employee),false);
  assert.equal(canAccessEmployeeByPolicy({...employee,accessMode:'manage'}),false);
  for(const resourceType of ['lead','customer','visit','quotation']) {
    const input={actorId:'mis',actorRoleCode:'MIS',actorRoleCategory:'PRIMARY',ownerId:'cp',ownerIsInActorHierarchy:false,resourceType};
    assert.equal(canAccessOwnedResourceByPolicy({...input,accessMode:'read'}),true);
    assert.equal(canAccessOwnedResourceByPolicy(input),false);
    for(const role of ['CP_HEAD','RM','CP']) assert.equal(canAccessOwnedResourceByPolicy({...input,actorRoleCode:role,accessMode:'read'}),false);
  }
});

test('MIS business read permissions work for existing roles without granting MD administration', async (t) => {
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {PermissionModel}=await import('../dist/modules/roles/models/permission.model.js');
  const {roleService,invalidateRolePermissionCache}=await import('../dist/modules/roles/services/role.service.js');
  const {MIS_READ_PERMISSIONS}=await import('../dist/modules/employees/services/visibility-policy.js');
  const actor=new Types.ObjectId(),roleId=new Types.ObjectId();let code='MIS';
  const chain=value=>({select:()=>({lean:async()=>value})});
  t.mock.method(EmployeeModel,'findById',()=>chain({role:roleId,isActive:true}));
  t.mock.method(RoleModel,'findOne',()=>chain({_id:roleId,code,permissions:[],permissionVersion:1}));
  t.mock.method(PermissionModel,'find',()=>chain([]));invalidateRolePermissionCache();
  for(const permission of MIS_READ_PERMISSIONS)assert.equal(await roleService.hasPermission(actor,permission),true,permission);
  for(const permission of ['roles.manage','permissions.manage','employees.create','employees.update','customers.update','leads.assign','audit.read'])assert.equal(await roleService.hasPermission(actor,permission),false,permission);
  code='RM';assert.equal(await roleService.hasPermission(actor,'employees.read'),false);invalidateRolePermissionCache();
});

test('MIS read scopes include all teams for employees, CP, leads, customers, visits and quotations', async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {LeadModel}=await import('../dist/modules/leads/models/lead.model.js');
  const {CustomerModel}=await import('../dist/modules/customers/models/customer.model.js');
  const {VisitModel}=await import('../dist/modules/visits/models/visit.model.js');
  const {QuotationModel}=await import('../dist/modules/quotations/models/quotation.model.js');
  const {employeeService}=await import('../dist/modules/employees/services/employee.service.js');
  const {leadService}=await import('../dist/modules/leads/services/lead.service.js');
  const {visitService}=await import('../dist/modules/visits/services/visit.service.js');
  const {customerService}=await import('../dist/modules/customers/services/customer.service.js');
  const {quotationService}=await import('../dist/modules/quotations/services/quotation.service.js');
  const {accessibleEmployeeScope}=await import('../dist/modules/employees/services/record-list-filter.service.js');
  const {customerScope}=await import('../dist/modules/customers/services/customer-access.service.js');
  const actor=new Types.ObjectId(),roleId=new Types.ObjectId(),cpRole=new Types.ObjectId();
  const queries=new Map();
  const chain=value=>{const q={select:()=>q,populate:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:async()=>value};return q;};
  t.mock.method(EmployeeModel,'findById',()=>chain({role:roleId,isActive:true}));
  t.mock.method(RoleModel,'findOne',()=>{const role={code:'MIS',category:'PRIMARY'};return {...role,...chain(role)};});
  t.mock.method(RoleModel,'findById',()=>chain({code:'MIS',category:'PRIMARY'}));
  t.mock.method(RoleModel,'find',()=>({distinct:async()=>[cpRole]}));
  for(const model of [EmployeeModel,LeadModel,CustomerModel,VisitModel,QuotationModel]){
    t.mock.method(model,'find',query=>{queries.set(model.modelName,query);return chain([]);});
    t.mock.method(model,'countDocuments',async()=>0);
  }
  assert.equal(await accessibleEmployeeScope(actor),null);assert.equal(await customerScope(actor),null);
  const page={page:1,limit:20};
  await employeeService.listAccessible(actor,page,'staff');assert.deepEqual(queries.get('Employee').$and[0],{});assert.ok(queries.get('Employee').$and[1].role.$nin);
  await employeeService.listAccessible(actor,page,'cp');assert.deepEqual(queries.get('Employee').$and[0],{});assert.ok(queries.get('Employee').$and[1].role.$in);
  await employeeService.getDownline(actor,page,'cp');assert.deepEqual(queries.get('Employee').$and[0],{});
  await leadService.list(actor,page,{});assert.equal(queries.get('Lead').$and,undefined);
  await customerService.list(actor,page,{});assert.equal(queries.get('Customer')._id,undefined);
  await visitService.list(actor,page,{});assert.equal(queries.get('Visit').lead,undefined);
  await quotationService.list(actor,page,{});assert.equal(queries.get('Quotation').lead,undefined);
});


test('record detail and history readers use read access, while MIS edits still require manage access',async(t)=>{
  const {Types}=await import('mongoose');
  const {hierarchyService}=await import('../dist/modules/employees/services/hierarchy.service.js');
  const modules=await Promise.all([
    import('../dist/modules/employees/models/employee.model.js'),import('../dist/modules/leads/models/lead.model.js'),import('../dist/modules/customers/models/customer.model.js'),import('../dist/modules/visits/models/visit.model.js'),import('../dist/modules/quotations/models/quotation.model.js'),import('../dist/modules/customers/models/customer-document.model.js'),import('../dist/modules/leads/models/lead-status-history.model.js'),import('../dist/modules/customers/models/customer-activity.model.js'),import('../dist/modules/amc/models/amc-contract.model.js'),import('../dist/modules/amc/models/amc-schedule.model.js'),import('../dist/modules/amc/models/amc-service-history.model.js')
  ]);
  const [employee,lead,customer,visit,quote,document,history,activity,contract,schedule,service]=modules.map(mod=>Object.values(mod)[0]);
  const {employeeService}=await import('../dist/modules/employees/services/employee.service.js');
  const {leadService}=await import('../dist/modules/leads/services/lead.service.js');
  const {visitService}=await import('../dist/modules/visits/services/visit.service.js');
  const {customerService}=await import('../dist/modules/customers/services/customer.service.js');
  const {customerDocumentService}=await import('../dist/modules/customers/services/customer-document.service.js');
  const {quotationService}=await import('../dist/modules/quotations/services/quotation.service.js');
  const {amcService}=await import('../dist/modules/amc/services/amc.service.js');
  const actor=new Types.ObjectId(),owner=new Types.ObjectId(),recordId=new Types.ObjectId();
  const record={_id:recordId,creatorId:owner,sourceLead:recordId,customer:recordId,lead:recordId,firstName:'CP',toObject:()=>({_id:recordId,quotationNumber:'Q-1'})};
  const chain=value=>{const q={select:()=>q,populate:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:async()=>value,then:(resolve,reject)=>Promise.resolve(value).then(resolve,reject)};return q;};
  for(const model of [employee,lead,customer,quote,contract])t.mock.method(model,'findById',()=>chain(record));
  t.mock.method(visit,'findById',()=>chain({...record,lead:{_id:recordId,creatorId:owner}}));
  t.mock.method(customer,'findOne',()=>chain(null));
  for(const model of [document,history,visit,activity,quote,contract,schedule,service])t.mock.method(model,'find',()=>chain([]));
  t.mock.method(service,'countDocuments',async()=>0);
  const checks=[];
  t.mock.method(hierarchyService,'canAccessResource',async(_actor,_owner,kind,mode)=>{checks.push([kind,mode]);return mode==='read';});
  t.mock.method(hierarchyService,'canAccessEmployee',async(_actor,_target,mode)=>{checks.push(['employee',mode]);return mode==='read';});
  t.mock.method(hierarchyService,'getReportingChain',async()=>[record]);
  await employeeService.getById(actor,String(recordId));await employeeService.getHierarchy(actor,String(recordId));
  await leadService.get(actor,String(recordId));await leadService.history(actor,String(recordId));
  await visitService.get(actor,String(recordId));
  await customerService.get(actor,String(recordId));await customerService.timeline(actor,String(recordId));
  await customerDocumentService.list(actor,String(recordId));
  await quotationService.get(actor,String(recordId));
  await amcService.get(String(recordId),actor);await amcService.serviceHistory(String(recordId),{page:1,limit:20},actor);
  assert.ok(checks.every(([,mode])=>mode==='read'));
  for(const operation of [()=>employeeService.update(actor,String(recordId),{firstName:'Changed'}),()=>leadService.update(actor,String(recordId),{customerName:'Changed'}),()=>customerService.update(actor,String(recordId),{customerName:'Changed'}),()=>amcService.cancel(String(recordId),actor)])await assert.rejects(operation(),error=>error.statusCode===404);
});


test('role and permission administration stays MD-only even when MIS has management permissions', async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {requireManagingDirector}=await import('../dist/middleware/authorize.middleware.js');
  const actor=new Types.ObjectId();let code='MIS',isActive=true;
  t.mock.method(EmployeeModel,'findById',()=>({select:()=>({lean:async()=>({role:new Types.ObjectId()})})}));
  t.mock.method(RoleModel,'findById',()=>({select:()=>({lean:async()=>({code,isActive,permissions:['roles.manage','permissions.manage']})})}));
  async function check(){let result;await requireManagingDirector({auth:{employeeId:actor}},{},error=>{result=error;});return result;}
  for(code of ['MIS','CP_HEAD','RM','CP','ADMIN_HEAD'])assert.equal((await check()).statusCode,403,code);
  code='MD';assert.equal(await check(),undefined);
  isActive=false;assert.equal((await check()).statusCode,403);
});


test('MIS and CP Head query inboxes stay private to the chosen recipient while sender and MD retain access',async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {QueryThreadModel,QueryMessageModel,QueryNotificationModel}=await import('../dist/modules/queries/query.models.js');
  const {queryService}=await import('../dist/modules/queries/query.service.js');
  const sender=new Types.ObjectId(),mis=new Types.ObjectId(),otherMis=new Types.ObjectId(),head=new Types.ObjectId(),md=new Types.ObjectId();
  const threads=[{_id:new Types.ObjectId(),createdBy:sender,assignedTo:mis,recipientRole:'MIS'},{_id:new Types.ObjectId(),createdBy:sender,assignedTo:head,recipientRole:'CP_HEAD'}];
  let role='MIS',messageReads=0;
  const chain=value=>{const q={select:()=>q,populate:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:async()=>value};return q;};
  t.mock.method(EmployeeModel,'findOne',()=>chain({role:new Types.ObjectId()}));
  t.mock.method(RoleModel,'findOne',()=>chain({code:role}));
  const match=(row,query)=>!query.$or || query.$or.some(clause=>Object.entries(clause).every(([key,value])=>String(row[key])===String(value)));
  t.mock.method(QueryThreadModel,'find',query=>chain(threads.filter(row=>match(row,query))));
  t.mock.method(QueryThreadModel,'countDocuments',async query=>threads.filter(row=>match(row,query)).length);
  t.mock.method(QueryThreadModel,'findById',id=>chain(threads.find(row=>row._id.equals(id))));
  t.mock.method(QueryMessageModel,'find',()=>{messageReads++;return chain([]);});
  t.mock.method(QueryMessageModel,'countDocuments',async()=>0);
  t.mock.method(QueryNotificationModel,'updateMany',async()=>{throw new Error('Should not update another recipient notifications');});
  const page={page:1,limit:20};
  const misInbox=await queryService.list(mis,page);assert.equal(misInbox.meta.total,1);assert.equal(misInbox.items[0].recipientRole,'MIS');
  assert.equal((await queryService.list(otherMis,page)).meta.total,0);
  await queryService.detail(mis,String(threads[0]._id),page);
  role='CP_HEAD';const headInbox=await queryService.list(head,page);assert.equal(headInbox.meta.total,1);assert.equal(headInbox.items[0].recipientRole,'CP_HEAD');
  await queryService.detail(head,String(threads[1]._id),page);
  const reads=messageReads;
  for(const [actor,code,thread] of [[mis,'MIS',threads[1]],[head,'CP_HEAD',threads[0]],[otherMis,'MIS',threads[0]]]){
    role=code;
    for(const action of [()=>queryService.detail(actor,String(thread._id),page),()=>queryService.reply(actor,String(thread._id),'Private'),()=>queryService.seen(actor,String(thread._id),[String(new Types.ObjectId())])])await assert.rejects(action(),error=>error.statusCode===404);
  }
  assert.equal(messageReads,reads);
  role='RM';assert.equal((await queryService.list(sender,page)).meta.total,2);
  for(const thread of threads)await queryService.detail(sender,String(thread._id),page);
  role='MD';assert.equal((await queryService.list(md,page)).meta.total,2);
  for(const thread of threads)await queryService.detail(md,String(thread._id),page);
});


test('announcement publisher policy enforces exact audiences and MD management',async()=>{
  const {canPublishAnnouncement,allowedAnnouncementRoles,announcementScope,canManageAnnouncement}=await import('../dist/modules/announcements/announcement.policy.js');
  assert.deepEqual(allowedAnnouncementRoles('RM'),['CP']);assert.deepEqual(allowedAnnouncementRoles('CP_HEAD'),['RM','CP']);assert.deepEqual(allowedAnnouncementRoles('MIS'),['CP_HEAD','RM','CP']);assert.equal(allowedAnnouncementRoles('MD'),null);
  for(const role of ['RM','CP_HEAD','MIS','MD'])assert.equal(canPublishAnnouncement(role),true);
  for(const role of ['CP','ADMIN_HEAD','CUSTOM'])assert.equal(canPublishAnnouncement(role),false);
  assert.equal(announcementScope('RM'),'TEAM');assert.equal(announcementScope('CP_HEAD'),'TEAM');assert.equal(announcementScope('MIS'),'ORGANIZATION');
  assert.equal(canManageAnnouncement('mis','MIS','head'),false);assert.equal(canManageAnnouncement('head','CP_HEAD','rm'),false);assert.equal(canManageAnnouncement('rm','RM','rm'),true);assert.equal(canManageAnnouncement('md','MD','rm'),true);
});

test('announcement feed combines audience roles, current downline, activity and expiry without widening MIS visibility',async()=>{
  const {announcementFeedFilter}=await import('../dist/modules/announcements/announcement.policy.js');
  const now=new Date('2026-11-11T10:00:00Z');
  const make=(name,createdBy,scope,audienceRoles,extra={})=>({name,createdBy,scope,audienceRoles,isActive:true,expiresAt:null,...extra});
  const all=['MD','MIS','CP_HEAD','RM','CP'];
  const rows=[make('MD','md','ORGANIZATION',all),make('MIS','mis','ORGANIZATION',['CP_HEAD','RM','CP']),make('Head 1','head1','TEAM',['RM','CP']),make('RM 1','rm1','TEAM',['CP']),make('RM 2','rm2','TEAM',['CP']),make('Stopped','md','ORGANIZATION',all,{isActive:false}),make('Expired','md','ORGANIZATION',all,{expiresAt:new Date('2026-11-11T09:00:00Z')}),make('Future expiry','md','ORGANIZATION',all,{expiresAt:new Date('2026-11-11T11:00:00Z')})];
  const equal=(a,b)=>a==null&&b==null||String(a)===String(b);
  const matches=(row,query)=>Object.entries(query).every(([key,condition])=>{
    if(key==='$and')return condition.every(part=>matches(row,part));if(key==='$or')return condition.some(part=>matches(row,part));
    const value=row[key];if(condition&&typeof condition==='object'&&!(condition instanceof Date)){if('$in'in condition)return condition.$in.some(item=>equal(item,value));if('$gt'in condition)return value&&value>condition.$gt;}
    return Array.isArray(value)?value.some(item=>equal(item,condition)):equal(value,condition);
  });
  const feed=(id,role,path)=>rows.filter(row=>matches(row,announcementFeedFilter(id,role,path,now))).map(row=>row.name);
  assert.deepEqual(feed('cp1','CP',['md','head1','rm1']),['MD','MIS','Head 1','RM 1','Future expiry']);
  assert.deepEqual(feed('cp2','CP',['md','head2','rm2']),['MD','MIS','RM 2','Future expiry']);
  assert.deepEqual(feed('rm1','RM',['md','head1']),['MD','MIS','Head 1','Future expiry']);
  assert.deepEqual(feed('head1','CP_HEAD',['md']),['MD','MIS','Future expiry']);
  assert.deepEqual(feed('mis','MIS',['md']),['MD','Future expiry']);
  assert.deepEqual(feed('md','MD',[]),['MD','MIS','Head 1','RM 1','RM 2','Future expiry']);
  assert.ok(!feed('cp1','CP',['md','head2','rm2']).includes('RM 1'));
});

test('announcement validation rejects empty, oversized and injected audience changes',async()=>{
  const {createAnnouncementSchema,updateAnnouncementSchema}=await import('../dist/modules/announcements/announcement.validation.js');
  const valid={title:'Weekly target',body:'Focus on quality follow-up.',category:'TARGET',audienceRoles:['CP']};
  assert.equal(createAnnouncementSchema.validate(valid).error,undefined);
  for(const change of [{title:' '},{body:'x'.repeat(2001)},{category:'OTHER'},{audienceRoles:[]},{audienceRoles:['CP','CP']},{expiresAt:'2000-01-01'}])assert.ok(createAnnouncementSchema.validate({...valid,...change}).error);
  assert.equal(updateAnnouncementSchema.validate({audienceRoles:['MD']}).error, undefined);
  assert.ok(updateAnnouncementSchema.validate({audienceRoles:[]}).error);
  assert.ok(updateAnnouncementSchema.validate({audienceRoles:['CP','CP']}).error);
  assert.equal(updateAnnouncementSchema.validate({isActive:false}).error,undefined);
  assert.equal(updateAnnouncementSchema.validate({expiresAt:null}).error,undefined);
});

test('announcement services reject audience escalation, enforce feed scope and protect other authors',async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {AnnouncementModel}=await import('../dist/modules/announcements/announcement.model.js');
  const {announcementService}=await import('../dist/modules/announcements/announcement.service.js');
  const actor=new Types.ObjectId(),head=new Types.ObjectId(),announcementId=new Types.ObjectId();let role='RM',created,listFilter,findFilter,allowRecord=false;const changed=[];
  const chain=value=>{const q={select:()=>q,populate:()=>q,sort:()=>q,skip:()=>q,limit:()=>q,lean:async()=>value};return q;};
  t.mock.method(EmployeeModel,'findOne',()=>chain({_id:actor,role:new Types.ObjectId(),hierarchyPath:[head]}));
  t.mock.method(RoleModel,'findOne',()=>chain({code:role}));
  t.mock.method(RoleModel,'find',query=>chain((query.code.$in??['MD','MIS','CP_HEAD','RM','CP']).map(code=>({code,name:code}))));
  t.mock.method(AnnouncementModel,'create',async input=>{created=input;return {_id:announcementId,...input};});
  t.mock.method(AnnouncementModel,'find',query=>{listFilter=query;return chain([]);});
  t.mock.method(AnnouncementModel,'countDocuments',async()=>0);
  t.mock.method(AnnouncementModel,'findOne',async query=>{findFilter=query;return allowRecord?{createdBy:actor,set:(key,value)=>changed.push([key,value]),save:async()=>{}}:null;});
  const input={title:'Target',body:'Team focus',category:'TARGET',audienceRoles:['CP'],scope:'ORGANIZATION',createdBy:head};
  await announcementService.create(actor,input);assert.equal(created.scope,'TEAM');assert.equal(created.createdBy,actor);assert.equal(created.authorRole,'RM');
  await assert.rejects(announcementService.create(actor,{...input,audienceRoles:['RM']}),error=>error.statusCode===403);
  role='CP_HEAD';await announcementService.create(actor,{...input,audienceRoles:['RM','CP']});assert.equal(created.scope,'TEAM');
  role='MIS';await announcementService.create(actor,{...input,audienceRoles:['CP_HEAD','RM','CP']});assert.equal(created.scope,'ORGANIZATION');
  await assert.rejects(announcementService.create(actor,{...input,audienceRoles:['MD']}),error=>error.statusCode===403);
  const page={page:1,limit:20};await announcementService.list(actor,page);assert.equal(listFilter.createdBy,actor);
  await announcementService.feed(actor,page);assert.equal(listFilter.$and[1].audienceRoles,'MIS');
  await assert.rejects(announcementService.update(actor,String(announcementId),{isActive:false}),error=>error.statusCode===404);assert.equal(findFilter.createdBy,actor);
  role='MD';await announcementService.list(actor,page);assert.deepEqual(listFilter,{});
  allowRecord=true;await announcementService.update(actor,String(announcementId),{body:'Updated',isActive:false,scope:'ORGANIZATION'});assert.equal(findFilter.createdBy,undefined);assert.deepEqual(changed,[['body','Updated'],['isActive',false]]);
  role='CP';await assert.rejects(announcementService.create(actor,input),error=>error.statusCode===403);
});


test('Admin Head is excluded from MD announcement audiences and rejected even if legacy data remains active',async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {AnnouncementModel}=await import('../dist/modules/announcements/announcement.model.js');
  const {announcementService}=await import('../dist/modules/announcements/announcement.service.js');
  const actor=new Types.ObjectId();let roleFilter;
  const chain=value=>{const q={select:()=>q,sort:()=>q,lean:async()=>value};return q;};
  t.mock.method(EmployeeModel,'findOne',()=>chain({_id:actor,role:new Types.ObjectId(),hierarchyPath:[]}));
  t.mock.method(RoleModel,'findOne',()=>chain({code:'MD'}));
  t.mock.method(RoleModel,'find',filter=>{roleFilter=filter;return chain(filter.code.$in?[{code:'ADMIN_HEAD'}]:[{code:'CP',name:'Channel Partner'}]);});
  const create=t.mock.method(AnnouncementModel,'create',async()=>{throw new Error('Must not publish');});
  await announcementService.audience(actor);
  assert.ok(roleFilter.code.$nin.includes('ADMIN_HEAD'));assert.equal(roleFilter.category.$ne,'ADMIN_HEAD');
  await assert.rejects(announcementService.create(actor,{title:'Business',body:'News',category:'BUSINESS',audienceRoles:['ADMIN_HEAD']}),error=>error.statusCode===403);
  assert.equal(create.mock.callCount(),0);
});

test('Admin Head retirement disables legacy roles, removes creation links and revokes sessions without deleting histories',async(t)=>{
  const {Types}=await import('mongoose');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RefreshTokenModel}=await import('../dist/modules/auth/models/refresh-token.model.js');
  const {retireAdminHeadRole}=await import('../dist/modules/roles/services/retire-admin-head.js');
  const role=new Types.ObjectId(),employee=new Types.ObjectId();let available=true;
  t.mock.method(RoleModel,'find',()=>({select:()=>({lean:async()=>available?[{_id:role}]:[]})}));
  const roles=t.mock.method(RoleModel,'updateMany',async()=>({}));
  t.mock.method(EmployeeModel,'find',()=>({distinct:async()=>[employee]}));
  const tokens=t.mock.method(RefreshTokenModel,'updateMany',async()=>({}));
  const employeeDelete=t.mock.method(EmployeeModel,'deleteMany',async()=>{throw new Error('Must preserve employee history');});
  const roleDelete=t.mock.method(RoleModel,'deleteMany',async()=>{throw new Error('Must preserve role references');});
  await retireAdminHeadRole();
  assert.equal(roles.mock.calls[0].arguments[1].$set.isActive,false);assert.deepEqual(roles.mock.calls[0].arguments[1].$set.allowedChildRoles,[]);assert.deepEqual(roles.mock.calls[1].arguments[1].$pull.allowedChildRoles.$in,[role]);
  assert.deepEqual(tokens.mock.calls[0].arguments[0].employee.$in,[employee]);assert.equal(tokens.mock.calls[0].arguments[0].revokedAt,null);
  assert.equal(employeeDelete.mock.callCount(),0);assert.equal(roleDelete.mock.callCount(),0);
  available=false;await retireAdminHeadRole();assert.equal(roles.mock.callCount(),2);
});


test('announcement audience edits validate editor limits and atomically update recipients and scope',async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {AnnouncementModel}=await import('../dist/modules/announcements/announcement.model.js');
  const {announcementService}=await import('../dist/modules/announcements/announcement.service.js');
  const actor=new Types.ObjectId(),other=new Types.ObjectId(),id=new Types.ObjectId();let code='CP_HEAD',saved=0,lastFilter;
  const chain=value=>{const q={select:()=>q,lean:async()=>value};return q;};
  const record={createdBy:actor,audienceRoles:['RM','CP'],scope:'TEAM',updatedBy:actor,set(key,value){this[key]=value;},async save(){saved++;}};
  t.mock.method(EmployeeModel,'findOne',()=>chain({role:new Types.ObjectId()}));
  t.mock.method(RoleModel,'findOne',()=>chain({code}));
  t.mock.method(RoleModel,'find',query=>chain(query.code.$in.map(code=>({code}))));
  t.mock.method(AnnouncementModel,'findOne',async query=>{lastFilter=query;return query.createdBy && !query.createdBy.equals(record.createdBy)?null:record;});
  await announcementService.update(actor,String(id),{audienceRoles:['CP']});assert.deepEqual(record.audienceRoles,['CP']);assert.equal(record.scope,'TEAM');
  code='MIS';await announcementService.update(actor,String(id),{audienceRoles:['CP_HEAD','RM','CP']});assert.equal(record.scope,'ORGANIZATION');assert.deepEqual(record.audienceRoles,['CP_HEAD','RM','CP']);
  code='MD';record.createdBy=other;await announcementService.update(actor,String(id),{audienceRoles:['MD','MIS']});assert.equal(lastFilter.createdBy,undefined);assert.equal(record.scope,'ORGANIZATION');assert.deepEqual(record.audienceRoles,['MD','MIS']);
  const count=saved;
  for(const [role,audience]of[['RM',['RM']],['CP_HEAD',['MIS']],['MIS',['MD']],['MD',['ADMIN_HEAD']],['MD',['MH']],['MD',[]],['MD',['CP','CP']]]){
    code=role;record.createdBy=actor;await assert.rejects(announcementService.update(actor,String(id),{audienceRoles:audience}),error=>error.statusCode===403);
  }
  assert.equal(saved,count);
  code='RM';record.createdBy=other;await assert.rejects(announcementService.update(actor,String(id),{audienceRoles:['CP']}),error=>error.statusCode===404);assert.equal(saved,count);
  code='MD';record.createdBy=other;record.audienceRoles=['CP'];record.scope='TEAM';await announcementService.update(actor,String(id),{body:'Content only'});assert.equal(record.scope,'TEAM');
  await announcementService.update(actor,String(id),{audienceRoles:['CP'],title:'Same recipients'});assert.equal(record.scope,'TEAM');assert.deepEqual(record.audienceRoles,['CP']);
});


test('candidate deletion requires explicit confirmation', async () => {
  const {deleteCallingCandidateSchema}=await import('../dist/modules/calling-lists/calling-list.routes.js');
  for(const input of [{},{confirm:false},{confirm:'false'},{confirm:true,extra:1}]) assert.ok(deleteCallingCandidateSchema.validate(input).error);
  assert.equal(deleteCallingCandidateSchema.validate({confirm:'true'}).value.confirm,true);
  const {callingListService}=await import('../dist/modules/calling-lists/calling-list.service.js');
  await assert.rejects(callingListService.deleteCandidate(null,'invalid','invalid',false),error=>error.statusCode===400);
});

test('candidate hard deletion enforces ownership, list scope, locking and transactional counts', async(t)=>{
  await mockCallingTransactions(t);
  const {default:mongoose,Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {CallingListModel,CallingCandidateModel}=await import('../dist/modules/calling-lists/calling-list.model.js');
  const {callingListService:service}=await import('../dist/modules/calling-lists/calling-list.service.js');
  const {callingListStorage}=await import('../dist/modules/calling-lists/calling-list.storage.js');
  const actor=new Types.ObjectId(),other=new Types.ObjectId(),id=new Types.ObjectId(),rowId=new Types.ObjectId(),session={};
  let code='MD',locked=true,found=true,matched=1,count=0,convertedRow=true,callStatus='NOT_CALLED';
  const list={_id:id,uploadedBy:other,assignedTo:other,state:'READY',rowCount:1};
  const chain=value=>({select:()=>({lean:async()=>value})});
  t.mock.method(EmployeeModel,'findOne',()=>chain({role:new Types.ObjectId()}));
  t.mock.method(RoleModel,'findOne',()=>chain({code}));
  t.mock.method(CallingListModel,'findById',()=>({select:async()=>list}));
  const lock=t.mock.method(CallingListModel,'findOneAndUpdate',async filter=>{
    assert.equal(filter._id,id);assert.equal(filter.assignedTo,list.assignedTo);assert.equal(filter.busy,false);assert.equal(filter.state,'READY');return locked?list:null;
  });
  const transaction=t.mock.method(mongoose.connection,'transaction',async callback=>callback(session));
  const deletion=t.mock.method(CallingCandidateModel,'findOneAndDelete',async(filter,options)=>{
    assert.equal(String(filter._id),String(rowId));assert.equal(filter.list,id);assert.equal(options.session,session);
    return found?{_id:rowId,employee:convertedRow?new Types.ObjectId():null,callStatus}:null;
  });
  t.mock.method(CallingCandidateModel,'countDocuments',filter=>{assert.equal(filter.list,id);return {session:async value=>{assert.equal(value,session);return count;}};});
  const updates=t.mock.method(CallingListModel,'updateOne',async(filter,update,options)=>{
    if('rowCount' in update.$set){assert.equal(options.session,session);assert.equal(filter.busy,true);assert.equal(update.$set.rowCount,count);assert.equal(update.$inc.deletedConvertedCount,convertedRow?1:0);assert.equal(update.$inc.deletedCalledCount,convertedRow||callStatus!=='NOT_CALLED'?1:0);return {matchedCount:matched};}
    assert.equal(update.$set.busy,false);return {matchedCount:1};
  });
  const employeeDelete=t.mock.method(EmployeeModel,'deleteOne',async()=>{throw new Error('Must preserve CP accounts');});
  const storageDelete=t.mock.method(callingListStorage,'remove',async()=>{throw new Error('Must preserve original workbook');});
  const remove=()=>service.deleteCandidate(actor,String(id),String(rowId),true);
  assert.equal((await remove()).rowCount,0);
  code='MIS';list.uploadedBy=actor;count=25;assert.equal((await remove()).rowCount,25);
  code='RM';list.assignedTo=actor;await remove();
  const successful=deletion.mock.callCount();assert.equal(successful,3);
  list.assignedTo=other;await assert.rejects(remove(),e=>e.statusCode===404);
  code='MIS';list.uploadedBy=other;await assert.rejects(remove(),e=>e.statusCode===404);
  code='CP';await assert.rejects(remove(),e=>e.statusCode===403);
  assert.equal(deletion.mock.callCount(),successful);assert.equal(lock.mock.callCount(),3);
  code='MD';locked=false;await assert.rejects(remove(),e=>e.statusCode===409);assert.equal(transaction.mock.callCount(),3);
  locked=true;found=false;await assert.rejects(remove(),e=>e.statusCode===404);
  assert.equal(updates.mock.calls.at(-1).arguments[1].$set.busy,false);
  found=true;matched=0;await assert.rejects(remove(),e=>e.statusCode===409);
  assert.equal(updates.mock.calls.at(-1).arguments[1].$set.busy,false);
  matched=1;convertedRow=false;callStatus='NEEDS_FOLLOWUP';await remove();callStatus='NOT_CALLED';await remove();
  assert.equal(employeeDelete.mock.callCount(),0);assert.equal(storageDelete.mock.callCount(),0);
});


test('CP cannot send quotations even if sharing permission was previously assigned',async(t)=>{
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {PermissionModel}=await import('../dist/modules/roles/models/permission.model.js');
  const {roleService,invalidateRolePermissionCache}=await import('../dist/modules/roles/services/role.service.js');
  const {quotationService}=await import('../dist/modules/quotations/services/quotation.service.js');
  const {PublicShareLinkModel}=await import('../dist/modules/quotations/models/public-share-link.model.js');
  const {QuotationShareModel}=await import('../dist/modules/quotations/models/quotation-share.model.js');
  const actor=new Types.ObjectId(),roleId=new Types.ObjectId();let code='RM';
  const chain=value=>({select:()=>({lean:async()=>value})});
  t.mock.method(EmployeeModel,'findById',()=>chain({isActive:true,role:roleId}));
  t.mock.method(RoleModel,'findOne',()=>chain({_id:roleId,code,permissionVersion:1,permissions:[]}));
  t.mock.method(PermissionModel,'find',()=>chain([{code:'quotations.share'},{code:'quotations.read'}]));
  const links=t.mock.method(PublicShareLinkModel,'create',async()=>{throw new Error('Must not create share link');});
  const history=t.mock.method(QuotationShareModel,'create',async()=>{throw new Error('Must not create share history');});
  invalidateRolePermissionCache();
  assert.equal(await roleService.hasPermission(actor,'quotations.share'),true);
  code='CP';assert.equal(await roleService.hasPermission(actor,'quotations.share'),false);
  assert.equal(await roleService.hasPermission(actor,'quotations.read'),true);
  await assert.rejects(quotationService.shareQuotation(actor,String(new Types.ObjectId()),'9999999999'),e=>e.statusCode===403);
  assert.equal(links.mock.callCount(),0);assert.equal(history.mock.callCount(),0);
  code='MD';assert.equal(await roleService.hasPermission(actor,'quotations.share'),true);
  invalidateRolePermissionCache();
});


test('calling-list conversion identifies duplicate mobile/email without linking another employee and releases its lock',async(t)=>{
  await mockCallingTransactions(t);
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {CallingListModel,CallingCandidateModel}=await import('../dist/modules/calling-lists/calling-list.model.js');
  const {employeeService}=await import('../dist/modules/employees/services/employee.service.js');
  const {callingListService}=await import('../dist/modules/calling-lists/calling-list.service.js');
  const rm=new Types.ObjectId(),listId=new Types.ObjectId(),rowId=new Types.ObjectId();let field='mobileNumber',keyStyle='keyPattern',recover=false;
  const recoveredId=new Types.ObjectId();
  const query=value=>({select:()=>({lean:async()=>value})});
  t.mock.method(EmployeeModel,'findOne',filter=>query(filter.employeeCode?(recover?{_id:recoveredId}:null):{_id:rm,role:new Types.ObjectId()}));
  t.mock.method(RoleModel,'findOne',filter=>query({_id:new Types.ObjectId(),code:filter.code??'RM'}));
  t.mock.method(CallingListModel,'findById',()=>({select:async()=>({_id:listId,assignedTo:rm,uploadedBy:new Types.ObjectId()})}));
  t.mock.method(CallingListModel,'findOneAndUpdate',async()=>({}));
  const release=t.mock.method(CallingListModel,'updateOne',async()=>({}));
  t.mock.method(CallingCandidateModel,'findOne',async()=>({_id:rowId,employee:null}));
  const link=t.mock.method(CallingCandidateModel,'updateOne',async()=>({}));
  t.mock.method(employeeService,'create',async()=>{throw Object.assign(new Error('duplicate'),{code:11000,[keyStyle]:{[field]:1}});});
  for(const [duplicateField,style,expected]of[['mobileNumber','keyPattern',/mobile number is already registered/],['email','keyPattern',/email is already registered/],['mobileNumber','keyValue',/mobile number is already registered/],['other','keyPattern',/conflicts with an existing record/]]){
    field=duplicateField;keyStyle=style;
    await assert.rejects(callingListService.createCp(rm,String(listId),String(rowId),{}),e=>e.statusCode===409&&expected.test(e.message));
  }
  assert.equal(link.mock.callCount(),0);assert.equal(release.mock.callCount(),4);
  assert.ok(release.mock.calls.every(call=>call.arguments[1].$set.busy===false));
  recover=true;const result=await callingListService.createCp(rm,String(listId),String(rowId),{});
  assert.equal(String(result.employeeId),String(recoveredId));assert.equal(result.invitationSent,false);assert.equal(link.mock.callCount(),1);
});


test('calling-list totals cover all rows and retain upload/conversion history after deletion',async(t)=>{
  const {Types}=await import('mongoose');
  const {CallingCandidateModel,CallingListModel}=await import('../dist/modules/calling-lists/calling-list.model.js');
  const {callingListCounts}=await import('../dist/modules/calling-lists/calling-list-counts.js');
  const id=new Types.ObjectId(),empty=new Types.ObjectId();let pipeline;
  t.mock.method(CallingCandidateModel,'aggregate',async input=>{pipeline=input;return [{_id:id,remaining:30,converted:7}];});
  const update=t.mock.method(CallingListModel,'updateOne',async()=>{throw new Error('Must preserve stored original total');});
  const result=await callingListCounts([{_id:id,rowCount:30,originalRowCount:35,deletedConvertedCount:2,bucket:'private',key:'secret'},{_id:empty,rowCount:0,originalRowCount:4,deletedConvertedCount:1}]);
  assert.deepEqual(pipeline[0].$match.list.$in,[id,empty]);
  assert.equal(result[0].originalRowCount,35);assert.equal(result[0].convertedCount,9);assert.equal(result[0].unconvertedCount,23);assert.equal(result[0].deletedCount,5);assert.equal(result[0].totalCallingCount,14);
  assert.equal(result[0].key,undefined);assert.equal(result[0].bucket,undefined);
  assert.equal(result[1].unconvertedCount,0);assert.equal(result[1].convertedCount,1);assert.equal(result[1].deletedCount,4);assert.equal(result[1].totalCallingCount,5);assert.equal(update.mock.callCount(),0);
});

test('legacy calling-list totals recover once from the original workbook and tolerate S3 outages',async(t)=>{
  const {Types}=await import('mongoose');
  const ExcelJS=(await import('exceljs')).default;
  const {CallingCandidateModel,CallingListModel}=await import('../dist/modules/calling-lists/calling-list.model.js');
  const {callingListCounts}=await import('../dist/modules/calling-lists/calling-list-counts.js');
  const {callingListStorage}=await import('../dist/modules/calling-lists/calling-list.storage.js');
  const {logger}=await import('../dist/services/logger.service.js');
  const id=new Types.ObjectId();let unavailable=false;
  const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Candidates');sheet.addRow(['Name']);sheet.addRow(['Candidate A']);sheet.addRow(['Candidate B']);sheet.addRow(['Candidate C']);
  const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
  t.mock.method(CallingCandidateModel,'aggregate',async()=>[{_id:id,remaining:1,converted:0}]);
  const read=t.mock.method(callingListStorage,'read',async()=>{if(unavailable)throw new Error('Unavailable');return bytes;});
  const update=t.mock.method(CallingListModel,'updateOne',async()=>({modifiedCount:1}));
  t.mock.method(logger,'warn',()=>{});
  const list={_id:id,rowCount:1,bucket:'private',key:'secret'};
  const [recovered]=await callingListCounts([list]);assert.equal(recovered.originalRowCount,3);assert.equal(recovered.deletedCount,2);assert.equal(recovered.totalCallingCount,2);assert.equal(recovered.unconvertedCount,1);
  assert.equal(update.mock.calls[0].arguments[0].originalRowCount.$exists,false);assert.equal(update.mock.calls[0].arguments[1].$set.originalRowCount,3);
  await callingListCounts([{...list,originalRowCount:3}]);assert.equal(read.mock.callCount(),1);
  unavailable=true;const [missing]=await callingListCounts([list]);assert.equal(missing.originalRowCount,null);assert.equal(missing.totalCallingCount,null);assert.equal(missing.unconvertedCount,1);assert.equal(update.mock.callCount(),1);
});


test('candidate calling status validation requires a follow-up date and rejects invalid or injected fields',async()=>{
  const {candidateStatusSchema}=await import('../dist/modules/calling-lists/calling-list.routes.js');
  for(const callStatus of ['NOT_CALLED','INTERESTED','NOT_INTERESTED']){
    const result=candidateStatusSchema.validate({callStatus});assert.equal(result.error,undefined);assert.equal(result.value.nextFollowUpAt,null);
  }
  const followUp={callStatus:'NEEDS_FOLLOWUP',nextFollowUpAt:'2027-01-20T09:30:00.000Z',callNote:' Call again '};
  const result=candidateStatusSchema.validate(followUp);assert.equal(result.error,undefined);assert.equal(result.value.callNote,'Call again');assert.ok(result.value.nextFollowUpAt instanceof Date);
  for(const input of [{},{callStatus:'OTHER'},{callStatus:'NEEDS_FOLLOWUP'},{...followUp,nextFollowUpAt:'bad'}, {...followUp,nextFollowUpAt:null},{callStatus:'INTERESTED',nextFollowUpAt:followUp.nextFollowUpAt},{callStatus:'INTERESTED',callNote:'x'.repeat(1001)},{callStatus:'INTERESTED',employee:'0123456789abcdef01234567'}])assert.ok(candidateStatusSchema.validate(input).error);
});

test('candidate calling updates enforce list access, row scope and conversion locks and save reviewed outcomes',async(t)=>{
  await mockCallingTransactions(t);
  const {Types}=await import('mongoose');
  const {EmployeeModel}=await import('../dist/modules/employees/models/employee.model.js');
  const {RoleModel}=await import('../dist/modules/roles/models/role.model.js');
  const {CallingListModel,CallingCandidateModel}=await import('../dist/modules/calling-lists/calling-list.model.js');
  const {callingListService:service}=await import('../dist/modules/calling-lists/calling-list.service.js');
  const actor=new Types.ObjectId(),other=new Types.ObjectId(),listId=new Types.ObjectId(),rowId=new Types.ObjectId();let code='RM',locked=true,found=true,saved=0;
  const list={_id:listId,uploadedBy:other,assignedTo:actor};
  const row={_id:rowId,employee:null,async save(){saved++;}};
  const chain=value=>({select:()=>({lean:async()=>value})});
  t.mock.method(EmployeeModel,'findOne',()=>chain({role:new Types.ObjectId()}));
  t.mock.method(RoleModel,'findOne',()=>chain({code}));
  t.mock.method(CallingListModel,'findById',()=>({select:async()=>list}));
  const lock=t.mock.method(CallingListModel,'findOneAndUpdate',async filter=>{assert.equal(filter.assignedTo,list.assignedTo);assert.equal(filter.state,'READY');assert.equal(filter.busy,false);return locked?list:null;});
  const release=t.mock.method(CallingListModel,'updateOne',async()=>({}));
  t.mock.method(CallingCandidateModel,'findOne',async filter=>{assert.equal(filter.list,listId);assert.equal(filter._id,String(rowId));return found?row:null;});
  const update=input=>service.updateCandidateStatus(actor,String(listId),String(rowId),input);
  const date=new Date('2027-01-20T09:30:00.000Z');
  const result=await update({callStatus:'NEEDS_FOLLOWUP',callNote:'Try tomorrow',nextFollowUpAt:date});assert.equal(result.callStatus,'NEEDS_FOLLOWUP');assert.equal(row.nextFollowUpAt,date);assert.equal(row.statusUpdatedBy,actor);assert.ok(row.lastCalledAt instanceof Date);
  code='MD';await update({callStatus:'INTERESTED'});assert.equal(row.nextFollowUpAt,null);assert.equal(row.callNote,'');
  code='MIS';list.uploadedBy=actor;await update({callStatus:'NOT_CALLED'});assert.equal(row.lastCalledAt,null);
  list.uploadedBy=other;await assert.rejects(update({callStatus:'INTERESTED'}),e=>e.statusCode===404);
  code='RM';list.assignedTo=other;await assert.rejects(update({callStatus:'INTERESTED'}),e=>e.statusCode===404);assert.equal(lock.mock.callCount(),3);
  list.assignedTo=actor;locked=false;await assert.rejects(update({callStatus:'INTERESTED'}),e=>e.statusCode===409);
  locked=true;found=false;await assert.rejects(update({callStatus:'INTERESTED'}),e=>e.statusCode===404);
  found=true;row.employee=new Types.ObjectId();await assert.rejects(update({callStatus:'INTERESTED'}),e=>e.statusCode===409);
  assert.equal(saved,3);assert.equal(release.mock.callCount(),5);assert.ok(release.mock.calls.every(call=>call.arguments[1].$set.busy===false));
});

test('calling progress reports all-list outcomes independently of preview pagination',async(t)=>{
  const {Types}=await import('mongoose');
  const {CallingCandidateModel}=await import('../dist/modules/calling-lists/calling-list.model.js');
  const {callingListCounts}=await import('../dist/modules/calling-lists/calling-list-counts.js');
  const id=new Types.ObjectId();
  t.mock.method(CallingCandidateModel,'aggregate',async pipeline=>{assert.deepEqual(pipeline[0].$match.list.$in,[id]);return [{_id:id,remaining:48,converted:5,called:30,interested:10,followUp:8,notCalled:18}];});
  const [result]=await callingListCounts([{_id:id,rowCount:48,originalRowCount:50,deletedConvertedCount:1,deletedCalledCount:2}]);
  assert.equal(result.calledCount,32);assert.equal(result.interestedCount,10);assert.equal(result.followUpCount,8);assert.equal(result.notCalledCount,18);assert.equal(result.convertedCount,6);assert.equal(result.totalCallingCount,26);
});

async function mockCallingTransactions(t){
  const {default:mongoose}=await import('mongoose');
  const {callingActivity}=await import('../dist/modules/calling-reports/calling-activity.service.js');
  t.mock.method(mongoose.connection,'transaction',async callback=>callback({}));
  return t.mock.method(callingActivity,'record',async()=>{});
}


test('calling report dates respect IST midnight, seven-day ranges and calendar months',async()=>{
  const {indiaDay,reportRange}=await import('../dist/modules/calling-reports/calling-report.policy.js');
  assert.equal(indiaDay(new Date('2026-11-12T18:29:59.999Z')),'2026-11-12');
  assert.equal(indiaDay(new Date('2026-11-12T18:30:00.000Z')),'2026-11-13');
  const day=reportRange('DAY','2026-11-12');assert.equal(day.start.toISOString(),'2026-11-11T18:30:00.000Z');assert.equal(day.end.toISOString(),'2026-11-12T18:30:00.000Z');
  const week=reportRange('WEEK','2026-01-03');assert.equal(week.fromDay,'2025-12-28');assert.equal(week.toDay,'2026-01-03');
  const month=reportRange('MONTH','2024-02-22');assert.equal(month.fromDay,'2024-02-01');assert.equal(month.toDay,'2024-02-29');
  for(const value of ['2026-02-30','bad','2026-13-01'])assert.throws(()=>reportRange('DAY',value));
});

test('calling report visibility and verification keep RM and upline scopes separate from MIS reads',async()=>{
  const {canViewCallingReport:read,canVerifyCallingReport:verify}=await import('../dist/modules/calling-reports/calling-report.policy.js');
  assert.equal(read('RM','rm','rm',['md','head']),true);assert.equal(read('RM','other','rm',['md','head']),false);
  assert.equal(read('CP_HEAD','head','rm',['md','head']),true);assert.equal(read('CP_HEAD','other','rm',['md','head']),false);
  assert.equal(read('MIS','mis','rm',['md','head']),true);assert.equal(read('CP','cp','rm',['md','head']),false);
  assert.equal(verify('RM','rm','rm',['md','head']),false);assert.equal(verify('MIS','mis','rm',['md','head']),false);
  assert.equal(verify('CP_HEAD','head','rm',['md','head']),true);assert.equal(verify('CP_HEAD','other','rm',['md','head']),false);assert.equal(verify('MD','md','rm',[]),true);
});

test('calling report validators reject caller supplied report counts, verification identity and scope',async()=>{
  const {callingReportQuerySchema,verifyCallingReportSchema}=await import('../dist/modules/calling-reports/calling-report.routes.js');
  assert.equal(callingReportQuerySchema.validate({period:'WEEK',date:'2026-11-12'}).error,undefined);
  assert.ok(callingReportQuerySchema.validate({period:'YEAR'}).error);assert.ok(callingReportQuerySchema.validate({rmId:'bad'}).error);assert.ok(callingReportQuerySchema.validate({scope:'ALL'}).error);
  assert.equal(verifyCallingReportSchema.validate({revision:1,reviewNote:' Reviewed '}).value.reviewNote,'Reviewed');
  for(const value of [{},{revision:0},{revision:1,verifiedBy:'caller'},{revision:1,totals:{called:999}}])assert.ok(verifyCallingReportSchema.validate(value).error);
});


test('calling-list filter validation accepts RM and upload dates but rejects invalid, reversed and injected filters',async()=>{
  const {callingListQuerySchema}=await import('../dist/modules/calling-lists/calling-list.routes.js');
  const good={rmId:'0123456789abcdef01234567',dateFrom:'2026-11-12',dateTo:'2026-11-12',page:2,limit:20};
  assert.equal(callingListQuerySchema.validate(good).error,undefined);
  for(const value of [{rmId:'bad'},{dateFrom:'2026-02-30'},{dateFrom:'2026-11-13',dateTo:'2026-11-12'},{dateTo:'bad'},{uploadedBy:'caller'},{scope:'ALL'}])assert.ok(callingListQuerySchema.validate(value).error);
});

test('calling-list filters intersect visibility and use inclusive IST upload dates',async()=>{
  const {Types}=await import('mongoose');
  const {filterCallingLists,canFilterCallingLists}=await import('../dist/modules/calling-lists/calling-list-filters.js');
  const actor=new Types.ObjectId(),rm=new Types.ObjectId(),scope={state:'READY',uploadedBy:actor};
  const filtered=filterCallingLists(scope,'MIS',{rmId:String(rm),dateFrom:'2026-11-12',dateTo:'2026-11-12'});
  assert.equal(filtered.$and[0],scope);assert.equal(String(filtered.$and[1].assignedTo),String(rm));
  assert.equal(filtered.$and[2].createdAt.$gte.toISOString(),'2026-11-11T18:30:00.000Z');assert.equal(filtered.$and[2].createdAt.$lt.toISOString(),'2026-11-12T18:30:00.000Z');
  for(const code of ['MD','MIS','CP_HEAD'])assert.equal(canFilterCallingLists(code),true);
  assert.equal(canFilterCallingLists('RM'),false);assert.throws(()=>filterCallingLists({assignedTo:actor},'RM',{rmId:String(rm)}),e=>e.statusCode===403);
  assert.throws(()=>filterCallingLists({assignedTo:actor},'RM',{dateFrom:'2026-11-12'}),e=>e.statusCode===403);
  const {canReadCallingList,canConvertCallingCandidate}=await import('../dist/modules/calling-lists/calling-list.policy.js');
  assert.equal(canReadCallingList('CP_HEAD','head','mis','rm',true),true);assert.equal(canReadCallingList('CP_HEAD','head','mis','rm',false),false);assert.equal(canReadCallingList('CP_HEAD','head','mis',null,true),false);assert.equal(canConvertCallingCandidate('CP_HEAD','head','rm'),false);
});

test('CP-to-customer conversion requires complete customer details, four documents and explicit confirmation', async () => {
  const { cpCustomerSchema } = await import('../dist/modules/customers/services/cp-customer.service.js');
  const id = '0123456789abcdef01234567';
  const input = { customerName: 'Fixture CP', mobileNumber: '9876543210', siteAddress: '1 Main Road', branch: id, state: id, district: id,
    requiredCapacityKW: 3, ratePerKW: 40000, paymentMode: 'Cash', panelBrand: 'Fixture', panelTechnology: 'Mono', remark: 'Customer conversion',
    documentUploadIds: ['0123456789abcdef01234561', '0123456789abcdef01234562', '0123456789abcdef01234563', '0123456789abcdef01234564'], confirmed: true };
  assert.equal(cpCustomerSchema.validate(input).error, undefined);
  for (const key of Object.keys(input)) { const incomplete = { ...input }; delete incomplete[key]; assert.ok(cpCustomerSchema.validate(incomplete).error, key); }
  for (const confirmed of [false, 'true', 1]) assert.ok(cpCustomerSchema.validate({ ...input, confirmed }).error);
  assert.ok(cpCustomerSchema.validate({ ...input, documentUploadIds: Array(4).fill(id) }).error);
  assert.ok(cpCustomerSchema.validate({ ...input, requiredCapacityKW: 0.01 }).error);
});
