import { Schema, model } from 'mongoose';

const activitySchema = new Schema({
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  action: { type: String, required: true, enum: ['CP_ACCOUNT_CREATED', 'CONVERTED', 'UPDATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_VERIFIED'] },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  actor: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: false, strict: 'throw' });

activitySchema.index({ customer: 1, occurredAt: -1 });
activitySchema.index({ customer: 1, action: 1 }, { unique: true, partialFilterExpression: { action: 'CP_ACCOUNT_CREATED' } });
export const CustomerActivityModel = model('CustomerActivity', activitySchema);
