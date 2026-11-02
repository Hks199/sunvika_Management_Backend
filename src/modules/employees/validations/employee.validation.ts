import Joi from 'joi';

const addressSchema = Joi.object({
  addressLine: Joi.string().trim().min(3).max(300).required(),
  state: Joi.string().hex().length(24).required(),
  district: Joi.string().hex().length(24).required(),
  city: Joi.string().trim().max(100),
  pincode: Joi.string().trim().pattern(/^[A-Za-z0-9 -]{3,12}$/)
}).required();

export const createEmployeeSchema = Joi.object({
  employeeCode: Joi.string().trim().uppercase().pattern(/^[A-Z0-9][A-Z0-9_-]{1,39}$/),
  firstName: Joi.string().trim().min(1).max(80).required(),
  middleName: Joi.string().trim().max(80).allow(''),
  lastName: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().email().max(254).lowercase().trim().required(),
  mobileNumber: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/).required(),
  address: addressSchema,
  roleCode: Joi.string().uppercase().pattern(/^[A-Z][A-Z0-9_]{1,39}$/).required(),
  branch: Joi.string().hex().length(24),
  profileImageUploadId: Joi.string().hex().length(24)
}).required();

export const updateEmployeeSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(80),
  middleName: Joi.string().trim().max(80).allow(''),
  lastName: Joi.string().trim().min(1).max(80),
  mobileNumber: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/),
  address: addressSchema,
  branch: Joi.string().hex().length(24).allow(null)
}).min(1).required();

export const changeManagerSchema = Joi.object({ reportingManagerId: Joi.string().hex().length(24).required() }).required();
