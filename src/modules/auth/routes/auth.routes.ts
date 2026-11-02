import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../../config/env.config.js';
import { authenticate } from '../../../middleware/authenticate.middleware.js';
import { validateBody } from '../../../middleware/validate.middleware.js';
import { emailSchema, loginSchema, tokenPasswordSchema } from '../validations/auth.validation.js';
import * as controller from '../controllers/auth.controller.js';

export const authRouter = Router();
const tooManyRequests: import('express-rate-limit').RateLimitExceededEventHandler = (_req, res) => {
  res.status(429).json({ success: false, message: 'Too many requests', errors: [], meta: null });
};
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooManyRequests });
const recoveryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooManyRequests });

function cookieOriginGuard(req: Parameters<import('express').RequestHandler>[0], res: Parameters<import('express').RequestHandler>[1], next: Parameters<import('express').RequestHandler>[2]): void {
  const origin = req.get('origin');
  if (origin && !env.corsOrigins.includes(origin)) {
    res.status(403).json({ success: false, message: 'Request origin is not allowed', errors: [], meta: null });
    return;
  }
  next();
}

authRouter.post('/login', cookieOriginGuard, loginLimiter, validateBody(loginSchema), controller.login);
authRouter.post('/logout', cookieOriginGuard, controller.logout);
authRouter.post('/refresh-token', cookieOriginGuard, controller.refresh);
authRouter.post('/set-password', recoveryLimiter, validateBody(tokenPasswordSchema), controller.setPassword);
authRouter.post('/forgot-password', recoveryLimiter, validateBody(emailSchema), controller.forgotPassword);
authRouter.post('/reset-password', recoveryLimiter, validateBody(tokenPasswordSchema), controller.resetPassword);
authRouter.get('/me', authenticate, controller.me);
authRouter.get('/sessions', authenticate, controller.sessions);
authRouter.delete('/sessions/:sessionId', authenticate, controller.revokeSession);
