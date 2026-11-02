import { Router } from 'express';
import mongoose from 'mongoose';
import { APP_NAME } from '../constants/app.constants.js';
import { sendSuccess } from '../utils/api-response.util.js';
import { authRouter } from '../modules/auth/routes/auth.routes.js';
import { employeeRouter } from '../modules/employees/routes/employee.routes.js';
import { roleRouter } from '../modules/roles/routes/role.routes.js';
import { geographyRouter } from '../modules/geography/routes/geography.routes.js';
import { leadRouter } from '../modules/leads/routes/lead.routes.js';
import { visitRouter } from '../modules/visits/routes/visit.routes.js';
import { customerRouter } from '../modules/customers/routes/customer.routes.js';
import { quotationRouter } from '../modules/quotations/routes/quotation.routes.js';
import { publicShare } from '../modules/quotations/controllers/quotation.controller.js';
import { dashboardRouter, reportsRouter } from '../modules/analytics/routes/analytics.routes.js';
import { amcRouter } from '../modules/amc/routes/amc.routes.js';
import { auditRouter } from '../modules/audit/routes/audit.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/employees', employeeRouter);
apiRouter.use('/roles', roleRouter);
apiRouter.use('/geography', geographyRouter);
apiRouter.use('/leads', leadRouter);
apiRouter.use('/visits', visitRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/quotations', quotationRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/amc', amcRouter);
apiRouter.use('/audit-logs', auditRouter);
apiRouter.get('/public/shares/:token', publicShare);

apiRouter.get('/health', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  if (!ready) {
    return res.status(503).json({ success: false, message: 'Service unavailable', errors: [], meta: null });
  }
  return sendSuccess(res, 'Service is healthy', { service: APP_NAME, database: 'connected' });
});
