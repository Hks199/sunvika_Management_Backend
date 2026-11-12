import express, { Router, type RequestHandler } from 'express';
import Joi from 'joi';
import { authenticate } from '../../middleware/authenticate.middleware.js';
import { requirePermission } from '../../middleware/authorize.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.middleware.js';
import { sendSuccess } from '../../utils/api-response.util.js';
import { createEmployeeSchema } from '../employees/validations/employee.validation.js';
import { callingListService as service } from './calling-list.service.js';
import { reportRange } from '../calling-reports/calling-report.policy.js';
import { EXCEL_TYPE, MAX_EXCEL_SIZE } from './calling-list.excel.js';
export const callingListRouter = Router();
callingListRouter.use(authenticate);
callingListRouter.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const pageSchema = Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(25) });
const filterDate = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value,helpers)=>{try{reportRange('DAY',value);return value;}catch{return helpers.error('any.invalid');}});
export const callingListQuerySchema = pageSchema.keys({rmId:Joi.string().hex().length(24),dateFrom:filterDate,dateTo:filterDate}).unknown(false).custom((value,helpers)=>value.dateFrom&&value.dateTo&&value.dateFrom>value.dateTo?helpers.error('any.invalid'):value);
export const reserveCallingListSchema = Joi.object({ title: Joi.string().trim().min(1).max(160).required(), fileName: Joi.string().max(180).pattern(/[\x00-\x1f]/, { invert: true }).pattern(/^[^\\/\r\n]+\.xlsx$/i).required(), size: Joi.number().integer().min(22).max(MAX_EXCEL_SIZE).required(), assignedTo: Joi.string().hex().length(24) });
export const deleteCallingCandidateSchema = Joi.object({ confirm: Joi.boolean().valid(true).required() }).unknown(false);
export const candidateStatusSchema = Joi.object({
  callStatus: Joi.string().valid('NOT_CALLED', 'INTERESTED', 'NEEDS_FOLLOWUP', 'NOT_INTERESTED').required(),
  callNote: Joi.string().trim().max(1000).allow('').default(''),
  nextFollowUpAt: Joi.when('callStatus', { is: 'NEEDS_FOLLOWUP', then: Joi.date().iso().required(), otherwise: Joi.valid(null).default(null) })
}).unknown(false);
const assignSchema = Joi.object({ assignedTo: Joi.string().hex().length(24).allow(null).required() });
const cpSchema = createEmployeeSchema.fork(['roleCode'], schema => schema.valid('CP').default('CP'));
const route = (work: (req: express.Request, res: express.Response) => Promise<unknown>): RequestHandler => async (req, res, next) => { try { await work(req, res); } catch (error) { next(error); } };
const param = (value: unknown) => String(value ?? '');
callingListRouter.get('/template', route(async (req, res) => sendSuccess(res, 'Blank CP candidate Excel template', await service.template(req.auth!.employeeId))));
callingListRouter.get('/managers', route(async (req, res) => sendSuccess(res, 'Active RMs', await service.managers(req.auth!.employeeId))));
callingListRouter.get('/filter-options', route(async (req,res)=>sendSuccess(res,'Accessible assigned RMs',await service.filterOptions(req.auth!.employeeId))));
callingListRouter.get('/', validateQuery(callingListQuerySchema), route(async (req, res) => { const q = res.locals.validatedQuery; return sendSuccess(res, 'Calling lists', await service.list(req.auth!.employeeId, q.page, q.limit, q)); }));
callingListRouter.post('/', validateBody(reserveCallingListSchema), route(async (req, res) => sendSuccess(res, 'Upload reserved', await service.reserve(req.auth!.employeeId, req.body), 201)));
callingListRouter.put('/:listId/file', express.raw({ type: [EXCEL_TYPE, 'application/octet-stream'], limit: MAX_EXCEL_SIZE }), route(async (req, res) => sendSuccess(res, 'Calling list uploaded', await service.upload(req.auth!.employeeId, param(req.params.listId), req.body))));
callingListRouter.patch('/:listId/assignment', validateBody(assignSchema), route(async (req, res) => sendSuccess(res, 'Assignment updated', await service.assign(req.auth!.employeeId, param(req.params.listId), req.body.assignedTo))));
callingListRouter.get('/:listId/preview', validateQuery(pageSchema), route(async (req, res) => { res.set('Cache-Control', 'private, no-store'); const q = res.locals.validatedQuery; return sendSuccess(res, 'Calling list preview', await service.preview(req.auth!.employeeId, param(req.params.listId), q.page, q.limit)); }));
callingListRouter.get('/:listId/download-url', route(async (req, res) => { res.set('Cache-Control', 'private, no-store'); return sendSuccess(res, 'Excel download', await service.download(req.auth!.employeeId, param(req.params.listId))); }));
callingListRouter.post('/:listId/candidates/:rowId/create-cp', requirePermission('employees.create'), validateBody(cpSchema), route(async (req, res) => sendSuccess(res, 'CP account created', await service.createCp(req.auth!.employeeId, param(req.params.listId), param(req.params.rowId), req.body), 201)));

callingListRouter.delete('/:listId/candidates/:rowId', validateQuery(deleteCallingCandidateSchema), route(async (req, res) => sendSuccess(res, 'Candidate permanently deleted', await service.deleteCandidate(req.auth!.employeeId, param(req.params.listId), param(req.params.rowId), res.locals.validatedQuery.confirm))));

callingListRouter.patch('/:listId/candidates/:rowId/status', validateBody(candidateStatusSchema), route(async (req, res) => sendSuccess(res, 'Candidate calling status updated', await service.updateCandidateStatus(req.auth!.employeeId, param(req.params.listId), param(req.params.rowId), req.body))));
