import Joi from 'joi';
import { indiaDay, reportRange } from '../calling-reports/calling-report.policy.js';
export const REMINDER_CONTROLLERS = ['MD','CP_HEAD','RM'];
export function canControlRm(code: string, actor: string, rm: string, hierarchy: readonly string[]) {
  return code === 'MD' || (code === 'RM' && actor === rm) || (code === 'CP_HEAD' && hierarchy.includes(actor));
}
export type ReminderTiming = { startDate: string; durationDays: number; everyDays: number; time: string; repeatMinutes: number; endTime: string };
export function reminderEndDate(input: Pick<ReminderTiming,'startDate'|'durationDays'>) { return new Date(Date.parse(`${input.startDate}T00:00:00Z`)+(input.durationDays-1)*86400_000).toISOString().slice(0,10); }
export function dueReminderSlot(input: ReminderTiming, now: Date) {
  const day=indiaDay(now), age=Math.round((Date.parse(`${day}T00:00:00Z`)-Date.parse(`${input.startDate}T00:00:00Z`))/86400_000);
  if(age<0||age>=input.durationDays||age%input.everyDays!==0)return null;
  const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
  const local=new Date(now.getTime()+330*60_000),current=local.getUTCHours()*60+local.getUTCMinutes(),start=minutes(input.time);
  if(current<start)return null;
  const slot=input.repeatMinutes?start+Math.floor((current-start)/input.repeatMinutes)*input.repeatMinutes:start;
  if((input.repeatMinutes&&slot>minutes(input.endTime))||current-slot>=5)return null;
  const time=`${String(Math.floor(slot/60)).padStart(2,'0')}:${String(slot%60).padStart(2,'0')}`;
  return { slot:`${day}T${time}`,scheduledAt:new Date(`${day}T${time}:00+05:30`) };
}
const time=Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const day=Joi.string().pattern(/^20\d{2}-\d{2}-\d{2}$/).custom((value,helpers)=>{try{reportRange('DAY',value);return value;}catch{return helpers.error('any.invalid');}});
export const reminderSchema=Joi.object({
  title:Joi.string().trim().min(1).max(100).required(),body:Joi.string().trim().min(1).max(500).required(),enabled:Joi.boolean().strict().required(),
  startDate:day.required(),durationDays:Joi.number().integer().min(1).max(365).required(),everyDays:Joi.number().integer().min(1).max(365).required(),
  time:time.required(),repeatMinutes:Joi.number().integer().valid(0).allow(15,30,60,120,180,240,360,720).required(),endTime:time.allow('').required()
}).unknown(false).custom((value,helpers)=>value.repeatMinutes&&(!value.endTime||value.endTime<value.time)?helpers.error('any.invalid'):value);
export const expoToken=Joi.string().pattern(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/).max(250).required();
export const deviceSchema=Joi.object({token:expoToken,platform:Joi.string().valid('android','ios').required()}).unknown(false);
