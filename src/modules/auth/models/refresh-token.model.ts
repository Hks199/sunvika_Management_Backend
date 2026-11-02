import { Schema, model } from 'mongoose';

const refreshTokenSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  familyId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken' },
  userAgent: { type: String, maxlength: 500 },
  ipAddress: { type: String, maxlength: 64 },
  lastUsedAt: { type: Date, required: true }
}, { timestamps: true });

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ employee: 1, revokedAt: 1, expiresAt: 1 });
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
