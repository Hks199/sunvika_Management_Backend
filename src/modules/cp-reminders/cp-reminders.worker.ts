import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env.config.js';
import { logger } from '../../services/logger.service.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { RefreshTokenModel } from '../auth/models/refresh-token.model.js';
import { CpReminderScheduleModel, CpReminderRunModel, CpReminderNotificationModel, PushDeviceModel, PushDeliveryModel } from './cp-reminders.model.js';
import { indiaDay } from '../calling-reports/calling-report.policy.js';
import { dueReminderSlot, reminderEndDate } from './cp-reminders.policy.js';
type Ticket={status:'ok'|'error';id?:string;details?:{error?:string}};
async function expoRequest(path:string,payload:unknown){
  const response=await fetch(`https://exp.host/--/api/v2/push/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(env.expoPushAccessToken?{Authorization:`Bearer ${env.expoPushAccessToken}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`ExpoHTTP${response.status}`);
  const body=await response.json() as {data:unknown;errors?:unknown[]};if(body.errors?.length||!body.data)throw new Error('ExpoRequestRejected');return body.data;
}
export const expoPushTransport={
  async send(payload:unknown){const tickets=await expoRequest('send',[payload]) as Ticket[];if(!Array.isArray(tickets)||!tickets[0])throw new Error('InvalidExpoTicket');return tickets[0];},
  async receipt(ticket:string){const receipts=await expoRequest('getReceipts',{ids:[ticket]}) as Record<string,Ticket>;return receipts[ticket];}
};
export async function enqueueCpReminders(now=new Date()){
  const schedules=await CpReminderScheduleModel.find({enabled:true}).lean();
  for(const schedule of schedules){const due=dueReminderSlot(schedule,now);if(!due)continue;
    try{await CpReminderRunModel.updateOne({schedule:schedule._id,slot:due.slot},{$setOnInsert:{schedule:schedule._id,rm:schedule.rm,...due,version:schedule.version,title:schedule.title,body:schedule.body,state:'PENDING'}},{upsert:true});}
    catch(error){if((error as {code?:number}).code!==11000)throw error;}
  }
}
export async function prepareCpReminderRun(now=new Date()){
  const owner=randomUUID();
  const run=await CpReminderRunModel.findOneAndUpdate({$or:[{state:'PENDING'},{state:'PROCESSING',leaseUntil:{$lt:now}}]},{$set:{state:'PROCESSING',leaseOwner:owner,leaseUntil:new Date(now.getTime()+300000)}},{new:true,sort:{scheduledAt:1}});
  if(!run)return false;
  try{
    await mongoose.connection.transaction(async session=>{
      const schedule=await CpReminderScheduleModel.findOne({_id:run.schedule,enabled:true}).session(session).lean();
      const rmRole=await RoleModel.findOne({code:'RM',isActive:true}).session(session).lean();
      const cpRole=await RoleModel.findOne({code:'CP',isActive:true}).session(session).lean();
      if(!schedule||indiaDay(now)>reminderEndDate(schedule)||now.getTime()-run.scheduledAt.getTime()>3600000||!rmRole||!cpRole||!await EmployeeModel.exists({_id:run.rm,role:rmRole._id,isActive:true}).session(session)){
        await CpReminderRunModel.updateOne({_id:run._id,leaseOwner:owner},{$set:{state:'CANCELLED'},$unset:{leaseOwner:1,leaseUntil:1}},{session});return;
      }
      const cps=await EmployeeModel.find({role:cpRole._id,isActive:true,hierarchyPath:run.rm}).select('_id').session(session).lean();
      if(cps.length){
        await CpReminderNotificationModel.insertMany(cps.map(cp=>({recipient:cp._id,run:run._id,rm:run.rm,title:run.title,body:run.body})),{session,ordered:true});
        const notifications=await CpReminderNotificationModel.find({run:run._id}).select('_id recipient').session(session).lean();
        const byCp=new Map(notifications.map(item=>[String(item.recipient),item._id]));
        const devices=await PushDeviceModel.find({employee:{$in:cps.map(cp=>cp._id)},isActive:true}).select('_id employee').session(session).lean();
        if(devices.length)await PushDeliveryModel.insertMany(devices.map(device=>({notification:byCp.get(String(device.employee)),device:device._id,recipient:device.employee,run:run._id,nextAttemptAt:now})),{session,ordered:true});
      }
      const completed=await CpReminderRunModel.updateOne({_id:run._id,state:'PROCESSING',leaseOwner:owner},{$set:{state:'COMPLETED',recipientCount:cps.length,completedAt:now},$unset:{leaseOwner:1,leaseUntil:1}},{session});
      if(!completed.modifiedCount)throw new Error('ReminderRunLeaseChanged');
    });
  }catch(error){
    await CpReminderRunModel.updateOne({_id:run._id,leaseOwner:owner},{$set:{state:'PENDING'},$unset:{leaseOwner:1,leaseUntil:1}});
    throw error;
  }
  return true;
}
async function eligibleDelivery(job:InstanceType<typeof PushDeliveryModel>,now:Date){
  const [device,notification]=await Promise.all([PushDeviceModel.findOne({_id:job.device,employee:job.recipient,isActive:true}).select('+token +sessionId').lean(),CpReminderNotificationModel.findById(job.notification).lean()]);
  if(!device||!notification)return null;
  const run=await CpReminderRunModel.findById(notification.run).select('scheduledAt schedule').lean();
  const schedule=run?await CpReminderScheduleModel.findOne({_id:run.schedule,rm:notification.rm,enabled:true}).lean():null;if(!schedule||indiaDay(now)>reminderEndDate(schedule))return null;
  if(!run||now.getTime()-run.scheduledAt.getTime()>3600000)return null;
  const [cpRole,rmRole]=await Promise.all([RoleModel.findOne({code:'CP',isActive:true}).lean(),RoleModel.findOne({code:'RM',isActive:true}).lean()]);
  if(!cpRole||!rmRole||!await EmployeeModel.exists({_id:job.recipient,role:cpRole._id,isActive:true,hierarchyPath:notification.rm})||!await EmployeeModel.exists({_id:notification.rm,role:rmRole._id,isActive:true}))return null;
  if(!await RefreshTokenModel.exists({employee:job.recipient,familyId:device.sessionId,revokedAt:null,expiresAt:{$gt:now}}))return null;
  return {device,notification};
}
export async function deliverCpPush(now=new Date()){
  for(let i=0;i<20;i++){
    const owner=randomUUID();const job=await PushDeliveryModel.findOneAndUpdate({$or:[{state:'PENDING',nextAttemptAt:{$lte:now}},{state:'SENDING',leaseUntil:{$lt:now}}]},{$set:{state:'SENDING',leaseOwner:owner,leaseUntil:new Date(now.getTime()+60000)},$inc:{attempts:1}},{new:true,sort:{createdAt:1}});
    if(!job)return;
    const filter={_id:job._id,leaseOwner:owner};
    try{
      const eligible=await eligibleDelivery(job,now);
      if(!eligible){await PushDeliveryModel.updateOne(filter,{$set:{state:'SKIPPED',lastError:'RecipientDeviceOrScheduleInactive'},$unset:{leaseOwner:1,leaseUntil:1}});continue;}
      const {device,notification}=eligible;
      const ticket=await expoPushTransport.send({to:device.token,title:notification.title,body:notification.body,sound:'default',channelId:'cp-reminders',ttl:3600,data:{type:'CP_REMINDER',notificationId:String(notification._id),rmId:String(notification.rm)}});
      if(ticket.status==='ok'&&ticket.id){await PushDeliveryModel.updateOne(filter,{$set:{state:'ACCEPTED',ticket:ticket.id,nextAttemptAt:new Date(now.getTime()+15*60_000),lastError:''},$unset:{leaseOwner:1,leaseUntil:1}});}
      else{
        const code=ticket.details?.error??'PushRejected';
        if(code==='DeviceNotRegistered')await PushDeviceModel.updateOne({_id:device._id,employee:job.recipient},{$set:{isActive:false}});
        if(code==='MessageRateExceeded')throw new Error(code);
        await PushDeliveryModel.updateOne(filter,{$set:{state:'FAILED',lastError:code},$unset:{leaseOwner:1,leaseUntil:1}});
      }
    }catch(error){
      const code=error instanceof Error?error.message:'PushDeliveryFailed';
      await PushDeliveryModel.updateOne(filter,{$set:{state:job.attempts>=5?'FAILED':'PENDING',lastError:code.slice(0,100),nextAttemptAt:new Date(now.getTime()+Math.min(3600000,60000*2**job.attempts))},$unset:{leaseOwner:1,leaseUntil:1}});
    }
  }
}
export async function checkCpPushReceipts(now=new Date()){
  const jobs=await PushDeliveryModel.find({state:'ACCEPTED',nextAttemptAt:{$lte:now}}).sort({nextAttemptAt:1}).limit(20);
  for(const job of jobs){
    if(!job.ticket)continue;
    try{
      const receipt=await expoPushTransport.receipt(job.ticket);
      if(!receipt){await PushDeliveryModel.updateOne({_id:job._id,state:'ACCEPTED'},{$inc:{receiptChecks:1},$set:{state:job.receiptChecks>=95?'FAILED':'ACCEPTED',lastError:'ReceiptNotAvailable',nextAttemptAt:new Date(now.getTime()+15*60_000)}});continue;}
      if(receipt.details?.error==='DeviceNotRegistered')await PushDeviceModel.updateOne({_id:job.device,employee:job.recipient},{$set:{isActive:false}});
      await PushDeliveryModel.updateOne({_id:job._id,state:'ACCEPTED'},{$set:{state:receipt.status==='ok'?'DELIVERED':'FAILED',lastError:receipt.details?.error??''}});
    }catch{await PushDeliveryModel.updateOne({_id:job._id,state:'ACCEPTED'},{$set:{nextAttemptAt:new Date(now.getTime()+15*60_000)}});}
  }
}
export function startCpReminderWorker(){
  let scheduling=false,delivering=false;
  const scheduleTick=()=>{if(scheduling)return;scheduling=true;void(async()=>{
    await enqueueCpReminders();
    for(let i=0;i<20;i++)if(!await prepareCpReminderRun())break;
  })().catch(error=>logger.error({err:error},'CP reminder scheduler failed')).finally(()=>{scheduling=false;});};
  const deliveryTick=()=>{if(delivering)return;delivering=true;void(async()=>{
    await deliverCpPush();await checkCpPushReceipts();
  })().catch(error=>logger.error({err:error},'CP push delivery worker failed')).finally(()=>{delivering=false;});};
  const scheduler=setInterval(scheduleTick,30000),delivery=setInterval(deliveryTick,5000);scheduler.unref();delivery.unref();scheduleTick();deliveryTick();
  return()=>{clearInterval(scheduler);clearInterval(delivery);};
}
