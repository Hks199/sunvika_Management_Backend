import Joi from 'joi';

export const createPermissionSchema = Joi.object({
  module: Joi.string().lowercase().trim().pattern(/^[a-z][a-z0-9_-]{1,39}$/).required(),
  action: Joi.string().lowercase().trim().pattern(/^[a-z][a-z0-9_-]{1,39}$/).required(),
  description: Joi.string().trim().max(300)
}).required();
