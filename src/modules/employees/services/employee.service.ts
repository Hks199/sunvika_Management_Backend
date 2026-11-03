import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { authService } from '../../auth/services/auth.service.js';
import { EmployeeModel } from '../models/employee.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { RefreshTokenModel } from '../../auth/models/refresh-token.model.js';
import { HierarchyLockModel } from '../models/hierarchy-lock.model.js';
import { profileImageService } from './profile-image.service.js';
import { createPaginationMeta, type PaginationInput } from '../../../utils/pagination.util.js';
import { hierarchyService } from './hierarchy.service.js';
import { geographyService } from '../../geography/services/geography.service.js';

interface EmployeeInput {
  employeeCode?: string;
  firstName: string; middleName?: string; lastName: string; email: string; mobileNumber: string;
  address: { addressLine: string; state: string; district: string; city?: string; pincode?: string };
  roleCode: string; branch?: string; profileImageUploadId?: string;
}

function toPublicEmployee(employee: Record<string, unknown>) {
  const { passwordHash: _passwordHash, failedLoginAttempts: _attempts, lockedUntil: _lockedUntil, ...safe } = employee;
  return safe;
}

function validateObjectId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${field}`, 400);
  return new Types.ObjectId(value);
}

async function actorRole(actorId: Types.ObjectId) {
  const actor = await EmployeeModel.findById(actorId).select('role isActive').lean();
  if (!actor?.isActive) throw new AppError('Account is unavailable', 401);
  const role = await RoleModel.findOne({ _id: actor.role, isActive: true });
  if (!role) throw new AppError('Employee role is unavailable', 403);
  return role;
}

async function canCreateRole(actorId: Types.ObjectId, roleCode: string) {
  const creatorRole = await actorRole(actorId);
  if (creatorRole.category === 'ADMIN_HEAD') throw new AppError('Admin Head accounts cannot create employees', 403);
  const targetRole = await RoleModel.findOne({ code: roleCode.toUpperCase(), isActive: true });
  if (!targetRole) throw new AppError('Selected role is not available', 400);
  const isCreatingManagingDirector = creatorRole.code === 'MD' && targetRole.code === 'MD';
  if (targetRole.category === 'ADMIN_HEAD') {
    if (!['MD', 'BDO'].includes(creatorRole.code)) throw new AppError('Only MD or BDO can create Admin Head accounts', 403);
    if (!creatorRole.allowedChildRoles.some((id) => id.equals(targetRole._id))) throw new AppError('Admin Head creation is disabled for your role', 403);
  } else if (!isCreatingManagingDirector && (creatorRole.category !== 'PRIMARY' || !creatorRole.allowedChildRoles.some((id) => id.equals(targetRole._id)))) {
    throw new AppError('You are not allowed to create employees with this role', 403);
  }
  return { creatorRole, targetRole };
}

async function getCreatableRoles(actorId: Types.ObjectId) {
  const creatorRole = await actorRole(actorId);
  if (creatorRole.category === 'ADMIN_HEAD') throw new AppError('Admin Head accounts cannot create employees', 403);
  const eligibleCodes = creatorRole.category === 'PRIMARY'
    ? creatorRole.allowedChildRoles
    : [];
  const roles = await RoleModel.find({
    $or: [
      { _id: { $in: eligibleCodes } },
      ...(creatorRole.code === 'MD' ? [{ code: 'MD' }] : [])
    ],
    isActive: true,
    ...(creatorRole.code !== 'MD' && creatorRole.code !== 'BDO' ? { category: { $ne: 'ADMIN_HEAD' } } : {})
  }).select('_id name code category level').sort({ level: 1, name: 1 }).lean();
  return roles;
}

async function withHierarchyLock<T>(operation: () => Promise<T>): Promise<T> {
  const owner = randomUUID();
  const now = new Date();
  try {
    await HierarchyLockModel.findOneAndUpdate(
      { key: 'reporting-hierarchy', lockedUntil: { $lte: now } },
      { $set: { owner, lockedUntil: new Date(now.getTime() + 5 * 60 * 1000) } },
      { new: true, upsert: true }
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AppError('Another reporting hierarchy change is in progress', 409);
    throw error;
  }
  try {
    return await operation();
  } finally {
    await HierarchyLockModel.deleteOne({ key: 'reporting-hierarchy', owner });
  }
}

export const employeeService = {
  getCreatableRoles,
  async create(input: EmployeeInput, actorId: Types.ObjectId) {
    const imageUpload = input.profileImageUploadId
      ? await profileImageService.claimUpload(actorId, input.profileImageUploadId)
      : null;
    const claimedUploadId = imageUpload?.uploadId;
    const employee = await withHierarchyLock(async () => {
    await geographyService.validateEmployeePlacement(input.address.state, input.address.district, input.branch);
    const { creatorRole, targetRole } = await canCreateRole(actorId, input.roleCode);
    const isAdminHead = targetRole.category === 'ADMIN_HEAD';
    const isHierarchyRoot = isAdminHead || targetRole.code === 'MD';
    const reportingTo = isHierarchyRoot ? undefined : actorId;
    const parent = isHierarchyRoot ? null : await EmployeeModel.findById(actorId).select('hierarchyPath').lean();
    if (!isHierarchyRoot && !parent) throw new AppError('Reporting manager is unavailable', 404);
    const hierarchyPath = isHierarchyRoot ? [] : [...parent!.hierarchyPath, actorId];
    const employeeCode = input.employeeCode?.trim().toUpperCase() || `SVK-${randomBytes(5).toString('hex').toUpperCase()}`;
    const address = {
      addressLine: input.address.addressLine,
      state: validateObjectId(input.address.state, 'state ID'),
      district: validateObjectId(input.address.district, 'district ID'),
      ...(input.address.city ? { city: input.address.city } : {}),
      ...(input.address.pincode ? { pincode: input.address.pincode } : {})
    };
    return EmployeeModel.create({
      employeeCode,
      firstName: input.firstName,
      ...(input.middleName ? { middleName: input.middleName } : {}),
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      mobileNumber: input.mobileNumber,
      address,
      role: targetRole._id,
      ...(reportingTo ? { reportingTo } : {}),
      hierarchyPath,
      ...(input.branch ? { branch: validateObjectId(input.branch, 'branch ID') } : {}),
      ...(imageUpload ? { profileImage: { key: imageUpload.key } } : {}),
      isActive: true,
      isVerified: false,
      createdBy: actorId
    }).catch(async (error: unknown) => {
      if (claimedUploadId) await profileImageService.releaseUpload(claimedUploadId);
      throw error;
    });
    if (claimedUploadId) await profileImageService.completeUpload(claimedUploadId!, employee._id!);
    });
    const invitationSent = await authService.createInvitation(employee._id.toString(), actorId.toString());
    return { employee: toPublicEmployee(employee.toObject() as unknown as Record<string, unknown>), invitationSent };
  },

  async listAccessible(actorId: Types.ObjectId, pagination: PaginationInput) {
    const role = await actorRole(actorId);
    let query: Record<string, unknown>;
    if (role.code === 'MD') query = {};
    else if (role.category === 'ADMIN_HEAD') query = { _id: actorId };
    else {
      const scope: Record<string, unknown>[] = [{ _id: actorId }, { hierarchyPath: actorId }];
      if (role.code === 'BDO') {
        const adminRole = await RoleModel.findOne({ code: 'ADMIN_HEAD' }).select('_id').lean();
        if (adminRole) scope.push({ role: adminRole._id, createdBy: { $in: await hierarchyService.getDownlineEmployeeIds(actorId) } });
      }
      query = { $or: scope };
    }
    const [employees, total] = await Promise.all([
      EmployeeModel.find(query).select('-passwordHash -failedLoginAttempts -lockedUntil').populate('role', 'name code category level').sort({ createdAt: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      EmployeeModel.countDocuments(query)
    ]);
    return { data: employees, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },

  async getById(actorId: Types.ObjectId, employeeId: string) {
    const id = validateObjectId(employeeId, 'employee ID');
    if (!await hierarchyService.canAccessEmployee(actorId, id)) throw new AppError('Employee not found', 404);
    const employee = await EmployeeModel.findById(id).select('-passwordHash -failedLoginAttempts -lockedUntil').populate('role', 'name code category level').lean();
    if (!employee) throw new AppError('Employee not found', 404);
    return employee;
  },

  async getDownline(actorId: Types.ObjectId, pagination: PaginationInput) {
    const role = await actorRole(actorId);
    if (role.category === 'ADMIN_HEAD') return { data: [], meta: createPaginationMeta(pagination.page, pagination.limit, 0) };
    const query = role.code === 'MD' ? {} : { hierarchyPath: actorId, isActive: true };
    const [data, total] = await Promise.all([
      EmployeeModel.find(query).select('-passwordHash -failedLoginAttempts -lockedUntil').populate('role', 'name code category level').sort({ createdAt: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      EmployeeModel.countDocuments(query)
    ]);
    return { data, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },

  async getHierarchy(actorId: Types.ObjectId, employeeId: string) {
    const id = validateObjectId(employeeId, 'employee ID');
    if (!await hierarchyService.canAccessEmployee(actorId, id)) throw new AppError('Employee not found', 404);
    return hierarchyService.getReportingChain(id);
  },

  async update(actorId: Types.ObjectId, employeeId: string, input: Partial<Pick<EmployeeInput, 'firstName' | 'middleName' | 'lastName' | 'mobileNumber' | 'address' | 'branch'>>) {
    const id = validateObjectId(employeeId, 'employee ID');
    if (!await hierarchyService.canAccessEmployee(actorId, id)) throw new AppError('Employee not found', 404);
    const employee = await EmployeeModel.findById(id);
    if (!employee) throw new AppError('Employee not found', 404);
    if (input.firstName !== undefined) employee.firstName = input.firstName;
    if (input.middleName !== undefined) employee.middleName = input.middleName;
    if (input.lastName !== undefined) employee.lastName = input.lastName;
    if (input.mobileNumber !== undefined) employee.mobileNumber = input.mobileNumber;
    if (input.branch !== undefined) employee.branch = input.branch ? validateObjectId(input.branch, 'branch ID') : null;
    if (input.address) {
      await geographyService.validateEmployeePlacement(input.address.state, input.address.district, input.branch === undefined ? employee.branch?.toString() : input.branch || undefined);
      employee.address = {
        addressLine: input.address.addressLine,
        state: validateObjectId(input.address.state, 'state ID'),
        district: validateObjectId(input.address.district, 'district ID'),
        ...(input.address.city ? { city: input.address.city } : {}),
        ...(input.address.pincode ? { pincode: input.address.pincode } : {})
      };
    }
    if (input.branch !== undefined && !input.address) {
      await geographyService.validateEmployeePlacement(employee.address?.state?.toString() ?? '', employee.address?.district?.toString() ?? '', input.branch || undefined);
    }
    await employee.save();
    return toPublicEmployee(employee.toObject() as unknown as Record<string, unknown>);
  },

  async setActive(actorId: Types.ObjectId, employeeId: string, active: boolean) {
    const id = validateObjectId(employeeId, 'employee ID');
    const actor = await actorRole(actorId);
    if (!await hierarchyService.canAccessEmployee(actorId, id)) throw new AppError('Employee not found', 404);
    const target = await EmployeeModel.findById(id);
    if (!target) throw new AppError('Employee not found', 404);
    if (target._id.equals(actorId)) throw new AppError('You cannot deactivate your own account', 400);
    const role = await RoleModel.findById(target.role).select('code category').lean();
    if (role?.code === 'MD' || (role?.category === 'ADMIN_HEAD' && !['MD', 'BDO'].includes(actor.code))) throw new AppError('This account cannot be managed by your role', 403);
    target.isActive = active;
    await target.save();
    if (!active) {
      await RefreshTokenModel.updateMany({ employee: target._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    return toPublicEmployee(target.toObject() as unknown as Record<string, unknown>);
  },

  async resendInvitation(actorId: Types.ObjectId, employeeId: string) {
    const id = validateObjectId(employeeId, 'employee ID');
    if (!await hierarchyService.canAccessEmployee(actorId, id)) throw new AppError('Employee not found', 404);
    const employee = await EmployeeModel.findOne({ _id: id, isActive: true, isVerified: false });
    if (!employee) throw new AppError('Employee not found or already verified', 404);
    const invitationSent = await authService.createInvitation(employee._id.toString(), actorId.toString());
    return { invitationSent };
  },

  async changeReportingManager(actorId: Types.ObjectId, employeeId: string, managerId: string) {
    return withHierarchyLock(async () => {
    const employeeObjectId = validateObjectId(employeeId, 'employee ID');
    const managerObjectId = validateObjectId(managerId, 'reporting manager ID');
    if (!await hierarchyService.canAccessEmployee(actorId, employeeObjectId)) throw new AppError('Employee not found', 404);
    if (!await hierarchyService.canAccessEmployee(actorId, managerObjectId)) throw new AppError('Reporting manager not found', 404);
    if (employeeObjectId.equals(managerObjectId)) throw new AppError('An employee cannot report to themselves', 400);
    const employee = await EmployeeModel.findOne({ _id: employeeObjectId, isActive: true });
    const manager = await EmployeeModel.findOne({ _id: managerObjectId, isActive: true });
    if (!employee || !manager) throw new AppError('Employee or reporting manager not found', 404);
    if (manager.hierarchyPath.some((id) => id.equals(employeeObjectId))) throw new AppError('Reporting change would create a circular hierarchy', 400);
    const targetRole = await RoleModel.findById(employee.role).select('category code').lean();
    const managerRole = await RoleModel.findById(manager.role);
    if (!targetRole || !managerRole || targetRole.category === 'ADMIN_HEAD' || targetRole.code === 'MD') {
      throw new AppError('Managing Director and Admin Head accounts do not participate in the reporting hierarchy', 400);
    }
    if (!managerRole.allowedChildRoles.some((id) => id.equals(employee.role))) throw new AppError('The reporting manager is not allowed to manage this role', 400);
    const actor = await actorRole(actorId);
    if (actor.code !== 'MD' && !manager._id.equals(actorId) && !manager.hierarchyPath.some((id) => id.equals(actorId))) {
      throw new AppError('Reporting manager is outside your hierarchy', 403);
    }

    const oldPath = [...employee.hierarchyPath, employee._id];
    const newPath = [...manager.hierarchyPath, manager._id];
    let transactionUnsupported = false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const descendants = await EmployeeModel.find({ hierarchyPath: employee._id }).session(session).select('_id hierarchyPath');
        const operations = [
          { updateOne: { filter: { _id: employee._id }, update: { $set: { reportingTo: manager._id, hierarchyPath: newPath } } } },
          ...descendants.map((descendant) => {
          const suffix = descendant.hierarchyPath.slice(oldPath.length);
            return { updateOne: { filter: { _id: descendant._id }, update: { $set: { hierarchyPath: [...newPath, employee._id, ...suffix] } } } };
          })
        ];
        await EmployeeModel.bulkWrite(operations, { session, ordered: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if ((error as { code?: number }).code === 20 || /transaction numbers are only allowed/i.test(message)) {
        transactionUnsupported = true;
      } else {
        throw error;
      }
    } finally {
      await session.endSession();
    }
    if (transactionUnsupported) {
      const descendants = await EmployeeModel.find({ hierarchyPath: employee._id }).select('_id hierarchyPath').lean();
      const operations = [
        { updateOne: { filter: { _id: employee._id }, update: { $set: { reportingTo: manager._id, hierarchyPath: newPath } } } },
        ...descendants.map((descendant) => ({
          updateOne: {
            filter: { _id: descendant._id },
            update: { $set: { hierarchyPath: [...newPath, employee._id, ...descendant.hierarchyPath.slice(oldPath.length)] } }
          }
        }))
      ];
      await EmployeeModel.bulkWrite(operations, { ordered: true });
    }
    return this.getById(actorId, employeeId);
    });
  }
};
