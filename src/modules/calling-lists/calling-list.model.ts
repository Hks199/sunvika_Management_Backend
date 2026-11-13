import { Schema, model } from 'mongoose';
const listSchema = new Schema({
  candidateStorage: { type: String, enum: ['S3', 'DATABASE'], default: 'DATABASE' },
  batch: { type: Schema.Types.ObjectId, ref: 'CallingBatch' }, part: Number,
  assignmentSource: { type: String, enum: ['MANUAL', 'AUTO'] },
  title: { type: String, required: true, maxlength: 160 },
  fileName: { type: String, required: true, maxlength: 180 },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
  assignedAt: Date,
  bucket: { type: String, required: true, select: false },
  key: { type: String, required: true, select: false },
  state: { type: String, enum: ['RESERVED', 'UPLOADING', 'STAGED', 'READY'], default: 'RESERVED', required: true },
  expiresAt: Date,
  busy: { type: Boolean, default: false },
  headers: [{ type: String }],
  rowCount: { type: Number, default: 0 },
  originalRowCount: { type: Number, min: 0 },
  deletedCalledCount: { type: Number, default: 0, min: 0 },
  deletedConvertedCount: { type: Number, default: 0, min: 0 },
  size: { type: Number, required: true }
}, { timestamps: true, strict: 'throw' });
listSchema.index({ uploadedBy: 1, state: 1, createdAt: -1 });
listSchema.index({ assignedTo: 1, state: 1, createdAt: -1 });
listSchema.index({ batch: 1, part: 1 }, { unique: true, partialFilterExpression: { batch: { $type: 'objectId' } } });
listSchema.index({ candidateStorage: 1, state: 1, assignedTo: 1, createdAt: 1 });
export const CallingListModel = model('CallingList', listSchema);
const rowSchema = new Schema({
  list: { type: Schema.Types.ObjectId, ref: 'CallingList', required: true },
  rowNumber: { type: Number, required: true },
  values: [{ type: String }],
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  callStatus: { type: String, enum: ['NOT_CALLED', 'INTERESTED', 'NEEDS_FOLLOWUP', 'NOT_INTERESTED'], default: 'NOT_CALLED' },
  callNote: { type: String, maxlength: 1000, default: '' },
  nextFollowUpAt: { type: Date, default: null },
  lastCalledAt: { type: Date, default: null },
  statusUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
}, { timestamps: true, strict: 'throw' });
rowSchema.index({ list: 1, rowNumber: 1 }, { unique: true });
export const CallingCandidateModel = model('CallingCandidate', rowSchema);
