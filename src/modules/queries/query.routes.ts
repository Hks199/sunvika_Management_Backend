import { Router, type RequestHandler } from 'express';
import { authenticate } from '../../middleware/authenticate.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.middleware.js';
import { sendSuccess } from '../../utils/api-response.util.js';
import type { PaginationInput } from '../../utils/pagination.util.js';
import { queryService } from './query.service.js';
import { createQuerySchema, replyQuerySchema, seenQuerySchema, queryPageSchema } from './query.validation.js';
const handler = (operation: (req: Parameters<RequestHandler>[0], page: PaginationInput) => Promise<unknown>, status = 200): RequestHandler => async (req, res, next) => {
  try { return sendSuccess(res, 'Query request completed', await operation(req, res.locals.validatedQuery), status); } catch (error) { return next(error); }
};
export const queryRouter = Router();
queryRouter.use(authenticate);
queryRouter.get('/recipients', handler(req => queryService.recipients(req.auth!.employeeId)));
queryRouter.get('/', validateQuery(queryPageSchema), handler((req, page) => queryService.list(req.auth!.employeeId, page)));
queryRouter.post('/', validateBody(createQuerySchema), handler(req => queryService.create(req.auth!.employeeId, req.body), 201));
queryRouter.get('/:threadId', validateQuery(queryPageSchema), handler((req, page) => queryService.detail(req.auth!.employeeId, req.params.threadId as string, page)));
queryRouter.post('/:threadId/replies', validateBody(replyQuerySchema), handler(req => queryService.reply(req.auth!.employeeId, req.params.threadId as string, req.body.body), 201));
queryRouter.post('/:threadId/seen', validateBody(seenQuerySchema), handler(req => queryService.seen(req.auth!.employeeId, req.params.threadId as string, req.body.messageIds)));
export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get('/', validateQuery(queryPageSchema), handler((req, page) => queryService.notifications(req.auth!.employeeId, page)));
notificationRouter.post('/:notificationId/seen', handler(req => queryService.readNotification(req.auth!.employeeId, req.params.notificationId as string)));
