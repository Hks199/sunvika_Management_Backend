import { Types } from 'mongoose';
import { AppError } from '../../../utils/app-error.util.js';
import { EmployeeModel } from '../../employees/models/employee.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { assertCustomerAccess, customerScope } from '../../customers/services/customer-access.service.js';
import { AMCContractModel } from '../models/amc-contract.model.js';
import { AMCScheduleModel } from '../models/amc-schedule.model.js';
import { AMCServiceHistoryModel } from '../models/amc-service-history.model.js';
import { AMCSequenceModel } from '../models/amc-sequence.model.js';

type ContractInput = { startDate: Date; expiryDate: Date; amount: number; currency: string; assignedEmployeeId?: string };
type Pagination = { page?: number; limit?: number };

async function assertEmployeeInScope(actorId: Types.ObjectId, employeeId: string) {
  if (!Types.ObjectId.isValid(employeeId) || !await hierarchyService.canAccessEmployee(actorId, employeeId)) throw new AppError('Assigned employee is outside your authorized hierarchy', 403);
  const employee = await EmployeeModel.findOne({ _id: employeeId, isActive: true }).select('_id').lean();
  if (!employee) throw new AppError('Assigned employee is unavailable', 400);
  return employee._id;
}

async function nextContractNumber() {
  const year = new Date().getUTCFullYear();
  const sequence = await AMCSequenceModel.findOneAndUpdate({ _id: `AMC-${year}` }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return `AMC-${year}-${String(sequence.value).padStart(6, '0')}`;
}

async function createForCustomer(customerId: Types.ObjectId, input: ContractInput, actorId: Types.ObjectId, renewalOf?: Types.ObjectId) {
  const assignedEmployee = input.assignedEmployeeId ? await assertEmployeeInScope(actorId, input.assignedEmployeeId) : undefined;
  return AMCContractModel.create({ customer: customerId, contractNumber: await nextContractNumber(), startDate: input.startDate, expiryDate: input.expiryDate, amount: input.amount, currency: input.currency, createdBy: actorId, ...(assignedEmployee ? { assignedEmployee } : {}), ...(renewalOf ? { renewalOf } : {}) });
}

async function assertContractAccess(actorId: Types.ObjectId, contractId: string) {
  if (!Types.ObjectId.isValid(contractId)) throw new AppError('AMC contract not found', 404);
  const contract = await AMCContractModel.findById(contractId);
  if (!contract) throw new AppError('AMC contract not found', 404);
  await assertCustomerAccess(actorId, contract.customer);
  return contract;
}

export const amcService = {
  async create(input: ContractInput & { customerId: string }, actorId: Types.ObjectId) {
    if (!Types.ObjectId.isValid(input.customerId)) throw new AppError('Customer not found', 404);
    await assertCustomerAccess(actorId, new Types.ObjectId(input.customerId));
    return createForCustomer(new Types.ObjectId(input.customerId), input, actorId);
  },
  async list(filters: Pagination & { customerId?: string; status?: string; renewalStatus?: string }, actorId: Types.ObjectId) {
    const customerIds = await customerScope(actorId);
    const query: Record<string, unknown> = {};
    if (customerIds) query.customer = { $in: customerIds };
    if (filters.customerId) {
      if (!Types.ObjectId.isValid(filters.customerId)) throw new AppError('Customer not found', 404);
      await assertCustomerAccess(actorId, new Types.ObjectId(filters.customerId));
      query.customer = new Types.ObjectId(filters.customerId);
    }
    if (filters.status) query.status = filters.status;
    if (filters.renewalStatus) query.renewalStatus = filters.renewalStatus;
    const page = filters.page ?? 1, limit = filters.limit ?? 20;
    const [data, total] = await Promise.all([AMCContractModel.find(query).populate('customer', 'customerCode customerName').populate('assignedEmployee', 'employeeCode firstName lastName').sort({ expiryDate: 1 }).skip((page - 1) * limit).limit(limit).lean(), AMCContractModel.countDocuments(query)]);
    return { data, page, limit, total };
  },
  async get(contractId: string, actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    const [schedules, serviceHistory] = await Promise.all([AMCScheduleModel.find({ contract: contract._id }).populate('assignedEmployee', 'employeeCode firstName lastName').sort({ scheduledAt: 1 }).lean(), AMCServiceHistoryModel.find({ contract: contract._id }).populate('performedBy', 'employeeCode firstName lastName').sort({ serviceDate: -1 }).lean()]);
    return { contract, schedules, serviceHistory };
  },
  async renew(contractId: string, input: ContractInput, actorId: Types.ObjectId) {
    const current = await assertContractAccess(actorId, contractId);
    if (current.status === 'CANCELLED') throw new AppError('Cancelled contracts cannot be renewed', 400);
    if (current.renewalStatus === 'RENEWED') throw new AppError('This contract has already been renewed', 409);
    if (input.startDate <= current.expiryDate) throw new AppError('Renewal must start after the current contract expires', 400);
    const renewed = await createForCustomer(current.customer, { ...input, ...(input.assignedEmployeeId || !current.assignedEmployee ? {} : { assignedEmployeeId: current.assignedEmployee.toString() }) }, actorId, current._id);
    current.renewalStatus = 'RENEWED';
    await current.save();
    return renewed;
  },
  async setRenewalStatus(contractId: string, renewalStatus: 'DECLINED' | 'NOT_DUE', actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    if (contract.renewalStatus === 'RENEWED') throw new AppError('Renewal status cannot be changed after renewal', 409);
    contract.renewalStatus = renewalStatus;
    await contract.save();
    return contract;
  },
  async cancel(contractId: string, actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    if (contract.status !== 'ACTIVE') throw new AppError('Only active contracts can be cancelled', 409);
    contract.status = 'CANCELLED';
    await AMCScheduleModel.updateMany({ contract: contract._id, status: 'SCHEDULED' }, { $set: { status: 'CANCELLED' } });
    contract.nextServiceAt = null;
    await contract.save();
    return contract;
  },
  async upcomingRenewals(filters: Pagination & { days: number }, actorId: Types.ObjectId) {
    const customerIds = await customerScope(actorId);
    const now = new Date();
    const until = new Date(now.getTime() + filters.days * 86400000);
    const scopeFilter = customerIds ? { customer: { $in: customerIds } } : {};
    await AMCContractModel.updateMany({ ...scopeFilter, status: 'ACTIVE', renewalStatus: 'NOT_DUE', expiryDate: { $gte: now, $lte: until } }, { $set: { renewalStatus: 'UPCOMING' } });
    await AMCContractModel.updateMany({ ...scopeFilter, status: 'ACTIVE', expiryDate: { $lt: now } }, { $set: { status: 'EXPIRED' } });
    const query = { ...scopeFilter, status: 'ACTIVE', renewalStatus: { $in: ['NOT_DUE', 'UPCOMING'] }, expiryDate: { $gte: now, $lte: until } };
    const page = filters.page ?? 1, limit = filters.limit ?? 20;
    const [data, total] = await Promise.all([AMCContractModel.find(query).populate('customer', 'customerCode customerName').populate('assignedEmployee', 'employeeCode firstName lastName').sort({ expiryDate: 1 }).skip((page - 1) * limit).limit(limit).lean(), AMCContractModel.countDocuments(query)]);
    return { data, page, limit, total };
  },
  async upcomingSchedules(filters: Pagination & { days: number }, actorId: Types.ObjectId) {
    const customerIds = await customerScope(actorId);
    const now = new Date();
    const until = new Date(now.getTime() + filters.days * 86400000);
    const contracts = await AMCContractModel.find({ status: 'ACTIVE', ...(customerIds ? { customer: { $in: customerIds } } : {}) }).distinct('_id');
    const query = { contract: { $in: contracts }, status: 'SCHEDULED', scheduledAt: { $gte: now, $lte: until } };
    const page = filters.page ?? 1, limit = filters.limit ?? 20;
    const [data, total] = await Promise.all([AMCScheduleModel.find(query).populate({ path: 'contract', select: 'contractNumber customer', populate: { path: 'customer', select: 'customerCode customerName' } }).populate('assignedEmployee', 'employeeCode firstName lastName').sort({ scheduledAt: 1 }).skip((page - 1) * limit).limit(limit).lean(), AMCScheduleModel.countDocuments(query)]);
    return { data, page, limit, total };
  },
  async addSchedule(contractId: string, input: { scheduledAt: Date; assignedEmployeeId: string; notes?: string }, actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    if (contract.status !== 'ACTIVE' || input.scheduledAt < contract.startDate || input.scheduledAt > contract.expiryDate) throw new AppError('Schedule date must fall within an active contract', 400);
    const assignedEmployee = await assertEmployeeInScope(actorId, input.assignedEmployeeId);
    const schedule = await AMCScheduleModel.create({ contract: contract._id, scheduledAt: input.scheduledAt, assignedEmployee, notes: input.notes, createdBy: actorId });
    if (!contract.nextServiceAt || schedule.scheduledAt < contract.nextServiceAt) contract.nextServiceAt = schedule.scheduledAt;
    contract.assignedEmployee = assignedEmployee;
    await contract.save();
    return schedule;
  },
  async updateSchedule(contractId: string, scheduleId: string, input: { scheduledAt?: Date; assignedEmployeeId?: string; status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'MISSED'; notes?: string | null }, actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    const schedule = await AMCScheduleModel.findOne({ _id: scheduleId, contract: contract._id });
    if (!schedule) throw new AppError('Maintenance schedule not found', 404);
    if (input.scheduledAt) {
      if (input.scheduledAt < contract.startDate || input.scheduledAt > contract.expiryDate) throw new AppError('Schedule date must fall within the contract', 400);
      schedule.scheduledAt = input.scheduledAt;
    }
    if (input.status === 'SCHEDULED' && contract.status !== 'ACTIVE') throw new AppError('Only active contracts can have scheduled maintenance', 400);
    if (input.assignedEmployeeId) schedule.assignedEmployee = await assertEmployeeInScope(actorId, input.assignedEmployeeId);
    if (input.status) schedule.status = input.status;
    if (input.notes !== undefined) schedule.notes = input.notes;
    await schedule.save();
    const next = await AMCScheduleModel.findOne({ contract: contract._id, status: 'SCHEDULED', scheduledAt: { $gte: new Date() } }).sort({ scheduledAt: 1 }).select('scheduledAt assignedEmployee').lean();
    contract.nextServiceAt = next?.scheduledAt ?? null;
    if (next) contract.assignedEmployee = next.assignedEmployee;
    await contract.save();
    return schedule;
  },
  async recordService(contractId: string, input: { scheduleId?: string; serviceDate: Date; performedBy: string; outcome: string; notes?: string; partsUsed: string[] }, actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    if (input.serviceDate < contract.startDate || input.serviceDate > contract.expiryDate) throw new AppError('Service date must fall within the contract', 400);
    const performedBy = await assertEmployeeInScope(actorId, input.performedBy);
    let schedule: Types.ObjectId | undefined;
    if (input.scheduleId) {
      if (!Types.ObjectId.isValid(input.scheduleId)) throw new AppError('Maintenance schedule not found', 404);
      const scheduled = await AMCScheduleModel.findOne({ _id: input.scheduleId, contract: contract._id });
      if (!scheduled) throw new AppError('Maintenance schedule not found', 404);
      scheduled.status = 'COMPLETED';
      await scheduled.save();
      schedule = scheduled._id;
    }
    const record = await AMCServiceHistoryModel.create({ contract: contract._id, ...(schedule ? { schedule } : {}), serviceDate: input.serviceDate, performedBy, outcome: input.outcome, notes: input.notes, partsUsed: input.partsUsed, createdBy: actorId });
    if (schedule) {
      const next = await AMCScheduleModel.findOne({ contract: contract._id, status: 'SCHEDULED', scheduledAt: { $gte: new Date() } }).sort({ scheduledAt: 1 }).select('scheduledAt assignedEmployee').lean();
      contract.nextServiceAt = next?.scheduledAt ?? null;
      if (next) contract.assignedEmployee = next.assignedEmployee;
      await contract.save();
    }
    return record;
  },
  async serviceHistory(contractId: string, filters: Pagination, actorId: Types.ObjectId) {
    const contract = await assertContractAccess(actorId, contractId);
    const page = filters.page ?? 1, limit = filters.limit ?? 20;
    const [data, total] = await Promise.all([AMCServiceHistoryModel.find({ contract: contract._id }).populate('performedBy', 'employeeCode firstName lastName').sort({ serviceDate: -1 }).skip((page - 1) * limit).limit(limit).lean(), AMCServiceHistoryModel.countDocuments({ contract: contract._id })]);
    return { data, page, limit, total };
  }
};
