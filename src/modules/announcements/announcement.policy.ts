export const ANNOUNCEMENT_PUBLISHERS = ['MD', 'MIS', 'CP_HEAD', 'RM'];
export function canPublishAnnouncement(role: string) { return ANNOUNCEMENT_PUBLISHERS.includes(role); }
export function allowedAnnouncementRoles(role: string): string[] | null {
  if (role === 'MD') return null;
  if (role === 'MIS') return ['CP_HEAD', 'RM', 'CP'];
  if (role === 'CP_HEAD') return ['RM', 'CP'];
  if (role === 'RM') return ['CP'];
  return [];
}
export function announcementScope(role: string): 'TEAM' | 'ORGANIZATION' { return ['RM', 'CP_HEAD'].includes(role) ? 'TEAM' : 'ORGANIZATION'; }
export function canManageAnnouncement(actorId: string, role: string, authorId: string) {
  return role === 'MD' || (canPublishAnnouncement(role) && actorId === authorId);
}
/** The delivery filter always applies the stored publisher scope, regardless of viewer read privileges elsewhere. */
export function announcementFeedFilter(actorId: unknown, role: string, hierarchyPath: unknown[], now = new Date()): Record<string, unknown> {
  const active = { isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
  if (role === 'MD') return active;
  return { $and: [active, { audienceRoles: role, $or: [{ scope: 'ORGANIZATION' }, { scope: 'TEAM', createdBy: { $in: hierarchyPath } }] }] };
}
