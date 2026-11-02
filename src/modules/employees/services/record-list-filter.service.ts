import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { BranchModel } from '../../geography/models/branch.model.js';
import { EmployeeModel } from '../models/employee.model.js';
import { hierarchyService } from './hierarchy.service.js';
import { RoleModel } from '../../roles/models/role.model.js';

export interface RecordListFilters {
  branchId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  employeeName?: string;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function resolveEmployeeScope(
  actorId: Types.ObjectId,
  employeeName: string | undefined,
  accessibleIds: Types.ObjectId[] | null
): Promise<Types.ObjectId[] | null> {
  if (!employeeName) return accessibleIds;
  const actor = await EmployeeModel.findById(actorId).select('role').lean();
  const role = actor ? await RoleModel.findById(actor.role).select('code').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (role.code === 'CP') throw new AppError('Employee filtering is not available for your role', 403);

  const pattern = escaped(employeeName.trim());
  const employees = await EmployeeModel.find({
    ...(accessibleIds ? { _id: { $in: accessibleIds } } : {}),
    $or: [
      { firstName: { $regex: pattern, $options: 'i' } },
      { lastName: { $regex: pattern, $options: 'i' } },
      { employeeCode: { $regex: pattern, $options: 'i' } },
      {
        $expr: {
          $regexMatch: {
            input: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] },
            regex: pattern,
            options: 'i'
          }
        }
      }
    ]
  }).select('_id').lean();

  const teamIds = new Map(employees.map((employee) => [employee._id.toString(), employee._id]));
  const descendants = employees.length
    ? await EmployeeModel.find({ hierarchyPath: { $in: employees.map(({ _id }) => _id) } }).select('_id').lean()
    : [];
  for (const employee of descendants) teamIds.set(employee._id.toString(), employee._id);
  return accessibleIds
    ? accessibleIds.filter((id) => teamIds.has(id.toString()))
    : [...teamIds.values()];
}

export async function accessibleEmployeeScope(actorId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
  const actor = await EmployeeModel.findById(actorId).select('role').lean();
  const role = actor ? await RoleModel.findById(actor.role).select('code category').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (role.code === 'MD' || role.category === 'ADMIN_HEAD') return null;
  return hierarchyService.getDownlineEmployeeIds(actorId);
}

export async function resolveBranchId(branchId: string | undefined): Promise<Types.ObjectId | undefined> {
  if (!branchId) return undefined;
  if (!Types.ObjectId.isValid(branchId)) throw new AppError('Invalid branch ID', 400);
  const branch = await BranchModel.findById(branchId).select('_id').lean();
  if (!branch) throw new AppError('Branch not found', 400);
  return branch._id;
}

export function dateRange(field: string, filters: RecordListFilters): Record<string, unknown> {
  if (!filters.dateFrom && !filters.dateTo) return {};
  const range: Record<string, Date> = {};
  if (filters.dateFrom) range.$gte = filters.dateFrom;
  if (filters.dateTo) {
    const inclusiveEnd = new Date(filters.dateTo);
    inclusiveEnd.setUTCHours(23, 59, 59, 999);
    range.$lte = inclusiveEnd;
  }
  return { [field]: range };
}
