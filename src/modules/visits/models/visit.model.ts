import { Schema, model } from 'mongoose';

const visitSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
  visitedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  visitDate: { type: Date, required: true },
  remark: { type: String, required: true, trim: true, maxlength: 2000 },
  nextVisitDate: { type: Date },
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    address: { type: String, trim: true, maxlength: 500 }
  },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
}, { timestamps: true, strict: 'throw' });

visitSchema.index({ lead: 1, visitDate: -1 });
visitSchema.index({ visitedBy: 1, visitDate: -1 });
visitSchema.index({ nextVisitDate: 1 });

export const VisitModel = model('Visit', visitSchema);
