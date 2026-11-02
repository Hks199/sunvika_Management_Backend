import { Schema, model } from 'mongoose';

const roleSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, uppercase: true, trim: true, unique: true },
  description: { type: String, trim: true, maxlength: 500 },
  level: { type: Number, required: true, min: 0, max: 100 },
  category: { type: String, enum: ['PRIMARY', 'ADMIN_HEAD', 'CUSTOM'], required: true, default: 'CUSTOM' },
  parentRole: { type: Schema.Types.ObjectId, ref: 'Role' },
  permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }],
  allowedChildRoles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  isSystemRole: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  permissionVersion: { type: Number, default: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
}, { timestamps: true, strict: 'throw' });

roleSchema.index({ category: 1, level: 1, isActive: 1 });
roleSchema.index({ parentRole: 1, isActive: 1 });
export const RoleModel = model('Role', roleSchema);
