import { Schema, model } from 'mongoose';

const customerSchema = new Schema({
  customerCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  sourceLead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
  customerName: { type: String, required: true, trim: true, maxlength: 160 },
  mobileNumber: { type: String, required: true, trim: true },
  alternateNumber: { type: String, trim: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  state: { type: Schema.Types.ObjectId, ref: 'State', required: true },
  district: { type: Schema.Types.ObjectId, ref: 'District', required: true },
  blockOrTehsil: { type: String, trim: true, maxlength: 120 },
  siteAddress: { type: String, required: true, trim: true, maxlength: 1000 },
  requiredCapacityKW: { type: Number, required: true, min: 0.1, max: 100000 },
  ratePerKW: { type: Number, required: true, min: 0, max: 100000000 },
  paymentMode: { type: String, required: true, trim: true, maxlength: 100 },
  panelBrand: { type: String, required: true, trim: true, maxlength: 100 },
  panelTechnology: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, required: true, enum: ['ONBOARDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ONBOARDING' },
  creatorId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });

customerSchema.index({ creatorId: 1, createdAt: -1 });
customerSchema.index({ mobileNumber: 1 });
export const CustomerModel = model('Customer', customerSchema);
