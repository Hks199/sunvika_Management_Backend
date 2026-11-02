import type { RequestHandler } from 'express';
import { employeeService } from '../services/employee.service.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { AppError } from '../../../utils/app-error.util.js';
import { profileImageService } from '../services/profile-image.service.js';

function actorId(req: Parameters<RequestHandler>[0]) {
  if (!req.auth) throw new AppError('Authentication required', 401);
  return req.auth.employeeId;
}

export const create: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Employee created successfully', await employeeService.create(req.body, actorId(req)), 201); }
  catch (error) { return next(error); }
};

export const getCreatableRoles: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Available employee roles fetched successfully', await employeeService.getCreatableRoles(actorId(req))); }
  catch (error) { return next(error); }
};

export const createProfileImageUpload: RequestHandler = async (req, res, next) => {
  try {
    const result = await profileImageService.createUploadUrl(actorId(req), req.body.contentType as string, req.body.size as number);
    return sendSuccess(res, 'Profile image upload URL created', result, 201);
  } catch (error) { return next(error); }
};

export const createProfileImageUploadReservation: RequestHandler = async (req, res, next) => {
  try {
    const result = await profileImageService.createUploadReservation(actorId(req), req.body.contentType as string, req.body.size as number);
    return sendSuccess(res, 'Profile image upload reserved', result, 201);
  } catch (error) { return next(error); }
};

export const uploadProfileImage: RequestHandler = async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) throw new AppError('Profile image data is missing', 400);
    const result = await profileImageService.uploadReservedImage(
      actorId(req),
      req.params.uploadId as string,
      req.get('Content-Type') ?? '',
      req.body
    );
    return sendSuccess(res, 'Profile image uploaded successfully', result);
  } catch (error) { return next(error); }
};

export const getProfileImageUrl: RequestHandler = async (req, res, next) => {
  try {
    const employee = await employeeService.getById(actorId(req), req.params.employeeId as string);
    const profileImage = employee.profileImage as { key?: string } | undefined;
    if (!profileImage?.key) throw new AppError('Profile image not found', 404);
    const url = await profileImageService.createDownloadUrl(profileImage.key);
    return sendSuccess(res, 'Profile image URL created', { url, expiresInSeconds: 300 });
  } catch (error) { return next(error); }
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    const pagination = res.locals.validatedQuery as { page: number; limit: number };
    const result = await employeeService.listAccessible(actorId(req), pagination);
    return res.status(200).json({ success: true, message: 'Employees fetched successfully', ...result });
  }
  catch (error) { return next(error); }
};

export const downline: RequestHandler = async (req, res, next) => {
  try {
    const pagination = res.locals.validatedQuery as { page: number; limit: number };
    const result = await employeeService.getDownline(actorId(req), pagination);
    return res.status(200).json({ success: true, message: 'Downline employees fetched successfully', ...result });
  }
  catch (error) { return next(error); }
};

export const getById: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Employee fetched successfully', await employeeService.getById(actorId(req), req.params.employeeId as string)); }
  catch (error) { return next(error); }
};

export const hierarchy: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Reporting hierarchy fetched successfully', await employeeService.getHierarchy(actorId(req), req.params.employeeId as string)); }
  catch (error) { return next(error); }
};

export const update: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Employee updated successfully', await employeeService.update(actorId(req), req.params.employeeId as string, req.body)); }
  catch (error) { return next(error); }
};

export const activate: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Employee activated successfully', await employeeService.setActive(actorId(req), req.params.employeeId as string, true)); }
  catch (error) { return next(error); }
};

export const deactivate: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Employee deactivated successfully', await employeeService.setActive(actorId(req), req.params.employeeId as string, false)); }
  catch (error) { return next(error); }
};

export const resendInvitation: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Invitation resend request processed', await employeeService.resendInvitation(actorId(req), req.params.employeeId as string)); }
  catch (error) { return next(error); }
};

export const changeManager: RequestHandler = async (req, res, next) => {
  try { return sendSuccess(res, 'Reporting manager changed successfully', await employeeService.changeReportingManager(actorId(req), req.params.employeeId as string, req.body.reportingManagerId as string)); }
  catch (error) { return next(error); }
};
