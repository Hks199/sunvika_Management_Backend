import express from 'express';
import { Router } from 'express';
import { env } from '../../../config/env.config.js';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { validateBody, validateQuery } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/customer.controller.js';
import { completeDocumentUploadSchema, convertLeadSchema, createDocumentUploadSchema, createLeadConversionUploadsSchema, customerListQuerySchema, updateCustomerSchema, verifyDocumentSchema } from '../validations/customer.validation.js';

export const customerRouter = Router();
customerRouter.use(authenticate);
customerRouter.post('/from-lead/:leadId/document-upload-urls', requirePermission('customers.create'), validateBody(createLeadConversionUploadsSchema), controller.createLeadConversionUploadUrls);
customerRouter.put('/from-lead/:leadId/document-uploads/:uploadId', requirePermission('customers.create'), express.raw({
  type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  limit: env.customerDocumentMaxSizeBytes
}), controller.uploadLeadConversionDocument);
customerRouter.post('/from-lead/:leadId', requirePermission('customers.create'), validateBody(convertLeadSchema), controller.convert);
customerRouter.get('/', requirePermission('customers.read'), validateQuery(customerListQuerySchema), controller.list);
customerRouter.get('/:customerId/timeline', requirePermission('customers.read'), controller.timeline);
customerRouter.get('/:customerId/documents', requirePermission('customers.read'), controller.documents);
customerRouter.post('/:customerId/documents/upload-url', requirePermission('customers.create'), validateBody(createDocumentUploadSchema), controller.createDocumentUpload);
customerRouter.post('/:customerId/documents/complete', requirePermission('customers.create'), validateBody(completeDocumentUploadSchema), controller.completeDocumentUpload);
customerRouter.get('/:customerId/documents/:documentId/download-url', requirePermission('customers.read'), controller.documentDownloadUrl);
customerRouter.get('/:customerId/documents/:documentId/preview-url', requirePermission('customers.read'), controller.documentPreviewUrl);
customerRouter.patch('/:customerId/documents/:documentId/verification', requirePermission('customers.update'), validateBody(verifyDocumentSchema), controller.verifyDocument);
customerRouter.get('/:customerId', requirePermission('customers.read'), controller.get);
customerRouter.patch('/:customerId', requirePermission('customers.update'), validateBody(updateCustomerSchema), controller.update);
