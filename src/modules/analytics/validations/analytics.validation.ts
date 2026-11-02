import Joi from 'joi';
import { LEAD_STATUSES } from '../../leads/constants/lead-status.js';

const objectId = Joi.string().hex().length(24);
export const analyticsFilterSchema = Joi.object({
  dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(),
  branchId: objectId, stateId: objectId, districtId: objectId,
  mhId: objectId, dcId: objectId, rmId: objectId, cpId: objectId,
  leadStatus: Joi.string().valid(...LEAD_STATUSES),
  customerStatus: Joi.string().valid('ONBOARDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'),
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20)
}).oxor('mhId', 'dcId', 'rmId', 'cpId').custom((value, helpers) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) return helpers.error('any.invalid', { message: 'dateFrom must be before or equal to dateTo' });
  return value;
}).unknown(false);
