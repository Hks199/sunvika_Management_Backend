import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { validateQuery } from '../../../middleware/validate.middleware.js';
import { analyticsFilterSchema } from '../validations/analytics.validation.js';
import { analyticsController } from '../controllers/analytics.controller.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get('/summary', requirePermission('dashboard.read'), validateQuery(analyticsFilterSchema), analyticsController.summary);

export const reportsRouter = Router();
reportsRouter.use(authenticate);
for (const [path, kind] of Object.entries({
  '/employee-performance': 'employee-performance', '/branch-performance': 'branch-performance',
  '/district-performance': 'district-performance', '/state-performance': 'state-performance', '/lead-conversion': 'lead-conversion',
  '/customers': 'customers', '/follow-ups': 'follow-ups', '/quotations': 'quotations'
})) reportsRouter.get(path, requirePermission('reports.read'), validateQuery(analyticsFilterSchema), analyticsController.report(kind));
