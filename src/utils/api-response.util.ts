import type { Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta: unknown | null;
}

export function sendSuccess<T>(res: Response, message: string, data: T, statusCode = 200): Response<ApiSuccess<T>> {
  return res.status(statusCode).json({ success: true, message, data, meta: null });
}
