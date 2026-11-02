import type { RequestHandler } from 'express';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { geographyService } from '../services/geography.service.js';

const handler = (message: string, operation: (req: Parameters<RequestHandler>[0]) => Promise<unknown>, status = 200): RequestHandler => async (req, res, next) => {
  try { return sendSuccess(res, message, await operation(req), status); } catch (error) { return next(error); }
};

export const listStates = handler('States fetched successfully', () => geographyService.listStates());
export const listDistricts = handler('Districts fetched successfully', (req) => geographyService.listDistricts(req.params.stateId as string));
export const listBranches = handler('Branches fetched successfully', (req) => geographyService.listBranches(req.params.districtId as string));
export const createState = handler('State created successfully', (req) => geographyService.createState(req.body), 201);
export const updateState = handler('State updated successfully', (req) => geographyService.updateState(req.params.stateId as string, req.body));
export const createDistrict = handler('District created successfully', (req) => geographyService.createDistrict(req.body), 201);
export const updateDistrict = handler('District updated successfully', (req) => geographyService.updateDistrict(req.params.districtId as string, req.body));
export const createBranch = handler('Branch created successfully', (req) => geographyService.createBranch(req.body), 201);
export const updateBranch = handler('Branch updated successfully', (req) => geographyService.updateBranch(req.params.branchId as string, req.body));
