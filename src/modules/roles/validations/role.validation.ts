import Joi from 'joi';

const codes = Joi.array().items(Joi.string().pattern(/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/)).unique().max(200);
const roleCodes = Joi.array().items(Joi.string().uppercase().pattern(/^[A-Z][A-Z0-9_]{1,39}$/)).unique().max(100);

export const createRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  code: Joi.string().uppercase().pattern(/^[A-Z][A-Z0-9_]{1,39}$/).required(),
  description: Joi.string().trim().max(500),
  level: Joi.number().integer().min(0).max(100).required(),
  parentCode: Joi.string().uppercase().pattern(/^[A-Z][A-Z0-9_]{1,39}$/).required(),
  permissionCodes: codes.default([]),
  allowedChildRoleCodes: roleCodes.default([])
}).required();

export const updateRoleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().trim().max(500).allow(''),
  permissionCodes: codes,
  allowedChildRoleCodes: roleCodes,
  isActive: Joi.boolean()
}).min(1).required();
