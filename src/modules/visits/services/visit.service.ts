import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../../utils/pagination.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { LeadModel } from '../../leads/models/lead.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { VisitModel } from '../models/visit.model.js';
import { accessibleEmployeeScope, dateRange, resolveBranchId, resolveEmployeeScope, type RecordListFilters } from '../../employees/services/record-list-filter.service.js';

function objectId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new Types.ObjectId(value);
}

async function actorLeadScope(actorId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
  const actor = await EmployeeModel.findById(actorId).select('role').lean();
  const role = actor ? await RoleModel.findById(actor.role).select('code category').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (role.code === 'MD' || role.category === 'ADMIN_HEAD') return null;
  const creatorIds = await hierarchyService.getDownlineEmployeeIds(actorId);
  return LeadModel.find({ creatorId: { $in: creatorIds } }).distinct('_id');
}

async function assertLeadAccess(actorId: Types.ObjectId, leadId: Types.ObjectId) {
  const lead = await LeadModel.findById(leadId).select('creatorId').lean();
  if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'visit')) throw new AppError('Lead not found', 404);
  return lead;
}

async function pageVisits(query: Record<string, unknown>, pagination: PaginationInput) {
  const [data, total] = await Promise.all([
    VisitModel.find(query).populate({ path: 'lead', select: 'leadCode customerName mobileNumber status' }).populate('visitedBy', 'employeeCode firstName lastName').populate('customer', 'customerCode customerName').sort({ visitDate: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
    VisitModel.countDocuments(query)
  ]);
  return { data, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
}

function intersectIds(left: Types.ObjectId[] | null, right: Types.ObjectId[]): Types.ObjectId[] {
  if (!left) return right;
  return left.filter((id) => right.some((other) => id.equals(other)));
}

export const visitService = {
  async create(actorId: Types.ObjectId, input: { leadId: string; visitDate: Date; remark: string; nextVisitDate?: Date; location?: { latitude?: number; longitude?: number; address?: string } }) {
    const leadId = objectId(input.leadId, 'lead ID');
    await assertLeadAccess(actorId, leadId);
    return VisitModel.create({ lead: leadId, visitedBy: actorId, visitDate: input.visitDate, remark: input.remark, ...(input.nextVisitDate ? { nextVisitDate: input.nextVisitDate } : {}), ...(input.location ? { location: input.location } : {}) });
  },
  async list(actorId: Types.ObjectId, pagination: PaginationInput, filters: { leadId?: string; employeeId?: string; upcoming?: boolean; overdue?: boolean } & RecordListFilters) {
    let leadIds = await actorLeadScope(actorId);
    const query: Record<string, unknown> = {};
    if (filters.leadId) {
      const leadId = objectId(filters.leadId, 'lead ID');
      await assertLeadAccess(actorId, leadId);
      leadIds = intersectIds(leadIds, [leadId]);
    }
    const branchId = await resolveBranchId(filters.branchId);
    if (branchId) {
      const branchLeadIds = await LeadModel.find({ branch: branchId }).distinct('_id');
      leadIds = intersectIds(leadIds, branchLeadIds);
    }
    if (leadIds) query.lead = { $in: leadIds };

    if (filters.employeeName) {
      const visitorScope = await accessibleEmployeeScope(actorId);
      const employeeScope = await resolveEmployeeScope(actorId, filters.employeeName, visitorScope);
      if (employeeScope) query.visitedBy = { $in: employeeScope };
    }
    if (filters.employeeId) {
      const employeeId = objectId(filters.employeeId, 'employee ID');
      if (!await hierarchyService.canAccessResource(actorId, employeeId, 'visit')) throw new AppError('Employee not found', 404);
      const existingVisitors = query.visitedBy;
      query.visitedBy = existingVisitors && typeof existingVisitors === 'object' && '$in' in existingVisitors
        ? { $in: (existingVisitors as { $in: Types.ObjectId[] }).$in.filter((id) => id.equals(employeeId)) }
        : employeeId;
    }
    if (filters.upcoming) query.nextVisitDate = { $gte: new Date() };
    if (filters.overdue) query.nextVisitDate = { $lt: new Date() };
    Object.assign(query, dateRange('visitDate', filters));
    return pageVisits(query, pagination);
  },
  async get(actorId: Types.ObjectId, visitId: string) {
    const visit = await VisitModel.findById(objectId(visitId, 'visit ID')).populate({ path: 'lead', select: 'leadCode customerName mobileNumber status creatorId' }).populate('visitedBy', 'employeeCode firstName lastName').populate('customer', 'customerCode customerName').lean();
    const lead = visit?.lead as { creatorId?: Types.ObjectId } | undefined;
    if (!visit || !lead?.creatorId || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'visit')) throw new AppError('Visit not found', 404);
    return visit;
  },
  async update(actorId: Types.ObjectId, visitId: string, input: { visitDate?: Date; remark?: string; nextVisitDate?: Date | null; location?: { latitude?: number; longitude?: number; address?: string } | null }) {
    const visit = await VisitModel.findById(objectId(visitId, 'visit ID'));
    if (!visit) throw new AppError('Visit not found', 404);
    await assertLeadAccess(actorId, visit.lead);
    if (input.visitDate !== undefined) visit.visitDate = input.visitDate;
    if (input.remark !== undefined) visit.remark = input.remark;
    if (input.nextVisitDate !== undefined) visit.nextVisitDate = input.nextVisitDate;
    if (input.location !== undefined) visit.location = input.location;
    visit.updatedBy = actorId;
    await visit.save(); return visit;
  }
};
