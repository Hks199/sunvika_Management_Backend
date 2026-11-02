import { Schema, model } from 'mongoose';

const hierarchyLockSchema = new Schema({
  key: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  lockedUntil: { type: Date, required: true }
}, { timestamps: true });

export const HierarchyLockModel = model('HierarchyLock', hierarchyLockSchema);
