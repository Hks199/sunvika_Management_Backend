import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../../utils/pagination.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { dateRange, resolveBranchId, resolveEmployeeScope, type RecordListFilters } from '../../employees/services/record-list-filter.service.js';
import { geographyService } from '../../geography/services/geography.service.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { LeadStatusHistoryModel } from '../models/lead-status-history.model.js';
import { LeadModel } from '../models/lead.model.js';
import { assertLeadStatusTransition, type LeadStatus } from '../constants/lead-status.js';
import { VisitModel } from '../../visits/models/visit.model.js';
import { quotationService } from '../../quotations/services/quotation.service.js';

function objectId(value: string, label = 'lead ID'): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new Types.ObjectId(value);
}
function escaped(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function canManage(actorId: Types.ObjectId, leadId: Types.ObjectId) {
  const lead = await LeadModel.findById(leadId);
  if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'lead')) throw new AppError('Lead not found', 404);
  return lead;
}

async function accessibleCreatorIds(actorId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
  const actor = await EmployeeModel.findById(actorId).select('role').lean();
  const role = actor ? await RoleModel.findById(actor.role).select('code category').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (role.code === 'MD' || role.category === 'ADMIN_HEAD') return null;
  return hierarchyService.getDownlineEmployeeIds(actorId);
}

export const leadService = {
  async create(actorId: Types.ObjectId, input: { customerName: string; mobileNumber: string; alternateNumber?: string; state: string; district: string; branch: string; blockOrTehsil?: string; siteAddress: string }) {
    await geographyService.validateEmployeePlacement(input.state, input.district, input.branch);
    return LeadModel.create({
      leadCode: `LD-${randomBytes(6).toString('hex').toUpperCase()}`,
      customerName: input.customerName, mobileNumber: input.mobileNumber,
      ...(input.alternateNumber ? { alternateNumber: input.alternateNumber } : {}),
      state: objectId(input.state, 'state ID'), district: objectId(input.district, 'district ID'), branch: objectId(input.branch, 'branch ID'),
      ...(input.blockOrTehsil ? { blockOrTehsil: input.blockOrTehsil } : {}), siteAddress: input.siteAddress,
      status: 'PENDING', creatorId: actorId
    });
  },
  async list(actorId: Types.ObjectId, pagination: PaginationInput, filter: { status?: LeadStatus; search?: string } & RecordListFilters) {
    const creators = await accessibleCreatorIds(actorId);
    const employeeScope = await resolveEmployeeScope(actorId, filter.employeeName, creators);
    const query: Record<string, unknown> = {};
    if (employeeScope) query.creatorId = { $in: employeeScope };
    const branchId = await resolveBranchId(filter.branchId);
    if (branchId) query.branch = branchId;
    const filterDates = dateRange('createdAt', filter);
    Object.assign(query, filterDates);
    if (filter.status === 'CONVERTED') query.status = { $in: [] };
    else query.status = filter.status ?? { $ne: 'CONVERTED' };
    if (filter.search) {
      const pattern = new RegExp(escaped(filter.search), 'i');
      query.$or = [{ customerName: pattern }, { mobileNumber: pattern }, { leadCode: pattern }];
    }
    const [data, total] = await Promise.all([
      LeadModel.find(query).populate('branch', 'name code').populate('state', 'name code').populate('district', 'name').populate('creatorId', 'employeeCode firstName lastName').populate('assignedTo', 'employeeCode firstName lastName').sort({ createdAt: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      LeadModel.countDocuments(query)
    ]);
    return { data, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },
  async get(actorId: Types.ObjectId, leadId: string) {
    const id = objectId(leadId);
    const accessRecord = await LeadModel.findById(id).select('creatorId').lean();
    if (!accessRecord || !await hierarchyService.canAccessResource(actorId, accessRecord.creatorId, 'lead')) {
      throw new AppError('Lead not found', 404);
    }
    const lead = await LeadModel.findById(id)
      .populate('branch', 'name code')
      .populate('state', 'name code')
      .populate('district', 'name')
      .populate('creatorId', 'employeeCode firstName lastName')
      .populate('assignedTo', 'employeeCode firstName lastName')
      .lean();
    if (!lead) throw new AppError('Lead not found', 404);
    return lead;
  },
  async update(actorId: Types.ObjectId, leadId: string, input: Record<string, string>) {
    const lead = await canManage(actorId, objectId(leadId));
    const state = input.state ?? lead.state.toString(); const district = input.district ?? lead.district.toString(); const branch = input.branch ?? lead.branch.toString();
    if (input.state !== undefined || input.district !== undefined || input.branch !== undefined) await geographyService.validateEmployeePlacement(state, district, branch);
    for (const key of ['customerName', 'mobileNumber', 'alternateNumber', 'blockOrTehsil', 'siteAddress'] as const) {
      if (input[key] !== undefined) (lead as unknown as Record<string, unknown>)[key] = input[key] || undefined;
    }
    if (input.state) lead.state = objectId(input.state, 'state ID');
    if (input.district) lead.district = objectId(input.district, 'district ID');
    if (input.branch) lead.branch = objectId(input.branch, 'branch ID');
    await lead.save(); return lead;
  },
  async changeStatus(actorId: Types.ObjectId, leadId: string, input: {
    status: LeadStatus;
    remark: string;
    nextFollowUpDate?: Date;
    quotation?: {
      requiredCapacityKW: number;
      ratePerKW: number;
      paymentMode: string;
      panelBrand: string;
      panelTechnology: string;
      termsAndConditions: string;
    };
  }) {
    const lead = await canManage(actorId, objectId(leadId));
    try { assertLeadStatusTransition(lead.status as LeadStatus, input.status); }
    catch (error) { throw new AppError(error instanceof Error ? error.message : 'Invalid lead status transition', 409); }
    const previousStatus = lead.status;
    const previousFollowUpDate = lead.nextFollowUpDate;
    lead.status = input.status;
    lead.nextFollowUpDate = input.status === 'NEED_FOLLOWUP' ? input.nextFollowUpDate! : null;
    await lead.save();
    let historyId: Types.ObjectId | undefined;
    let visitId: Types.ObjectId | undefined;
    let quotation: unknown;
    try {
      const [history] = await LeadStatusHistoryModel.create([{
        lead: lead._id,
        previousStatus,
        newStatus: input.status,
        remark: input.remark,
        changedBy: actorId,
        ...(input.nextFollowUpDate ? { nextFollowUpDate: input.nextFollowUpDate } : {})
      }]);
      historyId = history!._id;
      if (input.status === 'SITE_VISITED') {
        const [visit] = await VisitModel.create([{
          lead: lead._id,
          visitedBy: actorId,
          visitDate: new Date(),
          remark: input.remark
        }]);
        visitId = visit!._id;
      }
      if (input.quotation) {
        quotation = await quotationService.create(actorId, {
          leadId: lead._id.toString(),
          ...input.quotation
        });
      }
    } catch (error) {
      const rollback: Record<string, unknown> = { $set: { status: previousStatus }, $unset: {} };
      if (previousFollowUpDate) (rollback.$set as Record<string, unknown>).nextFollowUpDate = previousFollowUpDate;
      else (rollback.$unset as Record<string, number>).nextFollowUpDate = 1;
      await LeadModel.updateOne({ _id: lead._id, status: input.status }, rollback);
      if (historyId) await LeadStatusHistoryModel.deleteOne({ _id: historyId });
      if (visitId) await VisitModel.deleteOne({ _id: visitId });
      throw error;
    }
    return quotation ? { lead, quotation } : lead;
  },
  async assign(actorId: Types.ObjectId, leadId: string, assignedTo: string) {
    const lead = await canManage(actorId, objectId(leadId));
    const targetId = objectId(assignedTo, 'employee ID');
    const target = await EmployeeModel.findOne({ _id: targetId, isActive: true }).select('_id hierarchyPath').lean();
    const allowedIds = await accessibleCreatorIds(actorId);
    if (!target || (allowedIds && !allowedIds.some((id) => id.equals(targetId)))) throw new AppError('Assignee must be an active employee within your hierarchy', 400);
    lead.assignedTo = targetId; await lead.save(); return lead;
  },
  async history(actorId: Types.ObjectId, leadId: string) {
    const lead = await LeadModel.findById(objectId(leadId)).select('creatorId').lean();
    if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'lead')) throw new AppError('Lead not found', 404);
    return LeadStatusHistoryModel.find({ lead: lead._id }).populate('changedBy', 'employeeCode firstName lastName').sort({ changedAt: -1 }).lean();
  },
  async followUps(actorId: Types.ObjectId, pagination: PaginationInput, overdue = false, filter: RecordListFilters = {}) {
    const creators = await accessibleCreatorIds(actorId);
    const employeeScope = await resolveEmployeeScope(actorId, filter.employeeName, creators);
    const query: Record<string, unknown> = { status: 'NEED_FOLLOWUP', nextFollowUpDate: overdue ? { $lt: new Date() } : { $gte: new Date() } };
    if (employeeScope) query.creatorId = { $in: employeeScope };
    const branchId = await resolveBranchId(filter.branchId);
    if (branchId) query.branch = branchId;
    const filterDate = dateRange('nextFollowUpDate', filter).nextFollowUpDate;
    if (filterDate && query.nextFollowUpDate && typeof query.nextFollowUpDate === 'object') {
      query.nextFollowUpDate = { ...query.nextFollowUpDate as Record<string, Date>, ...filterDate as Record<string, Date> };
    }
    const [data, total] = await Promise.all([
      LeadModel.find(query).populate('creatorId', 'employeeCode firstName lastName').populate('assignedTo', 'employeeCode firstName lastName').sort({ nextFollowUpDate: 1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      LeadModel.countDocuments(query)
    ]);
    return { data, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  }
};
