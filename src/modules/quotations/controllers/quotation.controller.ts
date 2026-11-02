import type { RequestHandler } from 'express';
import { AppError } from '../../../utils/app-error.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { quotationService } from '../services/quotation.service.js';

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
export const create = handler('Quotation generated successfully', (req) => quotationService.create(actorId(req), req.body), 201);
export const list = handler('Quotations fetched successfully', (req) => quotationService.list(actorId(req), req.res!.locals.validatedQuery, req.res!.locals.validatedQuery));
export const get = handler('Quotation fetched successfully', (req) => quotationService.get(actorId(req), req.params.quotationId as string));
export const downloadUrl = handler('Quotation download URL created', (req) => quotationService.downloadUrl(actorId(req), req.params.quotationId as string));
export const downloadFile: RequestHandler = async (req, res, next) => {
  try {
    const { body, fileName } = await quotationService.downloadFile(actorId(req), req.params.quotationId as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/["\\/\r\n]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(Buffer.from(body));
  } catch (error) {
    return next(error);
  }
};
export const generateBrochure = handler('Brochure generated successfully', (req) => quotationService.generateBrochure(actorId(req)), 201);
export const brochureDownloadUrl = handler('Brochure download URL created', (req) => quotationService.brochureDownloadUrl(actorId(req), req.params.brochureId as string));
export const shareQuotation = handler('WhatsApp share link created', (req) => quotationService.shareQuotation(actorId(req), req.params.quotationId as string, req.body.mobileNumber as string, req.body.brochureId as string | undefined));
export const shareBrochure = handler('WhatsApp brochure share link created', (req) => quotationService.shareBrochure(actorId(req), req.params.brochureId as string, req.body.mobileNumber as string));
export const shareHistory = handler('Quotation share activity fetched', (req) => quotationService.shareHistory(actorId(req), req.params.quotationId as string));
export const publicShare: RequestHandler = async (req, res, next) => {
  try { return res.redirect(302, await quotationService.publicShare(req.params.token as string)); }
  catch (error) { return next(error); }
};
