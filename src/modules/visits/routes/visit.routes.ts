import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { validateBody, validateQuery } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/visit.controller.js';
import { createVisitSchema, updateVisitSchema, visitHistoryQuerySchema, visitQuerySchema } from '../validations/visit.validation.js';

export const visitRouter = Router();
visitRouter.use(authenticate);
visitRouter.post('/', requirePermission('visits.create'), validateBody(createVisitSchema), controller.create);
visitRouter.get('/follow-ups/overdue', requirePermission('visits.read'), validateQuery(visitHistoryQuerySchema), controller.overdueFollowUps);
visitRouter.get('/follow-ups', requirePermission('visits.read'), validateQuery(visitHistoryQuerySchema), controller.followUps);
visitRouter.get('/leads/:leadId', requirePermission('visits.read'), validateQuery(visitHistoryQuerySchema), controller.byLead);
visitRouter.get('/employees/:employeeId', requirePermission('visits.read'), validateQuery(visitHistoryQuerySchema), controller.byEmployee);
visitRouter.get('/', requirePermission('visits.read'), validateQuery(visitQuerySchema), controller.list);
visitRouter.get('/:visitId', requirePermission('visits.read'), controller.get);
visitRouter.patch('/:visitId', requirePermission('visits.create'), validateBody(updateVisitSchema), controller.update);
