import { Schema, model } from 'mongoose';

const customerDocumentSchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  documentType: { type: String, required: true, enum: ['PAN', 'AADHAAR', 'ELECTRICITY_BILL', 'BANK_PASSBOOK'] },
  fileName: { type: String, required: true, trim: true, maxlength: 180 },
  s3Key: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  fileSize: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  uploadedAt: { type: Date, default: Date.now },
  verificationStatus: { type: String, required: true, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
  verifiedAt: { type: Date },
  verificationRemark: { type: String, trim: true, maxlength: 1000 },
  uploadReservation: { type: Schema.Types.ObjectId, ref: 'CustomerDocumentUpload', required: true, unique: true }
}, { timestamps: true, strict: 'throw' });

customerDocumentSchema.index({ customer: 1, documentType: 1, uploadedAt: -1 });
export const CustomerDocumentModel = model('CustomerDocument', customerDocumentSchema);
