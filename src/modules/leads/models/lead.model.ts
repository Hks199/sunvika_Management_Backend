import { Schema, model } from 'mongoose';
import { LEAD_STATUSES } from '../constants/lead-status.js';

const leadSchema = new Schema({
  leadCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  customerName: { type: String, required: true, trim: true, maxlength: 160 },
  mobileNumber: { type: String, required: true, trim: true },
  alternateNumber: { type: String, trim: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  state: { type: Schema.Types.ObjectId, ref: 'State', required: true },
  district: { type: Schema.Types.ObjectId, ref: 'District', required: true },
  blockOrTehsil: { type: String, trim: true, maxlength: 120 },
  siteAddress: { type: String, required: true, trim: true, maxlength: 1000 },
  status: { type: String, enum: LEAD_STATUSES, default: 'PENDING', required: true },
  creatorId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  nextFollowUpDate: { type: Date }
}, { timestamps: true, strict: 'throw' });

leadSchema.index({ creatorId: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ status: 1, nextFollowUpDate: 1 });
leadSchema.index({ mobileNumber: 1 });

export const LeadModel = model('Lead', leadSchema);
