import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../../../config/env.config.js';
import { AppError } from '../../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../../utils/pagination.util.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { LeadModel } from '../../leads/models/lead.model.js';
import { CustomerModel } from '../../customers/models/customer.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { QuotationModel } from '../models/quotation.model.js';
import { QuotationSequenceModel } from '../models/quotation-sequence.model.js';
import { BrochureModel } from '../models/brochure.model.js';
import { PublicShareLinkModel } from '../models/public-share-link.model.js';
import { QuotationShareModel } from '../models/quotation-share.model.js';
import { generateBrochurePdf, generateQuotationPdf } from './pdf-template.service.js';
import { quotationStorageService } from './quotation-storage.service.js';
import { accessibleEmployeeScope, dateRange, resolveBranchId, resolveEmployeeScope, type RecordListFilters } from '../../employees/services/record-list-filter.service.js';

function parseId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new Types.ObjectId(value);
}
function digitsOnly(value: string): string { return value.replace(/\D/g, ''); }
function publicQuotation(quote: Record<string, unknown>) {
  const { s3Key: _s3Key, ...result } = quote;
  return result;
}
async function leadScope(actorId: Types.ObjectId): Promise<Types.ObjectId[] | null> {
  const employee = await EmployeeModel.findById(actorId).select('role').lean();
  const role = employee ? await RoleModel.findById(employee.role).select('code category').lean() : null;
  if (!role) throw new AppError('Employee role is unavailable', 403);
  if (role.code === 'MD' || role.category === 'ADMIN_HEAD') return null;
  const ids = await hierarchyService.getDownlineEmployeeIds(actorId);
  return LeadModel.find({ creatorId: { $in: ids } }).distinct('_id');
}
async function assertQuotationAccess(actorId: Types.ObjectId, quoteId: string) {
  const quote = await QuotationModel.findById(parseId(quoteId, 'quotation ID'));
  const lead = quote ? await LeadModel.findById(quote.lead).select('creatorId').lean() : null;
  if (!quote || !lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'quotation')) throw new AppError('Quotation not found', 404);
  return { quote, lead };
}
async function nextNumber(prefix: 'QTN' | 'BR'): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await QuotationSequenceModel.findOneAndUpdate({ _id: `${prefix}-${year}` }, { $inc: { value: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  return `${prefix}-${year}-${String(sequence.value).padStart(6, '0')}`;
}
async function createShareLink(resourceType: 'QUOTATION' | 'BROCHURE', resourceId: Types.ObjectId, s3Key: string, fileName: string, actorId: Types.ObjectId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await PublicShareLinkModel.create({ tokenHash: createHash('sha256').update(token).digest('hex'), resourceType, resource: resourceId, s3Key, fileName, expiresAt, createdBy: actorId });
  return { url: `${env.publicApiUrl}/public/shares/${token}`, expiresAt };
}
function whatsappNumber(mobileNumber: string): string {
  let phone = digitsOnly(mobileNumber);
  if (phone.length === 10) phone = `91${phone}`;
  if (phone.length < 11 || phone.length > 15) throw new AppError('WhatsApp number must include a valid country code', 400);
  return phone;
}
function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

interface QuotationInput {
  leadId: string; requiredCapacityKW: number; ratePerKW: number; paymentMode: string; panelBrand: string; panelTechnology: string; termsAndConditions: string;
}

export const quotationService = {
  async create(actorId: Types.ObjectId, input: QuotationInput) {
    const lead = await LeadModel.findById(parseId(input.leadId, 'lead ID'));
    if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'quotation')) throw new AppError('Lead not found', 404);
    if (lead.status !== 'QUOTATION_SENT') throw new AppError('A quotation can only be generated for a lead with QUOTATION_SENT status', 409);
    const capacity = Number(input.requiredCapacityKW.toFixed(3));
    const rate = Number(input.ratePerKW.toFixed(2));
    const total = Math.round(capacity * rate * 100) / 100;
    if (!Number.isFinite(total)) throw new AppError('Quotation total is outside the supported range', 400);
    const customer = await CustomerModel.findOne({ sourceLead: lead._id }).select('_id');
    const latest = await QuotationModel.findOne({ lead: lead._id }).sort({ version: -1 }).select('version').lean();
    const version = (latest?.version ?? 0) + 1;
    const quotationNumber = await nextNumber('QTN');
    const quotationDate = new Date();
    const companyDetails = [env.quotationCompanyAddress, env.quotationCompanyPhone, env.quotationCompanyEmail].filter(Boolean).join(' | ');
    const pdf = await generateQuotationPdf({
      companyName: 'Sunvika Private Limited', companyDetails, customerName: lead.customerName, customerMobile: lead.mobileNumber,
      siteAddress: lead.siteAddress, requiredCapacityKW: capacity, ratePerKW: rate, totalProjectAmount: total,
      paymentMode: input.paymentMode, panelBrand: input.panelBrand, panelTechnology: input.panelTechnology,
      quotationDate, quotationNumber, version, termsAndConditions: input.termsAndConditions, authorizedSignatory: env.quotationAuthorizedSignatory
    });
    const key = `quotations/${lead._id.toString()}/${quotationNumber}-${randomUUID()}.pdf`;
    await quotationStorageService.upload(key, pdf, { lead: lead._id.toString(), quotation: quotationNumber });
    try {
      const quote = await QuotationModel.create({
        quotationNumber, lead: lead._id, ...(customer ? { customer: customer._id } : {}), version,
        customerName: lead.customerName, customerMobile: lead.mobileNumber, siteAddress: lead.siteAddress,
        requiredCapacityKW: Types.Decimal128.fromString(capacity.toFixed(3)),
        ratePerKW: Types.Decimal128.fromString(rate.toFixed(2)),
        totalProjectAmount: Types.Decimal128.fromString(total.toFixed(2)),
        paymentMode: input.paymentMode, panelBrand: input.panelBrand, panelTechnology: input.panelTechnology,
        quotationDate, termsAndConditions: input.termsAndConditions, authorizedCompanyDetails: [companyDetails, env.quotationAuthorizedSignatory].filter(Boolean).join(' | '),
        s3Key: key, fileSize: pdf.byteLength, generatedBy: actorId, status: 'GENERATED'
      });
      await QuotationModel.updateMany({ lead: lead._id, _id: { $ne: quote._id }, status: 'GENERATED' }, { $set: { status: 'SUPERSEDED' } });
      return publicQuotation(quote.toObject() as unknown as Record<string, unknown>);
    } catch (error) {
      await quotationStorageService.delete(key);
      if ((error as { code?: number }).code === 11000) throw new AppError('A quotation version was created concurrently; retry to create the next version', 409);
      throw error;
    }
  },
  async list(actorId: Types.ObjectId, pagination: PaginationInput, filters: RecordListFilters & { leadId?: string }) {
    let leadIds = await leadScope(actorId);
    if (filters.employeeName) {
      const accessibleEmployees = await accessibleEmployeeScope(actorId);
      const employeeIds = await resolveEmployeeScope(actorId, filters.employeeName, accessibleEmployees);
      const leadQuery: Record<string, unknown> = { creatorId: { $in: employeeIds ?? [] } };
      if (leadIds) leadQuery._id = { $in: leadIds };
      leadIds = await LeadModel.find(leadQuery).distinct('_id');
    }
    const branchId = await resolveBranchId(filters.branchId);
    if (branchId) {
      const leadQuery: Record<string, unknown> = { branch: branchId };
      if (leadIds) leadQuery._id = { $in: leadIds };
      leadIds = await LeadModel.find(leadQuery).distinct('_id');
    }
    const query: Record<string, unknown> = {};
    if (leadIds) query.lead = { $in: leadIds };
    if (filters.leadId) {
      const leadObjectId = parseId(filters.leadId, 'lead ID');
      const lead = await LeadModel.findById(leadObjectId).select('creatorId').lean();
      if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'quotation')) throw new AppError('Lead not found', 404);
      query.lead = leadIds
        ? { $in: leadIds.filter((id) => id.equals(leadObjectId)) }
        : leadObjectId;
    }
    Object.assign(query, dateRange('quotationDate', filters));
    const [data, total] = await Promise.all([
      QuotationModel.find(query).select('-s3Key').populate('lead', 'leadCode customerName mobileNumber status').populate('customer', 'customerCode').populate('generatedBy', 'employeeCode firstName lastName').sort({ lead: 1, version: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      QuotationModel.countDocuments(query)
    ]);
    return { data, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },
  async get(actorId: Types.ObjectId, quoteId: string) {
    const { quote } = await assertQuotationAccess(actorId, quoteId);
    return publicQuotation(quote.toObject() as unknown as Record<string, unknown>);
  },
  async downloadUrl(actorId: Types.ObjectId, quoteId: string) {
    const { quote } = await assertQuotationAccess(actorId, quoteId);
    const url = await quotationStorageService.downloadUrl(quote.s3Key, `${quote.quotationNumber}.pdf`);
    return { url, expiresInSeconds: 300 };
  },
  async downloadFile(actorId: Types.ObjectId, quoteId: string) {
    const { quote } = await assertQuotationAccess(actorId, quoteId);
    return { body: await quotationStorageService.download(quote.s3Key), fileName: `${quote.quotationNumber}.pdf` };
  },
  async generateBrochure(actorId: Types.ObjectId) {
    const code = await nextNumber('BR');
    const pdf = await generateBrochurePdf();
    const key = `brochures/${code}-${randomUUID()}.pdf`;
    await quotationStorageService.upload(key, pdf, { brochure: code });
    try {
      const brochure = await BrochureModel.create({ brochureCode: code, version: 1, s3Key: key, fileSize: pdf.byteLength, generatedBy: actorId });
      return { id: brochure._id, brochureCode: code, createdAt: brochure.createdAt, fileSize: brochure.fileSize, downloadUrl: await quotationStorageService.downloadUrl(key, `${code}.pdf`) };
    } catch (error) { await quotationStorageService.delete(key); throw error; }
  },
  async brochureDownloadUrl(actorId: Types.ObjectId, brochureId: string) {
    if (!Types.ObjectId.isValid(brochureId)) throw new AppError('Invalid brochure ID', 400);
    const brochure = await BrochureModel.findById(brochureId).select('s3Key brochureCode');
    if (!brochure) throw new AppError('Brochure not found', 404);
    return { url: await quotationStorageService.downloadUrl(brochure.s3Key, `${brochure.brochureCode}.pdf`), expiresInSeconds: 300 };
  },
  async shareQuotation(actorId: Types.ObjectId, quoteId: string, mobileNumber: string, brochureId?: string) {
    const phone = whatsappNumber(mobileNumber);
    const { quote } = await assertQuotationAccess(actorId, quoteId);
    let brochureLink: { url: string; expiresAt: Date } | undefined;
    let brochure;
    if (brochureId) {
      if (!Types.ObjectId.isValid(brochureId)) throw new AppError('Invalid brochure ID', 400);
      brochure = await BrochureModel.findById(brochureId);
      if (!brochure) throw new AppError('Brochure not found', 404);
    }
    const quoteLink = await createShareLink('QUOTATION', quote._id, quote.s3Key, `${quote.quotationNumber}.pdf`, actorId);
    if (brochure) brochureLink = await createShareLink('BROCHURE', brochure._id, brochure.s3Key, `${brochure.brochureCode}.pdf`, actorId);
    await QuotationShareModel.create({ quotation: quote._id, ...(brochure ? { brochure: brochure._id } : {}), sharedBy: actorId, recipientMobileLast4: digitsOnly(mobileNumber).slice(-4) });
    const message = [`Sunvika Private Limited quotation ${quote.quotationNumber}: ${quoteLink.url}`, ...(brochureLink ? [`Solar brochure: ${brochureLink.url}`] : [])].join('\n');
    return { whatsappUrl: whatsappUrl(phone, message), expiresAt: brochureLink && brochureLink.expiresAt < quoteLink.expiresAt ? brochureLink.expiresAt : quoteLink.expiresAt, deliveryStatus: 'NOT_SENT' as const };
  },
  async shareBrochure(actorId: Types.ObjectId, brochureId: string, mobileNumber: string) {
    const phone = whatsappNumber(mobileNumber);
    if (!Types.ObjectId.isValid(brochureId)) throw new AppError('Invalid brochure ID', 400);
    const brochure = await BrochureModel.findById(brochureId);
    if (!brochure) throw new AppError('Brochure not found', 404);
    const shareLink = await createShareLink('BROCHURE', brochure._id, brochure.s3Key, `${brochure.brochureCode}.pdf`, actorId);
    await QuotationShareModel.create({ brochure: brochure._id, sharedBy: actorId, recipientMobileLast4: digitsOnly(mobileNumber).slice(-4) });
    return { whatsappUrl: whatsappUrl(phone, `Sunvika Private Limited solar brochure: ${shareLink.url}`), expiresAt: shareLink.expiresAt, deliveryStatus: 'NOT_SENT' as const };
  },
  async shareHistory(actorId: Types.ObjectId, quoteId: string) {
    const { quote } = await assertQuotationAccess(actorId, quoteId);
    return QuotationShareModel.find({ quotation: quote._id }).populate('sharedBy', 'employeeCode firstName lastName').sort({ linkCreatedAt: -1 }).lean();
  },
  async publicShare(token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new AppError('Share link is invalid or expired', 404);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const link = await PublicShareLinkModel.findOneAndUpdate({ tokenHash, revokedAt: null, expiresAt: { $gt: now } }, { $inc: { accessCount: 1 }, $set: { lastAccessedAt: now } }, { new: true });
    if (!link) throw new AppError('Share link is invalid or expired', 404);
    return quotationStorageService.downloadUrl(link.s3Key, link.fileName, 300);
  }
};
