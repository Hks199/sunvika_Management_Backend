import { Schema, model } from 'mongoose';

const bootstrapStateSchema = new Schema({
  key: { type: String, required: true, unique: true },
  status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], required: true },
  lockedAt: { type: Date, required: true },
  completedAt: { type: Date }
}, { timestamps: true });

export const BootstrapStateModel = model('BootstrapState', bootstrapStateSchema);
