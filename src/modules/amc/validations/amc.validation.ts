import Joi from 'joi';

const objectId = Joi.string().hex().length(24);
const money = Joi.number().greater(0).max(100000000000);

export const createContractSchema = Joi.object({
  customerId: objectId.required(), startDate: Joi.date().iso().required(), expiryDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
  amount: money.required(), currency: Joi.string().trim().uppercase().length(3).default('INR'), assignedEmployeeId: objectId
}).required();

export const renewContractSchema = Joi.object({
  startDate: Joi.date().iso().required(), expiryDate: Joi.date().iso().greater(Joi.ref('startDate')).required(), amount: money.required(),
  currency: Joi.string().trim().uppercase().length(3).default('INR'), assignedEmployeeId: objectId
}).required();

export const contractListSchema = Joi.object({
  customerId: objectId, status: Joi.string().valid('ACTIVE', 'EXPIRED', 'CANCELLED'),
  renewalStatus: Joi.string().valid('NOT_DUE', 'UPCOMING', 'RENEWED', 'DECLINED'),
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(false);

export const renewalListSchema = Joi.object({ days: Joi.number().integer().min(1).max(365).default(60), page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20) }).unknown(false);
export const renewalStatusSchema = Joi.object({ renewalStatus: Joi.string().valid('DECLINED', 'NOT_DUE').required() }).required();
export const createScheduleSchema = Joi.object({ scheduledAt: Joi.date().iso().required(), assignedEmployeeId: objectId.required(), notes: Joi.string().trim().max(1000) }).required();
export const updateScheduleSchema = Joi.object({ scheduledAt: Joi.date().iso(), assignedEmployeeId: objectId, status: Joi.string().valid('SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED'), notes: Joi.string().trim().max(1000).allow(null) }).min(1).required();
export const createServiceSchema = Joi.object({ scheduleId: objectId, serviceDate: Joi.date().iso().max('now').required(), performedBy: objectId.required(), outcome: Joi.string().trim().min(1).max(120).required(), notes: Joi.string().trim().max(2000), partsUsed: Joi.array().items(Joi.string().trim().min(1).max(120)).max(50).default([]) }).required();
export const paginationSchema = Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20) }).unknown(false);
