import type { ErrorRequestHandler } from 'express';
import { logger } from '../services/logger.service.js';

export const errorMiddleware: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const error = err instanceof Error ? err : new Error('Unknown error');
  const duplicateKey = Number((err as { code?: unknown })?.code) === 11000;
  const duplicateField = (err as { keyPattern?: Record<string, unknown> })?.keyPattern;
  const statusCode = duplicateKey
    ? 409
    : Number((err as { statusCode?: unknown })?.statusCode ?? (err as { status?: unknown })?.status) || 500;
  const safeStatus = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  logger.error({ err: error, requestId: res.locals.requestId, method: req.method, path: req.path }, 'Request failed');
  res.status(safeStatus).json({
    success: false,
    message: safeStatus === 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : duplicateKey && duplicateField?.employeeCode ? 'Employee code already exists. Enter a different code.' : duplicateKey ? 'A record with those unique details already exists' : error.message,
    errors: Array.isArray((err as { errors?: unknown })?.errors) ? (err as { errors: unknown[] }).errors : [],
    meta: null
  });
};
