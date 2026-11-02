import type { RequestHandler } from 'express';
import { AppError } from '../../../utils/app-error.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { customerDocumentService } from '../services/customer-document.service.js';
import { customerService } from '../services/customer.service.js';

function actorId(req: Parameters<RequestHandler>[0]) {
  if (!req.auth) throw new AppError('Authentication required', 401);
  return req.auth.employeeId;
}
function handler(message: string, operation: (req: Parameters<RequestHandler>[0]) => Promise<unknown>, status = 200): RequestHandler {
  return async (req, res, next) => {
    try { return sendSuccess(res, message, await operation(req), status); }
    catch (error) { return next(error); }
  };
}
export const convert = handler('Lead converted to customer successfully', (req) => customerService.convert(actorId(req), req.params.leadId as string, req.body), 201);
export const createLeadConversionUploadUrls = handler('Lead conversion document upload URLs created', (req) => customerDocumentService.createLeadConversionUploadUrls(actorId(req), req.params.leadId as string, req.body.documents), 201);
export const uploadLeadConversionDocument: RequestHandler = async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw new AppError('Upload a document file with its matching Content-Type', 400);
    const result = await customerDocumentService.uploadLeadConversionDocument(
      actorId(req),
      req.params.leadId as string,
      req.params.uploadId as string,
      req.get('Content-Type') ?? '',
      req.body
    );
    return sendSuccess(res, 'Lead conversion document uploaded successfully', result);
  } catch (error) {
    return next(error);
  }
};
export const list = handler('Customers fetched successfully', (req) => customerService.list(actorId(req), req.res!.locals.validatedQuery, req.res!.locals.validatedQuery));
export const get = handler('Customer fetched successfully', (req) => customerService.get(actorId(req), req.params.customerId as string));
export const update = handler('Customer updated successfully', (req) => customerService.update(actorId(req), req.params.customerId as string, req.body));
export const timeline = handler('Customer timeline fetched successfully', (req) => customerService.timeline(actorId(req), req.params.customerId as string));
export const documents = handler('Customer documents fetched successfully', (req) => customerDocumentService.list(actorId(req), req.params.customerId as string));
export const createDocumentUpload = handler('Customer document upload URL created', (req) => customerDocumentService.createUploadUrl(actorId(req), req.params.customerId as string, req.body), 201);
export const completeDocumentUpload = handler('Customer document uploaded successfully', (req) => customerDocumentService.completeUpload(actorId(req), req.params.customerId as string, req.body.uploadId as string), 201);
export const documentDownloadUrl = handler('Customer document download URL created', (req) => customerDocumentService.downloadUrl(actorId(req), req.params.customerId as string, req.params.documentId as string));
export const documentPreviewUrl = handler('Customer document preview URL created', (req) => customerDocumentService.previewUrl(actorId(req), req.params.customerId as string, req.params.documentId as string));
export const verifyDocument = handler('Customer document verification updated', (req) => customerDocumentService.verify(actorId(req), req.params.customerId as string, req.params.documentId as string, req.body.status, req.body.remark));
