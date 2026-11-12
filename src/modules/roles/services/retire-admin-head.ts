import { RoleModel } from '../models/role.model.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { RefreshTokenModel } from '../../auth/models/refresh-token.model.js';
/** Retire the unsupported role without deleting employee or business-history references. */
export async function retireAdminHeadRole(): Promise<void> {
  const roles = await RoleModel.find({ $or: [{ code: 'ADMIN_HEAD' }, { category: 'ADMIN_HEAD' }] }).select('_id').lean();
  const ids = roles.map(role => role._id);
  if (!ids.length) return;
  await RoleModel.updateMany({ _id: { $in: ids }, $or: [{ isActive: { $ne: false } }, { 'allowedChildRoles.0': { $exists: true } }, { parentRole: { $ne: null } }] }, { $set: { isActive: false, allowedChildRoles: [], parentRole: null }, $inc: { permissionVersion: 1 } });
  await RoleModel.updateMany({ allowedChildRoles: { $in: ids } }, { $pull: { allowedChildRoles: { $in: ids } }, $inc: { permissionVersion: 1 } });
  const employees = await EmployeeModel.find({ role: { $in: ids } }).distinct('_id');
  if (employees.length) await RefreshTokenModel.updateMany({ employee: { $in: employees }, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
