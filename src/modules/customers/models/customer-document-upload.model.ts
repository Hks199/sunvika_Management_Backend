import { Schema, model } from 'mongoose';

const uploadSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  owner: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  documentType: { type: String, required: true, enum: ['PAN', 'AADHAAR', 'ELECTRICITY_BILL', 'BANK_PASSBOOK'] },
  fileName: { type: String, required: true, trim: true, maxlength: 180 },
  key: { type: String, required: true, unique: true },
  contentType: { type: String, required: true, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  size: { type: Number, required: true },
  uploadedAt: { type: Date },
  expiresAt: { type: Date, required: true },
  status: { type: String, required: true, enum: ['PENDING', 'UPLOADING', 'VERIFYING', 'COMPLETED', 'REVOKED'], default: 'PENDING' }
}, { timestamps: true, strict: 'throw' });

uploadSchema.pre('validate', function validateOwner(next) {
  if (Boolean(this.customer) === Boolean(this.lead)) {
    next(new Error('A document upload must belong to exactly one customer or lead'));
    return;
  }
  next();
});
uploadSchema.index({ owner: 1, expiresAt: 1, status: 1 });
export const CustomerDocumentUploadModel = model('CustomerDocumentUpload', uploadSchema);
