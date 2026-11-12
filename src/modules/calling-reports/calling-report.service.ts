import mongoose, { Types, type ClientSession } from 'mongoose';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { CallingListModel } from '../calling-lists/calling-list.model.js';
import { callingListCounts } from '../calling-lists/calling-list-counts.js';
import { AppError } from '../../utils/app-error.util.js';
import { CallingActivityModel, CallingDailyReportModel } from './calling-report.models.js';
import { CALLING_REPORT_ROLES, canVerifyCallingReport, indiaDay, reportRange, sumCounts, type ReportCounts } from './calling-report.policy.js';
const personFields = '_id firstName lastName employeeCode hierarchyPath';
export async function reportScope(actorId: Types.ObjectId) {
  const actor = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role').lean();
  const role = actor ? await RoleModel.findOne({ _id: actor.role, isActive: true }).select('code').lean() : null;
  if (!role || !(CALLING_REPORT_ROLES as readonly string[]).includes(role.code)) throw new AppError('Calling reports are not available for your role',403);
  const rmRoles = await RoleModel.find({ code: 'RM' }).select('_id').lean();
  const filter = { role: { $in: rmRoles.map(r=>r._id) }, ...(role.code==='RM'?{_id:actorId}:role.code==='CP_HEAD'?{hierarchyPath:actorId}:{}) };
  const rms = await EmployeeModel.find(filter).select(personFields).sort({firstName:1,lastName:1}).lean();
  return { code:role.code, rms };
}
type Line = ReportCounts & { rm: Types.ObjectId; day: string; list: Types.ObjectId; sheetName: string };
export async function activityLines(rmIds: Types.ObjectId[], start: Date, end: Date, session?: ClientSession) {
  const pipeline: mongoose.PipelineStage[] = [
    { $match: { rm: { $in: rmIds }, occurredAt: { $gte:start,$lt:end } } },
    { $sort: { occurredAt:1, _id:1 } },
    { $group: {
      _id: { rm:'$rm',list:'$list',candidate:'$candidate',day:{$dateToString:{date:'$occurredAt',format:'%Y-%m-%d',timezone:'Asia/Kolkata'}} },
      sheetName:{$last:'$sheetName'},status:{$last:'$status'},
      called:{$sum:{$cond:[{$and:[{$eq:['$kind','OUTCOME']},{$ne:['$status','NOT_CALLED']}]},1,0]}},
      converted:{$max:{$cond:[{$eq:['$kind','CONVERTED']},1,0]}}
    } },
    { $group: {
      _id: {rm:'$_id.rm',list:'$_id.list',day:'$_id.day'},sheetName:{$last:'$sheetName'},
      called:{$sum:'$called'},converted:{$sum:'$converted'},
      interested:{$sum:{$cond:[{$and:[{$eq:['$converted',0]},{$eq:['$status','INTERESTED']},{$gt:['$called',0]}]},1,0]}},
      followUp:{$sum:{$cond:[{$and:[{$eq:['$converted',0]},{$eq:['$status','NEEDS_FOLLOWUP']},{$gt:['$called',0]}]},1,0]}}
    } },
    { $project: {_id:0,rm:'$_id.rm',list:'$_id.list',day:'$_id.day',sheetName:1,called:1,converted:1,interested:1,followUp:1} },
    { $sort: {day:1,rm:1,list:1} }
  ];
  const query = CallingActivityModel.aggregate<Line>(pipeline);
  if (session) query.session(session);
  return query;
}
type Snapshot = { rm: Types.ObjectId; day: string; sheets: {list: Types.ObjectId; called:number}[] };
/** Read the exact same Total calling source used by the calling-lists endpoint. */
async function useSheetCallingTotals(lines: Line[], reports: Snapshot[], session?: ClientSession) {
  if (!lines.length) return lines;
  const query=CallingListModel.find({_id:{$in:lines.map(line=>line.list)}}).select('_id assignedTo rowCount originalRowCount deletedConvertedCount +bucket +key');
  if(session)query.session(session);
  const lists=await query.lean();
  // Do not expose the new assignee's sheet totals through the previous RM's historical report.
  const eligible=lists.filter(list=>lines.some(line=>line.list.equals(list._id)&&line.rm.equals(list.assignedTo)));
  const counts=await callingListCounts(eligible,session);
  const byId=new Map(counts.map(list=>[String(list._id),list]));
  const today=indiaDay();
  return lines.map(line=>{
    const saved=reports.find(report=>report.rm.equals(line.rm)&&report.day===line.day)?.sheets.find(sheet=>sheet.list.equals(line.list));
    const current=byId.get(String(line.list));
    const owned=current&&current.assignedTo?.equals(line.rm);
    if(saved&&(line.day<today||!owned))return {...line,called:saved.called};
    if(owned){
      if(current.totalCallingCount===null)throw new AppError('The original upload count for a calling sheet is unavailable. Retry after its Total calling value is restored.',503);
      return {...line,called:current.totalCallingCount};
    }
    return line;
  });
}
function sheetsFor(lines: Line[]) { return lines.map(({list,sheetName,called,converted,interested,followUp})=>({list,sheetName,called,converted,interested,followUp})); }
function signature(sheets: unknown) { return JSON.stringify((sheets as ReturnType<typeof sheetsFor>).map(s=>({list:String(s.list),sheetName:s.sheetName,called:s.called,converted:s.converted,interested:s.interested,followUp:s.followUp})).sort((a,b)=>a.list.localeCompare(b.list))); }
export const callingReportService = {
  async options(actorId: Types.ObjectId) {
    const scope=await reportScope(actorId);
    return {role:scope.code,today:indiaDay(),timeZone:'Asia/Kolkata',rms:scope.rms.map(({hierarchyPath:_path,...rm})=>rm)};
  },
  async summary(actorId: Types.ObjectId, period: string, day: string, rmId?: string) {
    const scope=await reportScope(actorId), range=reportRange(period,day);
    const rms=rmId?scope.rms.filter(r=>String(r._id)===rmId):scope.rms;
    if(rmId&&!rms.length)throw new AppError('RM not found',404);
    const ids=rms.map(r=>r._id);
    const [activity,reports]=await Promise.all([
      activityLines(ids,range.start,range.end),
      CallingDailyReportModel.find({rm:{$in:ids},day:{$gte:range.fromDay,$lte:range.toDay}}).populate('verifiedBy','firstName lastName employeeCode').lean()
    ]);
    const lines=await useSheetCallingTotals(activity,reports);
    const keys=new Set([...lines.map(l=>`${l.rm}:${l.day}`),...reports.map(r=>`${r.rm}:${r.day}`)]);
    const days=[...keys].sort().map(key=>{
      const report=reports.find(r=>`${r.rm}:${r.day}`===key), rows=lines.filter(l=>`${l.rm}:${l.day}`===key);
      const rm=rms.find(r=>key.startsWith(`${r._id}:`))!;
      const sheets=sheetsFor(rows), total=sumCounts(rows);
      const isCurrent=Boolean(report&&signature(report.sheets)===signature(sheets));
      return {day:key.split(':')[1],rm:{_id:rm._id,firstName:rm.firstName,lastName:rm.lastName,employeeCode:rm.employeeCode},sheets,totals:total,
        report:report?{_id:report._id,revision:report.revision,status:report.status,generatedAt:report.generatedAt,verifiedBy:report.verifiedBy,verifiedAt:report.verifiedAt,reviewNote:report.reviewNote,sheets:report.sheets,totals:report.totals}:null,
        isCurrent,canVerify:Boolean(report&&isCurrent&&canVerifyCallingReport(scope.code,String(actorId),String(rm._id),rm.hierarchyPath.map(String)))};
    }).sort((a,b)=>String(b.day).localeCompare(String(a.day))||a.rm.firstName.localeCompare(b.rm.firstName));
    const grouped = new Map<string, Line>();
    for(const line of lines){const key=`${line.rm}:${line.list}`,previous=grouped.get(key);const totals=sumCounts(previous?[previous,line]:[line]);grouped.set(key,{...line,...totals,called:!previous||line.day>=previous.day?line.called:previous.called});}
    const sheets=[...grouped.values()].map(line=>({...line,rm:rms.find(r=>r._id.equals(line.rm))?{_id:line.rm,firstName:rms.find(r=>r._id.equals(line.rm))!.firstName,lastName:rms.find(r=>r._id.equals(line.rm))!.lastName,employeeCode:rms.find(r=>r._id.equals(line.rm))!.employeeCode}:null}));
    return {period,...range,timeZone:'Asia/Kolkata',totals:sumCounts([...grouped.values()]),sheets,days};
  },
  async generateToday(actorId: Types.ObjectId, rmId?: string) {
    const scope=await reportScope(actorId);
    if(!['RM','MD'].includes(scope.code))throw new AppError('Only RM or MD can generate daily calling reports',403);
    if(scope.code==='MD'&&!rmId)throw new AppError('Select an RM to generate their report',400);
    const owner=scope.code==='RM'?actorId:scope.rms.find(r=>String(r._id)===rmId)?._id;
    if(!owner||(scope.code==='RM'&&rmId&&rmId!==String(actorId)))throw new AppError('RM not found',404);
    const day=indiaDay(),range=reportRange('DAY',day);
    return mongoose.connection.transaction(async session=>{
      const existing=await CallingDailyReportModel.findOne({rm:owner,day}).session(session);
      const lines=await useSheetCallingTotals(await activityLines([owner],range.start,range.end,session),existing?[existing]:[],session), sheets=sheetsFor(lines);
      if(existing&&signature(existing.sheets.toObject())===signature(sheets))return existing;
      if(existing){existing.sheets=sheets as typeof existing.sheets;existing.totals=sumCounts(lines);existing.generatedAt=new Date();existing.generatedBy=actorId;existing.revision+=1;existing.status='PENDING';existing.verifiedAt=null;existing.verifiedBy=null;existing.reviewNote='';await existing.save({session});return existing;}
      const [report]=await CallingDailyReportModel.create([{rm:owner,day,sheets,totals:sumCounts(lines),generatedBy:actorId,generatedAt:new Date(),revision:1,status:'PENDING'}],{session});
      return report;
    });
  },
  async verify(actorId: Types.ObjectId, reportId: string, revision: number, reviewNote: string) {
    const scope=await reportScope(actorId);
    if(!Types.ObjectId.isValid(reportId))throw new AppError('Report not found',404);
    return mongoose.connection.transaction(async session=>{
      const report=await CallingDailyReportModel.findById(reportId).session(session);
      const rm=scope.rms.find(r=>r._id.equals(report?.rm));
      if(!report||!rm)throw new AppError('Report not found',404);
      if(!canVerifyCallingReport(scope.code,String(actorId),String(rm._id),rm.hierarchyPath.map(String)))throw new AppError('Only the RM upline or MD can verify this report',403);
      if(report.revision!==revision)throw new AppError('Report changed. Refresh and review the latest version',409);
      const range=reportRange('DAY',report.day);
      const lines=await useSheetCallingTotals(await activityLines([rm._id],range.start,range.end,session),[report],session);
      if(signature(report.sheets.toObject())!==signature(sheetsFor(lines)))throw new AppError('Calling activity changed. Ask the RM to regenerate this report before verifying',409);
      report.status='VERIFIED';report.verifiedBy=actorId;report.verifiedAt=new Date();report.reviewNote=reviewNote;
      await report.save({session});return report;
    });
  }
};
