import Joi from 'joi';

const objectId = Joi.string().hex().length(24);
const location = Joi.object({
  latitude: Joi.number().min(-90).max(90), longitude: Joi.number().min(-180).max(180), address: Joi.string().trim().max(500)
}).and('latitude', 'longitude');

export const createVisitSchema = Joi.object({
  leadId: objectId.required(), visitDate: Joi.date().iso().max('now').required(), remark: Joi.string().trim().min(1).max(2000).required(),
  nextVisitDate: Joi.date().iso().greater('now'), location
}).required();

export const updateVisitSchema = Joi.object({
  visitDate: Joi.date().iso().max('now'), remark: Joi.string().trim().min(1).max(2000),
  nextVisitDate: Joi.date().iso().greater('now').allow(null), location: location.allow(null)
}).min(1).required();

export const visitQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20),
  leadId: objectId, employeeId: objectId, upcoming: Joi.boolean(), overdue: Joi.boolean(),
  branchId: objectId, dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(), employeeName: Joi.string().trim().min(1).max(100)
}).unknown(false).oxor('upcoming', 'overdue').custom((value, helpers) => value.dateFrom && value.dateTo && value.dateFrom > value.dateTo
  ? helpers.error('date.range')
  : value).messages({ 'date.range': 'dateFrom must be on or before dateTo' });

export const visitHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(false);
