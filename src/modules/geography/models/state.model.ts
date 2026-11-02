import { Schema, model } from 'mongoose';

const stateSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  code: { type: String, trim: true, uppercase: true, maxlength: 12 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });

stateSchema.index({ normalizedName: 1 }, { unique: true });
stateSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });

export const StateModel = model('State', stateSchema);
