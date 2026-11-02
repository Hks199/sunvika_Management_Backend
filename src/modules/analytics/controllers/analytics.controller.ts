import type { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/async-handler.util.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { analyticsService } from '../services/analytics.service.js';

const filters = (res: Response) => res.locals.validatedQuery as Parameters<typeof analyticsService.summary>[1];
const actor = (req: Request) => req.auth!.employeeId.toString();

export const analyticsController = {
  summary: asyncHandler(async (req, res) => sendSuccess(res, 'Dashboard summary retrieved', await analyticsService.summary(actor(req), filters(res)))),
  report: (kind: string) => asyncHandler(async (req, res) => sendSuccess(res, `${kind} report retrieved`, await analyticsService.report(actor(req), filters(res), kind)))
};
