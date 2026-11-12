import Joi from 'joi';
const audienceRoles = Joi.array().items(Joi.string().pattern(/^[A-Z][A-Z0-9_]*$/).max(40)).min(1).max(100).unique();
const fields = { title: Joi.string().trim().min(1).max(160), body: Joi.string().trim().min(1).max(2000), category: Joi.string().valid('BUSINESS', 'TARGET', 'MOTIVATION'), expiresAt: Joi.date().iso().greater('now').allow(null) };
export const createAnnouncementSchema = Joi.object({ ...fields, title: fields.title.required(), body: fields.body.required(), category: fields.category.required(), audienceRoles: audienceRoles.required() }).unknown(false);
export const updateAnnouncementSchema = Joi.object({ ...fields, audienceRoles, isActive: Joi.boolean() }).min(1).unknown(false);
export const announcementPageSchema = Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20) }).unknown(false);
