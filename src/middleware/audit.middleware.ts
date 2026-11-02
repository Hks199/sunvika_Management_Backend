import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env.config.js';
import { logger } from '../services/logger.service.js';
import { auditService } from '../modules/audit/services/audit.service.js';

type AuditData = { _id?: unknown };
type AuditResponse = { success?: boolean; data?: AuditData };

export function resolveAuditResourceId(params: Record<string, unknown>, body: unknown, responseData: unknown): Types.ObjectId | null {
  const candidates: unknown[] = [];
  if (responseData && typeof responseData === 'object' && '_id' in responseData) candidates.push((responseData as AuditData)._id);
  for (const value of Object.values(params)) candidates.push(value);
  if (body && typeof body === 'object') {
    const fields = body as Record<string, unknown>;
    for (const key of ['customerId', 'leadId', 'employeeId', 'roleId', 'branchId', 'districtId', 'stateId', 'resourceId']) candidates.push(fields[key]);
  }
  for (const value of candidates) {
    if (typeof value === 'string' && Types.ObjectId.isValid(value)) return new Types.ObjectId(value);
    if (value instanceof Types.ObjectId) return value;
  }
  return null;
}

export const auditMiddleware: RequestHandler = (req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isSensitiveRead = req.method === 'GET' && /(?:download-url|profile-image-url|\/documents\/)/i.test(req.path);
  if (!isMutation && !isSensitiveRead) return next();

  const originalJson = res.json.bind(res);
  res.json = ((body: AuditResponse) => {
    if (!body?.success || res.statusCode < 200 || res.statusCode >= 300) return originalJson(body);
    const employeeId = req.auth?.employeeId;
    if (!employeeId) return originalJson(body);
    const relativePath = req.originalUrl.split('?')[0]!.slice(env.apiPrefix.length);
    const moduleName = relativePath.split('/').filter(Boolean)[0] ?? 'api';
    const routePath = typeof req.route?.path === 'string' ? req.route.path : '';
    const resourceId = resolveAuditResourceId(req.params as Record<string, unknown>, req.body, body.data);
    if (!resourceId) {
      logger.warn({ requestId: res.locals.requestId, module: moduleName, action: req.method }, 'Successful request could not be associated with an audit resource');
      return originalJson(body);
    }
    const event = {
      action: `${req.method} ${moduleName}${routePath}`.slice(0, 200),
      module: moduleName,
      performedBy: employeeId,
      resourceType: moduleName,
      resourceId,
      ...(typeof res.locals.requestId === 'string' ? { requestId: res.locals.requestId } : {}),
      ...(req.ip ? { ipAddress: req.ip.slice(0, 64) } : {}),
      ...(req.get('user-agent') ? { userAgent: req.get('user-agent')!.slice(0, 500) } : {}),
      responseStatus: res.statusCode
    };
    void auditService.record(event)
      .then(() => originalJson(body))
      .catch((error: unknown) => {
        logger.error({ err: error, requestId: res.locals.requestId, module: moduleName }, 'Audit record write failed');
        originalJson(body);
      });
    return res;
  }) as typeof res.json;
  return next();
};
