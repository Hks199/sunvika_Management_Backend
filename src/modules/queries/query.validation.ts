import Joi from 'joi';
const objectId = Joi.string().hex().length(24);
export const queryPageSchema = Joi.object({ page: Joi.number().integer().min(1).max(10000).default(1), limit: Joi.number().integer().min(1).max(50).default(20) });
export const createQuerySchema = Joi.object({ title: Joi.string().trim().min(1).max(160).required(), body: Joi.string().trim().min(1).max(5000).required(), recipientRole: Joi.string().valid('CP_HEAD', 'MIS').required(), recipientId: objectId.required() });
export const replyQuerySchema = Joi.object({ body: Joi.string().trim().min(1).max(5000).required() });
export const seenQuerySchema = Joi.object({ messageIds: Joi.array().items(objectId.required()).min(1).max(50).unique().required() });
