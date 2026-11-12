import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js';
import { CallingActivityModel } from '../src/modules/calling-reports/calling-report.models.js';
import { CallingCandidateModel, CallingListModel } from '../src/modules/calling-lists/calling-list.model.js';
import { EmployeeModel } from '../src/modules/employees/models/employee.model.js';
import { RoleModel } from '../src/modules/roles/models/role.model.js';
async function main(){
  await connectDatabase();
  const rmRole=await RoleModel.findOne({code:'RM'}).select('_id').lean();
  if(!rmRole)return;
  const rms=await EmployeeModel.find({role:rmRole._id}).select('_id').lean(),rmIds=rms.map(r=>r._id),rmKeys=new Set(rmIds.map(String));
  const managerRoles=await RoleModel.find({code:{$in:['MD','MIS']}}).select('_id').lean();
  const managers=await EmployeeModel.find({role:{$in:managerRoles.map(role=>role._id)}}).select('_id').lean(),managerKeys=new Set(managers.map(person=>String(person._id)));
  const employees=await EmployeeModel.find({createdBy:{$in:rmIds},employeeCode:/^CP-[A-F0-9]{24}$/}).select('_id createdBy createdAt').lean();
  const byId=new Map(employees.map(e=>[String(e._id),e]));
  let recoveredCalls=0,recoveredConversions=0;
  const rows=CallingCandidateModel.find({$or:[{statusUpdatedBy:{$type:'objectId'},lastCalledAt:{$type:'date'}},{employee:{$in:employees.map(e=>e._id)}}]}).cursor();
  for await(const row of rows){
    const list=await CallingListModel.findById(row.list).select('title assignedTo assignedAt').lean();if(!list)continue;
    const callerIsRm=Boolean(row.statusUpdatedBy&&rmKeys.has(String(row.statusUpdatedBy)));
    const assignedRmKnown=Boolean(row.statusUpdatedBy&&managerKeys.has(String(row.statusUpdatedBy))&&list.assignedTo&&rmKeys.has(String(list.assignedTo))&&list.assignedAt&&row.lastCalledAt&&list.assignedAt<=row.lastCalledAt);
    const callOwner=callerIsRm?row.statusUpdatedBy:assignedRmKnown?list.assignedTo:null;
    if(row.lastCalledAt&&row.callStatus&&row.callStatus!=='NOT_CALLED'&&row.statusUpdatedBy&&callOwner&&!await CallingActivityModel.exists({candidate:row._id,kind:'OUTCOME'})){
      const eventKey=`legacy-call:${row._id}`;
      const result=await CallingActivityModel.updateOne({eventKey},{$setOnInsert:{eventKey,rm:callOwner,performedBy:row.statusUpdatedBy,list:list._id,sheetName:list.title,candidate:row._id,kind:'OUTCOME',status:row.callStatus,occurredAt:row.lastCalledAt,source:'LEGACY'}},{upsert:true});recoveredCalls+=result.upsertedCount;
    }
    const employee=row.employee?byId.get(String(row.employee)):null;
    if(employee){const eventKey=`conversion:${row._id}`;const result=await CallingActivityModel.updateOne({eventKey},{$setOnInsert:{eventKey,rm:employee.createdBy,performedBy:employee.createdBy,list:list._id,sheetName:list.title,candidate:row._id,kind:'CONVERTED',status:'CONVERTED',occurredAt:employee.createdAt,source:'LEGACY'}},{upsert:true});recoveredConversions+=result.upsertedCount;}
  }
  console.log(JSON.stringify({recoveredCalls,recoveredConversions,note:'Only timestamped latest calls can be recovered; older repeated calls cannot be reconstructed.'}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Backfill failed');process.exitCode=1;}).finally(()=>disconnectDatabase());
