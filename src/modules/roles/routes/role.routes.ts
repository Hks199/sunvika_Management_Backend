import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requireManagingDirector } from '../../../middleware/authorize.middleware.js';
import { validateBody } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/role.controller.js';
import { createRoleSchema, updateRoleSchema } from '../validations/role.validation.js';
import { createPermissionSchema } from '../validations/permission.validation.js';

export const roleRouter = Router();
roleRouter.use(authenticate, requireManagingDirector);
roleRouter.get('/', controller.listRoles);
roleRouter.get('/permissions', controller.listPermissions);
roleRouter.post('/permissions', validateBody(createPermissionSchema), controller.createPermission);
roleRouter.post('/', validateBody(createRoleSchema), controller.createRole);
roleRouter.patch('/:roleId', validateBody(updateRoleSchema), controller.updateRole);
