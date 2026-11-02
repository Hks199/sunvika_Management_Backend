import { Types } from 'mongoose';
import { AuditLogModel } from '../models/audit-log.model.js';

export type AuditFilters = {
  module?: string; action?: string; resourceType?: string; resourceId?: string; performedBy?: string;
  dateFrom?: Date; dateTo?: Date; page?: number; limit?: number;
};

export const auditService = {
  async record(event: {
    action: string; module: string; performedBy: Types.ObjectId; resourceType: string; resourceId: Types.ObjectId;
    requestId?: string; ipAddress?: string; userAgent?: string; responseStatus: number;
  }) {
    return AuditLogModel.create(event);
  },
  async list(filters: AuditFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const query: Record<string, unknown> = {};
    if (filters.module) query.module = filters.module;
    if (filters.action) query.action = filters.action;
    if (filters.resourceType) query.resourceType = filters.resourceType;
    if (filters.resourceId) query.resourceId = new Types.ObjectId(filters.resourceId);
    if (filters.performedBy) query.performedBy = new Types.ObjectId(filters.performedBy);
    if (filters.dateFrom || filters.dateTo) query.createdAt = {
      ...(filters.dateFrom ? { $gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { $lte: new Date(new Date(filters.dateTo).setHours(23, 59, 59, 999)) } : {})
    };
    const [data, total] = await Promise.all([
      AuditLogModel.find(query).populate('performedBy', 'employeeCode firstName lastName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLogModel.countDocuments(query)
    ]);
    return { data, page, limit, total };
  }
};
