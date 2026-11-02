import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requireGeographyManagement, requireManagingDirector } from '../../../middleware/authorize.middleware.js';
import { validateBody } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/geography.controller.js';
import { createBranchSchema, createDistrictSchema, createStateSchema, updateBranchSchema, updateDistrictSchema, updateStateSchema } from '../validations/geography.validation.js';

export const geographyRouter = Router();
geographyRouter.use(authenticate);
geographyRouter.get('/states', controller.listStates);
geographyRouter.get('/states/:stateId/districts', controller.listDistricts);
geographyRouter.get('/districts/:districtId/branches', controller.listBranches);
geographyRouter.post('/states', requireGeographyManagement, validateBody(createStateSchema), controller.createState);
geographyRouter.patch('/states/:stateId', requireManagingDirector, validateBody(updateStateSchema), controller.updateState);
geographyRouter.post('/districts', requireGeographyManagement, validateBody(createDistrictSchema), controller.createDistrict);
geographyRouter.patch('/districts/:districtId', requireManagingDirector, validateBody(updateDistrictSchema), controller.updateDistrict);
geographyRouter.post('/branches', requireGeographyManagement, validateBody(createBranchSchema), controller.createBranch);
geographyRouter.patch('/branches/:branchId', requireManagingDirector, validateBody(updateBranchSchema), controller.updateBranch);
