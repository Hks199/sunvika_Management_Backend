import { Schema, model } from 'mongoose';

const amcScheduleSchema = new Schema({
  contract: { type: Schema.Types.ObjectId, ref: 'AMCContract', required: true, index: true },
  scheduledAt: { type: Date, required: true },
  assignedEmployee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  status: { type: String, enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED'], default: 'SCHEDULED', required: true },
  notes: { type: String, trim: true, maxlength: 1000 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });

amcScheduleSchema.index({ assignedEmployee: 1, scheduledAt: 1 });
export const AMCScheduleModel = model('AMCSchedule', amcScheduleSchema);
