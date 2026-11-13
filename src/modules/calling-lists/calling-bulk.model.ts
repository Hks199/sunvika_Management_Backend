import { Schema, model } from 'mongoose';
const batchSchema = new Schema({
  title: { type: String, required: true, maxlength: 140 }, fileName: { type: String, required: true, maxlength: 180 },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  bucket: { type: String, required: true, select: false }, key: { type: String, required: true, select: false }, size: { type: Number, required: true },
  state: { type: String, enum: ['RESERVED','UPLOADING','QUEUED','PROCESSING','READY','FAILED'], default: 'RESERVED' },
  expiresAt: Date, leaseUntil: Date, leaseOwner: String, candidateCount: { type: Number, default: 0 }, sheetCount: { type: Number, default: 0 },
  error: { type: String, default: '', maxlength: 500 }, completedAt: Date
}, { timestamps: true, strict: 'throw' });
batchSchema.index({ state: 1, leaseUntil: 1, createdAt: 1 });
export const CallingBatchModel = model('CallingBatch', batchSchema);
const settingsSchema = new Schema({
  key: { type: String, unique: true, default: 'daily' }, enabled: { type: Boolean, default: true },
  skipUnfinished: { type: Boolean, default: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
}, { timestamps: true, strict: 'throw' });
export const CallingDistributionSettingsModel = model('CallingDistributionSettings', settingsSchema);
const allocationSchema = new Schema({
  day: { type: String, required: true }, rm: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  slot: { type: Number, required: true }, list: { type: Schema.Types.ObjectId, ref: 'CallingList', required: true }
}, { timestamps: true, strict: 'throw' });
allocationSchema.index({ day: 1, rm: 1, slot: 1 }, { unique: true });
allocationSchema.index({ list: 1 }, { unique: true });
export const CallingAllocationModel = model('CallingAllocation', allocationSchema);
