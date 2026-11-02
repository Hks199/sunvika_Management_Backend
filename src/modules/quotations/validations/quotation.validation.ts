import Joi from 'joi';

const objectId = Joi.string().hex().length(24);
const mobile = Joi.string().trim().pattern(/^\+?[0-9]{10,15}$/);
export const createQuotationSchema = Joi.object({
  leadId: objectId.required(), requiredCapacityKW: Joi.number().positive().max(100000).required(),
  ratePerKW: Joi.number().min(0).max(100000000).required(), paymentMode: Joi.string().trim().min(2).max(100).required(),
  panelBrand: Joi.string().trim().min(1).max(100).required(), panelTechnology: Joi.string().trim().min(1).max(100).required(),
  termsAndConditions: Joi.string().trim().min(10).max(5000).required()
}).required();
export const quotationListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20), leadId: objectId,
  branchId: objectId, dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(), employeeName: Joi.string().trim().min(1).max(100)
}).unknown(false).custom((value, helpers) => value.dateFrom && value.dateTo && value.dateFrom > value.dateTo
  ? helpers.error('date.range')
  : value).messages({ 'date.range': 'dateFrom must be on or before dateTo' });
export const shareQuotationSchema = Joi.object({ mobileNumber: mobile.required(), brochureId: objectId }).required();
export const shareBrochureSchema = Joi.object({ mobileNumber: mobile.required() }).required();
