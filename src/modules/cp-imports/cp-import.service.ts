import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.util.js';
import { logger } from '../../services/logger.service.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { roleService } from '../roles/services/role.service.js';
import { CustomerModel } from '../customers/models/customer.model.js';
import { StateModel } from '../geography/models/state.model.js';
import { DistrictModel } from '../geography/models/district.model.js';
import { BranchModel } from '../geography/models/branch.model.js';
import { geographyService } from '../geography/services/geography.service.js';
import { canCreateRole,withHierarchyLock } from '../employees/services/employee.service.js';
import { createEmployeeSchema } from '../employees/validations/employee.validation.js';
import { authService } from '../auth/services/auth.service.js';
import { CpImportModel } from './cp-import.model.js';
import { parseCpImport } from './cp-import.excel.js';
const normalize=(value:string)=>value.trim().toLowerCase();
export async function cpImportActor(actorId:Types.ObjectId){
  const actor=await EmployeeModel.findOne({_id:actorId,isActive:true}).select('role').lean();
  const role=actor?await RoleModel.findOne({_id:actor.role,isActive:true}).select('code').lean():null;
  if(!role||!['MD','CP_HEAD','RM'].includes(role.code)||!await roleService.hasPermission(actorId,'employees.create'))throw new AppError('Only MD, CP Head and RM with CP creation access can import channel partners',403);
  return role.code;
}
export async function cpImportManagers(actorId:Types.ObjectId){
  const code=await cpImportActor(actorId),role=await RoleModel.findOne({code:'RM',isActive:true}).select('_id').lean();
  return role?EmployeeModel.find({role:role._id,isActive:true,...(code==='RM'?{_id:actorId}:code==='CP_HEAD'?{hierarchyPath:actorId}:{})}).select('_id firstName lastName employeeCode hierarchyPath').sort({firstName:1,lastName:1}).lean():[];
}
async function manager(actorId:Types.ObjectId,managerId:string){
  const available=await cpImportManagers(actorId),found=available.find(rm=>String(rm._id)===managerId);
  if(!found)throw new AppError('Choose an active RM in your permitted team',403);
  return found;
}
async function authorizedJob(actorId:Types.ObjectId,id:string){
  const code=await cpImportActor(actorId);
  if(!Types.ObjectId.isValid(id))throw new AppError('Import not found',404);
  const job=await CpImportModel.findOne({_id:id,...(code==='MD'?{}:{owner:actorId})});
  if(!job)throw new AppError('Import not found',404);
  return job;
}
function publicJob(job:InstanceType<typeof CpImportModel>){
  const rows=job.rows.map(row=>({rowNumber:row.rowNumber,managerId:row.manager ?? job.manager,managerName:row.managerName ?? '',managerCode:row.managerCode ?? '',fields:row.fields,errors:row.validationErrors,status:row.status,employeeId:row.employee,invitationSent:row.invitationSent,error:row.error}));
  return {_id:job._id,manager:job.manager,fileName:job.fileName,state:job.state,createdAt:job.createdAt,rows,total:rows.length,created:rows.filter(row=>row.status==='CREATED').length,failed:rows.filter(row=>row.status==='FAILED').length,invalid:rows.filter(row=>row.errors.length).length};
}
export const cpImportService={
  async options(actorId:Types.ObjectId){return {rms:(await cpImportManagers(actorId)).map(({hierarchyPath:_path,...rm})=>rm)};},
  async preview(actorId:Types.ObjectId,managerId:string | undefined,fileName:string,bytes:Buffer){
    const available=await cpImportManagers(actorId);
    const defaultManager=managerId?available.find(rm=>String(rm._id)===managerId):undefined;
    if(managerId&&!defaultManager)throw new AppError('Choose an active default RM in your permitted team',403);
    const parsed=await parseCpImport(bytes);
    const [states,districts,branches]=await Promise.all([StateModel.find({isActive:true}).select('_id name').lean(),DistrictModel.find({isActive:true}).select('_id name state').lean(),BranchModel.find({isActive:true}).select('_id name code state district').lean()]);
    const rows=parsed.map(row=>{
      const f=row.fields,errors:string[]=[];
      const rmCode=normalize(f['Reporting RM employee code'] ?? '');
      const reportingManager=rmCode?available.find(rm=>normalize(rm.employeeCode)===rmCode):defaultManager;
      if(!reportingManager)errors.push(rmCode?'Reporting RM employee code must match an active RM in your permitted team':'Enter Reporting RM employee code or select a default Reporting RM');
      const state=states.find(item=>normalize(item.name)===normalize(f.State!));
      if(!state)errors.push('State does not match an active state name');
      const district=state?districts.find(item=>item.state.equals(state._id)&&normalize(item.name)===normalize(f.District!)):undefined;
      if(!district)errors.push('District does not match an active district in the selected state');
      const branchText=normalize(f.Branch!);
      const matches=branchText&&district?branches.filter(item=>item.state.equals(state!._id)&&item.district.equals(district._id)&&(normalize(item.name)===branchText||normalize(item.code)===branchText)):[];
      if(branchText&&matches.length!==1)errors.push('Branch is missing or ambiguous in this district; use its unique branch code');
      const input={roleCode:'CP',...(f['CP code']?{employeeCode:f['CP code'].toUpperCase()}:{}),firstName:f['First name'],lastName:f['Last name'],...(f['Middle name']?{middleName:f['Middle name']}:{}),email:f.Email!.toLowerCase(),mobileNumber:f['Mobile number'],address:{addressLine:f.Address,state:String(state?._id ?? ''),district:String(district?._id ?? ''),...(f.City?{city:f.City}:{}),...(f.Pincode?{pincode:f.Pincode}:{})},...(matches[0]?{branch:String(matches[0]._id)}:{})};
      const validation=createEmployeeSchema.validate(input,{abortEarly:false});
      if(validation.error)errors.push(...validation.error.details.map(item=>item.message));
      return {rowNumber:row.rowNumber,manager:reportingManager?._id,managerName:reportingManager?[reportingManager.firstName,reportingManager.lastName].filter(Boolean).join(' '):'',managerCode:reportingManager?.employeeCode ?? '',fields:f,payload:validation.value,errors,status:'PENDING' as const};
    });
    for(const key of ['email','mobileNumber','employeeCode'] as const){
      const seen=new Map<string,number[]>();
      rows.forEach((row,index)=>{const value=row.payload?.[key];if(value)seen.set(value,[...(seen.get(value)??[]),index]);});
      for(const indexes of seen.values())if(indexes.length>1)for(const index of indexes)rows[index]!.errors.push(`Duplicate ${key} within this workbook`);
    }
    const existing=await EmployeeModel.find({$or:[{isActive:true,email:{$in:rows.map(row=>row.payload.email)}},{isActive:true,mobileNumber:{$in:rows.map(row=>row.payload.mobileNumber)}},{employeeCode:{$in:rows.map(row=>row.payload.employeeCode).filter(Boolean)}}]}).select('email mobileNumber employeeCode isActive').lean();
    const customers=await CustomerModel.find({mobileNumber:{$in:rows.map(row=>row.payload.mobileNumber)}}).select('mobileNumber').lean();
    for(const row of rows)if(customers.some(customer=>customer.mobileNumber===row.payload.mobileNumber))row.errors.push('Customer already exists with this mobile number. Use Convert to CP on the customer record to preserve history.');
    for(const row of rows){if(existing.some(item=>item.isActive&&item.email===row.payload.email))row.errors.push('Email already registered');if(existing.some(item=>item.isActive&&item.mobileNumber===row.payload.mobileNumber))row.errors.push('Mobile number already registered');if(row.payload.employeeCode&&existing.some(item=>item.employeeCode===row.payload.employeeCode))row.errors.push('CP code already registered');}
    const job=await CpImportModel.create({owner:actorId,...(defaultManager?{manager:defaultManager._id}:{}),fileName,state:rows.some(row=>row.errors.length)?'INVALID':'PREVIEW',rows:rows.map(({errors,...row})=>({...row,validationErrors:errors}))});return publicJob(job);
  },
  async get(actorId:Types.ObjectId,id:string){return publicJob(await authorizedJob(actorId,id));},
  async list(actorId:Types.ObjectId){const code=await cpImportActor(actorId);return CpImportModel.find(code==='MD'?{}:{owner:actorId}).select('_id fileName state manager createdAt').sort({createdAt:-1}).limit(20).lean();},
  async confirm(actorId:Types.ObjectId,id:string,confirmed:boolean){
    if(confirmed!==true)throw new AppError('Confirm CP account creation first',400);
    const job=await authorizedJob(actorId,id);
    if(job.state!=='PREVIEW'||job.rows.some(row=>row.validationErrors.length))throw new AppError('Only a valid, unconfirmed preview can be imported',409);
    const available=await cpImportManagers(actorId);
    for(const row of job.rows)if(!available.some(rm=>rm._id.equals(row.manager ?? job.manager)))throw new AppError('A reporting RM is no longer active or is outside your permitted team. Upload a corrected workbook.',403);
    const queued=await CpImportModel.updateOne({_id:job._id,state:'PREVIEW'},{$set:{state:'QUEUED'}});if(!queued.matchedCount)throw new AppError('Import was already confirmed',409);return {_id:job._id,state:'QUEUED'};
  }
};
export async function processCpImport(){
  const owner=randomUUID(),now=new Date();
  const job=await CpImportModel.findOneAndUpdate({$or:[{state:'QUEUED'},{state:'PROCESSING',lockedUntil:{$lte:now}}]},{$set:{state:'PROCESSING',lockOwner:owner,lockedUntil:new Date(Date.now()+120000)}},{new:true,sort:{createdAt:1}});
  if(!job)return false;
  const heartbeat=setInterval(()=>{void CpImportModel.updateOne({_id:job._id,lockOwner:owner},{$set:{lockedUntil:new Date(Date.now()+120000)}}).catch(()=>{});},15000);heartbeat.unref();
  try{
    for(let index=0;index<job.rows.length;index++){
      const row=job.rows[index]!;if(row.status!=='PENDING')continue;
      if(!await CpImportModel.exists({_id:job._id,lockOwner:owner,lockedUntil:{$gt:new Date()}}))return true;
      try{
        const employee=await withHierarchyLock(async()=>{
          const rm=await manager(job.owner,String(row.manager ?? job.manager));
          await canCreateRole(rm._id,'CP');
          if(!await CpImportModel.exists({_id:job._id,lockOwner:owner}))throw new AppError('Import processing changed',409);
          const key=`${job._id}:${row.rowNumber}`;
          const existing=await EmployeeModel.findOne({cpImportKey:key}).select('_id employeeCode').lean();if(existing)return existing;
          const payload=createEmployeeSchema.validate(row.payload);if(payload.error)throw new AppError('Row validation failed; correct the workbook and upload again',400);
          const input=payload.value as {employeeCode?:string;firstName:string;middleName?:string;lastName:string;email:string;mobileNumber:string;address:{state:string;district:string;addressLine:string;city?:string;pincode?:string};branch?:string};
          if(await CustomerModel.exists({mobileNumber:input.mobileNumber}))throw new AppError('Customer already exists with this mobile number. Use Convert to CP on the customer record to preserve history.',409);
          await geographyService.validateEmployeePlacement(input.address.state,input.address.district,input.branch);
          const cpRole=await RoleModel.findOne({code:'CP',isActive:true}).select('_id').lean();if(!cpRole)throw new AppError('CP role is unavailable',400);
          return EmployeeModel.create({firstName:input.firstName,lastName:input.lastName,email:input.email,mobileNumber:input.mobileNumber,...(input.middleName?{middleName:input.middleName}:{}),employeeCode:input.employeeCode ?? `CP-${job._id}-${row.rowNumber}`,cpImportKey:key,
            address:{...input.address,state:new Types.ObjectId(input.address.state),district:new Types.ObjectId(input.address.district)},
            ...(input.branch?{branch:new Types.ObjectId(input.branch)}:{}),role:cpRole._id,reportingTo:rm._id,hierarchyPath:[...rm.hierarchyPath,rm._id],createdBy:job.owner,isActive:true,isVerified:false});
        });
        const result=await CpImportModel.updateOne({_id:job._id,lockOwner:owner},{$set:{[`rows.${index}.status`]:'CREATED',[`rows.${index}.employee`]:employee._id,[`rows.${index}.error`]:'Invitation not sent; use Resend invitation if needed'}});
        if(!result.matchedCount)return true;
        let sent=false;try{sent=await authService.createInvitation(String(employee._id),String(job.owner));}catch{}
        await CpImportModel.updateOne({_id:job._id,lockOwner:owner},{$set:{[`rows.${index}.invitationSent`]:sent,[`rows.${index}.error`]:sent?'':'Account created. Invitation was not sent; use Resend invitation.'}});
      }catch(error){
        const message=(error as {code?:number}).code===11000?'Email, mobile number or CP code was registered after preview; no duplicate account was created':error instanceof AppError?error.message:'Row could not be created. Refresh and check before retrying.';
        await CpImportModel.updateOne({_id:job._id,lockOwner:owner,[`rows.${index}.status`]:'PENDING'},{$set:{[`rows.${index}.status`]:'FAILED',[`rows.${index}.error`]:message}});
      }
    }
    await CpImportModel.updateOne({_id:job._id,lockOwner:owner},{$set:{state:'COMPLETED'},$unset:{lockOwner:1,lockedUntil:1}});
  }finally{clearInterval(heartbeat);}
  return true;
}
export function startCpImportWorker(){
  let running=false;const tick=()=>{if(running)return;running=true;void processCpImport().catch(error=>logger.error({err:error},'CP bulk import failed')).finally(()=>{running=false;});};
  const timer=setInterval(tick,5000);timer.unref();tick();return()=>clearInterval(timer);
}
