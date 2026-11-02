import Joi from 'joi';

const objectId = Joi.string().hex().length(24);
export const auditListSchema = Joi.object({
  module: Joi.string().trim().lowercase().max(80), action: Joi.string().trim().max(200), resourceType: Joi.string().trim().max(80),
  resourceId: objectId, performedBy: objectId, dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(50)
}).custom((value, helpers) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) return helpers.error('any.invalid', { message: 'dateFrom must be before or equal to dateTo' });
  return value;
}).unknown(false);
