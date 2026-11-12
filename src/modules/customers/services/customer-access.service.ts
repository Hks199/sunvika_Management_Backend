import { hasOrganizationVisibility, type AccessMode } from '../../employees/services/visibility-policy.js';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { CustomerModel } from '../models/customer.model.js';

export async function assertCustomerAccess(actorId: Types.ObjectId, customerId: Types.ObjectId, accessMode: AccessMode = 'manage') {
  const customer = await CustomerModel.findById(customerId);
  if (!customer || (!await hierarchyService.canAccessResource(actorId, customer.creatorId, 'customer', accessMode) && !(customer.cpEmployee && await hierarchyService.canAccessEmployee(actorId, customer.cpEmployee, accessMode)))) throw new AppError('Customer not found', 404);
  return customer;
}

export async function customerScope(actorId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
  const employee = await EmployeeModel.findById(actorId).select('role').lean();
  const role = employee ? await RoleModel.findById(employee.role).select('code category').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (hasOrganizationVisibility(role.code) || role.category === 'ADMIN_HEAD') return null;
  const ids = await hierarchyService.getDownlineEmployeeIds(actorId);
  return CustomerModel.find({ $or: [{ creatorId: { $in: ids } }, { cpEmployee: { $in: ids } }] }).distinct('_id');
}
