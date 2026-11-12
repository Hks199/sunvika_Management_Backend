import { Schema, model } from 'mongoose';
const schema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  category: { type: String, required: true, enum: ['BUSINESS', 'TARGET', 'MOTIVATION'] },
  audienceRoles: [{ type: String, required: true }],
  scope: { type: String, required: true, enum: ['TEAM', 'ORGANIZATION'] },
  authorRole: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });
schema.index({ isActive: 1, audienceRoles: 1, createdAt: -1 });
schema.index({ createdBy: 1, createdAt: -1 });
export const AnnouncementModel = model('Announcement', schema);
