import { Schema, model } from 'mongoose';
const scheduleSchema = new Schema({
  rm: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  title: { type: String, required: true, maxlength: 100 }, body: { type: String, required: true, maxlength: 500 },
  enabled: { type: Boolean, default: true }, startDate: { type: String, required: true }, durationDays: { type: Number, required: true, min: 1, max: 365 },
  everyDays: { type: Number, required: true, min: 1, max: 365 }, time: { type: String, required: true },
  repeatMinutes: { type: Number, default: 0, min: 0, max: 720 }, endTime: { type: String, default: '' },
  version: { type: Number, default: 1 }, createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }, updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }
}, { timestamps: true, strict: 'throw' });
scheduleSchema.index({ enabled: 1 });
scheduleSchema.index({ rm: 1 }, { name: 'rm_schedule_lookup' });
export const CpReminderScheduleModel = model('CpReminderSchedule', scheduleSchema);
const runSchema = new Schema({
  schedule: { type: Schema.Types.ObjectId, ref: 'CpReminderSchedule', required: true }, rm: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  slot: { type: String, required: true }, scheduledAt: { type: Date, required: true }, version: { type: Number, required: true },
  title: { type: String, required: true }, body: { type: String, required: true },
  state: { type: String, enum: ['PENDING','PROCESSING','COMPLETED','CANCELLED'], default: 'PENDING' },
  leaseUntil: Date, leaseOwner: String, recipientCount: { type: Number, default: 0 }, completedAt: Date
}, { timestamps: true, strict: 'throw' });
runSchema.index({ schedule: 1, slot: 1 }, { unique: true, name: 'schedule_slot_unique' }); runSchema.index({ state: 1, leaseUntil: 1 });
export const CpReminderRunModel = model('CpReminderRun', runSchema);
const inboxSchema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  run: { type: Schema.Types.ObjectId, ref: 'CpReminderRun', required: true }, rm: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  kind: { type: String, default: 'CP_REMINDER' }, title: { type: String, required: true }, body: { type: String, required: true }, readAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });
inboxSchema.index({ recipient: 1, run: 1 }, { unique: true }); inboxSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
export const CpReminderNotificationModel = model('CpReminderNotification', inboxSchema);
const deviceSchema = new Schema({
  token: { type: String, required: true, unique: true, select: false }, employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  sessionId: { type: String, required: true, select: false }, platform: { type: String, enum: ['android','ios'], required: true }, isActive: { type: Boolean, default: true }
}, { timestamps: true, strict: 'throw' });
deviceSchema.index({ employee: 1, isActive: 1 });
export const PushDeviceModel = model('PushDevice', deviceSchema);
const deliverySchema = new Schema({
  notification: { type: Schema.Types.ObjectId, ref: 'CpReminderNotification', required: true }, device: { type: Schema.Types.ObjectId, ref: 'PushDevice', required: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'Employee', required: true }, run: { type: Schema.Types.ObjectId, ref: 'CpReminderRun', required: true },
  state: { type: String, enum: ['PENDING','SENDING','ACCEPTED','DELIVERED','FAILED','SKIPPED'], default: 'PENDING' },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now }, leaseUntil: Date, leaseOwner: String,
  ticket: String, receiptChecks: { type: Number, default: 0 }, lastError: { type: String, default: '', maxlength: 100 }
}, { timestamps: true, strict: 'throw' });
deliverySchema.index({ notification: 1, device: 1 }, { unique: true }); deliverySchema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 }); deliverySchema.index({ run: 1, state: 1 });
export const PushDeliveryModel = model('PushDelivery', deliverySchema);
export const CP_REMINDER_MODELS = [CpReminderScheduleModel,CpReminderRunModel,CpReminderNotificationModel,PushDeviceModel,PushDeliveryModel] as const;
