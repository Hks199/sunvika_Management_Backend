import Joi from 'joi';
import { LEAD_STATUSES } from '../constants/lead-status.js';

const objectId = Joi.string().hex().length(24);
const mobile = Joi.string().trim().pattern(/^\+?[0-9]{10,15}$/);
export const createLeadSchema = Joi.object({
  customerName: Joi.string().trim().min(2).max(160).required(), mobileNumber: mobile.required(), alternateNumber: mobile,
  branch: objectId.required(), state: objectId.required(), district: objectId.required(), blockOrTehsil: Joi.string().trim().max(120), siteAddress: Joi.string().trim().min(3).max(1000).required()
}).required();
export const updateLeadSchema = Joi.object({
  customerName: Joi.string().trim().min(2).max(160), mobileNumber: mobile, alternateNumber: mobile.allow(''),
  branch: objectId, state: objectId, district: objectId, blockOrTehsil: Joi.string().trim().max(120).allow(''), siteAddress: Joi.string().trim().min(3).max(1000)
}).min(1).required();
export const changeLeadStatusSchema = Joi.object({
  status: Joi.string().valid(...LEAD_STATUSES).required(), remark: Joi.string().trim().min(1).max(1000).required(),
  nextFollowUpDate: Joi.date().iso().greater('now').when('status', { is: 'NEED_FOLLOWUP', then: Joi.required(), otherwise: Joi.forbidden() }),
  quotation: Joi.object({
    requiredCapacityKW: Joi.number().positive().max(100000).required(),
    ratePerKW: Joi.number().min(0).max(100000000).required(),
    paymentMode: Joi.string().trim().min(2).max(100).required(),
    panelBrand: Joi.string().trim().min(1).max(100).required(),
    panelTechnology: Joi.string().trim().min(1).max(100).required(),
    termsAndConditions: Joi.string().trim().min(10).max(5000).required()
  }).when('status', { is: 'QUOTATION_SENT', then: Joi.optional(), otherwise: Joi.forbidden() })
}).required();
export const assignLeadSchema = Joi.object({ assignedTo: objectId.required() }).required();
export const leadListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid(...LEAD_STATUSES), search: Joi.string().trim().max(100),
  branchId: objectId, dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(), employeeName: Joi.string().trim().min(1).max(100)
}).unknown(false).custom((value, helpers) => value.dateFrom && value.dateTo && value.dateFrom > value.dateTo
  ? helpers.error('date.range')
  : value).messages({ 'date.range': 'dateFrom must be on or before dateTo' });
export const followUpQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20),
  branchId: objectId, dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(), employeeName: Joi.string().trim().min(1).max(100)
}).unknown(false).custom((value, helpers) => value.dateFrom && value.dateTo && value.dateFrom > value.dateTo
  ? helpers.error('date.range')
  : value).messages({ 'date.range': 'dateFrom must be on or before dateTo' });
