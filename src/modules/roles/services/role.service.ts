import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { RefreshTokenModel } from '../../auth/models/refresh-token.model.js';
import { PermissionModel } from '../models/permission.model.js';
import { RoleModel } from '../models/role.model.js';
import { PROTECTED_PERMISSION_CODES, SYSTEM_PERMISSIONS } from '../constants/system-permissions.js';

const permissionCache = new Map<string, { version: number; codes: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;
const RESERVED_CODES = new Set(['MD', 'BDO', 'MH', 'DC', 'RM', 'CP', 'ADMIN_HEAD']);

export function invalidateRolePermissionCache(roleId?: string): void {
  if (roleId) permissionCache.delete(roleId);
  else permissionCache.clear();
}

export async function seedSystemRoles(createdBy?: Types.ObjectId): Promise<void> {
  const permissionIds = new Map<string, Types.ObjectId>();
  for (const [module, action] of SYSTEM_PERMISSIONS) {
    const code = `${module}.${action}`;
    const permission = await PermissionModel.findOneAndUpdate(
      { code }, { $setOnInsert: { module, action, code, description: `${module} ${action} access` } },
      { upsert: true, new: true }
    );
    permissionIds.set(code, permission._id);
  }

  const specs = [
    { name: 'Managing Director', code: 'MD', level: 0, category: 'PRIMARY', parentCode: null, childCodes: ['BDO', 'ADMIN_HEAD'], permissions: [...permissionIds.keys()] },
    { name: 'Business Development Officer', code: 'BDO', level: 1, category: 'PRIMARY', parentCode: 'MD', childCodes: ['MH', 'ADMIN_HEAD'], permissions: ['employees.create','employees.read','employees.update','employees.deactivate','employees.activate','employees.invite','employees.hierarchy','leads.create','leads.read','leads.update','leads.assign','leads.status','customers.create','customers.read','customers.update','visits.create','visits.read','quotations.create','quotations.read','quotations.share','amc.create','amc.read','amc.update','reports.read','dashboard.read'] },
    { name: 'Marketing Head', code: 'MH', level: 2, category: 'PRIMARY', parentCode: 'BDO', childCodes: ['DC'], permissions: ['employees.create','employees.read','employees.update','employees.deactivate','employees.activate','employees.invite','employees.hierarchy','leads.create','leads.read','leads.update','leads.assign','leads.status','customers.create','customers.read','customers.update','visits.create','visits.read','quotations.create','quotations.read','quotations.share','amc.create','amc.read','amc.update','reports.read','dashboard.read'] },
    { name: 'District Coordinator', code: 'DC', level: 3, category: 'PRIMARY', parentCode: 'MH', childCodes: ['RM'], permissions: ['employees.create','employees.read','employees.update','employees.deactivate','employees.activate','employees.invite','employees.hierarchy','leads.create','leads.read','leads.update','leads.assign','leads.status','customers.create','customers.read','customers.update','visits.create','visits.read','quotations.create','quotations.read','quotations.share','amc.create','amc.read','amc.update','reports.read','dashboard.read'] },
    { name: 'Relationship Manager', code: 'RM', level: 4, category: 'PRIMARY', parentCode: 'DC', childCodes: ['CP'], permissions: ['employees.create','employees.read','employees.update','employees.invite','employees.hierarchy','leads.create','leads.read','leads.update','leads.status','customers.create','customers.read','customers.update','visits.create','visits.read','quotations.create','quotations.read','quotations.share','amc.create','amc.read','amc.update','reports.read','dashboard.read'] },
    { name: 'Channel Partner', code: 'CP', level: 5, category: 'PRIMARY', parentCode: 'RM', childCodes: [], permissions: ['leads.create','leads.read','leads.update','leads.status','customers.create','customers.read','visits.create','visits.read','amc.create','amc.read','dashboard.read'] },
    { name: 'Admin Head', code: 'ADMIN_HEAD', level: 1, category: 'ADMIN_HEAD', parentCode: null, childCodes: [], permissions: ['leads.read','customers.read','visits.read','quotations.read','amc.read','reports.read','dashboard.read'] }
  ] as const;

  for (const spec of specs) {
    const permissionObjectIds = spec.permissions.map((code) => permissionIds.get(code)).filter((id): id is Types.ObjectId => Boolean(id));
    await RoleModel.findOneAndUpdate({ code: spec.code }, {
      $setOnInsert: {
        name: spec.name,
        code: spec.code,
        level: spec.level,
        category: spec.category,
        permissions: permissionObjectIds,
        isSystemRole: true,
        isActive: true,
        permissionVersion: 1,
        ...(createdBy ? { createdBy } : {})
      }
    }, { upsert: true, new: true });
  }

  for (const code of ['BDO', 'MH', 'DC', 'RM', 'CP', 'ADMIN_HEAD']) {
    const role = await RoleModel.findOne({ code }).select('permissions permissionVersion').lean();
    const codes = code === 'ADMIN_HEAD' ? ['amc.read'] : code === 'CP' ? ['amc.create', 'amc.read'] : ['amc.create', 'amc.read', 'amc.update'];
    const amcPermissions = codes.map((permission) => permissionIds.get(permission)).filter((id): id is Types.ObjectId => Boolean(id));
    if (role && amcPermissions.some((id) => !role.permissions.some((existing) => existing.equals(id)))) {
      await RoleModel.updateOne({ _id: role._id }, { $addToSet: { permissions: { $each: amcPermissions } }, $inc: { permissionVersion: 1 } });
    }
  }

  const roles = await RoleModel.find({ code: { $in: specs.map(({ code }) => code) } }).select('_id code').lean();
  const roleIds = new Map(roles.map((role) => [role.code, role._id]));
  for (const spec of specs) {
    const parentRole = spec.parentCode ? roleIds.get(spec.parentCode) : undefined;
    const allowedChildRoles = spec.childCodes.map((code) => roleIds.get(code)).filter((id): id is Types.ObjectId => Boolean(id));
    await RoleModel.updateOne({ code: spec.code }, {
      $set: {
        parentRole: parentRole ?? null,
        allowedChildRoles,
        ...(spec.code === 'MD' ? { permissions: [...permissionIds.values()] } : {})
      }
    });
  }
  invalidateRolePermissionCache();
}

export const roleService = {
  async listRoles() {
    return RoleModel.find().populate('parentRole', 'name code').populate('allowedChildRoles', 'name code').populate('permissions', 'module action code description').sort({ level: 1, name: 1 }).lean();
  },

  async listPermissions() {
    return PermissionModel.find().sort({ module: 1, action: 1 }).lean();
  },

  async createPermission(input: { module: string; action: string; description?: string }) {
    const module = input.module.toLowerCase();
    const action = input.action.toLowerCase();
    const code = `${module}.${action}`;
    if (PROTECTED_PERMISSION_CODES.has(code)) throw new AppError('This permission is protected', 400);
    return PermissionModel.create({ module, action, code, ...(input.description ? { description: input.description } : {}) });
  },

  async createRole(input: { name: string; code: string; description?: string; level: number; parentCode?: string; permissionCodes: string[]; allowedChildRoleCodes: string[] }, actorId: Types.ObjectId) {
    const code = input.code.toUpperCase();
    if (RESERVED_CODES.has(code)) throw new AppError('This role code is reserved', 400);
    const parent = input.parentCode ? await RoleModel.findOne({ code: input.parentCode.toUpperCase(), isActive: true }) : null;
    if (!parent) throw new AppError('An active parent role is required', 400);
    if (parent?.category === 'ADMIN_HEAD') throw new AppError('Admin Head cannot be a parent in the employee hierarchy', 400);
    if (parent && input.level <= parent.level) throw new AppError('A child role must have a greater hierarchy level than its parent', 400);
    const permissionDocs = await PermissionModel.find({ code: { $in: input.permissionCodes } });
    if (permissionDocs.length !== new Set(input.permissionCodes).size) throw new AppError('One or more permissions are invalid', 400);
    if (input.permissionCodes.some((permission) => PROTECTED_PERMISSION_CODES.has(permission))) throw new AppError('Protected permissions can only be assigned to the Managing Director role', 403);
    if (input.allowedChildRoleCodes.length) throw new AppError('Create the role first, then configure it as an allowed child from its parent role', 400);
    const role = await RoleModel.create({
      name: input.name,
      code,
      description: input.description,
      level: input.level,
      category: 'CUSTOM',
      parentRole: parent?._id,
      permissions: permissionDocs.map(({ _id }) => _id),
      allowedChildRoles: [],
      isSystemRole: false,
      isActive: true,
      createdBy: actorId
    });
    invalidateRolePermissionCache();
    return role;
  },

  async updateRole(roleId: string, input: { name?: string; description?: string; permissionCodes?: string[]; allowedChildRoleCodes?: string[]; isActive?: boolean }) {
    if (!Types.ObjectId.isValid(roleId)) throw new AppError('Role not found', 404);
    const role = await RoleModel.findById(roleId);
    if (!role || role.code === 'MD') throw new AppError('Role not found or cannot be modified', 404);
    if (role.isSystemRole && input.isActive === false) throw new AppError('System roles cannot be deactivated', 400);
    if (input.name !== undefined) role.name = input.name;
    if (input.description !== undefined) role.description = input.description;
    if (input.isActive !== undefined) role.isActive = input.isActive;
    if (input.permissionCodes) {
      if (input.permissionCodes.some((permission) => PROTECTED_PERMISSION_CODES.has(permission))) throw new AppError('Protected permissions can only be assigned to the Managing Director role', 403);
      const permissions = await PermissionModel.find({ code: { $in: input.permissionCodes } });
      if (permissions.length !== new Set(input.permissionCodes).size) throw new AppError('One or more permissions are invalid', 400);
      role.permissions = permissions.map(({ _id }) => _id);
      role.permissionVersion += 1;
    }
    if (input.allowedChildRoleCodes) {
      const children = input.allowedChildRoleCodes.length ? await RoleModel.find({ code: { $in: input.allowedChildRoleCodes }, isActive: true }) : [];
      if (children.length !== new Set(input.allowedChildRoleCodes).size) throw new AppError('One or more child roles are invalid', 400);
      for (const child of children) {
        if (child._id.equals(role._id) || child.code === 'MD') throw new AppError('Invalid child role', 400);
        if (role.category === 'ADMIN_HEAD') throw new AppError('Admin Head cannot manage child roles', 400);
        if (child.code === 'BDO' && role.code !== 'MD') throw new AppError('Only MD can create BDO accounts', 403);
        if (child.category === 'ADMIN_HEAD' && !['MD', 'BDO'].includes(role.code)) throw new AppError('Only MD or BDO can create Admin Head accounts', 403);
        if (child.category === 'PRIMARY' && (!child.parentRole?.equals(role._id) || child.level <= role.level)) {
          throw new AppError('A primary child role must have this role as its parent and a lower reporting position', 400);
        }
        if (child.category === 'CUSTOM' && (!child.parentRole?.equals(role._id) || child.level <= role.level)) {
          throw new AppError('A custom child role must have this role as its parent and a lower reporting position', 400);
        }
      }
      if (role.code === 'MD' && !children.some((child) => child.code === 'BDO')) throw new AppError('MD must retain BDO as an allowed child role', 400);
      if (role.code === 'BDO' && !children.some((child) => child.code === 'MH')) throw new AppError('BDO must retain MH as an allowed child role', 400);
      role.allowedChildRoles = children.map(({ _id }) => _id);
      role.permissionVersion += 1;
    }
    await role.save();
    if (!role.isActive) {
      const employeeIds = await EmployeeModel.find({ role: role._id }).distinct('_id');
      await RefreshTokenModel.updateMany({ employee: { $in: employeeIds }, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    invalidateRolePermissionCache(role.id);
    return role;
  },

  async hasPermission(employeeId: Types.ObjectId, permissionCode: string): Promise<boolean> {
    const employee = await EmployeeModel.findById(employeeId).select('role isActive').lean();
    if (!employee?.isActive) return false;
    const role = await RoleModel.findOne({ _id: employee.role, isActive: true }).select('_id code permissions permissionVersion').lean();
    if (!role) return false;
    if (role.code === 'MD') return true;
    const cached = permissionCache.get(role._id.toString());
    let codes: Set<string>;
    if (cached && cached.version === role.permissionVersion && cached.expiresAt > Date.now()) {
      codes = cached.codes;
    } else {
      const permissions = await PermissionModel.find({ _id: { $in: role.permissions } }).select('code').lean();
      codes = new Set(permissions.map(({ code: found }) => found));
      permissionCache.set(role._id.toString(), { version: role.permissionVersion, codes, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return codes.has(permissionCode);
  }
};
