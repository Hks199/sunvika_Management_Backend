import { Schema, model } from 'mongoose';

const brochureSchema = new Schema({
  brochureCode: { type: String, required: true, unique: true, uppercase: true },
  version: { type: Number, required: true, default: 1 },
  s3Key: { type: String, required: true, unique: true },
  fileSize: { type: Number, required: true },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });
brochureSchema.index({ createdAt: -1 });
export const BrochureModel = model('Brochure', brochureSchema);
