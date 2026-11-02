import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { validateBody, validateQuery } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/quotation.controller.js';
import { createQuotationSchema, quotationListQuerySchema, shareBrochureSchema, shareQuotationSchema } from '../validations/quotation.validation.js';

export const quotationRouter = Router();
quotationRouter.use(authenticate);
quotationRouter.post('/brochures', requirePermission('quotations.create'), controller.generateBrochure);
quotationRouter.get('/brochures/:brochureId/download-url', requirePermission('quotations.read'), controller.brochureDownloadUrl);
quotationRouter.post('/brochures/:brochureId/share', requirePermission('quotations.share'), validateBody(shareBrochureSchema), controller.shareBrochure);
quotationRouter.post('/', requirePermission('quotations.create'), validateBody(createQuotationSchema), controller.create);
quotationRouter.get('/', requirePermission('quotations.read'), validateQuery(quotationListQuerySchema), controller.list);
quotationRouter.get('/:quotationId/shares', requirePermission('quotations.read'), controller.shareHistory);
quotationRouter.get('/:quotationId/file', requirePermission('quotations.read'), controller.downloadFile);
quotationRouter.get('/:quotationId/download-url', requirePermission('quotations.read'), controller.downloadUrl);
quotationRouter.post('/:quotationId/share', requirePermission('quotations.share'), validateBody(shareQuotationSchema), controller.shareQuotation);
quotationRouter.get('/:quotationId', requirePermission('quotations.read'), controller.get);
