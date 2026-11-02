import { Schema, model } from 'mongoose';

const auditLogSchema = new Schema({
  action: { type: String, required: true, trim: true, maxlength: 200 },
  module: { type: String, required: true, trim: true, maxlength: 80, index: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  resourceType: { type: String, required: true, trim: true, maxlength: 80 },
  resourceId: { type: Schema.Types.ObjectId, required: true, index: true },
  oldValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
  requestId: { type: String, trim: true, maxlength: 100 },
  ipAddress: { type: String, trim: true, maxlength: 64 },
  userAgent: { type: String, trim: true, maxlength: 500 },
  responseStatus: { type: Number, min: 200, max: 299 }
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw', versionKey: false });

auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1, createdAt: -1 });
export const AuditLogModel = model('AuditLog', auditLogSchema, 'audit_logs');
