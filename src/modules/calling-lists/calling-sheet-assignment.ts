import mongoose, { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.util.js';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { CallingListModel, CallingCandidateModel } from './calling-list.model.js';
import { CallingAllocationModel } from './calling-bulk.model.js';
import { callingListStorage } from './calling-list.storage.js';
import { parseCallingWorkbook } from './calling-list.excel.js';

export async function assignStoredCallingSheet(listId: Types.ObjectId, rmId: Types.ObjectId, actorId?: Types.ObjectId, automatic?: { day: string; slot: number }) {
  const list = await CallingListModel.findOne({ _id: listId, state: 'READY', candidateStorage: 'S3', assignedTo: null }).select('+bucket +key');
  if (!list) throw new AppError('Sheet is already assigned or not ready', 409);
  const parsed = await parseCallingWorkbook(await callingListStorage.read(list.bucket, list.key));
  if (parsed.rows.length !== list.rowCount || JSON.stringify(parsed.headers) !== JSON.stringify(list.headers)) throw new AppError('Stored sheet does not match its upload metadata', 409);
  await mongoose.connection.transaction(async session => {
    const role = await RoleModel.findOne({ code: 'RM', isActive: true }).session(session);
    if (!role || !await EmployeeModel.exists({ _id: rmId, role: role._id, isActive: true }).session(session)) throw new AppError('Select an active RM', 400);
    const claimed = await CallingListModel.updateOne({ _id: listId, state: 'READY', candidateStorage: 'S3', assignedTo: null, busy: false }, {
      $set: { candidateStorage: 'DATABASE', assignedTo: rmId, assignedAt: new Date(), assignmentSource: automatic ? 'AUTO' : 'MANUAL', ...(actorId ? { assignedBy: actorId } : {}) }
    }, { session });
    if (!claimed.modifiedCount) throw new AppError('Another request assigned this sheet; refresh and retry', 409);
    await CallingCandidateModel.insertMany(parsed.rows.map(row => ({ list: listId, ...row })), { session, ordered: true });
    if (automatic) await CallingAllocationModel.create([{ ...automatic, rm: rmId, list: listId }], { session });
  });
  return CallingListModel.findById(listId).select('title assignedTo assignedAt rowCount candidateStorage assignmentSource');
}
