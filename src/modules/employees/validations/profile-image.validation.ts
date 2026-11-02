import Joi from 'joi';

export const createProfileImageUploadSchema = Joi.object({
  contentType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp').required(),
  size: Joi.number().integer().min(1).max(10 * 1024 * 1024).required()
}).required();
