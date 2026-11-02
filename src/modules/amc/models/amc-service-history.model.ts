import { Schema, model } from 'mongoose';

const amcServiceHistorySchema = new Schema({
  contract: { type: Schema.Types.ObjectId, ref: 'AMCContract', required: true, index: true },
  schedule: { type: Schema.Types.ObjectId, ref: 'AMCSchedule' },
  serviceDate: { type: Date, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  outcome: { type: String, required: true, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 2000 },
  partsUsed: [{ type: String, trim: true, maxlength: 120 }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });

amcServiceHistorySchema.index({ contract: 1, serviceDate: -1 });
export const AMCServiceHistoryModel = model('AMCServiceHistory', amcServiceHistorySchema);
