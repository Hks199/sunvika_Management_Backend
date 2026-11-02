import type { RequestHandler } from 'express';
import { AppError } from '../../../utils/app-error.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { leadService } from '../services/lead.service.js';

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
export const create = handler('Lead created successfully', (req) => leadService.create(actorId(req), req.body), 201);
export const list = handler('Leads fetched successfully', (req) => leadService.list(actorId(req), req.res!.locals.validatedQuery, req.res!.locals.validatedQuery));
export const get = handler('Lead fetched successfully', (req) => leadService.get(actorId(req), req.params.leadId as string));
export const update = handler('Lead updated successfully', (req) => leadService.update(actorId(req), req.params.leadId as string, req.body));
export const changeStatus = handler('Lead status updated successfully', (req) => leadService.changeStatus(actorId(req), req.params.leadId as string, req.body));
export const assign = handler('Lead assigned successfully', (req) => leadService.assign(actorId(req), req.params.leadId as string, req.body.assignedTo as string));
export const history = handler('Lead status history fetched successfully', (req) => leadService.history(actorId(req), req.params.leadId as string));
export const followUps = handler('Follow-ups fetched successfully', (req) => leadService.followUps(actorId(req), req.res!.locals.validatedQuery, false, req.res!.locals.validatedQuery));
export const overdueFollowUps = handler('Overdue follow-ups fetched successfully', (req) => leadService.followUps(actorId(req), req.res!.locals.validatedQuery, true, req.res!.locals.validatedQuery));
