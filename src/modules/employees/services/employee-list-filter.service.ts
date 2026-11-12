import { Types } from 'mongoose';
import { EmployeeModel } from '../models/employee.model.js';
import { dateRange, type RecordListFilters } from './record-list-filter.service.js';

export interface EmployeeListFilters extends RecordListFilters {
  stateId?: string;
  districtId?: string;
  cpType?: 'all' | 'cp_only' | 'customer_cp';
}

/** Keep filters separate from the access query so team matching cannot widen access. */
export async function employeeListFilter(filters: EmployeeListFilters): Promise<Record<string, unknown>> {
  const query: Record<string, unknown> = { ...dateRange('createdAt', filters) };
  if (filters.stateId) query['address.state'] = new Types.ObjectId(filters.stateId);
  if (filters.districtId) query['address.district'] = new Types.ObjectId(filters.districtId);
  if (filters.branchId) query.branch = new Types.ObjectId(filters.branchId);
  if (filters.cpType === 'cp_only') query.sourceCustomer = null;
  if (filters.cpType === 'customer_cp') query.sourceCustomer = { $ne: null };
  if (filters.employeeName) {
    const pattern = filters.employeeName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = await EmployeeModel.find({ $or: [
      { employeeCode: { $regex: pattern, $options: 'i' } },
      { $expr: { $regexMatch: {
        input: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] }, regex: pattern, options: 'i'
      } } },
      { $expr: { $regexMatch: {
        input: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$middleName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] }, regex: pattern, options: 'i'
      } } }
    ] }).select('_id').lean();
    const ids = matches.map(({ _id }) => _id);
    query.$or = [{ _id: { $in: ids } }, { hierarchyPath: { $in: ids } }];
  }
  return query;
}
