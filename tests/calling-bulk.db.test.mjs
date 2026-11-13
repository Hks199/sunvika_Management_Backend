import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose, {Types} from 'mongoose';
import ExcelJS from 'exceljs';
import {env} from '../dist/config/env.config.js';
import {EmployeeModel} from '../dist/modules/employees/models/employee.model.js';
import {RoleModel} from '../dist/modules/roles/models/role.model.js';
import {CallingListModel,CallingCandidateModel} from '../dist/modules/calling-lists/calling-list.model.js';
import {CallingBatchModel,CallingAllocationModel,CallingDistributionSettingsModel} from '../dist/modules/calling-lists/calling-bulk.model.js';
import {callingBulkService,processCallingBatch,distributeDailyCallingSheets} from '../dist/modules/calling-lists/calling-bulk.service.js';
import {callingListService} from '../dist/modules/calling-lists/calling-list.service.js';
import {callingListStorage} from '../dist/modules/calling-lists/calling-list.storage.js';
import {assignStoredCallingSheet} from '../dist/modules/calling-lists/calling-sheet-assignment.js';
import {parseCallingWorkbook} from '../dist/modules/calling-lists/calling-list.excel.js';

test('isolated bulk calling queue: S3-only preview, atomic import and retry-safe 09:30 daily allocations',{skip:process.env.CALLING_BULK_DB_TEST!=='1'},async()=>{
  const dbName=`sunvika_bulk_${Date.now()}_${Math.random().toString(16).slice(2,6)}`;
  await mongoose.connect(env.mongoUri,{dbName,serverSelectionTimeoutMS:10000});
  const put=callingListStorage.put,read=callingListStorage.read,insert=CallingCandidateModel.insertMany;
  const objects=new Map();callingListStorage.put=async(_bucket,key,bytes)=>{objects.set(key,Buffer.from(bytes));};callingListStorage.read=async(_bucket,key)=>{if(!objects.has(key))throw new Error('Missing test workbook');return objects.get(key);};
  try{
    for(const model of [RoleModel,EmployeeModel,CallingListModel,CallingCandidateModel,CallingBatchModel,CallingAllocationModel,CallingDistributionSettingsModel])await model.init();
    const roles={};for(const [level,code]of ['MD','CP_HEAD','RM','MIS','CP'].entries())roles[code]=await RoleModel.create({name:code,code,level,category:'PRIMARY',isActive:true});
    const mdId=new Types.ObjectId();let n=0;async function person(code,path=[],active=true){n++;return EmployeeModel.create({_id:code==='MD'?mdId:new Types.ObjectId(),employeeCode:`BULK-${n}`,firstName:`Fixture${n}`,lastName:'Test',email:`bulk${n}@example.invalid`,mobileNumber:`900000${String(n).padStart(4,'0')}`,role:roles[code]._id,hierarchyPath:path,createdBy:mdId,isActive:active});}
    const md=await person('MD'),head=await person('CP_HEAD',[md._id]),rm1=await person('RM',[md._id,head._id]),rm2=await person('RM',[md._id,head._id]),mis=await person('MIS',[md._id]),mis2=await person('MIS',[md._id]);await person('RM',[md._id],false);
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Candidates');sheet.addRow(['Name','Phone']);for(let i=0;i<201;i++)sheet.addRow([`Candidate ${i}`,'0123456789']);
    const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
    for(const actor of [head,rm1])await assert.rejects(callingBulkService.list(actor._id,1,10),e=>e.statusCode===403);
    const reservation=await callingBulkService.reserve(mis._id,{title:'Bulk fixture',fileName:'fixture.xlsx',size:bytes.length});
    await callingBulkService.upload(mis._id,String(reservation._id),bytes);
    assert.equal(await CallingCandidateModel.countDocuments(),0);await processCallingBatch();
    const batch=await CallingBatchModel.findById(reservation._id);assert.equal(batch.state,'READY');assert.equal(batch.candidateCount,201);assert.equal(batch.sheetCount,5);
    const lists=await CallingListModel.find({batch:batch._id}).sort({part:1}).select('+key +bucket').lean();assert.deepEqual(lists.map(l=>l.rowCount),[50,50,50,50,1]);assert.equal(new Set(lists.map(l=>l.key)).size,5);
    assert.equal(await CallingCandidateModel.countDocuments(),0);
    const overview=await callingListService.list(mis2._id,1,20,{assignmentState:'unassigned'});assert.equal(overview.total,5);assert.ok(overview.data.every(l=>l.totalCallingCount===0&&l.deletedCount===0&&l.notCalledCount===l.rowCount));
    for(const actor of [md,mis,mis2]){const preview=await callingListService.preview(actor._id,String(lists[0]._id),1,25);assert.equal(preview.rows.length,25);assert.equal(preview.readOnly,true);assert.equal(preview.rows[0].values[1],'0123456789');}
    assert.equal(await CallingCandidateModel.countDocuments(),0);
    for(const actor of [head,rm1])await assert.rejects(callingListService.preview(actor._id,String(lists[0]._id),1,25),e=>e.statusCode===404);
    await assert.rejects(callingListService.updateCandidateStatus(md._id,String(lists[0]._id),String(new Types.ObjectId()),{callStatus:'INTERESTED'}),e=>e.statusCode===409);
    await assert.rejects(callingListService.deleteCandidate(md._id,String(lists[0]._id),String(new Types.ObjectId()),true),e=>e.statusCode===409);
    await distributeDailyCallingSheets(new Date('2026-11-13T03:59:59Z'));assert.equal(await CallingCandidateModel.countDocuments(),0);
    const morning=new Date('2026-11-13T04:00:00Z');await Promise.all([distributeDailyCallingSheets(morning),distributeDailyCallingSheets(morning)]);
    assert.equal(await CallingAllocationModel.countDocuments(),2);assert.equal(await CallingCandidateModel.countDocuments(),100);
    await distributeDailyCallingSheets(morning);assert.equal(await CallingCandidateModel.countDocuments(),100);
    for(const rm of [rm1,rm2]){const own=await callingListService.list(rm._id,1,20);assert.equal(own.total,1);assert.equal((await callingListService.preview(rm._id,String(own.data[0]._id),1,100)).rows.length,50);}
    const pool=await CallingListModel.find({candidateStorage:'S3',state:'READY'}).sort({part:1}).lean();
    CallingCandidateModel.insertMany=async()=>{throw new Error('Simulated import failure');};
    await assert.rejects(assignStoredCallingSheet(pool[0]._id,rm1._id,md._id),/Simulated import failure/);
    assert.equal((await CallingListModel.findById(pool[0]._id)).candidateStorage,'S3');assert.equal(await CallingCandidateModel.countDocuments(),100);
    CallingCandidateModel.insertMany=insert;
    await callingListService.assign(mis2._id,String(pool[0]._id),String(rm1._id));assert.equal(await CallingCandidateModel.countDocuments(),150);
    await callingBulkService.saveSettings(md._id,{enabled:false,skipUnfinished:false});await distributeDailyCallingSheets(new Date('2026-11-14T04:00:00Z'));assert.equal(await CallingCandidateModel.countDocuments(),150);
    await callingBulkService.saveSettings(mis._id,{enabled:true,skipUnfinished:true});await distributeDailyCallingSheets(new Date('2026-11-14T04:00:00Z'));assert.equal(await CallingCandidateModel.countDocuments(),150);
    await callingBulkService.saveSettings(md._id,{enabled:true,skipUnfinished:false});await distributeDailyCallingSheets(new Date('2026-11-14T04:00:00Z'));assert.equal(await CallingCandidateModel.countDocuments(),201);assert.equal(await CallingAllocationModel.countDocuments(),4);
    assert.equal(await CallingCandidateModel.countDocuments({values:{$size:2}}),201);
    // An interrupted batch is retried with stable sheet IDs, without publishing partial output.
    const again=await callingBulkService.reserve(mis._id,{title:'Retry fixture',fileName:'retry.xlsx',size:bytes.length});await callingBulkService.upload(mis._id,String(again._id),bytes);
    let writes=0;callingListStorage.put=async(bucket,key,data)=>{if(key.includes(String(again._id))&&++writes===2)throw new Error('Simulated S3 failure');return putFixture(bucket,key,data);};
    function putFixture(_bucket,key,data){objects.set(key,Buffer.from(data));}
    await processCallingBatch();assert.equal((await CallingBatchModel.findById(again._id)).state,'FAILED');assert.equal(await CallingListModel.countDocuments({batch:again._id,state:'READY'}),0);
    callingListStorage.put=putFixture;await callingBulkService.retry(md._id,String(again._id));await processCallingBatch();assert.equal(await CallingListModel.countDocuments({batch:again._id,state:'READY'}),5);assert.equal(await CallingCandidateModel.countDocuments(),201);
    for(const list of await CallingListModel.find({batch:again._id}).select('+key +bucket'))assert.ok((await parseCallingWorkbook(objects.get(list.key))).rows.length<=50);
    await CallingCandidateModel.updateMany({},{$set:{callStatus:'NOT_INTERESTED'}});
    await callingBulkService.saveSettings(md._id,{enabled:true,skipUnfinished:true});
    // A legacy stored quantity must not override the fixed one-sheet allocation.
    await CallingDistributionSettingsModel.collection.updateOne({key:'daily'},{$set:{sheetsPerRm:20}});
    assert.equal(Object.hasOwn(await callingBulkService.settings(md._id),'sheetsPerRm'),false);
    await distributeDailyCallingSheets(new Date('2026-11-15T04:00:00Z'));
    assert.equal(await CallingAllocationModel.countDocuments({day:'2026-11-15'}),2);
    assert.equal(await CallingCandidateModel.countDocuments(),301);
    await distributeDailyCallingSheets(new Date('2026-11-15T05:00:00Z'));
    assert.equal(await CallingCandidateModel.countDocuments(),301);

  }catch(error){console.error(error);throw error;}finally{
    callingListStorage.put=put;callingListStorage.read=read;CallingCandidateModel.insertMany=insert;
    if(mongoose.connection.name!==dbName||!/^sunvika_bulk_\d{13}_[a-f0-9]{4}$/.test(dbName))throw new Error('Unexpected test database');
    try{await mongoose.connection.dropDatabase();}finally{await mongoose.disconnect();}
  }
});
