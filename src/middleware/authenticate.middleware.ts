import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { RequestHandler } from 'express';
import { env } from '../config/env.config.js';
import { EmployeeModel } from '../modules/employees/models/employee.model.js';
import { RefreshTokenModel } from '../modules/auth/models/refresh-token.model.js';
import { RoleModel } from '../modules/roles/models/role.model.js';
import { AppError } from '../utils/app-error.util.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError('Authentication required', 401);
    const token = header.slice(7);
    const claims = jwt.verify(token, env.jwtAccessSecret, {
      issuer: 'sunvika-management-api',
      audience: 'sunvika-management-client'
    });
    if (typeof claims === 'string' || claims.typ !== 'access' || typeof claims.sid !== 'string' || !claims.sub || !Types.ObjectId.isValid(claims.sub)) {
      throw new AppError('Invalid access token', 401);
    }
    const employee = await EmployeeModel.findOne({ _id: claims.sub, isActive: true }).select('role').lean();
    if (!employee) throw new AppError('Account is unavailable', 401);
    if (!await RoleModel.exists({ _id: employee.role, isActive: true })) throw new AppError('Employee role is unavailable', 401);
    const session = await RefreshTokenModel.exists({ employee: claims.sub, familyId: claims.sid, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!session) throw new AppError('Session has been revoked', 401);
    req.auth = { employeeId: new Types.ObjectId(claims.sub), sessionId: claims.sid };
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error instanceof jwt.JsonWebTokenError) return next(new AppError('Invalid or expired access token', 401));
    return next(error);
  }
};
