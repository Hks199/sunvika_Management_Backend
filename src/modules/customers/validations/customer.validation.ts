import Joi from 'joi';
import { CUSTOMER_DOCUMENT_TYPES } from '../services/customer-document.service.js';

const objectId = Joi.string().hex().length(24);
const projectFields = {
  requiredCapacityKW: Joi.number().positive().max(100000), ratePerKW: Joi.number().min(0).max(100000000),
  paymentMode: Joi.string().trim().min(2).max(100), panelBrand: Joi.string().trim().min(1).max(100), panelTechnology: Joi.string().trim().min(1).max(100)
};
export const convertLeadSchema = Joi.object({
  ...projectFields,
  remark: Joi.string().trim().min(1).max(1000).required(),
  documentUploadIds: Joi.array().items(objectId.required()).length(4).unique().required()
}).required();
export const updateCustomerSchema = Joi.object({
  customerName: Joi.string().trim().min(2).max(160), mobileNumber: Joi.string().trim().pattern(/^\+?[0-9]{10,15}$/), alternateNumber: Joi.string().trim().pattern(/^\+?[0-9]{10,15}$/).allow(''),
  siteAddress: Joi.string().trim().min(3).max(1000), blockOrTehsil: Joi.string().trim().max(120).allow(''), ...projectFields,
  status: Joi.string().valid('ONBOARDING', 'ACTIVE', 'COMPLETED', 'CANCELLED')
}).min(1).required();
export const customerListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20), search: Joi.string().trim().max(100),
  branchId: objectId, dateFrom: Joi.date().iso(), dateTo: Joi.date().iso(), employeeName: Joi.string().trim().min(1).max(100)
}).unknown(false).custom((value, helpers) => value.dateFrom && value.dateTo && value.dateFrom > value.dateTo
  ? helpers.error('date.range')
  : value).messages({ 'date.range': 'dateFrom must be on or before dateTo' });
export const createDocumentUploadSchema = Joi.object({
  documentType: Joi.string().valid(...CUSTOMER_DOCUMENT_TYPES).required(), fileName: Joi.string().trim().min(1).max(180).required(),
  mimeType: Joi.string().valid('application/pdf', 'image/jpeg', 'image/png', 'image/webp').required(), fileSize: Joi.number().integer().min(1).max(20971520).required()
}).required();
export const createLeadConversionUploadsSchema = Joi.object({
  documents: Joi.array().items(Joi.object({
    documentType: Joi.string().valid(...CUSTOMER_DOCUMENT_TYPES).required(),
    fileName: Joi.string().trim().min(1).max(180).required(),
    mimeType: Joi.string().valid('application/pdf', 'image/jpeg', 'image/png', 'image/webp').required(),
    fileSize: Joi.number().integer().min(1).max(20971520).required()
  }).required()).length(4).unique((a, b) => a.documentType === b.documentType).required()
}).required();
export const completeDocumentUploadSchema = Joi.object({ uploadId: objectId.required() }).required();
export const verifyDocumentSchema = Joi.object({ status: Joi.string().valid('VERIFIED', 'REJECTED').required(), remark: Joi.string().trim().max(1000).allow('') }).required();
