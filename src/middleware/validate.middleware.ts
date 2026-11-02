import type { RequestHandler } from 'express';
import type { ObjectSchema } from 'joi';
import { AppError } from '../utils/app-error.util.js';

export function validateBody<T>(schema: ObjectSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, convert: true, stripUnknown: true });
    if (error) {
      return next(new AppError('Validation failed', 400, error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))));
    }
    req.body = value;
    return next();
  };
}

export function validateQuery<T>(schema: ObjectSchema<T>): RequestHandler {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false, convert: true, stripUnknown: true });
    if (error) {
      return next(new AppError('Validation failed', 400, error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))));
    }
    res.locals.validatedQuery = value;
    return next();
  };
}
