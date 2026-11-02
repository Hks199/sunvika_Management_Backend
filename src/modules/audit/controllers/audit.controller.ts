import type { RequestHandler } from 'express';
import { AppError } from '../../../utils/app-error.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { auditService } from '../services/audit.service.js';

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    return sendSuccess(res, 'Audit records retrieved', await auditService.list(res.locals.validatedQuery));
  } catch (error) { return next(error); }
};
