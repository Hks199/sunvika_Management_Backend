import { Schema, model } from 'mongoose';

const sequenceSchema = new Schema({ _id: { type: String }, value: { type: Number, required: true, default: 0 } }, { versionKey: false, strict: 'throw' });
export const QuotationSequenceModel = model('QuotationSequence', sequenceSchema);
