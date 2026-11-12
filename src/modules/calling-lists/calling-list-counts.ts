import { callingTotal } from './calling-total.js';
import { Types, type ClientSession } from 'mongoose';
import { logger } from '../../services/logger.service.js';
import { CallingCandidateModel, CallingListModel } from './calling-list.model.js';
import { parseCallingWorkbook } from './calling-list.excel.js';
import { callingListStorage } from './calling-list.storage.js';

type List = { _id: Types.ObjectId; rowCount: number; originalRowCount?: number | null | undefined; deletedCalledCount?: number | null | undefined; deletedConvertedCount?: number | null | undefined; bucket?: string | null | undefined; key?: string | null | undefined };
/** Count the entire list, independent of the current preview page. */
export async function callingListCounts<T extends List>(lists: T[], session?: ClientSession) {
  if (!lists.length) return [];
  const query = CallingCandidateModel.aggregate<{ _id: Types.ObjectId; remaining: number; converted: number; called: number; interested: number; followUp: number; notCalled: number }>([
    { $match: { list: { $in: lists.map(list => list._id) } } },
    { $group: { _id: '$list', remaining: { $sum: 1 }, converted: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$employee', null] }, null] }, 1, 0] } },
      called: { $sum: { $cond: [{ $or: [{ $ne: [{ $ifNull: ['$employee', null] }, null] }, { $ne: [{ $ifNull: ['$callStatus', 'NOT_CALLED'] }, 'NOT_CALLED'] }] }, 1, 0] } },
      interested: { $sum: { $cond: [{ $and: [{ $eq: ['$callStatus', 'INTERESTED'] }, { $eq: [{ $ifNull: ['$employee', null] }, null] }] }, 1, 0] } },
      followUp: { $sum: { $cond: [{ $and: [{ $eq: ['$callStatus', 'NEEDS_FOLLOWUP'] }, { $eq: [{ $ifNull: ['$employee', null] }, null] }] }, 1, 0] } },
      notCalled: { $sum: { $cond: [{ $and: [{ $eq: [{ $ifNull: ['$callStatus', 'NOT_CALLED'] }, 'NOT_CALLED'] }, { $eq: [{ $ifNull: ['$employee', null] }, null] }] }, 1, 0] } } } }
  ]);
  const counts = await (session ? query.session(session) : query);
  const byList = new Map(counts.map(count => [String(count._id), count]));
  return Promise.all(lists.map(async list => {
    const { bucket, key, deletedConvertedCount, deletedCalledCount, ...publicList } = list;
    let originalRowCount: number | null = list.originalRowCount ?? null;
    // Older lists did not preserve their original size. Recover it once from the unchanged workbook.
    if (originalRowCount === null && bucket && key) {
      try {
        originalRowCount = (await parseCallingWorkbook(await callingListStorage.read(bucket, key))).rows.length;
        await CallingListModel.updateOne({ _id: list._id, originalRowCount: { $exists: false } }, { $set: { originalRowCount } }, session ? { session } : undefined);
      } catch (error) { logger.warn({ err: error, listId: list._id }, 'Original calling-list count could not be recovered'); }
    }
    const count = byList.get(String(list._id));
    const retained = count?.remaining ?? 0, converted = count?.converted ?? 0;
    const convertedCount = converted + (deletedConvertedCount ?? 0);
    const deletedCount = originalRowCount === null ? null : Math.max(0, originalRowCount - retained);
    return { ...publicList, originalRowCount, convertedCount, unconvertedCount: retained - converted,
      calledCount: (count?.called ?? converted) + (deletedCalledCount ?? 0), interestedCount: count?.interested ?? 0, followUpCount: count?.followUp ?? 0, notCalledCount: count?.notCalled ?? 0,
      deletedCount, totalCallingCount: callingTotal(deletedCount, convertedCount, count?.interested ?? 0, count?.followUp ?? 0) };
  }));
}
