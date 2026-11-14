import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose,{Types} from 'mongoose';
import {env} from '../dist/config/env.config.js';
import {EmployeeModel} from '../dist/modules/employees/models/employee.model.js';
import {RoleModel} from '../dist/modules/roles/models/role.model.js';
import {PermissionModel} from '../dist/modules/roles/models/permission.model.js';
import {HierarchyLockModel} from '../dist/modules/employees/models/hierarchy-lock.model.js';
import {StateModel} from '../dist/modules/geography/models/state.model.js';
import {DistrictModel} from '../dist/modules/geography/models/district.model.js';
import {BranchModel} from '../dist/modules/geography/models/branch.model.js';
import {CustomerModel} from '../dist/modules/customers/models/customer.model.js';
import {InvitationModel} from '../dist/modules/auth/models/invitation.model.js';
import {RefreshTokenModel} from '../dist/modules/auth/models/refresh-token.model.js';
import {authService} from '../dist/modules/auth/services/auth.service.js';
import {emailService} from '../dist/services/email.service.js';
import {hierarchyService} from '../dist/modules/employees/services/hierarchy.service.js';
import {CpImportModel} from '../dist/modules/cp-imports/cp-import.model.js';
import {cpImportService,processCpImport} from '../dist/modules/cp-imports/cp-import.service.js';
import {cpImportTemplate} from '../dist/modules/cp-imports/cp-import.excel.js';
import ExcelJS from 'exceljs';

test('isolated CP bulk import: validation, permission scope, confirmed creation, invitations and recovery',{skip:process.env.CP_IMPORT_DB_TEST!=='1'},async()=>{
  const dbName=`sunvika_cpimport_${Date.now()}_${Math.random().toString(16).slice(2,6)}`;
  await mongoose.connect(env.mongoUri,{dbName,serverSelectionTimeoutMS:10000});
  const original=emailService.sendInvitation,tokens=new Map();let failMail=false,sends=0;
  emailService.sendInvitation=async(email,token)=>{sends++;if(failMail)throw new Error('Mock SMTP failure');tokens.set(email,token);};
  try{
    for(const model of [EmployeeModel,RoleModel,PermissionModel,HierarchyLockModel,StateModel,DistrictModel,BranchModel,InvitationModel,RefreshTokenModel,CpImportModel,CustomerModel])await model.init();
    const permission=await PermissionModel.create({module:'employees',action:'create',code:'employees.create'});
    const roles={};for(const [level,code] of ['MD','MIS','CP_HEAD','RM','CP'].entries())roles[code]=await RoleModel.create({name:code,code,category:'PRIMARY',level,permissions:[permission._id]});
    await RoleModel.updateOne({_id:roles.RM._id},{$set:{allowedChildRoles:[roles.CP._id]}});
    let seq=0;const mdId=new Types.ObjectId();
    const person=(code,path=[])=>{seq++;return EmployeeModel.create({_id:code==='MD'?mdId:new Types.ObjectId(),employeeCode:`TEST-${seq}`,firstName:'Fixture',lastName:String(seq),email:`fixture${seq}@example.invalid`,mobileNumber:`987660${String(seq).padStart(4,'0')}`,role:roles[code]._id,hierarchyPath:path,createdBy:mdId,isActive:true});};
    const md=await person('MD'),head=await person('CP_HEAD',[md._id]),otherHead=await person('CP_HEAD',[md._id]),rm=await person('RM',[md._id,head._id]),otherRm=await person('RM',[md._id,otherHead._id]),mis=await person('MIS',[md._id]),cp=await person('CP',[md._id,head._id,rm._id]);
    const state=await StateModel.create({name:'Chhattisgarh',normalizedName:'chhattisgarh',code:'CG'});
    const district=await DistrictModel.create({name:'Raipur',normalizedName:'raipur',state:state._id});
    const branch=await BranchModel.create({name:'Raipur Central',code:'RPR',state:state._id,district:district._id});
    const template=await cpImportTemplate();
    async function workbook(entries){const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(template.base64,'base64'));for(const values of entries)book.worksheets[0].addRow(values);return Buffer.from(await book.xlsx.writeBuffer());}
    const entry=(suffix,code='')=>[code,'Candidate','','Partner',`bulk${suffix}@example.com`,`+9198765${String(suffix).padStart(5,'0')}`,'Test address','Chhattisgarh','Raipur','Raipur','492001','RPR',''];
    assert.equal((await cpImportService.options(md._id)).rms.length,2);assert.equal((await cpImportService.options(head._id)).rms.length,1);assert.equal((await cpImportService.options(rm._id)).rms.length,1);
    for(const actor of [mis,cp])await assert.rejects(cpImportService.options(actor._id),e=>e.statusCode===403);
    await assert.rejects(cpImportService.preview(otherHead._id,String(rm._id),'test.xlsx',await workbook([entry(1)])),e=>e.statusCode===403);
    const bad=entry(2);bad[7]='Unknown state';
    const invalid=await cpImportService.preview(md._id,String(rm._id),'invalid.xlsx',await workbook([entry(1),entry(1),bad]));
    assert.equal(invalid.state,'INVALID');assert.ok(invalid.rows[0].errors.some(error=>error.includes('Duplicate')));assert.ok(invalid.rows[2].errors.some(error=>error.includes('State')));
    await assert.rejects(cpImportService.confirm(md._id,String(invalid._id),true),e=>e.statusCode===409);
    assert.equal(await EmployeeModel.countDocuments({cpImportKey:{$exists:true}}),0);
    const preview=await cpImportService.preview(head._id,String(rm._id),'valid.xlsx',await workbook([entry(10),entry(11,'MANUAL-CP-11')]));
    assert.equal(preview.state,'PREVIEW',JSON.stringify(preview.rows.map(row=>row.errors)));assert.equal(preview.invalid,0);assert.equal(preview.rows[0].payload,undefined);
    await assert.rejects(cpImportService.get(otherHead._id,String(preview._id)),e=>e.statusCode===404);
    await assert.rejects(cpImportService.confirm(head._id,String(preview._id),false),e=>e.statusCode===400);
    await cpImportService.confirm(head._id,String(preview._id),true);
    await assert.rejects(cpImportService.confirm(head._id,String(preview._id),true),e=>e.statusCode===409);
    await Promise.all([processCpImport(),processCpImport()]);
    const complete=await cpImportService.get(head._id,String(preview._id));assert.equal(complete.state,'COMPLETED');assert.equal(complete.created,2);assert.equal(complete.failed,0);assert.ok(complete.rows.every(row=>row.invitationSent));
    const created=await EmployeeModel.findById(complete.rows[0].employeeId).select('+passwordHash');
    assert.equal(String(created.reportingTo),String(rm._id));assert.deepEqual(created.hierarchyPath.map(String),[md,head,rm].map(person=>String(person._id)));assert.equal(String(created.createdBy),String(head._id));assert.equal(created.passwordHash,undefined);assert.equal(created.isVerified,false);assert.equal(String(created.role),String(roles.CP._id));assert.equal(String(created.branch),String(branch._id));
    assert.equal(created.cpImportKey,undefined);assert.equal(await hierarchyService.canAccessEmployee(head._id,created._id,'read'),true);assert.equal(await hierarchyService.canAccessEmployee(otherRm._id,created._id,'read'),false);
    await authService.setPassword(tokens.get(created.email),'StrongPassword@2026');assert.equal((await EmployeeModel.findById(created._id)).isVerified,true);
    const duplicate=await cpImportService.preview(md._id,String(rm._id),'duplicates.xlsx',await workbook([entry(10)]));assert.equal(duplicate.state,'INVALID');assert.ok(duplicate.rows[0].errors.includes('Email already registered'));
    await CustomerModel.create({customerCode:'CUSTOMER-FIXTURE',sourceLead:new Types.ObjectId(),customerName:'Existing Customer',mobileNumber:entry(19)[5],branch:branch._id,state:state._id,district:district._id,siteAddress:'Test address',requiredCapacityKW:1,ratePerKW:1,paymentMode:'Cash',panelBrand:'Test',panelTechnology:'Test',creatorId:rm._id,updatedBy:md._id});
    const customerConflict=await cpImportService.preview(md._id,String(rm._id),'existing-customer.xlsx',await workbook([entry(19)]));assert.equal(customerConflict.state,'INVALID');assert.match(customerConflict.rows[0].errors.join(';'),/preserve history/);
    // Concurrent registration after preview must fail just that row and keep other successful accounts.
    const race=await cpImportService.preview(md._id,String(rm._id),'race.xlsx',await workbook([entry(20),entry(21)]));
    await EmployeeModel.create({employeeCode:'RACE',firstName:'Race',lastName:'Person',email:'bulk20@example.com',mobileNumber:'+919999999999',role:roles.CP._id,reportingTo:otherRm._id,hierarchyPath:[md._id,otherHead._id,otherRm._id],createdBy:md._id});
    failMail=true;await cpImportService.confirm(md._id,String(race._id),true);await processCpImport();failMail=false;
    const raced=await cpImportService.get(md._id,String(race._id));assert.equal(raced.failed,1);assert.equal(raced.created,1);assert.match(raced.rows[0].error,/after preview/);assert.equal(raced.rows[1].invitationSent,false);assert.match(raced.rows[1].error,/Account created/);
    // Recover an employee inserted just before a process crash without creating another CP.
    const resume=await cpImportService.preview(md._id,String(rm._id),'resume.xlsx',await workbook([entry(30)]));
    const persisted=await CpImportModel.findById(resume._id),{roleCode:_roleCode,...input}=persisted.rows[0].payload;
    await EmployeeModel.create({...input,employeeCode:'RESUMED-CP',cpImportKey:`${resume._id}:2`,role:roles.CP._id,reportingTo:rm._id,hierarchyPath:[md._id,head._id,rm._id],createdBy:md._id});
    await CpImportModel.updateOne({_id:resume._id},{$set:{state:'PROCESSING',lockOwner:'crashed',lockedUntil:new Date(0)}});
    const before=await EmployeeModel.countDocuments();await processCpImport();assert.equal(await EmployeeModel.countDocuments(),before);assert.equal((await cpImportService.get(md._id,String(resume._id))).created,1);
    // Different row-level RM codes override the optional default and resolve without a page-level manager.
    const first=entry(50),second=entry(51);first[12]=rm.employeeCode.toLowerCase();second[12]=otherRm.employeeCode;
    const mixed=await cpImportService.preview(md._id,undefined,'mixed-rms.xlsx',await workbook([first,second]));
    assert.equal(mixed.state,'PREVIEW');assert.equal(String(mixed.rows[0].managerId),String(rm._id));assert.equal(String(mixed.rows[1].managerId),String(otherRm._id));assert.equal(mixed.rows[1].managerCode,otherRm.employeeCode);
    await cpImportService.confirm(md._id,String(mixed._id),true);await processCpImport();
    const mixedDone=await cpImportService.get(md._id,String(mixed._id));assert.equal(mixedDone.created,2);
    const partnerOne=await EmployeeModel.findById(mixedDone.rows[0].employeeId),partnerTwo=await EmployeeModel.findById(mixedDone.rows[1].employeeId);
    assert.equal(String(partnerOne.reportingTo),String(rm._id));assert.equal(String(partnerTwo.reportingTo),String(otherRm._id));assert.deepEqual(partnerTwo.hierarchyPath.map(String),[md,otherHead,otherRm].map(person=>String(person._id)));
    const override=entry(52);override[12]=otherRm.employeeCode;
    const overridden=await cpImportService.preview(md._id,String(rm._id),'override-default.xlsx',await workbook([override]));assert.equal(String(overridden.rows[0].managerId),String(otherRm._id));
    const outside=await cpImportService.preview(head._id,undefined,'outside-team.xlsx',await workbook([second]));assert.equal(outside.state,'INVALID');assert.match(outside.rows[0].errors.join(';'),/permitted team/);
    const selfOnly=await cpImportService.preview(rm._id,undefined,'rm-outside.xlsx',await workbook([override]));assert.equal(selfOnly.state,'INVALID');
    const unknown=entry(53);unknown[12]='MISSING-RM';
    const unknownPreview=await cpImportService.preview(md._id,String(rm._id),'unknown-rm.xlsx',await workbook([unknown]));assert.equal(unknownPreview.state,'INVALID'); // Explicit invalid code must never fall back to default.
    const missing=await cpImportService.preview(md._id,undefined,'missing-rm.xlsx',await workbook([entry(54)]));assert.equal(missing.state,'INVALID');assert.match(missing.rows[0].errors.join(';'),/Enter Reporting RM/);
    // A manager becoming inactive after preview blocks confirmation; after queueing only that RM's rows fail.
    const inactive=entry(55);inactive[12]=otherRm.employeeCode;
    const inactivePreview=await cpImportService.preview(md._id,undefined,'inactive-rm.xlsx',await workbook([inactive]));
    await EmployeeModel.updateOne({_id:otherRm._id},{$set:{isActive:false}});
    await assert.rejects(cpImportService.confirm(md._id,String(inactivePreview._id),true),e=>e.statusCode===403);
    const inactiveCode=await cpImportService.preview(md._id,undefined,'inactive-code.xlsx',await workbook([inactive]));assert.equal(inactiveCode.state,'INVALID');
    await EmployeeModel.updateOne({_id:otherRm._id},{$set:{isActive:true}});
    const queuedA=entry(56),queuedB=entry(57);queuedA[12]=rm.employeeCode;queuedB[12]=otherRm.employeeCode;
    const partial=await cpImportService.preview(md._id,undefined,'partial-rms.xlsx',await workbook([queuedA,queuedB]));await cpImportService.confirm(md._id,String(partial._id),true);
    await EmployeeModel.updateOne({_id:otherRm._id},{$set:{isActive:false}});await processCpImport();
    const partialResult=await cpImportService.get(md._id,String(partial._id));assert.equal(partialResult.created,1);assert.equal(partialResult.failed,1);assert.equal(partialResult.rows[0].status,'CREATED');assert.equal(partialResult.rows[1].status,'FAILED');
    await EmployeeModel.updateOne({_id:otherRm._id},{$set:{isActive:true}});
    // Already staged legacy jobs with only a job-level manager still process safely.
    const legacyPreview=await cpImportService.preview(md._id,String(rm._id),'legacy.xlsx',await workbook([entry(58)]));
    await CpImportModel.updateOne({_id:legacyPreview._id},{$unset:{'rows.0.manager':1,'rows.0.managerCode':1,'rows.0.managerName':1}});
    await cpImportService.confirm(md._id,String(legacyPreview._id),true);await processCpImport();assert.equal((await cpImportService.get(md._id,String(legacyPreview._id))).created,1);
    // Revoked RM access between preview and processing prevents creation.
    const revoked=await cpImportService.preview(rm._id,String(rm._id),'revoked.xlsx',await workbook([entry(40)]));await cpImportService.confirm(rm._id,String(revoked._id),true);await EmployeeModel.updateOne({_id:rm._id},{$set:{isActive:false}});await processCpImport();
    assert.equal(await EmployeeModel.countDocuments({email:'bulk40@example.com'}),0);assert.equal((await CpImportModel.findById(revoked._id)).rows[0].status,'FAILED');
    assert.ok(sends>=4);
  }finally{
    emailService.sendInvitation=original;
    if(mongoose.connection.name!==dbName||!/^sunvika_cpimport_\d{13}_[a-f0-9]{4}$/.test(dbName))throw new Error('Unexpected test database');
    try{await mongoose.connection.dropDatabase();}finally{await mongoose.disconnect();}
  }
});
