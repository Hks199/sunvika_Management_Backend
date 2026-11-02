import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../../../config/env.config.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { emailService } from '../../../services/email.service.js';
import { logger } from '../../../services/logger.service.js';
import { AppError } from '../../../utils/app-error.util.js';
import { comparePassword, hashPassword } from '../../../utils/password.util.js';
import { createOpaqueToken, hashToken } from '../../../utils/token.util.js';
import { InvitationModel } from '../models/invitation.model.js';
import { PasswordResetTokenModel } from '../models/password-reset-token.model.js';
import { RefreshTokenModel } from '../models/refresh-token.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { PermissionModel } from '../../roles/models/permission.model.js';

const GENERIC_AUTH_ERROR = 'Invalid email or password';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = hashPassword(randomUUID());

interface RequestMetadata { ipAddress?: string; userAgent?: string }
interface PublicEmployee {
  id: string;
  employeeCode?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  mobileNumber: string;
  role: { id: string; code: string; name: string; level: number; category: string; permissions: string[] };
  isActive: boolean;
  isVerified: boolean;
}

async function publicEmployee(employee: {
  _id: Types.ObjectId;
  employeeCode?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  mobileNumber: string;
  role: Types.ObjectId;
  isActive: boolean;
  isVerified: boolean;
}): Promise<PublicEmployee> {
  const role = await RoleModel.findOne({ _id: employee.role, isActive: true }).select('code name level category permissions').lean();
  if (!role) throw new AppError('Employee role is unavailable', 403);
  const permissions = await PermissionModel.find({ _id: { $in: role.permissions } }).select('code').lean();
  return {
    id: employee._id.toString(),
    ...(employee.employeeCode ? { employeeCode: employee.employeeCode } : {}),
    firstName: employee.firstName,
    ...(employee.middleName ? { middleName: employee.middleName } : {}),
    lastName: employee.lastName,
    email: employee.email,
    mobileNumber: employee.mobileNumber,
    role: { id: employee.role.toString(), code: role.code, name: role.name, level: role.level, category: role.category, permissions: permissions.map(({ code }) => code) },
    isActive: employee.isActive,
    isVerified: employee.isVerified
  };
}

function issueRefreshAccessToken(employeeId: Types.ObjectId, sessionId: string): string {
  return jwt.sign({ typ: 'access', sid: sessionId }, env.jwtAccessSecret, {
    subject: employeeId.toString(),
    jwtid: randomUUID(),
    expiresIn: env.jwtAccessExpiresIn as NonNullable<jwt.SignOptions['expiresIn']>,
    issuer: 'sunvika-management-api',
    audience: 'sunvika-management-client'
  });
}

async function issueRefreshToken(employeeId: Types.ObjectId, familyId: string, metadata: RequestMetadata) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + env.refreshTokenExpiresDays * 24 * 60 * 60 * 1000);
  const session = await RefreshTokenModel.create({
    employee: employeeId,
    tokenHash: hashToken(token),
    familyId,
    expiresAt,
    lastUsedAt: new Date(),
    ...metadata
  });
  return { token, sessionId: session._id.toString(), expiresAt };
}

export const authService = {
  async login(email: string, password: string, metadata: RequestMetadata) {
    const employee = await EmployeeModel.findOne({ email: email.toLowerCase() })
      .select('+passwordHash +failedLoginAttempts +lockedUntil');
    const now = new Date();
    if (!employee || !employee.isActive || !employee.isVerified || !employee.passwordHash) {
      await comparePassword(password, await DUMMY_PASSWORD_HASH);
      throw new AppError(GENERIC_AUTH_ERROR, 401);
    }
    if (!await RoleModel.exists({ _id: employee.role, isActive: true })) {
      await comparePassword(password, await DUMMY_PASSWORD_HASH);
      throw new AppError(GENERIC_AUTH_ERROR, 401);
    }
    if (employee.lockedUntil && employee.lockedUntil > now) {
      await comparePassword(password, await DUMMY_PASSWORD_HASH);
      throw new AppError(GENERIC_AUTH_ERROR, 401);
    }
    const matches = await comparePassword(password, employee.passwordHash);
    if (!matches) {
      employee.failedLoginAttempts += 1;
      if (employee.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        employee.lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60 * 1000);
        employee.failedLoginAttempts = 0;
      }
      await employee.save();
      throw new AppError(GENERIC_AUTH_ERROR, 401);
    }
    employee.failedLoginAttempts = 0;
    employee.lockedUntil = null;
    await employee.save();
    const familyId = randomUUID();
    const refresh = await issueRefreshToken(employee._id, familyId, metadata);
    return { accessToken: issueRefreshAccessToken(employee._id, familyId), refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt, employee: await publicEmployee(employee) };
  },

  async refresh(rawToken: string | undefined, metadata: RequestMetadata) {
    if (!rawToken) throw new AppError('Refresh session is invalid or expired', 401);
    const tokenHash = hashToken(rawToken);
    const existing = await RefreshTokenModel.findOne({ tokenHash }).select('+tokenHash');
    if (!existing) throw new AppError('Refresh session is invalid or expired', 401);
    if (existing.revokedAt) {
      await RefreshTokenModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      throw new AppError('Refresh token reuse detected. Please sign in again.', 401);
    }
    if (existing.expiresAt <= new Date()) throw new AppError('Refresh session is invalid or expired', 401);
    const employee = await EmployeeModel.findOne({ _id: existing.employee, isActive: true });
    const roleIsActive = employee ? await RoleModel.exists({ _id: employee.role, isActive: true }) : null;
    if (!employee || !roleIsActive) {
      await RefreshTokenModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      throw new AppError('Account is unavailable', 401);
    }
    const replacement = await issueRefreshToken(employee._id, existing.familyId, metadata);
    const consumed = await RefreshTokenModel.findOneAndUpdate(
      { _id: existing._id, revokedAt: null },
      { $set: { revokedAt: new Date(), replacedBy: new Types.ObjectId(replacement.sessionId), lastUsedAt: new Date() } },
      { new: true }
    );
    if (!consumed) {
      await RefreshTokenModel.deleteOne({ _id: replacement.sessionId });
      await RefreshTokenModel.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      throw new AppError('Refresh token reuse detected. Please sign in again.', 401);
    }
    return { accessToken: issueRefreshAccessToken(employee._id, existing.familyId), refreshToken: replacement.token, refreshExpiresAt: replacement.expiresAt };
  },

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const session = await RefreshTokenModel.findOne({ tokenHash: hashToken(rawToken) }).select('familyId');
    if (session) await RefreshTokenModel.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  },

  async me(employeeId: string) {
    const employee = await EmployeeModel.findOne({ _id: employeeId, isActive: true });
    if (!employee) throw new AppError('Account is unavailable', 401);
    return publicEmployee(employee);
  },

  async listSessions(employeeId: string) {
    return RefreshTokenModel.find({ employee: employeeId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('_id createdAt lastUsedAt expiresAt userAgent ipAddress')
      .sort({ lastUsedAt: -1 }).lean();
  },

  async revokeSession(employeeId: string, sessionId: string): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) throw new AppError('Session not found', 404);
    const result = await RefreshTokenModel.updateOne(
      { _id: sessionId, employee: employeeId, revokedAt: null }, { $set: { revokedAt: new Date() } }
    );
    if (!result.modifiedCount) throw new AppError('Session not found', 404);
  },

  async createInvitation(employeeId: string, creatorId: string): Promise<boolean> {
    const employee = await EmployeeModel.findById(employeeId);
    if (!employee || !employee.isActive) throw new AppError('Employee is unavailable', 404);
    const rawToken = createOpaqueToken();
    await InvitationModel.updateMany({ employee: employee._id, usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } });
    const invitation = await InvitationModel.create({ employee: employee._id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + INVITATION_TTL_MS), createdBy: creatorId });
    try {
      await emailService.sendInvitation(employee.email, rawToken);
      return true;
    } catch (error) {
      await InvitationModel.updateOne({ _id: invitation._id }, { $set: { revokedAt: new Date() } });
      logger.error({ err: error, employeeId: employee._id.toString() }, 'Unable to send employee invitation');
      return false;
    }
  },

  async setPassword(rawToken: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const invitation = await InvitationModel.findOneAndUpdate(
      { tokenHash: hashToken(rawToken), usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!invitation) throw new AppError('Invitation link is invalid or expired', 400);
    const employee = await EmployeeModel.findOne({ _id: invitation.employee, isActive: true });
    if (!employee) throw new AppError('Invitation link is invalid or expired', 400);
    employee.passwordHash = passwordHash;
    employee.isVerified = true;
    await employee.save();
  },

  async requestPasswordReset(email: string): Promise<void> {
    const employee = await EmployeeModel.findOne({ email: email.toLowerCase(), isActive: true });
    if (!employee) return;
    const rawToken = createOpaqueToken();
    await PasswordResetTokenModel.updateMany({ employee: employee._id, usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await PasswordResetTokenModel.create({ employee: employee._id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) });
    try {
      await emailService.sendPasswordReset(employee.email, rawToken);
    } catch (error) {
      await PasswordResetTokenModel.updateOne({ tokenHash: hashToken(rawToken) }, { $set: { revokedAt: new Date() } });
      logger.error({ err: error, employeeId: employee._id.toString() }, 'Unable to send password reset email');
      // The generic response prevents account enumeration; a configured SMTP service is required for delivery.
    }
  },

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const reset = await PasswordResetTokenModel.findOneAndUpdate(
      { tokenHash: hashToken(rawToken), usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!reset) throw new AppError('Password reset link is invalid or expired', 400);
    const employee = await EmployeeModel.findOne({ _id: reset.employee, isActive: true });
    if (!employee) throw new AppError('Password reset link is invalid or expired', 400);
    employee.passwordHash = passwordHash;
    employee.failedLoginAttempts = 0;
    employee.lockedUntil = null;
    await employee.save();
    await RefreshTokenModel.updateMany({ employee: employee._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
};
