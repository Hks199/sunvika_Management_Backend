import { Schema, model } from 'mongoose';

const permissionSchema = new Schema({
  module: { type: String, required: true, lowercase: true, trim: true },
  action: { type: String, required: true, lowercase: true, trim: true },
  code: { type: String, required: true, lowercase: true, trim: true, unique: true },
  description: { type: String, trim: true, maxlength: 300 }
}, { timestamps: true, strict: 'throw' });

permissionSchema.index({ module: 1, action: 1 }, { unique: true });
export const PermissionModel = model('Permission', permissionSchema);
