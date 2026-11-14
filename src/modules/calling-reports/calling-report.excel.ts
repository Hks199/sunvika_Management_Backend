import ExcelJS from 'exceljs';
import type { CandidateExportRow } from './calling-report-candidates.service.js';
import type { callingReportService } from './calling-report.service.js';
type Summary = Awaited<ReturnType<typeof callingReportService.summary>>;
type Person = {firstName?:string;lastName?:string;employeeCode?:string} | null | undefined;
const personName=(value:unknown)=>{const person=value as Person;return person ? [person.firstName,person.lastName].filter(Boolean).join(' ') || person.employeeCode || 'RM' : 'RM';};
export async function buildCallingReportExcel(summary: Summary, selectedRm?: string, candidates: CandidateExportRow[] = []) {
  const workbook=new ExcelJS.Workbook();
  workbook.creator='Sunvika Management';
  const overview=workbook.addWorksheet('Summary');
  overview.addRows([
    ['Calling report','Value'],['Period',summary.period],['From date (IST)',summary.fromDay],['To date (IST)',summary.toDay],
    ['Time zone',summary.timeZone],['RM filter',selectedRm ?? 'All accessible RMs'],
    ['Recorded calls',summary.totals.called],['Converted to CP',summary.totals.converted],['Interested',summary.totals.interested],['Needs follow-up',summary.totals.followUp],
    ['Recorded calls basis',"Calling sheet Total calling; each sheet counted once in consolidated totals. Daily rows may repeat sheet totals."],
  ]);
  const sheets=workbook.addWorksheet('Consolidated sheets');
  sheets.addRow(['RM','RM code','Calling sheet','Recorded calls','Converted to CP','Interested','Needs follow-up']);
  for(const sheet of summary.sheets) sheets.addRow([personName(sheet.rm),sheet.rm?.employeeCode ?? '',sheet.sheetName,sheet.called,sheet.converted,sheet.interested,sheet.followUp]);
  sheets.addRow(['TOTAL','','',summary.totals.called,summary.totals.converted,summary.totals.interested,summary.totals.followUp]);
  const daily=workbook.addWorksheet('Daily details');
  daily.addRow(['Date (IST)','RM','RM code','Calling sheet','Recorded calls','Converted to CP','Interested','Needs follow-up','Verification status','Verified by','Verified at (IST)','Review note']);
  for(const day of summary.days) {
    const status=!day.report ? 'Not generated' : !day.isCurrent ? 'Activity changed - regenerate' : day.report.status==='VERIFIED' ? 'Verified' : 'Pending upline verification';
    const verifiedAt=day.report?.verifiedAt ? new Date(day.report.verifiedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : '';
    const lines=day.sheets.length ? day.sheets : [{sheetName:'No calling activity',called:0,converted:0,interested:0,followUp:0}];
    for(const sheet of lines) daily.addRow([day.day,personName(day.rm),day.rm.employeeCode ?? '',sheet.sheetName,sheet.called,sheet.converted,sheet.interested,sheet.followUp,status,day.report?.verifiedBy ? personName(day.report.verifiedBy) : '',verifiedAt,day.report?.reviewNote ?? '']);
  }
  const candidateSheet=workbook.addWorksheet('Candidate details');
  const headers=[...new Set(candidates.flatMap(row=>row.headers))];
  const labels:Record<string,string>={NOT_CALLED:'Not called',INTERESTED:'Interested',NEEDS_FOLLOWUP:'Needs follow-up',NOT_INTERESTED:'Not interested',CONVERTED:'Converted to CP'};
  const ist=(value:Date | null)=>value ? new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : '';
  candidateSheet.addRow(['RM','RM code','Calling sheet','Original row','Last activity in period (IST)','Activity','Status in report period','Current status','Current calling note','Current follow-up (IST)','CP code','Details availability',...headers.map(header=>`Candidate: ${header}`)]);
  for(const row of candidates) candidateSheet.addRow([row.rmName,row.rmCode,row.sheetName,row.rowNumber,ist(row.activityAt),row.activityKind,labels[row.periodStatus] ?? row.periodStatus,labels[row.currentStatus] ?? row.currentStatus,row.note,ist(row.followUpAt),row.cpCode,row.availability,...headers.map(header=>{const index=row.headers.indexOf(header);return index<0?'':row.values[index] ?? '';})]);
  overview.addRow(['Candidate details basis','One row per RM / sheet / candidate with activity in the selected period. Includes all original uploaded columns. Current notes and follow-up dates may have changed after that period. Permanently deleted details cannot be recovered.']);
  for(const sheet of workbook.worksheets) {
    sheet.views=[{state:'frozen',ySplit:1}];
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17204F'}};
    sheet.getRow(1).height=26;
    sheet.columns.forEach((column,index)=>{column.width=index===0?24:index===2||index===3?30:24;});
    sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});
    if(sheet!==overview) sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet===sheets?sheet.rowCount-1:sheet.rowCount),column:sheet.columnCount}};
  }
  overview.getColumn(2).width=80;
  sheets.getRow(sheets.rowCount).font={bold:true};
  const bytes=await workbook.xlsx.writeBuffer();
  return {fileName:`Calling-report-${summary.period}-${summary.fromDay}-to-${summary.toDay}.xlsx`,base64:Buffer.from(bytes).toString('base64')};
}
