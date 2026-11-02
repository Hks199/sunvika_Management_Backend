import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { CustomerModel } from '../models/customer.model.js';

export async function assertCustomerAccess(actorId: Types.ObjectId, customerId: Types.ObjectId) {
  const customer = await CustomerModel.findById(customerId);
  if (!customer || !await hierarchyService.canAccessResource(actorId, customer.creatorId, 'customer')) throw new AppError('Customer not found', 404);
  return customer;
}

export async function customerScope(actorId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
  const employee = await EmployeeModel.findById(actorId).select('role').lean();
  const role = employee ? await RoleModel.findById(employee.role).select('code category').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (role.code === 'MD' || role.category === 'ADMIN_HEAD') return null;
  const ids = await hierarchyService.getDownlineEmployeeIds(actorId);
  return CustomerModel.find({ creatorId: { $in: ids } }).distinct('_id');
}
