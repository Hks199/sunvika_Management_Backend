import { Schema, model } from 'mongoose';

const passwordResetTokenSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  revokedAt: { type: Date }
}, { timestamps: true });

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordResetTokenModel = model('PasswordResetToken', passwordResetTokenSchema);
