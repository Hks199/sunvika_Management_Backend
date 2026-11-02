import { Schema, model } from 'mongoose';

const quotationSchema = new Schema({
  quotationNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  version: { type: Number, required: true, min: 1 },
  companyName: { type: String, required: true, default: 'Sunvika Private Limited' },
  customerName: { type: String, required: true, trim: true },
  customerMobile: { type: String, required: true, trim: true },
  siteAddress: { type: String, required: true, trim: true },
  requiredCapacityKW: { type: Schema.Types.Decimal128, required: true },
  ratePerKW: { type: Schema.Types.Decimal128, required: true },
  totalProjectAmount: { type: Schema.Types.Decimal128, required: true },
  paymentMode: { type: String, required: true, trim: true },
  panelBrand: { type: String, required: true, trim: true },
  panelTechnology: { type: String, required: true, trim: true },
  quotationDate: { type: Date, required: true },
  termsAndConditions: { type: String, required: true, trim: true },
  authorizedCompanyDetails: { type: String, required: true, trim: true },
  s3Key: { type: String, required: true, unique: true },
  fileSize: { type: Number, required: true },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  status: { type: String, enum: ['GENERATED', 'SUPERSEDED'], default: 'GENERATED', required: true }
}, { timestamps: true, strict: 'throw' });

quotationSchema.index({ lead: 1, version: 1 }, { unique: true });
quotationSchema.index({ lead: 1, createdAt: -1 });
export const QuotationModel = model('Quotation', quotationSchema);
