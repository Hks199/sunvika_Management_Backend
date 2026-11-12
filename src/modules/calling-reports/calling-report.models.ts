import { Schema, model } from 'mongoose';
const activitySchema = new Schema({
  eventKey: { type: String, required: true, unique: true },
  rm: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  performedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  list: { type: Schema.Types.ObjectId, ref: 'CallingList', required: true },
  sheetName: { type: String, required: true },
  candidate: { type: Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['OUTCOME','CONVERTED','DELETED'], required: true },
  status: { type: String, required: true },
  occurredAt: { type: Date, required: true },
  source: { type: String, enum: ['LIVE','LEGACY'], default: 'LIVE' }
}, { timestamps: true, strict: 'throw' });
activitySchema.index({ rm: 1, occurredAt: 1, _id: 1 });
activitySchema.index({ candidate: 1, kind: 1 });
export const CallingActivityModel = model('CallingActivity', activitySchema);
const counts = { called: { type: Number, required: true }, converted: { type: Number, required: true }, interested: { type: Number, required: true }, followUp: { type: Number, required: true } };
const sheet = new Schema({ list: { type: Schema.Types.ObjectId, required: true }, sheetName: { type: String, required: true }, ...counts }, { _id: false });
const reportSchema = new Schema({
  rm: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  day: { type: String, required: true },
  sheets: { type: [sheet], required: true },
  totals: { type: new Schema(counts, { _id: false }), required: true },
  generatedAt: { type: Date, required: true },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  revision: { type: Number, default: 1 },
  status: { type: String, enum: ['PENDING','VERIFIED'], default: 'PENDING' },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  verifiedAt: { type: Date, default: null },
  reviewNote: { type: String, maxlength: 1000, default: '' }
}, { timestamps: true, strict: 'throw' });
reportSchema.index({ rm: 1, day: 1 }, { unique: true });
export const CallingDailyReportModel = model('CallingDailyReport', reportSchema);
