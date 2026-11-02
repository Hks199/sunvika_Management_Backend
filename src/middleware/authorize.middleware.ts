import { EmployeeModel } from '../modules/employees/models/employee.model.js';
import { roleService } from '../modules/roles/services/role.service.js';
import { RoleModel } from '../modules/roles/models/role.model.js';
import { AppError } from '../utils/app-error.util.js';
import type { RequestHandler } from 'express';

export function requirePermission(permissionCode: string): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.auth) throw new AppError('Authentication required', 401);
      if (!await roleService.hasPermission(req.auth.employeeId, permissionCode)) throw new AppError('Permission denied', 403);
      return next();
    } catch (error) { return next(error); }
  };
}

export const requireManagingDirector: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    const employee = await EmployeeModel.findById(req.auth.employeeId).select('role').lean();
    const role = employee ? await RoleModel.findById(employee.role).select('code isActive').lean() : null;
    if (!role?.isActive || role.code !== 'MD') throw new AppError('Only the Managing Director can manage roles and permissions', 403);
    return next();
  } catch (error) { return next(error); }
};

export const requireGeographyManagement: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    const employee = await EmployeeModel.findById(req.auth.employeeId).select('role').lean();
    const role = employee ? await RoleModel.findById(employee.role).select('code isActive').lean() : null;
    if (!role?.isActive || !['MD', 'BDO'].includes(role.code)) {
      throw new AppError('Only MD and BDO employees can add states, districts, or branches', 403);
    }
    return next();
  } catch (error) { return next(error); }
};
