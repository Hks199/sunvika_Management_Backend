import { createHash, randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { env } from '../../config/env.config.js';
import { AppError } from '../../utils/app-error.util.js';
import { logger } from '../../services/logger.service.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { indiaDay } from '../calling-reports/calling-report.policy.js';
import { CallingBatchModel, CallingAllocationModel, CallingDistributionSettingsModel } from './calling-bulk.model.js';
import { CallingListModel, CallingCandidateModel } from './calling-list.model.js';
import { callingListStorage } from './calling-list.storage.js';
import { buildCallingSheet, splitCallingWorkbook } from './calling-bulk.excel.js';
import { assignStoredCallingSheet } from './calling-sheet-assignment.js';

export async function assertCallingBatchAdministrator(actorId: Types.ObjectId) {
  const employee = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role').lean();
  const role = employee ? await RoleModel.findOne({ _id: employee.role, isActive: true }).select('code').lean() : null;
  if (!role || !['MD','MIS'].includes(role.code)) throw new AppError('Only MD and MIS can manage upload batches and daily distribution', 403);
}
const publicBatch = 'title fileName uploadedBy state size candidateCount sheetCount error createdAt completedAt';
export function dailyDistributionTime(now: Date) {
  const local = new Date(now.getTime() + 330 * 60_000);
  return { day: indiaDay(now), due: local.getUTCHours() * 60 + local.getUTCMinutes() >= 570 };
}
export const callingBulkService = {
  async reserve(actorId: Types.ObjectId, input: { title: string; fileName: string; size: number }) {
    await assertCallingBatchAdministrator(actorId);
    if (!env.awsRegion || !env.awsCallingListBucketName) throw new AppError('Calling-list S3 storage is not configured', 503);
    const id = new Types.ObjectId();
    const batch = await CallingBatchModel.create({ _id: id, ...input, uploadedBy: actorId, bucket: env.awsCallingListBucketName,
      key: `calling-lists/batches/${id}/source.xlsx`, expiresAt: new Date(Date.now() + 30 * 60_000) });
    return { _id: batch._id, expiresAt: batch.expiresAt };
  },
  async upload(actorId: Types.ObjectId, batchId: string, bytes: Buffer) {
    await assertCallingBatchAdministrator(actorId);
    if (!Types.ObjectId.isValid(batchId)) throw new AppError('Batch not found', 404);
    const batch = await CallingBatchModel.findById(batchId).select('+bucket +key');
    if (!batch) throw new AppError('Batch not found', 404);
    if (!Buffer.isBuffer(bytes) || bytes.length !== batch.size || bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw new AppError('Upload the selected .xlsx workbook with its reserved size', 400);
    const claimed = await CallingBatchModel.updateOne({ _id: batch._id, state: 'RESERVED', expiresAt: { $gt: new Date() } }, { $set: { state: 'UPLOADING', leaseUntil: new Date(Date.now() + 30 * 60_000) } });
    if (!claimed.modifiedCount) throw new AppError('Upload expired or is already in progress. Select the workbook again.', 409);
    try {
      await callingListStorage.put(batch.bucket, batch.key, bytes);
      await CallingBatchModel.updateOne({ _id: batch._id, state: 'UPLOADING' }, { $set: { state: 'QUEUED' }, $unset: { expiresAt: 1, leaseUntil: 1 } });
    } catch (error) { await CallingBatchModel.updateOne({ _id: batch._id, state: 'UPLOADING' }, { $set: { state: 'RESERVED' } }); throw error; }
    return { _id: batch._id, state: 'QUEUED' };
  },
  async list(actorId: Types.ObjectId, page: number, limit: number) {
    await assertCallingBatchAdministrator(actorId);
    const [data,total] = await Promise.all([CallingBatchModel.find().select(publicBatch).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean(),CallingBatchModel.countDocuments()]);
    return { data,total,page,limit };
  },
  async retry(actorId: Types.ObjectId, batchId: string) {
    await assertCallingBatchAdministrator(actorId);
    if (!Types.ObjectId.isValid(batchId)) throw new AppError('Batch not found',404);
    const batch = await CallingBatchModel.findOneAndUpdate({ _id: batchId, $or: [{ state:'FAILED' },{ state:'UPLOADING',leaseUntil:{$lte:new Date()} }] },{ $set:{state:'QUEUED',error:''} });
    if (!batch) throw new AppError('Only failed or interrupted uploads can be retried',409);
    return { _id:batch._id,state:'QUEUED' };
  },
  async settings(actorId: Types.ObjectId) { await assertCallingBatchAdministrator(actorId); return (await CallingDistributionSettingsModel.findOne({key:'daily'}).select('enabled skipUnfinished -_id').lean()) ?? { enabled:true,skipUnfinished:false }; },
  async saveSettings(actorId: Types.ObjectId, input: { enabled:boolean; skipUnfinished:boolean }) {
    await assertCallingBatchAdministrator(actorId);
    return CallingDistributionSettingsModel.findOneAndUpdate({key:'daily'},{$set:{enabled:input.enabled,skipUnfinished:input.skipUnfinished,updatedBy:actorId}},{new:true,upsert:true,runValidators:true}).select('enabled skipUnfinished -_id');
  }
};

/** Recoverable queue worker: a batch's partial sheets remain hidden until the whole import succeeds. */
export async function processCallingBatch() {
  const owner = randomUUID(), now = new Date();
  const batch = await CallingBatchModel.findOneAndUpdate({ $or:[{state:'QUEUED'},{state:'PROCESSING',leaseUntil:{$lt:now}}] },
    {$set:{state:'PROCESSING',leaseOwner:owner,leaseUntil:new Date(Date.now()+20*60_000),error:''}}, {new:true,sort:{createdAt:1}}).select('+bucket +key');
  if (!batch) return false;
  try {
    const bytes = await callingListStorage.read(batch.bucket,batch.key);
    const counts = await splitCallingWorkbook(bytes,async(headers,rows,part,count)=>{
      const id = new Types.ObjectId(createHash('sha256').update(`${batch._id}:${part}`).digest('hex').slice(0,24));
      const partName = `${batch._id}_part_${String(part).padStart(5,'0')}.xlsx`, key = `calling-lists/batches/${batch._id}/${partName}`;
      const workbook = await buildCallingSheet(headers,rows);
      const lease = await CallingBatchModel.updateOne({_id:batch._id,state:'PROCESSING',leaseOwner:owner},{$set:{leaseUntil:new Date(Date.now()+20*60_000)}});
      if(!lease.matchedCount)throw new AppError('Batch processing lease expired',409);
      await callingListStorage.put(batch.bucket,key,workbook);
      await CallingListModel.updateOne({_id:id,state:{$ne:'READY'}},{$set:{batch:batch._id,part,title:`${batch.title} / ${part}`,fileName:partName,uploadedBy:batch.uploadedBy,bucket:batch.bucket,key,state:'STAGED',candidateStorage:'S3',headers,rowCount:rows.length,originalRowCount:rows.length,size:workbook.length}}, {upsert:true});
      await CallingBatchModel.updateOne({_id:batch._id,leaseOwner:owner},{$set:{candidateCount:count,sheetCount:part}});
    });
    await mongoose.connection.transaction(async session=>{
      const completed = await CallingBatchModel.updateOne({_id:batch._id,state:'PROCESSING',leaseOwner:owner},{$set:{state:'READY',...counts,completedAt:new Date()},$unset:{leaseOwner:1,leaseUntil:1}}, {session});
      if(!completed.modifiedCount)throw new AppError('Batch processing ownership changed',409);
      await CallingListModel.updateMany({batch:batch._id,state:'STAGED'},{$set:{state:'READY'}},{session});
    });
  } catch(error) {
    logger.error({err:error,batchId:batch._id},'Calling batch processing failed');
    await CallingBatchModel.updateOne({_id:batch._id,state:'PROCESSING',leaseOwner:owner},{$set:{state:'FAILED',error:error instanceof AppError?error.message:'Processing failed. Retry or upload a corrected workbook.'},$unset:{leaseOwner:1,leaseUntil:1}});
  }
  return true;
}

/** Unique (IST day, RM, slot) allocations make retries and multiple API instances safe. */
export async function distributeDailyCallingSheets(now = new Date()) {
  const {day,due}=dailyDistributionTime(now); if(!due)return;
  const settings = await CallingDistributionSettingsModel.findOne({key:'daily'}).lean();
  if(settings?.enabled===false)return;
  const role=await RoleModel.findOne({code:'RM',isActive:true}).select('_id').lean();if(!role)return;
  const rms=await EmployeeModel.find({role:role._id,isActive:true}).select('_id').sort({employeeCode:1}).lean();
  // Rotate the first recipient daily so a small remaining pool is not always given to the same RMs.
  const offset=rms.length?Math.floor(Date.parse(day)/86400_000)%rms.length:0;
  const ordered=[...rms.slice(offset),...rms.slice(0,offset)];
  const slot = 0; // One sheet per RM per day; preserve historical slot references.
  for(const rm of ordered){
    if(await CallingAllocationModel.exists({day,rm:rm._id}))continue;
    if(settings?.skipUnfinished){
      const today=await CallingAllocationModel.find({day,rm:rm._id}).distinct('list');
      const lists=await CallingListModel.find({assignedTo:rm._id,state:'READY',_id:{$nin:today}}).distinct('_id');
      if(await CallingCandidateModel.exists({list:{$in:lists},employee:null,callStatus:'NOT_CALLED'}))continue;
    }
    for(let attempt=0;attempt<3;attempt++){
      const list=await CallingListModel.findOne({state:'READY',candidateStorage:'S3',assignedTo:null,busy:false,batch:{$type:'objectId'}}).sort({createdAt:1,part:1}).select('_id').lean();
      if(!list)return;
      try{await assignStoredCallingSheet(list._id,rm._id,undefined,{day,slot});break;}
      catch(error){
        if(await CallingAllocationModel.exists({day,rm:rm._id}))break;
        if((error as {statusCode?:number}).statusCode===409)continue;
        logger.error({err:error,listId:list._id,rmId:rm._id},'Daily calling-sheet assignment failed');break;
      }
    }
  }
}

export function startCallingDistributionWorker() {
  let processing=false,distributing=false;
  const tick=()=>{
    if(!processing){processing=true;void processCallingBatch().catch(error=>logger.error({err:error},'Calling import worker failed')).finally(()=>{processing=false;});}
    if(!distributing){distributing=true;void distributeDailyCallingSheets().catch(error=>logger.error({err:error},'Calling distribution worker failed')).finally(()=>{distributing=false;});}
  };
  const timer=setInterval(tick,30_000);timer.unref();tick();
  return ()=>clearInterval(timer);
}
