import { randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../../utils/pagination.util.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { LeadModel } from '../../leads/models/lead.model.js';
import { LeadStatusHistoryModel } from '../../leads/models/lead-status-history.model.js';
import { VisitModel } from '../../visits/models/visit.model.js';
import { CustomerActivityModel } from '../models/customer-activity.model.js';
import { CustomerDocumentModel } from '../models/customer-document.model.js';
import { CustomerModel } from '../models/customer.model.js';
import { assertCustomerAccess, customerScope } from './customer-access.service.js';
import { customerDocumentService } from './customer-document.service.js';
import { accessibleEmployeeScope, dateRange, resolveBranchId, resolveEmployeeScope, type RecordListFilters } from '../../employees/services/record-list-filter.service.js';

function objectId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new Types.ObjectId(value);
}
function transactionUnsupported(error: unknown): boolean {
  const code = (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : '';
  return code === 20 || /transactions are not supported|replica set|transaction numbers are only allowed/i.test(message);
}

interface ConversionInput {
  requiredCapacityKW: number;
  ratePerKW: number;
  paymentMode: string;
  panelBrand: string;
  panelTechnology: string;
  remark: string;
  documentUploadIds: string[];
}

export const customerService = {
  async convert(actorId: Types.ObjectId, leadIdValue: string, input: ConversionInput) {
    const leadId = objectId(leadIdValue, 'lead ID');
    const lead = await LeadModel.findById(leadId);
    if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'lead')) throw new AppError('Lead not found', 404);
    const existing = await CustomerModel.findOne({ sourceLead: lead._id });
    if (existing) {
      throw new AppError('This lead has already been converted to a customer', 409);
    }
    if (lead.status === 'CONVERTED') throw new AppError('Lead is marked converted but its customer record is unavailable', 409);
    if (lead.status === 'LOST' || lead.status === 'NOT_INTERESTED') throw new AppError('Lost or not-interested leads cannot be converted', 409);
    const previousStatus = lead.status;
    const customerData = {
      customerCode: `CUS-${randomBytes(6).toString('hex').toUpperCase()}`,
      sourceLead: lead._id, customerName: lead.customerName, mobileNumber: lead.mobileNumber,
      ...(lead.alternateNumber ? { alternateNumber: lead.alternateNumber } : {}), branch: lead.branch, state: lead.state, district: lead.district,
      ...(lead.blockOrTehsil ? { blockOrTehsil: lead.blockOrTehsil } : {}), siteAddress: lead.siteAddress,
      requiredCapacityKW: input.requiredCapacityKW, ratePerKW: input.ratePerKW, paymentMode: input.paymentMode,
      panelBrand: input.panelBrand, panelTechnology: input.panelTechnology, status: 'ONBOARDING', creatorId: lead.creatorId, updatedBy: actorId
    };
    const conversionUploads = await customerDocumentService.prepareLeadConversionUploads(actorId, lead._id, input.documentUploadIds);
    const session = await mongoose.startSession();
    let transactionFallback = false;
    try {
      await session.withTransaction(async () => {
        const docs = await CustomerModel.create([customerData], { session });
        await customerDocumentService.createDocumentsForConversion(actorId, docs[0]!._id, conversionUploads, session);
        const update = await LeadModel.updateOne({ _id: lead._id, status: previousStatus }, { $set: { status: 'CONVERTED', nextFollowUpDate: null } }, { session });
        if (!update.modifiedCount) throw new AppError('Lead was changed by another request; reload and retry', 409);
        await VisitModel.updateMany({ lead: lead._id }, { $set: { customer: docs[0]!._id } }, { session });
        await LeadStatusHistoryModel.create([{ lead: lead._id, previousStatus, newStatus: 'CONVERTED', remark: input.remark, changedBy: actorId }], { session });
        await CustomerActivityModel.create([{ customer: docs[0]!._id, action: 'CONVERTED', description: `Converted from lead ${lead.leadCode}: ${input.remark}`, actor: actorId }], { session });
      });
    } catch (error) {
      if (transactionUnsupported(error)) transactionFallback = true;
      else if ((error as { code?: number }).code === 11000) {
        const racedCustomer = await CustomerModel.findOne({ sourceLead: lead._id });
        if (racedCustomer) {
          await customerDocumentService.revokeLeadConversionUploads(conversionUploads);
          return { customer: racedCustomer, alreadyConverted: true };
        }
        await customerDocumentService.revokeLeadConversionUploads(conversionUploads);
        throw new AppError('A customer conversion is already in progress', 409);
      } else {
        await customerDocumentService.revokeLeadConversionUploads(conversionUploads);
        throw error;
      }
    } finally { await session.endSession(); }

    if (transactionFallback) {
      let fallbackCustomer: InstanceType<typeof CustomerModel> | undefined;
      try {
        fallbackCustomer = await CustomerModel.create(customerData);
        const updated = await LeadModel.updateOne({ _id: lead._id, status: previousStatus }, { $set: { status: 'CONVERTED', nextFollowUpDate: null } });
        if (!updated.modifiedCount) throw new AppError('Lead was changed by another request; reload and retry', 409);
        await VisitModel.updateMany({ lead: lead._id }, { $set: { customer: fallbackCustomer._id } });
        await LeadStatusHistoryModel.create({ lead: lead._id, previousStatus, newStatus: 'CONVERTED', remark: input.remark, changedBy: actorId });
        await CustomerActivityModel.create({ customer: fallbackCustomer._id, action: 'CONVERTED', description: `Converted from lead ${lead.leadCode}: ${input.remark}`, actor: actorId });
        await customerDocumentService.createDocumentsForConversion(actorId, fallbackCustomer._id, conversionUploads);
      } catch (error) {
        if (fallbackCustomer) {
          await CustomerDocumentModel.deleteMany({ customer: fallbackCustomer._id });
          await LeadStatusHistoryModel.deleteOne({ lead: lead._id, newStatus: 'CONVERTED', changedBy: actorId, remark: input.remark });
          await CustomerActivityModel.deleteMany({ customer: fallbackCustomer._id });
          const restore: Record<string, unknown> = { status: previousStatus };
          if (lead.nextFollowUpDate) restore.nextFollowUpDate = lead.nextFollowUpDate;
          await LeadModel.updateOne({ _id: lead._id, status: 'CONVERTED' }, { $set: restore, ...(!lead.nextFollowUpDate ? { $unset: { nextFollowUpDate: 1 } } : {}) });
          await VisitModel.updateMany({ lead: lead._id, customer: fallbackCustomer._id }, { $unset: { customer: 1 } });
          await CustomerModel.deleteOne({ _id: fallbackCustomer._id });
        }
        await customerDocumentService.revokeLeadConversionUploads(conversionUploads);
        if ((error as { code?: number }).code === 11000) {
          const racedCustomer = await CustomerModel.findOne({ sourceLead: lead._id });
          if (racedCustomer) return { customer: racedCustomer, alreadyConverted: true };
        }
        throw error;
      }
    }
    const convertedCustomer = await CustomerModel.findOne({ sourceLead: lead._id });
    if (!convertedCustomer) throw new AppError('Customer conversion failed', 500);
    return { customer: convertedCustomer, alreadyConverted: false };
  },
  async list(actorId: Types.ObjectId, pagination: PaginationInput, filters: RecordListFilters & { search?: string }) {
    const ids = await customerScope(actorId);
    const query: Record<string, unknown> = {};
    if (ids) query._id = { $in: ids };
    if (filters.employeeName) {
      const employeeScope = await resolveEmployeeScope(actorId, filters.employeeName, await accessibleEmployeeScope(actorId));
      if (employeeScope) query.creatorId = { $in: employeeScope };
    }
    const branchId = await resolveBranchId(filters.branchId);
    if (branchId) query.branch = branchId;
    Object.assign(query, dateRange('createdAt', filters));
    if (filters.search) query.$or = [{ customerName: new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { customerCode: new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { mobileNumber: new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
    const [data, total] = await Promise.all([
      CustomerModel.find(query).select('-__v').populate('creatorId', 'employeeCode firstName lastName').populate('updatedBy', 'employeeCode firstName lastName').sort({ createdAt: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      CustomerModel.countDocuments(query)
    ]);
    return { data, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },
  async get(actorId: Types.ObjectId, customerIdValue: string) {
    const customerId = objectId(customerIdValue, 'customer ID');
    const customer = await assertCustomerAccess(actorId, customerId);
    const [documents, lead, leadStatusHistory, visits, activities] = await Promise.all([
      CustomerDocumentModel.find({ customer: customer._id }).select('-s3Key').populate('uploadedBy', 'employeeCode firstName lastName').populate('verifiedBy', 'employeeCode firstName lastName').sort({ uploadedAt: -1 }).lean(),
      LeadModel.findById(customer.sourceLead).select('-__v').populate('creatorId', 'employeeCode firstName lastName').lean(),
      LeadStatusHistoryModel.find({ lead: customer.sourceLead }).populate('changedBy', 'employeeCode firstName lastName').sort({ changedAt: -1 }).lean(),
      VisitModel.find({ lead: customer.sourceLead }).populate('visitedBy', 'employeeCode firstName lastName').sort({ visitDate: -1 }).lean(),
      CustomerActivityModel.find({ customer: customer._id }).populate('actor', 'employeeCode firstName lastName').sort({ occurredAt: -1 }).lean()
    ]);
    const updatedCustomer = await CustomerModel.findById(customer._id).populate('creatorId', 'employeeCode firstName lastName').populate('updatedBy', 'employeeCode firstName lastName').populate('branch', 'name code').populate('state', 'name code').populate('district', 'name').lean();
    return { customer: updatedCustomer, sourceLead: lead, documents, leadStatusHistory, visits, activities };
  },
  async update(actorId: Types.ObjectId, customerIdValue: string, input: Record<string, string | number>) {
    const customer = await assertCustomerAccess(actorId, objectId(customerIdValue, 'customer ID'));
    const fields = ['customerName', 'mobileNumber', 'alternateNumber', 'siteAddress', 'blockOrTehsil', 'requiredCapacityKW', 'ratePerKW', 'paymentMode', 'panelBrand', 'panelTechnology', 'status'] as const;
    const changed: string[] = [];
    for (const field of fields) if (input[field] !== undefined) { (customer as unknown as Record<string, unknown>)[field] = input[field]; changed.push(field); }
    if (!changed.length) throw new AppError('No customer fields to update', 400);
    customer.updatedBy = actorId; await customer.save();
    await CustomerActivityModel.create({ customer: customer._id, action: 'UPDATED', description: `Updated: ${changed.join(', ')}`, actor: actorId });
    return customer;
  },
  async timeline(actorId: Types.ObjectId, customerIdValue: string) {
    const customer = await assertCustomerAccess(actorId, objectId(customerIdValue, 'customer ID'));
    const [activities, histories, visits] = await Promise.all([
      CustomerActivityModel.find({ customer: customer._id }).populate('actor', 'employeeCode firstName lastName').sort({ occurredAt: -1 }).lean(),
      LeadStatusHistoryModel.find({ lead: customer.sourceLead }).populate('changedBy', 'employeeCode firstName lastName').sort({ changedAt: -1 }).lean(),
      VisitModel.find({ lead: customer.sourceLead }).populate('visitedBy', 'employeeCode firstName lastName').sort({ visitDate: -1 }).lean()
    ]);
    return [
      ...activities.map((item) => ({ type: `CUSTOMER_${item.action}`, occurredAt: item.occurredAt, actor: item.actor, description: item.description })),
      ...histories.map((item) => ({ type: 'LEAD_STATUS', occurredAt: item.changedAt, actor: item.changedBy, description: `${item.previousStatus} → ${item.newStatus}: ${item.remark}` })),
      ...visits.map((item) => ({ type: 'SITE_VISIT', occurredAt: item.visitDate, actor: item.visitedBy, description: item.remark, nextVisitDate: item.nextVisitDate }))
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }
};
