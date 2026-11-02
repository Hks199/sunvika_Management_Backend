import type { RequestHandler } from 'express';
import { roleService } from '../services/role.service.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { AppError } from '../../../utils/app-error.util.js';

export const listRoles: RequestHandler = async (_req, res, next) => {
  try { return sendSuccess(res, 'Roles fetched successfully', await roleService.listRoles()); }
  catch (error) { return next(error); }
};

export const listPermissions: RequestHandler = async (_req, res, next) => {
  try { return sendSuccess(res, 'Permissions fetched successfully', await roleService.listPermissions()); }
  catch (error) { return next(error); }
};

export const createPermission: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Permission created successfully', await roleService.createPermission(req.body), 201); }
  catch (error) { return next(error); }
};

export const createRole: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    return sendSuccess(res, 'Role created successfully', await roleService.createRole(req.body, req.auth.employeeId), 201);
  } catch (error) { return next(error); }
};

export const updateRole: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Role updated successfully', await roleService.updateRole(req.params.roleId as string, req.body)); }
  catch (error) { return next(error); }
};
