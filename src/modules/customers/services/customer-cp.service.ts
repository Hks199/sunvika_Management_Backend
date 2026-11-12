import Joi from 'joi';
import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { RoleModel } from '../../roles/models/role.model.js';
import { withHierarchyLock } from '../../employees/services/employee.service.js';
import { createEmployeeSchema } from '../../employees/validations/employee.validation.js';
import { geographyService } from '../../geography/services/geography.service.js';
import { authService } from '../../auth/services/auth.service.js';
import { CustomerModel } from '../models/customer.model.js';
import { CustomerActivityModel } from '../models/customer-activity.model.js';
import { assertCustomerAccess } from './customer-access.service.js';
import { canConvertCustomerToCp, canChooseCpManager } from './customer-cp.policy.js';

export const customerCpSchema = createEmployeeSchema
  .fork(['roleCode'], schema => schema.valid('CP').default('CP').optional())
  .fork(['employeeCode', 'profileImageUploadId'], schema => schema.forbidden())
  .keys({ confirmed: Joi.boolean().valid(true).strict().required(), reportingManagerId: Joi.string().hex().length(24) });
interface CpInput { firstName: string; lastName: string; middleName?: string; email: string; mobileNumber: string;
  address: { addressLine: string; state: string; district: string; city?: string; pincode?: string }; branch?: string; reportingManagerId?: string; confirmed: boolean; }
function customerId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError('Customer not found', 404);
  return new Types.ObjectId(value);
}
async function actor(actorId: Types.ObjectId) {
  const employee = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role').lean();
  const role = employee ? await RoleModel.findOne({ _id: employee.role, isActive: true }).select('code').lean() : null;
  if (!role || !canConvertCustomerToCp(role.code)) throw new AppError('Only MD, CP Head or RM can convert a customer to CP', 403);
  return role.code;
}
async function managers(actorId: Types.ObjectId, code: string) {
  const rmRole = await RoleModel.findOne({ code: 'RM', isActive: true }).select('_id').lean();
  if (!rmRole) return [];
  return EmployeeModel.find({ role: rmRole._id, isActive: true,
    ...(code === 'RM' ? { _id: actorId } : code === 'CP_HEAD' ? { hierarchyPath: actorId } : {})
  }).select('_id firstName lastName employeeCode').sort({ firstName: 1 }).lean();
}
export const customerCpService = {
  async options(actorId: Types.ObjectId, id: string) {
    const code = await actor(actorId);
    const customer = await assertCustomerAccess(actorId, customerId(id));
    const existing = await EmployeeModel.findOne({ sourceCustomer: customer._id }).select('_id employeeCode firstName lastName email reportingTo').lean();
    return { managers: await managers(actorId, code), cpEmployee: customer.cpEmployee ?? null,
      defaults: { ...(existing ? { firstName: existing.firstName, lastName: existing.lastName, email: existing.email, reportingManagerId: existing.reportingTo ? String(existing.reportingTo) : undefined } : {}), customerName: customer.customerName, mobileNumber: customer.mobileNumber, addressLine: customer.siteAddress,
        state: String(customer.state), district: String(customer.district), branch: String(customer.branch) } };
  },
  async convert(actorId: Types.ObjectId, id: string, input: CpInput) {
    if (input.confirmed !== true) throw new AppError('Confirm the customer-to-CP conversion before continuing', 400);
    const result = await withHierarchyLock(async () => {
      const code = await actor(actorId);
      const customer = await assertCustomerAccess(actorId, customerId(id));
      if (customer.cpEmployee) return { employeeId: customer.cpEmployee, alreadyConverted: true };
      const managerId = code === 'RM' ? String(actorId) : input.reportingManagerId;
      if (!managerId || !Types.ObjectId.isValid(managerId)) throw new AppError('Select an active RM for the new CP', 400);
      const [rmRole, cpRole] = await Promise.all([
        RoleModel.findOne({ code: 'RM', isActive: true }).select('_id').lean(), RoleModel.findOne({ code: 'CP', isActive: true }).select('_id').lean()
      ]);
      const manager = rmRole ? await EmployeeModel.findOne({ _id: managerId, role: rmRole._id, isActive: true }).select('_id hierarchyPath').lean() : null;
      if (!manager || !cpRole || !canChooseCpManager(code, String(actorId), managerId, manager.hierarchyPath.map(String))) throw new AppError('The selected RM is outside your permitted hierarchy', 403);
      if (code === 'RM' && input.reportingManagerId && input.reportingManagerId !== String(actorId)) throw new AppError('RM-created CP accounts must report to that RM', 403);
      await geographyService.validateEmployeePlacement(input.address.state, input.address.district, input.branch);
      // Unique sourceCustomer and deterministic code make interrupted/repeated conversions recoverable.
      let employee = await EmployeeModel.findOne({ sourceCustomer: customer._id }).select('_id reportingTo email').lean();
      if (employee && (!employee.reportingTo?.equals(manager._id) || employee.email !== input.email.toLowerCase())) throw new AppError('A conversion is already in progress with different account details. Use the existing account details to retry', 409);
      if (!employee) {
        const created = await EmployeeModel.create({ sourceCustomer: customer._id, employeeCode: `CP-CUS-${customer._id}`.toUpperCase(),
          firstName: input.firstName, lastName: input.lastName, ...(input.middleName ? { middleName: input.middleName } : {}),
          email: input.email.toLowerCase(), mobileNumber: input.mobileNumber,
          address: { ...input.address, state: new Types.ObjectId(input.address.state), district: new Types.ObjectId(input.address.district) },
          ...(input.branch ? { branch: new Types.ObjectId(input.branch) } : {}), role: cpRole._id, reportingTo: manager._id,
          hierarchyPath: [...manager.hierarchyPath, manager._id], createdBy: actorId, isActive: true, isVerified: false });
        employee = created.toObject();
      }
      await CustomerActivityModel.findOneAndUpdate({ customer: customer._id, action: 'CP_ACCOUNT_CREATED' },
        { $setOnInsert: { description: 'Customer linked to a Channel Partner employee account; existing business history preserved', actor: actorId, occurredAt: new Date() } }, { upsert: true });
      const linked = await CustomerModel.updateOne({ _id: customer._id, cpEmployee: null }, { $set: { cpEmployee: employee._id, cpConvertedAt: new Date(), cpConvertedBy: actorId } });
      if (!linked.matchedCount) throw new AppError('Customer conversion changed. Refresh before retrying', 409);
      return { employeeId: employee._id, alreadyConverted: false };
    });
    // Invitation delivery is separate from account creation; failures never create a second account.
    let invitationSent = false;
    if (!result.alreadyConverted) {
      try { invitationSent = await authService.createInvitation(String(result.employeeId), String(actorId)); }
      catch { invitationSent = false; }
    }
    return { _id: customerId(id), ...result, invitationSent };
  }
};
