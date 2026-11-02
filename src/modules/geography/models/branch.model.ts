import { Schema, model } from 'mongoose';

const branchSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  state: { type: Schema.Types.ObjectId, ref: 'State', required: true, index: true },
  district: { type: Schema.Types.ObjectId, ref: 'District', required: true, index: true },
  address: { type: String, trim: true, maxlength: 500 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });

branchSchema.index({ code:  1 }, { unique: true });
branchSchema.index({ district: 1, name: 1 });

export const BranchModel = model('Branch', branchSchema);
