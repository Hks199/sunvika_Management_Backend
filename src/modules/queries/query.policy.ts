export const QUERY_ROLES = ['MD', 'RM', 'CP', 'CP_HEAD', 'MIS'];
export function canRaiseQuery(role: string) { return ['MD', 'RM', 'CP'].includes(role); }
export function canAccessQuery(actorId: string, role: string, createdBy: string, assignedTo: string) {
  return QUERY_ROLES.includes(role) && (role === 'MD' || actorId === createdBy || actorId === assignedTo);
}
export function notificationRecipients(actorId: string, participants: string[], directors: string[]): string[] {
  return [...new Set([...participants.filter(id => id !== actorId), ...directors])];
}
