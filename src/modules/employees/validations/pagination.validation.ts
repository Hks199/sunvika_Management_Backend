import Joi from 'joi';
const objectId = Joi.string().hex().length(24);
export const paginationSchema = Joi.object({
  directory: Joi.string().valid('all', 'staff', 'cp').default('all'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  stateId: objectId, districtId: objectId, branchId: objectId,
  dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(),
  employeeName: Joi.string().trim().min(1).max(100),
  cpType: Joi.string().valid('all', 'cp_only', 'customer_cp').default('all')
}).unknown(false).custom((value, helpers) => value.dateFrom && value.dateTo && value.dateFrom > value.dateTo
  ? helpers.error('date.range') : value).messages({ 'date.range': 'dateFrom must be on or before dateTo' });
