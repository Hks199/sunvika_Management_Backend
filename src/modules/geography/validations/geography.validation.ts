import Joi from 'joi';

const name = Joi.string().trim().min(2).max(100);
const objectId = Joi.string().hex().length(24);

export const createStateSchema = Joi.object({
  name: name.required(), code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{1,12}$/), isActive: Joi.boolean().default(true)
}).required();
export const updateStateSchema = Joi.object({ name, code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{1,12}$/).allow(''), isActive: Joi.boolean() }).min(1).required();
export const createDistrictSchema = Joi.object({ name: name.required(), state: objectId.required(), isActive: Joi.boolean().default(true) }).required();
export const updateDistrictSchema = Joi.object({ name, isActive: Joi.boolean() }).min(1).required();
export const createBranchSchema = Joi.object({
  name: name.required(), code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{1,30}$/).required(),
  state: objectId.required(), district: objectId.required(), address: Joi.string().trim().max(500).allow(''), isActive: Joi.boolean().default(true)
}).required();
export const updateBranchSchema = Joi.object({
  name, code: Joi.string().trim().uppercase().pattern(/^[A-Z0-9_-]{1,30}$/), address: Joi.string().trim().max(500).allow(''), isActive: Joi.boolean()
}).min(1).required();
