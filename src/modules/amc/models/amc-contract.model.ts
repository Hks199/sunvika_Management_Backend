import { Schema, model } from 'mongoose';

const amcContractSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  contractNumber: { type: String, required: true, uppercase: true, trim: true, unique: true },
  startDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  amount: { type: Schema.Types.Decimal128, required: true },
  currency: { type: String, required: true, uppercase: true, default: 'INR' },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'], default: 'ACTIVE', required: true },
  renewalStatus: { type: String, enum: ['NOT_DUE', 'UPCOMING', 'RENEWED', 'DECLINED'], default: 'NOT_DUE', required: true },
  renewalOf: { type: Schema.Types.ObjectId, ref: 'AMCContract' },
  assignedEmployee: { type: Schema.Types.ObjectId, ref: 'Employee' },
  nextServiceAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });

amcContractSchema.index({ customer: 1, status: 1 });
amcContractSchema.index({ expiryDate: 1, renewalStatus: 1 });
amcContractSchema.index({ assignedEmployee: 1, nextServiceAt: 1 });
export const AMCContractModel = model('AMCContract', amcContractSchema);
