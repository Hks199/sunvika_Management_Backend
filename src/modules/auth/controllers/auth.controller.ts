import type { RequestHandler } from 'express';
import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../../../utils/api-response.util.js';
import { AppError } from '../../../utils/app-error.util.js';
import { env } from '../../../config/env.config.js';

const COOKIE_NAME = 'sunvika_refresh';
const COOKIE_PATH = `${env.apiPrefix}/auth`;
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: env.nodeEnv === 'production' ? 'none' as const : 'lax' as const,
  path: COOKIE_PATH,
  maxAge: env.refreshTokenExpiresDays * 24 * 60 * 60 * 1000
});

function metadata(req: Parameters<RequestHandler>[0]) {
  return {
    ...(req.ip ? { ipAddress: req.ip } : {}),
    ...(req.get('user-agent') ? { userAgent: req.get('user-agent') as string } : {})
  };
}

export const login: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.login(req.body.email as string, req.body.password as string, metadata(req));
    res.cookie(COOKIE_NAME, result.refreshToken, cookieOptions());
    return sendSuccess(res, 'Signed in successfully', { accessToken: result.accessToken, employee: result.employee });
  } catch (error) { return next(error); }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    await authService.logout(req.cookies?.[COOKIE_NAME] as string | undefined);
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
      path: COOKIE_PATH
    });
    return sendSuccess(res, 'Signed out successfully', null);
  } catch (error) { return next(error); }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.refresh(req.cookies?.[COOKIE_NAME] as string | undefined, metadata(req));
    res.cookie(COOKIE_NAME, result.refreshToken, cookieOptions());
    return sendSuccess(res, 'Session refreshed successfully', { accessToken: result.accessToken });
  } catch (error) { return next(error); }
};

export const setPassword: RequestHandler = async (req, res, next) => {
  try {
    await authService.setPassword(req.body.token as string, req.body.password as string);
    return sendSuccess(res, 'Password set successfully', null);
  } catch (error) { return next(error); }
};

export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    await authService.requestPasswordReset(req.body.email as string);
    return sendSuccess(res, 'If the account exists, password reset instructions will be sent', null, 202);
  } catch (error) { return next(error); }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token as string, req.body.password as string);
    return sendSuccess(res, 'Password reset successfully', null);
  } catch (error) { return next(error); }
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    const employee = await authService.me(req.auth.employeeId.toString());
    return sendSuccess(res, 'Current employee fetched successfully', employee);
  } catch (error) { return next(error); }
};

export const sessions: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    return sendSuccess(res, 'Sessions fetched successfully', await authService.listSessions(req.auth.employeeId.toString()));
  } catch (error) { return next(error); }
};

export const revokeSession: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401);
    await authService.revokeSession(req.auth.employeeId.toString(), req.params.sessionId as string);
    return sendSuccess(res, 'Session revoked successfully', null);
  } catch (error) { return next(error); }
};
