export function canManageCallingList(role: string, actorId: string, uploadedBy: string): boolean {
  return role === 'MD' || (role === 'MIS' && actorId === uploadedBy);
}
export function canReadCallingList(role: string, actorId: string, uploadedBy: string, assignedTo?: string | null, assignedRmInDownline = false): boolean {
  return canManageCallingList(role, actorId, uploadedBy) || (role === 'RM' && actorId === assignedTo) || (role === 'CP_HEAD' && Boolean(assignedTo) && assignedRmInDownline);
}
export function canConvertCallingCandidate(role: string, actorId: string, assignedTo?: string | null): boolean {
  return Boolean(assignedTo) && (role === 'MD' || (role === 'RM' && actorId === assignedTo));
}
