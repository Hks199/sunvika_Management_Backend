import { Schema, model } from 'mongoose';

const shareLinkSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  resourceType: { type: String, required: true, enum: ['QUOTATION', 'BROCHURE'] },
  resource: { type: Schema.Types.ObjectId, required: true },
  s3Key: { type: String, required: true },
  fileName: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  revokedAt: { type: Date },
  accessCount: { type: Number, default: 0 },
  lastAccessedAt: { type: Date }
}, { timestamps: true, strict: 'throw' });
shareLinkSchema.index({ expiresAt: 1, revokedAt: 1 });
export const PublicShareLinkModel = model('PublicShareLink', shareLinkSchema);
