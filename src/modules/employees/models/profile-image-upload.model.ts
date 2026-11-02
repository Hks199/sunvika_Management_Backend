import { Schema, model } from 'mongoose';

const profileImageUploadSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee' },
  key: { type: String, required: true, unique: true },
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  size: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  claimedAt: { type: Date },
  revokedAt: { type: Date }
}, { timestamps: true });

profileImageUploadSchema.index({ owner: 1, expiresAt: 1, claimedAt: 1, employee: 1 });
export const ProfileImageUploadModel = model('ProfileImageUpload', profileImageUploadSchema);
