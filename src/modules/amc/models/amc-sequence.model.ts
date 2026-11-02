import { Schema, model } from 'mongoose';

const amcSequenceSchema = new Schema({ _id: { type: String }, value: { type: Number, required: true, default: 0 } }, { versionKey: false, strict: 'throw' });
export const AMCSequenceModel = model('AMCSequence', amcSequenceSchema);
