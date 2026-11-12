import { RoleModel } from '../../roles/models/role.model.js';
export type EmployeeDirectory = 'all' | 'staff' | 'cp';
/** Filter before pagination so list rows and totals use the same directory boundary. */
export async function employeeDirectoryFilter(directory: EmployeeDirectory): Promise<Record<string, unknown>> {
  if (directory === 'all') return {};
  const cpRoleIds = await RoleModel.find({ code: 'CP' }).distinct('_id');
  return { role: directory === 'cp' ? { $in: cpRoleIds } : { $nin: cpRoleIds } };
}
