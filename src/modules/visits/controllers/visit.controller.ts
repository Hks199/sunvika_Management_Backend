import type { RequestHandler } from 'express';
import { AppError } from '../../../utils/app-error.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { visitService } from '../services/visit.service.js';

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
export const create = handler('Visit recorded successfully', (req) => visitService.create(actorId(req), req.body), 201);
export const list = handler('Visits fetched successfully', (req) => visitService.list(actorId(req), req.res!.locals.validatedQuery, req.res!.locals.validatedQuery));
export const byLead = handler('Lead visits fetched successfully', (req) => visitService.list(actorId(req), req.res!.locals.validatedQuery, { leadId: req.params.leadId as string }));
export const byEmployee = handler('Employee visits fetched successfully', (req) => visitService.list(actorId(req), req.res!.locals.validatedQuery, { employeeId: req.params.employeeId as string }));
export const followUps = handler('Visit follow-ups fetched successfully', (req) => visitService.list(actorId(req), req.res!.locals.validatedQuery, { ...req.res!.locals.validatedQuery, upcoming: true }));
export const overdueFollowUps = handler('Overdue visit follow-ups fetched successfully', (req) => visitService.list(actorId(req), req.res!.locals.validatedQuery, { ...req.res!.locals.validatedQuery, overdue: true }));
export const get = handler('Visit fetched successfully', (req) => visitService.get(actorId(req), req.params.visitId as string));
export const update = handler('Visit updated successfully', (req) => visitService.update(actorId(req), req.params.visitId as string, req.body));
