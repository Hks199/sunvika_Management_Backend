import mongoose, { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../utils/pagination.util.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { CpReminderScheduleModel, CpReminderRunModel, PushDeviceModel, PushDeliveryModel } from './cp-reminders.model.js';
import { canControlRm, reminderEndDate } from './cp-reminders.policy.js';
export async function reminderActor(actorId: Types.ObjectId) {
  const employee=await EmployeeModel.findOne({_id:actorId,isActive:true}).select('role').lean();
  const role=employee?await RoleModel.findOne({_id:employee.role,isActive:true}).select('code').lean():null;
  if(!role||!['MD','MIS','CP_HEAD','RM'].includes(role.code))throw new AppError('CP notification schedules are unavailable for your role',403);
  return role.code;
}
async function rmScope(actorId:Types.ObjectId) {
  const code=await reminderActor(actorId), role=await RoleModel.findOne({code:'RM',isActive:true}).select('_id').lean();
  const rms=role?await EmployeeModel.find({role:role._id,isActive:true,...(code==='RM'?{_id:actorId}:code==='CP_HEAD'?{hierarchyPath:actorId}:{})}).select('firstName lastName employeeCode hierarchyPath').sort({firstName:1}).lean():[];
  return {code,rms};
}
async function managerAccess(actorId:Types.ObjectId,value:string,write=false) {
  if(!Types.ObjectId.isValid(value))throw new AppError('RM not found',404);
  const scope=await rmScope(actorId),rm=scope.rms.find(person=>String(person._id)===value);
  if(!rm)throw new AppError('RM not found in your permitted hierarchy',404);
  if(write&&!canControlRm(scope.code,String(actorId),String(rm._id),rm.hierarchyPath.map(String)))throw new AppError('Only RM and their CP Head or MD can control this schedule',403);
  return rm;
}
async function scheduleAccess(actorId:Types.ObjectId,value:string){
  if(!Types.ObjectId.isValid(value))throw new AppError('Notification schedule not found',404);
  const schedule=await CpReminderScheduleModel.findById(value).select('rm').lean();
  if(!schedule)throw new AppError('Notification schedule not found',404);
  await managerAccess(actorId,String(schedule.rm),true);
  return schedule;
}
export const cpReminderService={
  async managers(actorId:Types.ObjectId){const {code,rms}=await rmScope(actorId);return {canManage:code!=='MIS',managers:rms.map(({hierarchyPath,...person})=>person)};},
  async list(actorId:Types.ObjectId,pagination:PaginationInput,rmId?:string){
    const {rms}=await rmScope(actorId);if(rmId&&!rms.some(rm=>String(rm._id)===rmId))throw new AppError('RM not found',404);
    const filter={rm:{$in:rmId?[new Types.ObjectId(rmId)]:rms.map(rm=>rm._id)}};
    const [items,total]=await Promise.all([CpReminderScheduleModel.find(filter).populate('rm updatedBy','firstName lastName employeeCode').sort({updatedAt:-1}).skip((pagination.page-1)*pagination.limit).limit(pagination.limit).lean(),CpReminderScheduleModel.countDocuments(filter)]);
    return {items:items.map(item=>({...item,endDate:reminderEndDate(item)})),meta:createPaginationMeta(pagination.page,pagination.limit,total)};
  },
  async create(actorId:Types.ObjectId,rmId:string,input:Record<string,unknown>){
    const rm=await managerAccess(actorId,rmId,true);
    return CpReminderScheduleModel.create({...input,rm:rm._id,createdBy:actorId,updatedBy:actorId});
  },
  async update(actorId:Types.ObjectId,scheduleId:string,input:Record<string,unknown>){
    const schedule=await scheduleAccess(actorId,scheduleId);
    const updated=await CpReminderScheduleModel.findOneAndUpdate({_id:schedule._id,rm:schedule.rm},{$set:{...input,updatedBy:actorId},$inc:{version:1}},{new:true,runValidators:true});
    if(!updated)throw new AppError('Notification schedule not found',404);
    return updated;
  },
  async remove(actorId:Types.ObjectId,scheduleId:string){
    const schedule=await scheduleAccess(actorId,scheduleId);
    await mongoose.connection.transaction(async session=>{
      const deleted=await CpReminderScheduleModel.deleteOne({_id:schedule._id,rm:schedule.rm},{session});
      if(!deleted.deletedCount)throw new AppError('Notification schedule not found',404);
      const runs=await CpReminderRunModel.find({schedule:schedule._id}).select('_id').session(session).lean();
      await CpReminderRunModel.updateMany({schedule:schedule._id,state:{$in:['PENDING','PROCESSING']}},{$set:{state:'CANCELLED'},$unset:{leaseOwner:1,leaseUntil:1}},{session});
      await PushDeliveryModel.updateMany({run:{$in:runs.map(run=>run._id)},state:{$in:['PENDING','SENDING']}},{$set:{state:'SKIPPED',lastError:'ScheduleDeleted'},$unset:{leaseOwner:1,leaseUntil:1}},{session});
    });
    return {_id:schedule._id,deleted:true};
  },
  async history(actorId:Types.ObjectId,rmId:string,pagination:PaginationInput){
    const rm=await managerAccess(actorId,rmId);
    const [items,total]=await Promise.all([CpReminderRunModel.find({rm:rm._id}).select('-leaseOwner -leaseUntil').sort({scheduledAt:-1}).skip((pagination.page-1)*pagination.limit).limit(pagination.limit).lean(),CpReminderRunModel.countDocuments({rm:rm._id})]);
    const counts=await PushDeliveryModel.aggregate([{$match:{run:{$in:items.map(item=>item._id)}}},{$group:{_id:{run:'$run',state:'$state'},count:{$sum:1}}}]);
    return {items:items.map(item=>({...item,push: Object.fromEntries(counts.filter(c=>String(c._id.run)===String(item._id)).map(c=>[c._id.state,c.count]))})),meta:createPaginationMeta(pagination.page,pagination.limit,total)};
  },
  async register(actorId:Types.ObjectId,sessionId:string,input:{token:string;platform:string}){
    const employee=await EmployeeModel.findOne({_id:actorId,isActive:true}).select('role').lean();
    if(!employee||!await RoleModel.exists({_id:employee.role,code:'CP',isActive:true}))throw new AppError('Push registration is available only to active CP accounts',403);
    await PushDeviceModel.findOneAndUpdate({token:input.token},{$set:{employee:actorId,sessionId,platform:input.platform,isActive:true}},{upsert:true,new:true,runValidators:true});
    return {registered:true};
  },
  async unregister(actorId:Types.ObjectId,sessionId:string,token:string){await PushDeviceModel.updateOne({token,employee:actorId,sessionId},{$set:{isActive:false}});return {registered:false};}
};
