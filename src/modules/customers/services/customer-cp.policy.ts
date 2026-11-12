export function canConvertCustomerToCp(roleCode: string): boolean { return ['MD', 'CP_HEAD', 'RM'].includes(roleCode); }
export function canChooseCpManager(roleCode: string, actorId: string, managerId: string, managerHierarchy: readonly string[]): boolean {
  return roleCode === 'MD' || (roleCode === 'RM' && actorId === managerId) || (roleCode === 'CP_HEAD' && managerHierarchy.includes(actorId));
}
