import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { validateBody, validateQuery } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/lead.controller.js';
import { assignLeadSchema, changeLeadStatusSchema, createLeadSchema, followUpQuerySchema, leadListQuerySchema, updateLeadSchema } from '../validations/lead.validation.js';

export const leadRouter = Router();
leadRouter.use(authenticate);
leadRouter.post('/', requirePermission('leads.create'), validateBody(createLeadSchema), controller.create);
leadRouter.get('/follow-ups/overdue', requirePermission('leads.read'), validateQuery(followUpQuerySchema), controller.overdueFollowUps);
leadRouter.get('/follow-ups', requirePermission('leads.read'), validateQuery(followUpQuerySchema), controller.followUps);
leadRouter.get('/', requirePermission('leads.read'), validateQuery(leadListQuerySchema), controller.list);
leadRouter.get('/:leadId/history', requirePermission('leads.read'), controller.history);
leadRouter.get('/:leadId', requirePermission('leads.read'), controller.get);
leadRouter.patch('/:leadId', requirePermission('leads.update'), validateBody(updateLeadSchema), controller.update);
leadRouter.patch('/:leadId/status', requirePermission('leads.status'), validateBody(changeLeadStatusSchema), controller.changeStatus);
leadRouter.patch('/:leadId/assignment', requirePermission('leads.assign'), validateBody(assignLeadSchema), controller.assign);
