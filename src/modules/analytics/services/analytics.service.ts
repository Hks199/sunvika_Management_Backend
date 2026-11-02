import { Types } from 'mongoose';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { LeadModel } from '../../leads/models/lead.model.js';
import { CustomerModel } from '../../customers/models/customer.model.js';
import { QuotationModel } from '../../quotations/models/quotation.model.js';
import { VisitModel } from '../../visits/models/visit.model.js';
import { BranchModel } from '../../geography/models/branch.model.js';
import { DistrictModel } from '../../geography/models/district.model.js';
import { StateModel } from '../../geography/models/state.model.js';

type Filters = { dateFrom?: Date; dateTo?: Date; branchId?: string; stateId?: string; districtId?: string; mhId?: string; dcId?: string; rmId?: string; cpId?: string; leadStatus?: string; customerStatus?: string; page?: number; limit?: number };

const id = (value: string) => new Types.ObjectId(value);
const inDateRange = (field: string, f: Filters) => f.dateFrom || f.dateTo ? { [field]: { ...(f.dateFrom ? { $gte: f.dateFrom } : {}), ...(f.dateTo ? { $lte: new Date(new Date(f.dateTo).setHours(23, 59, 59, 999)) } : {}) } } : {};
const quotationLeadMatch = (s: Awaited<ReturnType<typeof scope>>) => Object.fromEntries(Object.entries(s.leadMatch).map(([key, value]) => [`leadRecord.${key}`, value]));

async function scope(actorId: string, f: Filters) {
  const actor = await EmployeeModel.findById(actorId).select('role hierarchyPath').lean();
  if (!actor) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  const role = await RoleModel.findById(actor.role).select('code category').lean();
  const universal = role?.code === 'MD' || role?.category === 'ADMIN_HEAD';
  let employeeIds: Types.ObjectId[] | null = universal ? null : await hierarchyService.getDownlineEmployeeIds(actorId);
  const selector = f.cpId ?? f.rmId ?? f.dcId ?? f.mhId;
  if (selector) {
    const expectedRole = f.cpId ? 'CP' : f.rmId ? 'RM' : f.dcId ? 'DC' : 'MH';
    const selected = await EmployeeModel.findById(selector).select('role hierarchyPath').lean();
    const selectedRole = selected ? await RoleModel.findById(selected.role).select('code').lean() : null;
    const actorIsAncestor = selected?.hierarchyPath.some((x) => x.equals(actor._id));
    const actorIsSelf = actor._id.equals(selector);
    if (!selected || selectedRole?.code !== expectedRole || (!universal && !actorIsAncestor && !actorIsSelf)) throw Object.assign(new Error('Employee filter is outside your authorized hierarchy'), { statusCode: 403 });
    const selectedIds = await hierarchyService.getDownlineEmployeeIds(selector);
    employeeIds = employeeIds ? employeeIds.filter((x) => selectedIds.some((y) => y.equals(x))) : selectedIds;
  }
  const geo: Record<string, unknown> = {};
  if (f.branchId) geo.branch = id(f.branchId);
  if (f.stateId) geo.state = id(f.stateId);
  if (f.districtId) geo.district = id(f.districtId);
  if (f.branchId || f.stateId || f.districtId) {
    const branch = f.branchId ? await BranchModel.findById(f.branchId).select('state district').lean() : null;
    const district = f.districtId ? await DistrictModel.findById(f.districtId).select('state').lean() : null;
    if ((f.branchId && !branch) || (f.stateId && !(await StateModel.exists({ _id: f.stateId }))) || (f.districtId && !district)) throw Object.assign(new Error('Unknown geography filter'), { statusCode: 400 });
    if (branch && ((f.stateId && !branch.state.equals(id(f.stateId))) || (f.districtId && !branch.district.equals(id(f.districtId))))) throw Object.assign(new Error('Geography filters do not match'), { statusCode: 400 });
    if (district && f.stateId && !district.state.equals(id(f.stateId))) throw Object.assign(new Error('Geography filters do not match'), { statusCode: 400 });
  }
  const leadMatch: Record<string, unknown> = { ...geo, ...inDateRange('createdAt', f) };
  if (employeeIds) leadMatch.creatorId = { $in: employeeIds };
  if (f.leadStatus) leadMatch.status = f.leadStatus;
  const customerMatch: Record<string, unknown> = { ...geo, ...inDateRange('createdAt', f) };
  if (employeeIds) customerMatch.creatorId = { $in: employeeIds };
  if (f.customerStatus) customerMatch.status = f.customerStatus;
  return { actor, role, employeeIds, leadMatch, customerMatch };
}

export const analyticsService = {
  async summary(actorId: string, filters: Filters) {
    const s = await scope(actorId, filters);
    const now = new Date();
    const [leadStats, customerStats, quoteStats, visits, roleCounts, branchPerformance, districtPerformance, statePerformance] = await Promise.all([
      LeadModel.aggregate([
        { $match: s.leadMatch },
        { $facet: {
          statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          followups: [
            { $match: { nextFollowUpDate: { $exists: true } } },
            { $group: { _id: null, total: { $sum: 1 }, overdue: { $sum: { $cond: [{ $lt: ['$nextFollowUpDate', now] }, 1, 0] } } } }
          ],
          conversion: [
            { $group: { _id: null, total: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'CONVERTED'] }, 1, 0] } } } }
          ]
        } }
      ]),
      CustomerModel.aggregate([{ $match: s.customerMatch }, { $group: { _id: null, total: { $sum: 1 }, capacityKW: { $sum: '$requiredCapacityKW' } } }]),
      QuotationModel.aggregate([
        { $match: inDateRange('quotationDate', filters) },
        { $lookup: { from: 'leads', localField: 'lead', foreignField: '_id', as: 'leadRecord' } },
        { $unwind: '$leadRecord' },
        { $match: { ...quotationLeadMatch(s), ...(s.employeeIds ? { 'leadRecord.creatorId': { $in: s.employeeIds } } : {}) } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$totalProjectAmount' } }, count: { $sum: 1 } } }
      ]),
      VisitModel.countDocuments({ ...(s.employeeIds ? { visitedBy: { $in: s.employeeIds } } : {}), ...inDateRange('visitDate', filters) }),
      s.employeeIds ? EmployeeModel.aggregate([{ $match: { _id: { $in: s.employeeIds }, isActive: true } }, { $lookup: { from: 'roles', localField: 'role', foreignField: '_id', as: 'role' } }, { $unwind: '$role' }, { $group: { _id: '$role.code', total: { $sum: 1 } } }]) : EmployeeModel.aggregate([{ $match: { isActive: true } }, { $lookup: { from: 'roles', localField: 'role', foreignField: '_id', as: 'role' } }, { $unwind: '$role' }, { $group: { _id: '$role.code', total: { $sum: 1 } } }]),
      LeadModel.aggregate([{ $match: s.leadMatch }, { $group: { _id: '$branch', leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'CONVERTED'] }, 1, 0] } } } }, { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } }, { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } }, { $project: { _id: 1, name: '$branch.name', leads: 1, converted: 1 } }]),
      LeadModel.aggregate([{ $match: s.leadMatch }, { $group: { _id: '$district', leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'CONVERTED'] }, 1, 0] } } } }, { $lookup: { from: 'districts', localField: '_id', foreignField: '_id', as: 'district' } }, { $unwind: { path: '$district', preserveNullAndEmptyArrays: true } }, { $project: { _id: 1, name: '$district.name', leads: 1, converted: 1 } }]),
      LeadModel.aggregate([{ $match: s.leadMatch }, { $group: { _id: '$state', leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'CONVERTED'] }, 1, 0] } } } }, { $lookup: { from: 'states', localField: '_id', foreignField: '_id', as: 'state' } }, { $unwind: { path: '$state', preserveNullAndEmptyArrays: true } }, { $project: { _id: 1, name: '$state.name', leads: 1, converted: 1 } }])
    ]);
    const byStatus = Object.fromEntries(leadStats[0]?.statuses.map((x: { _id: string; count: number }) => [x._id, x.count]) ?? []);
    const totalLeads = Object.values(byStatus).reduce((a: number, b) => a + Number(b), 0);
    const roles = Object.fromEntries(roleCounts.map((x: { _id: string; total: number }) => [x._id, x.total]));
    return { employees: { total: Object.values(roles).reduce((a: number, b) => a + Number(b), 0), byRole: roles }, leads: { total: totalLeads, byStatus, conversionRate: totalLeads ? (byStatus.CONVERTED ?? 0) / totalLeads : 0, followUps: leadStats[0]?.followups[0]?.total ?? 0, overdueFollowUps: leadStats[0]?.followups[0]?.overdue ?? 0 }, customers: { total: customerStats[0]?.total ?? 0, solarCapacityKW: customerStats[0]?.capacityKW ?? 0 }, quotations: { total: quoteStats[0]?.count ?? 0, value: quoteStats[0]?.total ?? 0 }, siteVisits: visits, branchPerformance, districtPerformance, statePerformance };
  },
  async report(actorId: string, filters: Filters, kind: string) {
    const s = await scope(actorId, filters);
    const page = filters.page ?? 1, limit = filters.limit ?? 20;
    if (kind === 'employee-performance') {
      const match = s.employeeIds ? { _id: { $in: s.employeeIds } } : {};
      const rows = await EmployeeModel.aggregate([{ $match: { ...match, isActive: true } }, { $lookup: { from: 'roles', localField: 'role', foreignField: '_id', as: 'role' } }, { $unwind: '$role' }, ...(s.role?.code === 'RM' ? [{ $match: { 'role.code': 'CP' } }] : []), { $lookup: { from: 'leads', let: { employeeId: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$creatorId', '$$employeeId'] }, ...s.leadMatch } }, { $group: { _id: null, total: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'CONVERTED'] }, 1, 0] } } } }], as: 'stats' } }, { $project: { name: { $concat: ['$firstName', ' ', '$lastName'] }, role: '$role.code', stats: { $ifNull: [{ $first: '$stats' }, { total: 0, converted: 0 }] } } }, { $sort: { 'stats.total': -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }]);
      return { data: rows, page, limit };
    }
    const grouping = kind === 'branch-performance' ? '$branch' : kind === 'district-performance' ? '$district' : kind === 'state-performance' ? '$state' : null;
    if (grouping) {
      const collection = kind === 'branch-performance' ? 'branches' : kind === 'district-performance' ? 'districts' : 'states';
      const result = await LeadModel.aggregate([{ $match: s.leadMatch }, { $group: { _id: grouping, leads: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'CONVERTED'] }, 1, 0] } } } }, { $lookup: { from: collection, localField: '_id', foreignField: '_id', as: 'dimension' } }, { $unwind: { path: '$dimension', preserveNullAndEmptyArrays: true } }, { $project: { _id: 1, name: '$dimension.name', leads: 1, converted: 1, conversionRate: { $cond: [{ $gt: ['$leads', 0] }, { $divide: ['$converted', '$leads'] }, 0] } } }, { $sort: { leads: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }]);
      return { data: result, page, limit };
    }
    if (kind === 'customers') return { data: await CustomerModel.find(s.customerMatch).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), page, limit, total: await CustomerModel.countDocuments(s.customerMatch) };
    if (kind === 'follow-ups') return { data: await LeadModel.find({ ...s.leadMatch, nextFollowUpDate: { $exists: true } }).sort({ nextFollowUpDate: 1 }).skip((page - 1) * limit).limit(limit).lean(), page, limit };
    if (kind === 'quotations') {
      const rows = await QuotationModel.aggregate([
        { $match: inDateRange('quotationDate', filters) },
        { $lookup: { from: 'leads', localField: 'lead', foreignField: '_id', as: 'leadRecord' } },
        { $unwind: '$leadRecord' },
        { $match: { ...quotationLeadMatch(s), ...(s.employeeIds ? { 'leadRecord.creatorId': { $in: s.employeeIds } } : {}) } },
        { $sort: { quotationDate: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }
      ]);
      return { data: rows, page, limit };
    }
    const rows = await LeadModel.aggregate([{ $match: s.leadMatch }, { $group: { _id: '$status', total: { $sum: 1 } } }, { $sort: { total: -1 } }]);
    return { data: rows };
  }
};
