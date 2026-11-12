import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose, {Types} from 'mongoose';
import {env} from '../dist/config/env.config.js';
import {EmployeeModel} from '../dist/modules/employees/models/employee.model.js';
import {RoleModel} from '../dist/modules/roles/models/role.model.js';
import {CallingListModel,CallingCandidateModel} from '../dist/modules/calling-lists/calling-list.model.js';
import {CallingActivityModel,CallingDailyReportModel} from '../dist/modules/calling-reports/calling-report.models.js';
import {callingListService} from '../dist/modules/calling-lists/calling-list.service.js';
import {callingListCounts} from '../dist/modules/calling-lists/calling-list-counts.js';
import {callingReportService} from '../dist/modules/calling-reports/calling-report.service.js';
import {callingActivity} from '../dist/modules/calling-reports/calling-activity.service.js';
import {employeeService} from '../dist/modules/employees/services/employee.service.js';
import {indiaDay,reportRange} from '../dist/modules/calling-reports/calling-report.policy.js';

test('isolated MongoDB calling reports count repeat calls, multiple sheets, exact dates and versioned upline verification',{skip:process.env.CALLING_REPORT_DB_TEST!=='1'},async t=>{
 const dbName=`sunvika_cr_test_${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
 await mongoose.connect(env.mongoUri,{dbName,serverSelectionTimeoutMS:10000});
 const originalCreate=employeeService.create,originalRecord=callingActivity.record;
 try{
  for(const model of [RoleModel,EmployeeModel,CallingListModel,CallingCandidateModel,CallingActivityModel,CallingDailyReportModel])await model.init();
  const roles={};for(const [level,code]of ['MD','CP_HEAD','RM','MIS','CP'].entries())roles[code]=await RoleModel.create({name:code,code,level,category:'PRIMARY',isActive:true});
  const mdId=new Types.ObjectId();let n=0;
  async function person(role,path=[],id){n++;return EmployeeModel.create({_id:id??new Types.ObjectId(),firstName:`Fixture${n}`,lastName:'Test',employeeCode:`TEST-${n}`,email:`fixture${n}@example.invalid`,mobileNumber:`900000${String(n).padStart(4,'0')}`,role:roles[role]._id,hierarchyPath:path,createdBy:mdId,isActive:true});}
  const md=await person('MD',[],mdId),head=await person('CP_HEAD',[md._id]),otherHead=await person('CP_HEAD',[md._id]),rm=await person('RM',[md._id,head._id]),otherRm=await person('RM',[md._id,otherHead._id]),mis=await person('MIS',[md._id]);
  async function sheet(title){return CallingListModel.create({title,fileName:`${title}.xlsx`,uploadedBy:mis._id,assignedTo:rm._id,bucket:'fixture-only',key:'fixture-only',size:30,state:'READY',rowCount:2,originalRowCount:2,headers:['Name']});}
  const a=await sheet('Sheet A'),b=await sheet('Sheet B');
  const filterDay=indiaDay(),bounds=reportRange('DAY',filterDay);
  for(const [name,date]of [['before',new Date(bounds.start.getTime()-1)],['start',bounds.start],['end',new Date(bounds.end.getTime()-1)],['after',bounds.end]])await CallingListModel.create({title:`Boundary ${name}`,fileName:'boundary.xlsx',uploadedBy:mis._id,assignedTo:rm._id,bucket:'fixture-only',key:'fixture-only',size:30,state:'READY',rowCount:0,originalRowCount:0,headers:['Name'],createdAt:date});
  const filtered=await callingListService.list(head._id,1,2,{rmId:String(rm._id),dateFrom:filterDay,dateTo:filterDay});assert.equal(filtered.total,4);assert.equal(filtered.data.length,2);
  assert.equal((await callingListService.list(otherHead._id,1,20,{rmId:String(rm._id)})).total,0);
  const anotherMis=await person('MIS',[md._id]);assert.equal((await callingListService.list(anotherMis._id,1,20,{rmId:String(rm._id)})).total,0);
  assert.equal((await callingListService.filterOptions(head._id)).length,1);assert.equal((await callingListService.filterOptions(otherHead._id)).length,0);
  await assert.rejects(callingListService.list(rm._id,1,20,{rmId:String(otherRm._id)}),e=>e.statusCode===403);
  await assert.rejects(callingListService.filterOptions(rm._id),e=>e.statusCode===403);

  const [a1,a2,b1,b2]=await CallingCandidateModel.create([{list:a._id,rowNumber:2,values:['A1']},{list:a._id,rowNumber:3,values:['A2']},{list:b._id,rowNumber:2,values:['B1']},{list:b._id,rowNumber:3,values:['B2']}]);
  assert.equal((await callingListService.preview(head._id,String(a._id),1,25)).rows.length,2);
  await assert.rejects(callingListService.preview(otherHead._id,String(a._id),1,25),e=>e.statusCode===404);
  await assert.rejects(callingListService.deleteCandidate(head._id,String(a._id),String(a1._id),true),e=>e.statusCode===403);
  await assert.rejects(callingListService.updateCandidateStatus(head._id,String(a._id),String(a1._id),{callStatus:'INTERESTED'}),e=>e.statusCode===403);
  await assert.rejects(callingListService.assign(head._id,String(a._id),String(otherRm._id)),e=>e.statusCode===404);
  const update=(row,status)=>callingListService.updateCandidateStatus(rm._id,String(row.list),String(row._id),{callStatus:status,nextFollowUpAt:status==='NEEDS_FOLLOWUP'?new Date(Date.now()+86400000):null});
  await update(a1,'INTERESTED');await update(a1,'NEEDS_FOLLOWUP');await update(a2,'INTERESTED');await update(b1,'NOT_INTERESTED');
  employeeService.create=async(input,creator)=>{const {roleCode,...details}=input;const employee=await EmployeeModel.create({...details,role:roles.CP._id,createdBy:creator,reportingTo:creator,hierarchyPath:[md._id,head._id,creator],isActive:true,address:{}});return {employee:employee.toObject(),invitationSent:false};};
  await callingListService.createCp(rm._id,String(b._id),String(b2._id),{firstName:'New',lastName:'CP',email:'cp-fixture@example.invalid',mobileNumber:'9888888888',roleCode:'CP',address:{addressLine:'Fixture',state:String(new Types.ObjectId()),district:String(new Types.ObjectId())}});
  await callingListService.deleteCandidate(rm._id,String(a._id),String(a2._id),true);
  const day=indiaDay();let result=await callingReportService.summary(rm._id,'DAY',day);
  assert.deepEqual(result.totals,{called:3,converted:1,interested:1,followUp:1});assert.equal(result.days[0].sheets.length,2);assert.equal(result.days[0].report,null);
  const sheetCounts=await callingListCounts(await CallingListModel.find({_id:{$in:[a._id,b._id]}}).lean());
  for(const line of result.days[0].sheets)assert.equal(line.called,sheetCounts.find(sheet=>String(sheet._id)===String(line.list)).totalCallingCount);
  // A repeat save of the same outcome does not increase the sheet's Total calling counter.
  await update(b1,'NOT_INTERESTED');assert.equal((await callingReportService.summary(rm._id,'DAY',day)).totals.called,3);
  let report=await callingReportService.generateToday(rm._id);assert.equal(report.revision,1);
  const unchanged=await callingReportService.generateToday(rm._id);assert.equal(unchanged.revision,1);assert.equal(String(unchanged._id),String(report._id));
  await assert.rejects(callingReportService.verify(rm._id,String(report._id),1,''),e=>e.statusCode===403);
  await assert.rejects(callingReportService.verify(mis._id,String(report._id),1,''),e=>e.statusCode===403);
  await assert.rejects(callingReportService.verify(otherHead._id,String(report._id),1,''),e=>e.statusCode===404);
  await assert.rejects(callingReportService.summary(otherRm._id,'DAY',day,String(rm._id)),e=>e.statusCode===404);
  const verified=await callingReportService.verify(head._id,String(report._id),1,'Checked sheets');assert.equal(verified.status,'VERIFIED');assert.equal(String(verified.verifiedBy),String(head._id));
  await update(a1,'INTERESTED');result=await callingReportService.summary(head._id,'DAY',day);assert.equal(result.totals.called,3);assert.equal(result.days[0].isCurrent,false);assert.equal(result.days[0].canVerify,false);
  await assert.rejects(callingReportService.verify(head._id,String(report._id),1,''),e=>e.statusCode===409);
  report=await callingReportService.generateToday(rm._id);assert.equal(report.revision,2);assert.equal(report.status,'PENDING');assert.equal(report.verifiedBy,null);
  await assert.rejects(callingReportService.verify(head._id,String(report._id),1,''),e=>e.statusCode===409);
  await callingReportService.verify(md._id,String(report._id),2,'MD checked');
  const mdGenerated=await callingReportService.generateToday(md._id,String(rm._id));assert.equal(mdGenerated.status,'VERIFIED');
  await update(b1,'NOT_INTERESTED');const repeatSummary=await callingReportService.summary(rm._id,'DAY',day);assert.equal(repeatSummary.totals.called,3);assert.equal(repeatSummary.days[0].isCurrent,true);
  await assert.rejects(callingReportService.generateToday(rm._id,String(otherRm._id)),e=>e.statusCode===404);
  // A failed activity write must roll the candidate update back, not lose a call while returning success.
  const before=await CallingCandidateModel.findById(b1._id).lean();callingActivity.record=async()=>{throw new Error('Fixture activity write failure');};
  await assert.rejects(update(b1,'INTERESTED'),/Fixture activity write failure/);callingActivity.record=originalRecord;
  const after=await CallingCandidateModel.findById(b1._id).lean();assert.equal(after.callStatus,before.callStatus);assert.equal((await CallingListModel.findById(b._id)).busy,false);
  // Earlier activity remains assigned to its original RM, regardless of later sheet reassignment.
  await CallingListModel.updateOne({_id:a._id},{$set:{assignedTo:otherRm._id}});
  result=await callingReportService.summary(rm._id,'DAY',day);assert.equal(result.totals.called,3);
  const range=reportRange('DAY',day),yesterday=new Date(range.start.getTime()-1000);
  await CallingActivityModel.create({eventKey:'fixture-yesterday',rm:rm._id,performedBy:rm._id,list:a._id,sheetName:a.title,candidate:a1._id,kind:'OUTCOME',status:'NEEDS_FOLLOWUP',occurredAt:yesterday});
  result=await callingReportService.summary(rm._id,'WEEK',day);assert.equal(result.totals.called,3);assert.equal(result.days.length,2);assert.equal(result.sheets.find(s=>String(s.list)===String(a._id)).called,2);
  const pastDay=indiaDay(yesterday);
  await CallingDailyReportModel.create({rm:rm._id,day:pastDay,sheets:[{list:a._id,sheetName:a.title,called:2,converted:0,interested:0,followUp:1}],totals:{called:2,converted:0,interested:0,followUp:1},generatedAt:yesterday,generatedBy:rm._id,status:'PENDING'});
  const past=await callingReportService.summary(rm._id,'DAY',pastDay);assert.equal(past.totals.called,2);
  const consolidated=await callingReportService.summary(rm._id,'WEEK',day);assert.equal(consolidated.totals.called,3);assert.equal(consolidated.sheets.find(s=>String(s.list)===String(a._id)).called,2);
  const month=await callingReportService.summary(mis._id,'MONTH',day);assert.ok(month.totals.called>=3);assert.equal((await callingReportService.summary(otherHead._id,'DAY',day)).totals.called,0);
  console.log('Isolated DB passed: exact Total calling values, repeat-save stability, sheet breakdowns, deletion retention, date filtering, RM scope, stale report protection, verification and rollback.');
 }catch(error){console.error(error);throw error;}finally{
  employeeService.create=originalCreate;callingActivity.record=originalRecord;
  if(mongoose.connection.name!==dbName||!dbName.startsWith('sunvika_cr_test_'))throw new Error('Refusing to remove an unexpected database');
  try{await mongoose.connection.dropDatabase();}finally{await mongoose.disconnect();}
 }
});
