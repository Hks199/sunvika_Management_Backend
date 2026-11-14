import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.util.js';
import { CallingListModel, CallingCandidateModel } from '../calling-lists/calling-list.model.js';
import { CallingActivityModel } from './calling-report.models.js';
import { reportScope } from './calling-report.service.js';
import { reportRange } from './calling-report.policy.js';
export type CandidateExportRow = {
  rmName:string;rmCode:string;sheetName:string;rowNumber:number | null;headers:string[];values:string[];
  activityAt:Date;activityKind:string;periodStatus:string;currentStatus:string;note:string;followUpAt:Date | null;
  cpCode:string;availability:string;
};
export async function callingReportCandidates(actorId: Types.ObjectId,period:string,date:string,rmId?:string):Promise<CandidateExportRow[]> {
  const scope=await reportScope(actorId),range=reportRange(period,date);
  const rms=rmId?scope.rms.filter(rm=>String(rm._id)===rmId):scope.rms;
  if(rmId&&!rms.length)throw new AppError('RM not found',404);
  const activity=await CallingActivityModel.aggregate<{rm:Types.ObjectId;list:Types.ObjectId;candidate:Types.ObjectId;sheetName:string;kind:string;status:string;occurredAt:Date}>([
    {$match:{rm:{$in:rms.map(rm=>rm._id)},occurredAt:{$gte:range.start,$lt:range.end}}},
    {$sort:{occurredAt:-1,_id:-1}},
    {$group:{_id:{rm:'$rm',list:'$list',candidate:'$candidate'},latest:{$first:'$$ROOT'}}},
    {$replaceRoot:{newRoot:'$latest'}},{$sort:{occurredAt:-1,_id:-1}}
  ]);
  const lists=await CallingListModel.find({_id:{$in:activity.map(row=>row.list)}}).select('_id assignedTo headers').lean();
  const byList=new Map(lists.map(list=>[String(list._id),list]));
  // Current candidate data belongs to the sheet's current RM. Historical events remain visible without leaking its new owner's data.
  const readable=activity.filter(row=>byList.get(String(row.list))?.assignedTo?.equals(row.rm));
  const candidates=readable.length ? await CallingCandidateModel.find({$or:readable.map(row=>({_id:row.candidate,list:row.list}))})
    .select('_id list rowNumber values employee callStatus callNote nextFollowUpAt').populate('employee','employeeCode').lean() : [];
  const byCandidate=new Map(candidates.map(row=>[String(row._id),row]));
  return activity.map(event=>{
    const rm=rms.find(rm=>rm._id.equals(event.rm))!;
    const list=byList.get(String(event.list));
    const canRead=Boolean(list?.assignedTo?.equals(event.rm));
    const row=canRead?byCandidate.get(String(event.candidate)):undefined;
    const employee=row?.employee as unknown as {employeeCode?:string} | null;
    return {rmName:[rm.firstName,rm.lastName].filter(Boolean).join(' ') || rm.employeeCode,rmCode:rm.employeeCode,sheetName:event.sheetName,
      rowNumber:row?.rowNumber ?? null,headers:row?list?.headers ?? []:[],values:row?.values ?? [],activityAt:event.occurredAt,activityKind:event.kind,
      periodStatus:event.status,currentStatus:row?(row.employee?'CONVERTED':row.callStatus):'',note:row?.callNote ?? '',followUpAt:row?.nextFollowUpAt ?? null,
      cpCode:employee?.employeeCode ?? '',availability:row?'Available':!canRead?'Details unavailable: sheet reassigned or removed':'Details unavailable: candidate permanently deleted'};
  });
}
