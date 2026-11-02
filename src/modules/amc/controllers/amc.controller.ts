import type { RequestHandler } from 'express';
import { AppError } from '../../../utils/app-error.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { amcService } from '../services/amc.service.js';

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

export const create = handler('AMC contract registered', (req) => amcService.create(req.body, actorId(req)), 201);
export const list = handler('AMC contracts retrieved', (req) => amcService.list(req.res!.locals.validatedQuery, actorId(req)));
export const get = handler('AMC contract retrieved', (req) => amcService.get(req.params.contractId as string, actorId(req)));
export const renewals = handler('Upcoming AMC renewals retrieved', (req) => amcService.upcomingRenewals(req.res!.locals.validatedQuery, actorId(req)));
export const upcomingSchedules = handler('Upcoming AMC maintenance retrieved', (req) => amcService.upcomingSchedules(req.res!.locals.validatedQuery, actorId(req)));
export const renew = handler('AMC contract renewed', (req) => amcService.renew(req.params.contractId as string, req.body, actorId(req)), 201);
export const renewalStatus = handler('AMC renewal status updated', (req) => amcService.setRenewalStatus(req.params.contractId as string, req.body.renewalStatus, actorId(req)));
export const cancel = handler('AMC contract cancelled', (req) => amcService.cancel(req.params.contractId as string, actorId(req)));
export const addSchedule = handler('Maintenance scheduled', (req) => amcService.addSchedule(req.params.contractId as string, req.body, actorId(req)), 201);
export const updateSchedule = handler('Maintenance schedule updated', (req) => amcService.updateSchedule(req.params.contractId as string, req.params.scheduleId as string, req.body, actorId(req)));
export const recordService = handler('AMC service recorded', (req) => amcService.recordService(req.params.contractId as string, req.body, actorId(req)), 201);
export const serviceHistory = handler('AMC service history retrieved', (req) => amcService.serviceHistory(req.params.contractId as string, req.res!.locals.validatedQuery, actorId(req)));
