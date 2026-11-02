import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;
  next();
};
