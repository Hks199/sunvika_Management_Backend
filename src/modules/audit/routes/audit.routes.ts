import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requireManagingDirector } from '../../../middleware/authorize.middleware.js';
import { validateQuery } from '../../../middleware/validate.middleware.js';
import { list } from '../controllers/audit.controller.js';
import { auditListSchema } from '../validations/audit.validation.js';

export const auditRouter = Router();
auditRouter.use(authenticate, requireManagingDirector);
auditRouter.get('/', validateQuery(auditListSchema), list);
