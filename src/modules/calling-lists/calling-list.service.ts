import { canFilterCallingLists, callingListScope, filterCallingLists, type CallingListFilters } from './calling-list-filters.js';
import { callingActivity } from '../calling-reports/calling-activity.service.js';
import { callingListCounts } from './calling-list-counts.js';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { env } from '../../config/env.config.js';
import { AppError } from '../../utils/app-error.util.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { employeeService } from '../employees/services/employee.service.js';
import { CallingListModel, CallingCandidateModel } from './calling-list.model.js';
import { canReadCallingList, canManageCallingList, canConvertCallingCandidate } from './calling-list.policy.js';
import { buildCallingListTemplate, EXCEL_TYPE, parseCallingWorkbook } from './calling-list.excel.js';
import { callingListStorage } from './calling-list.storage.js';

async function actor(actorId: Types.ObjectId) {
  const employee = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role').lean();
  const role = employee ? await RoleModel.findOne({ _id: employee.role, isActive: true }).select('code').lean() : null;
  if (!role || !['MD', 'MIS', 'CP_HEAD', 'RM'].includes(role.code)) throw new AppError('Calling lists are available only to MD, MIS, CP Head and assigned RMs', 403);
  return role.code;
}
async function relationshipManager(rmId: string | Types.ObjectId) {
  const role = await RoleModel.findOne({ code: 'RM', isActive: true }).select('_id').lean();
  const rm = role ? await EmployeeModel.findOne({ _id: rmId, role: role._id, isActive: true }).select('_id').lean() : null;
  if (!rm) throw new AppError('Select an active Relationship Manager', 400);
  return rm;
}
async function accessible(actorId: Types.ObjectId, listId: string, manage = false) {
  if (!Types.ObjectId.isValid(listId)) throw new AppError('Calling list not found', 404);
  const code = await actor(actorId);
  const list = await CallingListModel.findById(listId).select('+bucket +key');
  const downline = code === 'CP_HEAD' && list?.assignedTo ? Boolean(await EmployeeModel.exists({ _id: list.assignedTo, hierarchyPath: actorId })) : false;
  const allowed = list && (manage ? canManageCallingList(code, String(actorId), String(list.uploadedBy))
    : canReadCallingList(code, String(actorId), String(list.uploadedBy), list.assignedTo ? String(list.assignedTo) : null, downline));
  if (!list || !allowed) throw new AppError('Calling list not found', 404);
  return { list, code };
}
const publicFields = 'title fileName uploadedBy assignedTo assignedAt rowCount originalRowCount deletedConvertedCount deletedCalledCount headers size state createdAt updatedAt';
export const callingListService = {
  async template(actorId: Types.ObjectId) {
    const code = await actor(actorId);
    if (!['MD', 'MIS'].includes(code)) throw new AppError('Only MD or MIS can download the upload template', 403);
    const bytes = await buildCallingListTemplate();
    return { fileName: 'CP-candidate-template.xlsx', contentType: EXCEL_TYPE, base64: bytes.toString('base64') };
  },
  async managers(actorId: Types.ObjectId) {
    const code = await actor(actorId);
    if (!['MD', 'MIS'].includes(code)) throw new AppError('Only MD or MIS can assign calling lists', 403);
    const role = await RoleModel.findOne({ code: 'RM', isActive: true }).select('_id').lean();
    return role ? EmployeeModel.find({ role: role._id, isActive: true }).select('_id firstName lastName employeeCode').sort({ firstName: 1 }).lean() : [];
  },
  async filterOptions(actorId: Types.ObjectId) {
    const code=await actor(actorId);
    if(!canFilterCallingLists(code))throw new AppError('Calling-list filters are available only to upline roles',403);
    const scope=await callingListScope(actorId,code);
    const assigned=await CallingListModel.find(scope).distinct('assignedTo');
    return EmployeeModel.find({_id:{$in:assigned.filter(Boolean)}}).select('_id firstName lastName employeeCode isActive').sort({firstName:1,lastName:1}).lean();
  },
  async list(actorId: Types.ObjectId, page: number, limit: number, filters: CallingListFilters = {}) {
    const code = await actor(actorId);
    const filter = filterCallingLists(await callingListScope(actorId, code), code, filters);
    const [data, total] = await Promise.all([
      CallingListModel.find(filter).select(`${publicFields} +bucket +key`).populate('uploadedBy assignedTo', 'firstName lastName employeeCode').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CallingListModel.countDocuments(filter)
    ]);
    return { data: await callingListCounts(data), total, page, limit };
  },
  async reserve(actorId: Types.ObjectId, input: { title: string; fileName: string; size: number; assignedTo?: string }) {
    const code = await actor(actorId);
    if (!['MD', 'MIS'].includes(code)) throw new AppError('Only MD or MIS can upload calling lists', 403);
    if (!env.awsRegion || !env.awsCallingListBucketName) throw new AppError('Calling list S3 storage is not configured', 503);
    if (input.assignedTo) await relationshipManager(input.assignedTo);
    const list = await CallingListModel.create({ title: input.title, fileName: input.fileName, size: input.size,
      uploadedBy: actorId, bucket: env.awsCallingListBucketName, key: `calling-lists/${actorId}/${randomUUID()}.xlsx`,
      ...(input.assignedTo ? { assignedTo: input.assignedTo, assignedBy: actorId, assignedAt: new Date() } : {}), expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
    return { _id: list._id, expiresAt: list.expiresAt };
  },
  async upload(actorId: Types.ObjectId, listId: string, bytes: Buffer) {
    const { list } = await accessible(actorId, listId, true);
    if (!Buffer.isBuffer(bytes) || bytes.length !== list.size) throw new AppError('Uploaded size does not match the reserved Excel file', 400);
    const parsed = await parseCallingWorkbook(bytes);
    const locked = await CallingListModel.findOneAndUpdate({ _id: list._id, state: 'RESERVED', expiresAt: { $gt: new Date() } }, { $set: { state: 'UPLOADING' } });
    if (!locked) throw new AppError('Upload is expired, already completed or in progress. Select the file again', 409);
    let stored = false;
    try {
      await callingListStorage.put(list.bucket, list.key, bytes); stored = true;
      await CallingCandidateModel.insertMany(parsed.rows.map(row => ({ list: list._id, ...row })));
      await CallingListModel.updateOne({ _id: list._id, state: 'UPLOADING' }, { $set: { state: 'READY', headers: parsed.headers, rowCount: parsed.rows.length, originalRowCount: parsed.rows.length, deletedConvertedCount: 0 }, $unset: { expiresAt: 1 } });
      return { _id: list._id, rowCount: parsed.rows.length };
    } catch (error) {
      await CallingCandidateModel.deleteMany({ list: list._id });
      if (stored) await callingListStorage.remove(list.bucket, list.key).catch(() => undefined);
      await CallingListModel.updateOne({ _id: list._id }, { $set: { state: 'RESERVED' } });
      throw error;
    }
  },
  async assign(actorId: Types.ObjectId, listId: string, assignedTo: string | null) {
    const { list } = await accessible(actorId, listId, true);
    if (assignedTo) await relationshipManager(assignedTo);
    const updated = await CallingListModel.findOneAndUpdate({ _id: list._id, state: 'READY', busy: false },
      { $set: { assignedTo, assignedBy: actorId, assignedAt: new Date() } }, { new: true }).select(publicFields);
    if (!updated) throw new AppError('Calling list is not ready or a CP account is being created. Retry shortly', 409);
    return updated;
  },
  async preview(actorId: Types.ObjectId, listId: string, page: number, limit: number) {
    const { list } = await accessible(actorId, listId);
    if (list.state !== 'READY') throw new AppError('Calling list is not ready', 409);
    const rows = await CallingCandidateModel.find({ list: list._id }).select('rowNumber values employee callStatus callNote nextFollowUpAt lastCalledAt').sort({ rowNumber: 1 }).skip((page - 1) * limit).limit(limit).lean();
    return { _id: list._id, title: list.title, headers: list.headers, rows, total: list.rowCount, page, limit };
  },
  async download(actorId: Types.ObjectId, listId: string) {
    const { list } = await accessible(actorId, listId);
    if (list.state !== 'READY') throw new AppError('Calling list is not ready', 409);
    return { _id: list._id, url: await callingListStorage.download(list.bucket, list.key, list.fileName), expiresIn: 60, fileName: list.fileName };
  },
  async updateCandidateStatus(actorId: Types.ObjectId, listId: string, rowId: string, input: { callStatus: string; callNote?: string; nextFollowUpAt?: Date | null }) {
    const { list, code } = await accessible(actorId, listId);
    if (code === 'CP_HEAD') throw new AppError('CP Head has read-only access to calling lists',403);
    if (!Types.ObjectId.isValid(rowId)) throw new AppError('Candidate not found', 404);
    const locked = await CallingListModel.findOneAndUpdate({ _id: list._id, assignedTo: list.assignedTo, busy: false, state: 'READY' }, { $set: { busy: true } });
    if (!locked) throw new AppError('Calling list changed or another operation is in progress. Refresh and retry', 409);
    try {
      const row = await CallingCandidateModel.findOne({ _id: rowId, list: list._id });
      if (!row) throw new AppError('Candidate not found', 404);
      if (row.employee) throw new AppError('This candidate is already a CP. Calling status can no longer be changed.', 409);
      row.callStatus = input.callStatus as typeof row.callStatus;
      row.callNote = input.callNote ?? '';
      row.nextFollowUpAt = input.callStatus === 'NEEDS_FOLLOWUP' ? input.nextFollowUpAt ?? null : null;
      row.lastCalledAt = input.callStatus === 'NOT_CALLED' ? null : new Date();
      row.statusUpdatedBy = actorId;
      return await mongoose.connection.transaction(async session => {
        await row.save({ session });
        await callingActivity.record(list, row._id, actorId, 'OUTCOME', input.callStatus, session);
        return { _id: row._id, callStatus: row.callStatus, callNote: row.callNote, nextFollowUpAt: row.nextFollowUpAt, lastCalledAt: row.lastCalledAt };
      });
    } finally { await CallingListModel.updateOne({ _id: list._id }, { $set: { busy: false } }); }
  },
  async deleteCandidate(actorId: Types.ObjectId, listId: string, rowId: string, confirmed: boolean) {
    if (confirmed !== true) throw new AppError('Confirm permanent candidate deletion first', 400);
    const { list, code } = await accessible(actorId, listId);
    if (code === 'CP_HEAD') throw new AppError('CP Head has read-only access to calling lists',403);
    if (!Types.ObjectId.isValid(rowId)) throw new AppError('Candidate not found', 404);
    const locked = await CallingListModel.findOneAndUpdate({ _id: list._id, assignedTo: list.assignedTo, busy: false, state: 'READY' }, { $set: { busy: true } });
    if (!locked) throw new AppError('Calling list changed or another operation is in progress. Refresh and retry', 409);
    try {
      return await mongoose.connection.transaction(async session => {
        const row = await CallingCandidateModel.findOneAndDelete({ _id: new Types.ObjectId(rowId), list: list._id }, { session });
        if (!row) throw new AppError('Candidate not found', 404);
        await callingActivity.record(list, row._id, actorId, 'DELETED', row.employee ? 'CONVERTED' : row.callStatus ?? 'NOT_CALLED', session);
        const rowCount = await CallingCandidateModel.countDocuments({ list: list._id }).session(session);
        const result = await CallingListModel.updateOne({ _id: list._id, assignedTo: list.assignedTo, busy: true, state: 'READY' }, { $set: { rowCount }, ...{ $inc: { deletedConvertedCount: row.employee ? 1 : 0, deletedCalledCount: row.employee || (row.callStatus && row.callStatus !== 'NOT_CALLED') ? 1 : 0 } } }, { session });
        if (result.matchedCount !== 1) throw new AppError('Calling list changed. Refresh and retry', 409);
        return { _id: row._id, listId: list._id, rowCount };
      });
    } finally { await CallingListModel.updateOne({ _id: list._id }, { $set: { busy: false } }); }
  },
  async createCp(actorId: Types.ObjectId, listId: string, rowId: string, input: Parameters<typeof employeeService.create>[0]) {
    const { list, code } = await accessible(actorId, listId);
    if (!canConvertCallingCandidate(code, String(actorId), list.assignedTo ? String(list.assignedTo) : null)) throw new AppError('Only MD or the assigned RM can create a CP from this list', 403);
    if (!Types.ObjectId.isValid(rowId)) throw new AppError('Candidate not found', 404);
    await relationshipManager(list.assignedTo!);
    const locked = await CallingListModel.findOneAndUpdate({ _id: list._id, assignedTo: list.assignedTo, busy: false, state: 'READY' }, { $set: { busy: true } });
    if (!locked) throw new AppError('Calling list changed or another account is being created. Refresh and retry', 409);
    try {
      const row = await CallingCandidateModel.findOne({ _id: rowId, list: list._id });
      if (!row) throw new AppError('Candidate not found', 404);
      if (row.employee) throw new AppError('A CP account has already been created from this row', 409);
      // A deterministic unique code prevents duplicates even after a crash or invitation failure.
      const employeeCode = `CP-${row._id}`.toUpperCase();
      let employee: { _id: Types.ObjectId; createdAt?: Date | undefined } | null = await EmployeeModel.findOne({ employeeCode }).select('_id createdAt').lean();
      let invitationSent = false;
      if (!employee) {
        try {
          const result = await employeeService.create({ ...input, employeeCode, roleCode: 'CP' }, list.assignedTo!);
          employee = { _id: result.employee._id as Types.ObjectId, createdAt: result.employee.createdAt instanceof Date ? result.employee.createdAt : new Date() };
          invitationSent = result.invitationSent;
        } catch (error) {
          employee = await EmployeeModel.findOne({ employeeCode }).select('_id createdAt').lean();
          if (!employee) {
            const duplicate = error as { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> };
            if (duplicate.code === 11000) {
              const fields = { ...duplicate.keyValue, ...duplicate.keyPattern };
              if ('mobileNumber' in fields) throw new AppError('This mobile number is already registered to an active employee or channel partner. Enter the candidate’s own unique mobile number. If this person is already a CP, use their existing account.', 409);
              if ('email' in fields) throw new AppError('This email is already registered to an active employee or channel partner. Enter the candidate’s own unique email address. If this person is already a CP, use their existing account.', 409);
              throw new AppError('A CP account conflicts with an existing record. Check the candidate’s email and mobile number, then retry.', 409);
            }
            throw error;
          }
        }
      }
      if (!employee) throw new AppError('Unable to confirm CP account creation. Refresh before retrying', 503);
      const confirmedEmployee = employee;
      await mongoose.connection.transaction(async session => {
        await CallingCandidateModel.updateOne({ _id: row._id, list: list._id }, { $set: { employee: confirmedEmployee._id } }, { session });
        await callingActivity.record(list, row._id, actorId, 'CONVERTED', 'CONVERTED', session, confirmedEmployee.createdAt ?? new Date());
      });
      return { _id: row._id, employeeId: employee._id, invitationSent };
    } finally { await CallingListModel.updateOne({ _id: list._id }, { $set: { busy: false } }); }
  }
};
