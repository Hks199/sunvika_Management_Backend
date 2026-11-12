import { AppError } from '../../utils/app-error.util.js';
export const CALLING_REPORT_ROLES = ['RM','CP_HEAD','MIS','MD'] as const;
export function canViewCallingReport(code: string, actor: string, rm: string, hierarchy: string[]) {
  return code === 'MD' || code === 'MIS' || (code === 'RM' && actor === rm) || (code === 'CP_HEAD' && hierarchy.includes(actor));
}
export function canVerifyCallingReport(code: string, actor: string, rm: string, hierarchy: string[]) {
  return actor !== rm && (code === 'MD' || (code === 'CP_HEAD' && hierarchy.includes(actor)));
}
export function indiaDay(date = new Date()) { return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0,10); }
export function reportRange(period: string, day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== day) throw new AppError('Choose a valid report date',400);
  let first = new Date(date), last = new Date(date);
  if (period === 'WEEK') first.setUTCDate(first.getUTCDate()-6);
  else if (period === 'MONTH') { first.setUTCDate(1); last = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)); }
  else if (period !== 'DAY') throw new AppError('Choose day, week or month',400);
  const fromDay = first.toISOString().slice(0,10), toDay = last.toISOString().slice(0,10);
  return { fromDay, toDay, start: new Date(first.getTime()-330*60_000), end: new Date(last.getTime()+86400_000-330*60_000) };
}
export type ReportCounts = { called: number; converted: number; interested: number; followUp: number };
export function emptyCounts(): ReportCounts { return { called:0,converted:0,interested:0,followUp:0 }; }
export function sumCounts(rows: ReportCounts[]): ReportCounts { return rows.reduce((sum,row)=>({called:sum.called+row.called,converted:sum.converted+row.converted,interested:sum.interested+row.interested,followUp:sum.followUp+row.followUp}),emptyCounts()); }
