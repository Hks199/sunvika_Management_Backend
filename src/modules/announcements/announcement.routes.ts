import { Router, type RequestHandler } from 'express';
import { authenticate } from '../../middleware/authenticate.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.middleware.js';
import { sendSuccess } from '../../utils/api-response.util.js';
import type { PaginationInput } from '../../utils/pagination.util.js';
import { announcementService } from './announcement.service.js';
import { createAnnouncementSchema, updateAnnouncementSchema, announcementPageSchema } from './announcement.validation.js';
const handler = (operation: (req: Parameters<RequestHandler>[0], page: PaginationInput) => Promise<unknown>, status = 200): RequestHandler => async (req, res, next) => {
  try { return sendSuccess(res, 'Announcement request completed', await operation(req, res.locals.validatedQuery), status); } catch (error) { return next(error); }
};
export const announcementRouter = Router();
announcementRouter.use(authenticate);
announcementRouter.get('/feed', validateQuery(announcementPageSchema), handler((req, page) => announcementService.feed(req.auth!.employeeId, page)));
announcementRouter.get('/audience', handler(req => announcementService.audience(req.auth!.employeeId)));
announcementRouter.get('/', validateQuery(announcementPageSchema), handler((req, page) => announcementService.list(req.auth!.employeeId, page)));
announcementRouter.post('/', validateBody(createAnnouncementSchema), handler(req => announcementService.create(req.auth!.employeeId, req.body), 201));
announcementRouter.patch('/:announcementId', validateBody(updateAnnouncementSchema), handler(req => announcementService.update(req.auth!.employeeId, req.params.announcementId as string, req.body)));
