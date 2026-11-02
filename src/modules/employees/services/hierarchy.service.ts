import { Types } from 'mongoose';
import { EmployeeModel } from '../models/employee.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { canAccessEmployeeByPolicy, canAccessOwnedResourceByPolicy, type BusinessResource } from './hierarchy-policy.js';

export const hierarchyService = {
  async getAncestors(employeeId: Types.ObjectId | string) {
    const employee = await EmployeeModel.findById(employeeId).select('hierarchyPath').lean();
    if (!employee) return [];
    const ancestors = await EmployeeModel.find({ _id: { $in: employee.hierarchyPath } }).lean();
    const byId = new Map(ancestors.map((ancestor) => [ancestor._id.toString(), ancestor]));
    return employee.hierarchyPath.map((id) => byId.get(id.toString())).filter((ancestor) => ancestor !== undefined);
  },

  async getDescendants(employeeId: Types.ObjectId | string) {
    return EmployeeModel.find({ hierarchyPath: new Types.ObjectId(employeeId), isActive: true }).sort({ hierarchyPath: 1 }).lean();
  },

  async getDownlineEmployeeIds(employeeId: Types.ObjectId | string, includeSelf = true): Promise<Types.ObjectId[]> {
    const id = new Types.ObjectId(employeeId);
    const descendants = await EmployeeModel.find({ hierarchyPath: id }).select('_id').lean();
    return includeSelf ? [id, ...descendants.map(({ _id }) => _id)] : descendants.map(({ _id }) => _id);
  },

  async getReportingChain(employeeId: Types.ObjectId | string) {
    const employee = await EmployeeModel.findById(employeeId).select('hierarchyPath').lean();
    if (!employee) return [];
    const chain = await this.getAncestors(employeeId);
    const self = await EmployeeModel.findById(employeeId).lean();
    return self ? [...chain, self] : chain;
  },

  async isInMyHierarchy(actorId: Types.ObjectId | string, targetId: Types.ObjectId | string): Promise<boolean> {
    const actor = new Types.ObjectId(actorId);
    if (actor.equals(targetId)) return true;
    return Boolean(await EmployeeModel.exists({ _id: targetId, hierarchyPath: actor }));
  },

  async canAccessEmployee(actorId: Types.ObjectId | string, targetId: Types.ObjectId | string): Promise<boolean> {
    const actor = await EmployeeModel.findById(actorId).select('role').lean();
    const target = await EmployeeModel.findById(targetId).select('role hierarchyPath createdBy').lean();
    if (!actor || !target) return false;
    const actorRole = await RoleModel.findById(actor.role).select('code category').lean();
    const targetRole = await RoleModel.findById(target.role).select('category').lean();
    const targetCreatorIsInActorHierarchy = targetRole?.category === 'ADMIN_HEAD'
      ? await hierarchyService.isInMyHierarchy(actorId, target.createdBy)
      : false;
    return canAccessEmployeeByPolicy({
      actorId: actor._id.toString(), actorRoleCode: actorRole?.code, actorRoleCategory: actorRole?.category,
      targetId: target._id.toString(), targetRoleCategory: targetRole?.category,
      targetCreatorIsInActorHierarchy,
      targetHierarchyPath: target.hierarchyPath.map((id) => id.toString())
    });
  },

  async canAccessResource(actorId: Types.ObjectId | string, ownerId: Types.ObjectId | string, resourceType: BusinessResource): Promise<boolean> {
    const actor = await EmployeeModel.findById(actorId).select('role').lean();
    if (!actor) return false;
    const role = await RoleModel.findById(actor.role).select('code category').lean();
    const actorIdString = actor._id.toString();
    const ownerIdString = ownerId.toString();
    const ownerIsInActorHierarchy = actorIdString === ownerIdString
      ? false
      : Boolean(await EmployeeModel.exists({ _id: ownerId, hierarchyPath: actor._id }));
    return canAccessOwnedResourceByPolicy({
      actorId: actorIdString, actorRoleCode: role?.code, actorRoleCategory: role?.category,
      ownerId: ownerIdString, ownerIsInActorHierarchy, resourceType
    });
  }
};
