import { Schema, model } from 'mongoose';

const districtSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true },
  state: { type: Schema.Types.ObjectId, ref: 'State', required: true, index: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });

districtSchema.index({ state: 1, normalizedName: 1 }, { unique: true });

export const DistrictModel = model('District', districtSchema);
