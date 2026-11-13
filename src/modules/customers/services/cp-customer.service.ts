import { randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import Joi from 'joi';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { withHierarchyLock } from '../../employees/services/employee.service.js';
import { geographyService } from '../../geography/services/geography.service.js';
import { createLeadSchema } from '../../leads/validations/lead.validation.js';
import { LeadModel } from '../../leads/models/lead.model.js';
import { LeadStatusHistoryModel } from '../../leads/models/lead-status-history.model.js';
import { CustomerModel } from '../models/customer.model.js';
import { CustomerActivityModel } from '../models/customer-activity.model.js';
import { convertLeadSchema } from '../validations/customer.validation.js';
import { customerDocumentService } from './customer-document.service.js';
import { assertCpCustomerAccess } from './cp-customer-access.service.js';

export const cpCustomerSchema = createLeadSchema.concat(convertLeadSchema)
  .fork(['requiredCapacityKW', 'ratePerKW', 'paymentMode', 'panelBrand', 'panelTechnology'], field => field.required())
  .keys({ requiredCapacityKW: Joi.number().min(0.1).max(100000).required(), confirmed: Joi.boolean().valid(true).strict().required() });
interface ConversionInput {
  customerName: string; mobileNumber: string; alternateNumber?: string; branch: string; state: string; district: string;
  blockOrTehsil?: string; siteAddress: string; requiredCapacityKW: number; ratePerKW: number; paymentMode: string;
  panelBrand: string; panelTechnology: string; remark: string; documentUploadIds: string[]; confirmed: boolean;
}
export const cpCustomerService = {
  async options(actorId: Types.ObjectId, cpId: string) {
    const cp = await assertCpCustomerAccess(actorId, cpId);
    return { customerId: cp.sourceCustomer ?? null, defaults: {
      customerName: [cp.firstName, cp.middleName, cp.lastName].filter(Boolean).join(' '), mobileNumber: cp.mobileNumber,
      siteAddress: cp.address?.addressLine ?? '', state: cp.address?.state ? String(cp.address.state) : '',
      district: cp.address?.district ? String(cp.address.district) : '', branch: cp.branch ? String(cp.branch) : ''
    } };
  },
  async convert(actorId: Types.ObjectId, cpId: string, input: ConversionInput) {
    if (input.confirmed !== true) throw new AppError('Confirm the CP-to-customer conversion', 400);
    return withHierarchyLock(async () => {
      const cp = await assertCpCustomerAccess(actorId, cpId);
      if (cp.sourceCustomer) return { customerId: cp.sourceCustomer, alreadyConverted: true };
      // Also protect records linked in the opposite direction by historical conversions.
      if (await CustomerModel.exists({ cpEmployee: cp._id })) throw new AppError('This CP already has a linked customer. Reload its details.', 409);
      await geographyService.validateEmployeePlacement(input.state, input.district, input.branch);
      const uploads = await customerDocumentService.prepareLeadConversionUploads(actorId, cp._id, input.documentUploadIds, 'cp');
      const customerId = new Types.ObjectId();
      try {
        await mongoose.connection.transaction(async session => {
          // Claim this CP atomically: concurrent requests cannot create a second customer.
          const claimed = await EmployeeModel.updateOne({ _id: cp._id, sourceCustomer: null, isActive: true }, { $set: { sourceCustomer: customerId } }, { session });
          if (!claimed.modifiedCount) throw new AppError('This CP was changed by another request. Reload and retry.', 409);
          const { customerName, mobileNumber, alternateNumber, branch, state, district, blockOrTehsil, siteAddress } = input;
          const identity = { customerName, mobileNumber, ...(alternateNumber ? { alternateNumber } : {}), branch, state, district, ...(blockOrTehsil ? { blockOrTehsil } : {}), siteAddress };
          const leads = await LeadModel.create([{ ...identity, leadCode: `LEAD-CP-${cp._id}`, creatorId: cp._id, status: 'CONVERTED' }], { session });
          const lead = leads[0]!;
          await CustomerModel.create([{ ...identity, _id: customerId, sourceLead: lead._id, customerCode: `CUS-${randomBytes(6).toString('hex').toUpperCase()}`,
            cpEmployee: cp._id, cpConvertedAt: new Date(), cpConvertedBy: actorId, creatorId: cp._id, updatedBy: actorId,
            requiredCapacityKW: input.requiredCapacityKW, ratePerKW: input.ratePerKW, paymentMode: input.paymentMode,
            panelBrand: input.panelBrand, panelTechnology: input.panelTechnology, status: 'ONBOARDING'
          }], { session });
          await customerDocumentService.createDocumentsForConversion(actorId, customerId, uploads, session);
          await LeadStatusHistoryModel.create([{ lead: lead._id, previousStatus: 'PENDING', newStatus: 'CONVERTED', remark: input.remark, changedBy: actorId }], { session });
          await CustomerActivityModel.create([{ customer: customerId, action: 'CONVERTED', description: `Customer created from channel partner ${cp.employeeCode}: ${input.remark}`.slice(0, 1000), actor: actorId }], { session });
        });
      } catch (error) {
        await customerDocumentService.revokeLeadConversionUploads(uploads);
        throw error;
      }
      return { customerId, alreadyConverted: false };
    });
  }
};
