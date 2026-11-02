import { Schema, model } from 'mongoose';
import { LEAD_STATUSES } from '../constants/lead-status.js';

const historySchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  previousStatus: { type: String, enum: LEAD_STATUSES, required: true },
  newStatus: { type: String, enum: LEAD_STATUSES, required: true },
  remark: { type: String, required: true, trim: true, maxlength: 1000 },
  changedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  changedAt: { type: Date, default: Date.now },
  nextFollowUpDate: { type: Date }
}, { timestamps: false, strict: 'throw' });

historySchema.index({ lead: 1, changedAt: -1 });
export const LeadStatusHistoryModel = model('LeadStatusHistory', historySchema);
