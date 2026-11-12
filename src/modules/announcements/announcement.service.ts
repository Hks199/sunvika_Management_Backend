import { Types } from 'mongoose';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { AppError } from '../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../utils/pagination.util.js';
import { AnnouncementModel } from './announcement.model.js';
import { allowedAnnouncementRoles, announcementFeedFilter, announcementScope, canManageAnnouncement, canPublishAnnouncement } from './announcement.policy.js';
const personFields = 'firstName middleName lastName employeeCode';
async function actor(actorId: Types.ObjectId) {
  const employee = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role hierarchyPath').lean();
  const role = employee ? await RoleModel.findOne({ _id: employee.role, isActive: true }).select('code').lean() : null;
  if (!employee || !role) throw new AppError('Account is unavailable', 403);
  return { employee, role: role.code };
}
async function publisher(actorId: Types.ObjectId) {
  const user = await actor(actorId);
  if (!canPublishAnnouncement(user.role)) throw new AppError('Only MD, MIS, CP Head and RM can publish announcements', 403);
  return user;
}
async function page(query: Record<string, unknown>, pagination: PaginationInput) {
  const [items, total] = await Promise.all([
    AnnouncementModel.find(query).populate('createdBy', personFields).populate('updatedBy', personFields).sort({ createdAt: -1, _id: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
    AnnouncementModel.countDocuments(query)
  ]);
  return { items: items.map(item => ({ ...item, audienceRoles: item.audienceRoles.filter(code => !['MH', 'ADMIN_HEAD'].includes(code)) })), meta: createPaginationMeta(pagination.page, pagination.limit, total) };
}
async function validateAudience(roleCode: string, audienceRoles: string[]) {
  const allowed = allowedAnnouncementRoles(roleCode);
  const activeRoles = await RoleModel.find({ code: { $in: audienceRoles, $nin: ['MH', 'ADMIN_HEAD'] }, isActive: true, category: { $ne: 'ADMIN_HEAD' } }).select('code').lean();
  if (!audienceRoles.length || new Set(audienceRoles).size !== audienceRoles.length || audienceRoles.some(code => ['MH', 'ADMIN_HEAD'].includes(code) || (allowed && !allowed.includes(code)) || !activeRoles.some(role => role.code === code))) throw new AppError('Choose audience roles permitted for your position', 403);
}
export const announcementService = {
  async audience(actorId: Types.ObjectId) {
    const user = await publisher(actorId), codes = allowedAnnouncementRoles(user.role);
    const roles = await RoleModel.find({ isActive: true, code: { ...(codes ? { $in: codes } : {}), $nin: ['MH', 'ADMIN_HEAD'] } , category: { $ne: 'ADMIN_HEAD' } }).select('code name').sort({ level: 1, name: 1 }).lean();
    return { roles, scope: announcementScope(user.role) };
  },
  async create(actorId: Types.ObjectId, input: { title: string; body: string; category: string; audienceRoles: string[]; expiresAt?: Date | null }) {
    const user = await publisher(actorId);
    await validateAudience(user.role, input.audienceRoles);
    return AnnouncementModel.create({ title: input.title, body: input.body, category: input.category, audienceRoles: input.audienceRoles, scope: announcementScope(user.role), authorRole: user.role, createdBy: actorId, updatedBy: actorId, expiresAt: input.expiresAt ?? null, isActive: true });
  },
  async feed(actorId: Types.ObjectId, pagination: PaginationInput) {
    const user = await actor(actorId);
    return page(announcementFeedFilter(actorId, user.role, user.employee.hierarchyPath), pagination);
  },
  async list(actorId: Types.ObjectId, pagination: PaginationInput) {
    const user = await publisher(actorId);
    return page(user.role === 'MD' ? {} : { createdBy: actorId }, pagination);
  },
  async update(actorId: Types.ObjectId, announcementId: string, input: { title?: string; body?: string; category?: string; expiresAt?: Date | null; isActive?: boolean; audienceRoles?: string[] }) {
    const user = await publisher(actorId);
    if (!Types.ObjectId.isValid(announcementId)) throw new AppError('Invalid announcement ID', 400);
    const query = { _id: new Types.ObjectId(announcementId), ...(user.role === 'MD' ? {} : { createdBy: actorId }) };
    const record = await AnnouncementModel.findOne(query);
    if (!record || !canManageAnnouncement(String(actorId), user.role, String(record.createdBy))) throw new AppError('Announcement not found', 404);
    if (input.audienceRoles !== undefined) {
      await validateAudience(user.role, input.audienceRoles);
      const previous = record.audienceRoles ?? [];
      const changed = previous.length !== input.audienceRoles.length || previous.some(code => !input.audienceRoles!.includes(code));
      if (changed) {
        record.set('audienceRoles', input.audienceRoles);
        record.set('scope', announcementScope(user.role));
      }
    }
    for (const key of ['title', 'body', 'category', 'expiresAt', 'isActive'] as const) if (input[key] !== undefined) record.set(key, input[key]);
    record.updatedBy = actorId;
    await record.save();
    return record;
  }
};
