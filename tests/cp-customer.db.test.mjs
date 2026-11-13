import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose, { Types } from 'mongoose';
import { S3Client } from '@aws-sdk/client-s3';
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_S3_CUSTOMER_DOCUMENT_BUCKET = 'fixture-only';
const { env } = await import('../dist/config/env.config.js');
const { EmployeeModel } = await import('../dist/modules/employees/models/employee.model.js');
const { RoleModel } = await import('../dist/modules/roles/models/role.model.js');
const { LeadModel } = await import('../dist/modules/leads/models/lead.model.js');
const { CustomerModel } = await import('../dist/modules/customers/models/customer.model.js');
const { CustomerDocumentModel } = await import('../dist/modules/customers/models/customer-document.model.js');
const { CustomerDocumentUploadModel } = await import('../dist/modules/customers/models/customer-document-upload.model.js');
const { CustomerActivityModel } = await import('../dist/modules/customers/models/customer-activity.model.js');
const { StateModel } = await import('../dist/modules/geography/models/state.model.js');
const { DistrictModel } = await import('../dist/modules/geography/models/district.model.js');
const { BranchModel } = await import('../dist/modules/geography/models/branch.model.js');
const { cpCustomerService } = await import('../dist/modules/customers/services/cp-customer.service.js');
const { customerDocumentService } = await import('../dist/modules/customers/services/customer-document.service.js');
const { customerService } = await import('../dist/modules/customers/services/customer.service.js');

test('isolated CP customer conversion enforces scope and documents, preserves login, links history and rolls back failures', { skip: process.env.CP_CUSTOMER_DB_TEST !== '1' }, async () => {
  const dbName = `sunvika_cp_test_${Date.now()}_${Math.random().toString(16).slice(2,6)}`;
  try { await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 10000 }); } catch (e) { console.error(e.name, e.message.replace(env.mongoUri, '[redacted]')); await mongoose.disconnect(); throw new Error('Isolated database connection failed'); }
  const send = S3Client.prototype.send, createDocuments = customerDocumentService.createDocumentsForConversion;
  const objects = new Map();
  // No requests reach S3: exercise document validation using an in-memory storage double.
  S3Client.prototype.send = async function(command) {
    const i = command.input;
    if (command.constructor.name === 'PutObjectCommand') { objects.set(i.Key, i); return {}; }
    const stored = objects.get(i.Key); assert.ok(stored);
    if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: stored.Body.length, ContentType: stored.ContentType, ServerSideEncryption: stored.ServerSideEncryption };
    if (command.constructor.name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => stored.Body } };
    throw new Error('Unexpected S3 operation');
  };
  try {
    for (const model of [RoleModel, EmployeeModel, LeadModel, CustomerModel, CustomerDocumentModel, CustomerDocumentUploadModel, CustomerActivityModel]) await model.init();
    const roles = {}; for (const [level,code] of ['MD','CP_HEAD','RM','MIS','CP'].entries()) roles[code] = await RoleModel.create({ name: code, code, level, category: 'PRIMARY', isActive: true });
    const mdId = new Types.ObjectId(); let counter = 0;
    async function person(code, path = [], id) { counter++; return EmployeeModel.create({ _id: id ?? new Types.ObjectId(), employeeCode: `CPTEST-${counter}`, firstName: `Fixture${counter}`, lastName: 'Test', email: `fixture${counter}@example.invalid`, mobileNumber: `988888${String(counter).padStart(4,'0')}`, role: roles[code]._id, hierarchyPath: path, reportingTo: path.at(-1), createdBy: mdId, isActive: true, isVerified: true, passwordHash: 'existing-password-hash' }); }
    const md = await person('MD', [], mdId), head = await person('CP_HEAD', [md._id]), rm = await person('RM', [md._id,head._id]), outsider = await person('RM', [md._id]), mis = await person('MIS', [md._id]);
    const cp = await person('CP', [md._id,head._id,rm._id]), second = await person('CP', [md._id,head._id,rm._id]);
    const state = await StateModel.create({ name: 'Fixture', normalizedName: 'fixture', isActive: true });
    const district = await DistrictModel.create({ name: 'Fixture', normalizedName: 'fixture', state: state._id, isActive: true });
    const branch = await BranchModel.create({ name: 'Fixture', code: 'FIX', state: state._id, district: district._id, isActive: true });
    const base = { customerName: 'CP customer', mobileNumber: cp.mobileNumber, state: String(state._id), district: String(district._id), branch: String(branch._id), siteAddress: 'Fixture site address', requiredCapacityKW: 5, ratePerKW: 40000, panelBrand: 'Fixture', panelTechnology: 'Mono', paymentMode: 'Bank transfer', remark: 'Convert CP to customer', confirmed: true };
    for (const actor of [md,head,rm]) assert.equal((await cpCustomerService.options(actor._id,String(cp._id))).customerId,null);
    for (const actor of [mis,cp]) await assert.rejects(cpCustomerService.options(actor._id,String(cp._id)), e => e.statusCode === 403);
    await assert.rejects(cpCustomerService.options(outsider._id,String(cp._id)), e => e.statusCode === 404);
    await assert.rejects(cpCustomerService.options(md._id,String(rm._id)), e => e.statusCode === 404);
    await assert.rejects(cpCustomerService.convert(rm._id,String(cp._id), { ...base, confirmed: false, documentUploadIds: [] }), e => e.statusCode === 400);
    await assert.rejects(cpCustomerService.convert(rm._id,String(cp._id), { ...base, documentUploadIds: [] }), e => e.statusCode === 400);
    const types = ['PAN','AADHAAR','ELECTRICITY_BILL','BANK_PASSBOOK'], bytes = Buffer.from('%PDF-1.7 fixture');
    const metadata = types.map(documentType => ({ documentType, fileName: `${documentType}.pdf`, mimeType: 'application/pdf', fileSize: bytes.length }));
    async function uploads(actor, target) {
      const reservations = await customerDocumentService.createLeadConversionUploadUrls(actor._id,String(target._id),metadata,'cp');
      for (const upload of reservations) await customerDocumentService.uploadLeadConversionDocument(actor._id,String(target._id),upload.uploadId,'application/pdf',bytes,'cp');
      return reservations.map(r => r.uploadId);
    }
    const ids = await uploads(rm,cp);
    await assert.rejects(customerDocumentService.uploadLeadConversionDocument(outsider._id,String(cp._id),ids[0],'application/pdf',bytes,'cp'), e => e.statusCode === 404);
    await assert.rejects(cpCustomerService.convert(head._id,String(cp._id),{ ...base, documentUploadIds: ids }), e => e.statusCode === 400);
    await assert.rejects(cpCustomerService.convert(rm._id,String(second._id),{ ...base, documentUploadIds: ids }), e => e.statusCode === 400);
    const result = await cpCustomerService.convert(rm._id,String(cp._id),{ ...base, documentUploadIds: ids });
    const employee = await EmployeeModel.findById(cp._id).select('+passwordHash');
    assert.equal(String(employee.sourceCustomer),String(result.customerId)); assert.equal(employee.passwordHash,'existing-password-hash'); assert.equal(employee.isVerified,true);
    assert.equal(String(employee.role),String(roles.CP._id)); assert.equal(String(employee.reportingTo),String(rm._id));
    const customer = await CustomerModel.findById(result.customerId); assert.equal(String(customer.cpEmployee),String(cp._id));
    assert.equal((await LeadModel.findById(customer.sourceLead)).status,'CONVERTED');
    assert.equal(await CustomerDocumentModel.countDocuments({ customer: customer._id }),4);
    assert.equal(await CustomerDocumentUploadModel.countDocuments({ _id: { $in: ids }, customer: customer._id, status: 'COMPLETED', cpEmployee: { $exists: false } }),4);
    for (const actor of [md,head,rm,cp,mis]) assert.ok((await customerService.get(actor._id,String(customer._id))).customer);
    await assert.rejects(customerService.get(outsider._id,String(customer._id)), e => e.statusCode === 404);
    assert.ok((await customerService.timeline(head._id,String(customer._id))).some(a => a.description.includes('channel partner')));
    assert.equal((await cpCustomerService.convert(rm._id,String(cp._id),{ ...base, documentUploadIds: ids })).alreadyConverted,true);
    assert.equal(await CustomerModel.countDocuments(),1);
    const rollbackIds = await uploads(rm,second);
    customerDocumentService.createDocumentsForConversion = async (...args) => { await createDocuments.apply(customerDocumentService,args); throw new Error('Simulated document failure'); };
    await assert.rejects(cpCustomerService.convert(rm._id,String(second._id),{ ...base, documentUploadIds: rollbackIds }), /Simulated document failure/);
    assert.equal((await EmployeeModel.findById(second._id)).sourceCustomer,undefined);
    assert.equal(await CustomerModel.countDocuments(),1); assert.equal(await LeadModel.countDocuments(),1); assert.equal(await CustomerDocumentModel.countDocuments(),4);
    assert.equal(await CustomerDocumentUploadModel.countDocuments({ _id: { $in: rollbackIds }, status: 'REVOKED' }),4);
  } catch (error) { console.error(error); throw error; } finally {
    S3Client.prototype.send = send; customerDocumentService.createDocumentsForConversion = createDocuments;
    if (mongoose.connection.name !== dbName || !dbName.startsWith('sunvika_cp_test_')) throw new Error('Refusing to remove an unexpected database');
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  }
});
