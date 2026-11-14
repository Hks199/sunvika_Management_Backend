import { Schema, model } from 'mongoose';
const threadSchema = new Schema({
  title: { type: String, required: true, maxlength: 160, trim: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  recipientRole: { type: String, enum: ['CP_HEAD', 'MIS', 'RM'], required: true },
  lastMessageAt: { type: Date, required: true }
}, { timestamps: true, strict: 'throw' });
threadSchema.index({ createdBy: 1, lastMessageAt: -1 });
threadSchema.index({ assignedTo: 1, lastMessageAt: -1 });
const messageSchema = new Schema({
  thread: { type: Schema.Types.ObjectId, ref: 'QueryThread', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  body: { type: String, required: true, maxlength: 5000, trim: true }
}, { timestamps: true, strict: 'throw' });
messageSchema.index({ thread: 1, createdAt: -1, _id: -1 });
const notificationSchema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  thread: { type: Schema.Types.ObjectId, ref: 'QueryThread', required: true },
  message: { type: Schema.Types.ObjectId, ref: 'QueryMessage', required: true },
  title: { type: String, required: true },
  readAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, message: 1 }, { unique: true });
export const QueryThreadModel = model('QueryThread', threadSchema);
export const QueryMessageModel = model('QueryMessage', messageSchema);
export const QueryNotificationModel = model('QueryNotification', notificationSchema);
