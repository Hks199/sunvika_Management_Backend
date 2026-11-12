import { Types } from 'mongoose';
import { CustomerModel } from '../models/customer.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
// Only this customer's source lead is shared; unrelated records owned by the original creator stay private.
export async function linkedCustomerLeadIds(employeeIds: Types.ObjectId[]): Promise<Types.ObjectId[]> {
  return CustomerModel.find({ cpEmployee: { $in: employeeIds } }).distinct('sourceLead');
}
export async function canAccessConvertedLead(actorId: Types.ObjectId, leadId: Types.ObjectId): Promise<boolean> {
  const customer = await CustomerModel.findOne({ sourceLead: leadId, cpEmployee: { $type: 'objectId' } }).select('cpEmployee').lean();
  return Boolean(customer?.cpEmployee && await hierarchyService.canAccessEmployee(actorId, customer.cpEmployee));
}
