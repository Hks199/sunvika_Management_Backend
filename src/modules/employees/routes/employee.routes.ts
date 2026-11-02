import express, { Router } from 'express';
import { env } from '../../../config/env.config.js';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../../middleware/authorize.middleware.js';
import { validateBody, validateQuery } from '../../../middleware/validate.middleware.js';
import * as controller from '../controllers/employee.controller.js';
import { changeManagerSchema, createEmployeeSchema, updateEmployeeSchema } from '../validations/employee.validation.js';
import { paginationSchema } from '../validations/pagination.validation.js';
import { createProfileImageUploadSchema } from '../validations/profile-image.validation.js';

export const employeeRouter = Router();
employeeRouter.use(authenticate);
employeeRouter.get('/creatable-roles', requirePermission('employees.create'), controller.getCreatableRoles);
employeeRouter.post('/', requirePermission('employees.create'), validateBody(createEmployeeSchema), controller.create);
employeeRouter.post('/profile-image-upload', requirePermission('employees.create'), validateBody(createProfileImageUploadSchema), controller.createProfileImageUploadReservation);
employeeRouter.put('/profile-image-upload/:uploadId', requirePermission('employees.create'), express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: env.profileImageMaxSizeBytes
}), controller.uploadProfileImage);
employeeRouter.post('/profile-image-upload-url', requirePermission('employees.create'), validateBody(createProfileImageUploadSchema), controller.createProfileImageUpload);
employeeRouter.get('/:employeeId/profile-image-url', requirePermission('employees.read'), controller.getProfileImageUrl);
employeeRouter.get('/', requirePermission('employees.read'), validateQuery(paginationSchema), controller.list);
employeeRouter.get('/downline', requirePermission('employees.read'), validateQuery(paginationSchema), controller.downline);
employeeRouter.get('/:employeeId/hierarchy', requirePermission('employees.hierarchy'), controller.hierarchy);
employeeRouter.get('/:employeeId', requirePermission('employees.read'), controller.getById);
employeeRouter.patch('/:employeeId', requirePermission('employees.update'), validateBody(updateEmployeeSchema), controller.update);
employeeRouter.post('/:employeeId/activate', requirePermission('employees.activate'), controller.activate);
employeeRouter.post('/:employeeId/deactivate', requirePermission('employees.deactivate'), controller.deactivate);
employeeRouter.post('/:employeeId/resend-invitation', requirePermission('employees.invite'), controller.resendInvitation);
employeeRouter.patch('/:employeeId/reporting-manager', requirePermission('employees.hierarchy'), validateBody(changeManagerSchema), controller.changeManager);
