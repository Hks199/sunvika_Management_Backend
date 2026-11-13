import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';

export async function assertCpCustomerAccess(actorId: Types.ObjectId, cpId: string) {
  if (!Types.ObjectId.isValid(cpId)) throw new AppError('Channel partner not found', 404);
  const actor = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role').lean();
  const role = actor ? await RoleModel.findOne({ _id: actor.role, isActive: true }).select('code').lean() : null;
  if (!role || !['MD', 'CP_HEAD', 'RM'].includes(role.code)) throw new AppError('Only MD, CP Head or RM can convert a CP to customer', 403);
  const cp = await EmployeeModel.findOne({ _id: cpId, isActive: true });
  const cpRole = cp ? await RoleModel.findById(cp.role).select('code').lean() : null;
  if (!cp || cpRole?.code !== 'CP' || !await hierarchyService.canAccessEmployee(actorId, cp._id)) throw new AppError('Active channel partner not found in your hierarchy', 404);
  return cp;
}
