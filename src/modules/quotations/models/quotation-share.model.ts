import { Schema, model } from 'mongoose';

const quotationShareSchema = new Schema({
  quotation: { type: Schema.Types.ObjectId, ref: 'Quotation' },
  brochure: { type: Schema.Types.ObjectId, ref: 'Brochure' },
  sharedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  recipientMobileLast4: { type: String, required: true },
  channel: { type: String, enum: ['WHATSAPP_CLICK_TO_CHAT'], default: 'WHATSAPP_CLICK_TO_CHAT', required: true },
  linkCreatedAt: { type: Date, default: Date.now }
}, { timestamps: false, strict: 'throw' });
quotationShareSchema.index({ quotation: 1, linkCreatedAt: -1 });
quotationShareSchema.index({ sharedBy: 1, linkCreatedAt: -1 });
export const QuotationShareModel = model('QuotationShare', quotationShareSchema);
