import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.util.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { reportRange } from '../calling-reports/calling-report.policy.js';
export type CallingListFilters = { rmId?: string; dateFrom?: string; dateTo?: string; assignmentState?: 'assigned' | 'unassigned' };
export function canFilterCallingLists(code: string) { return ['MD','MIS','CP_HEAD'].includes(code); }
export async function callingListScope(actorId: Types.ObjectId, code: string): Promise<Record<string, unknown>> {
  if(code==='MD')return {state:'READY'};
  if(code==='MIS')return {state:'READY',$or:[{uploadedBy:actorId},{batch:{$type:'objectId'}}]};
  if(code==='CP_HEAD'){
    const role=await RoleModel.findOne({code:'RM'}).select('_id').lean();
    const rms=role?await EmployeeModel.find({role:role._id,hierarchyPath:actorId}).distinct('_id'):[];
    return {state:'READY',assignedTo:{$in:rms}};
  }
  return {state:'READY',assignedTo:actorId};
}
export function filterCallingLists(scope:Record<string,unknown>,code:string,filters:CallingListFilters) {
  if(!canFilterCallingLists(code)&&(filters.rmId||filters.dateFrom||filters.dateTo))throw new AppError('Calling-list filters are available only to MD, MIS and CP Head',403);
  const restrictions:Record<string,unknown>[]=[];
  if(filters.assignmentState){
    if(!['MD','MIS'].includes(code))throw new AppError('Only MD and MIS can filter the sheet pool',403);
    restrictions.push({assignedTo:filters.assignmentState==='unassigned'?null:{$ne:null}});
  }
  if(filters.rmId){if(!Types.ObjectId.isValid(filters.rmId))throw new AppError('Invalid RM filter',400);restrictions.push({assignedTo:new Types.ObjectId(filters.rmId)});}
  if(filters.dateFrom&&filters.dateTo&&filters.dateFrom>filters.dateTo)throw new AppError('Uploaded to must be on or after uploaded from',400);
  const dates:Record<string,Date>={};
  if(filters.dateFrom)dates.$gte=reportRange('DAY',filters.dateFrom).start;
  if(filters.dateTo)dates.$lt=reportRange('DAY',filters.dateTo).end;
  if(Object.keys(dates).length)restrictions.push({createdAt:dates});
  return restrictions.length?{$and:[scope,...restrictions]}:scope;
}
