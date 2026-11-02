/** Pure hierarchy policy decisions. Database membership is resolved by hierarchy.service. */
export interface EmployeeAccessPolicyInput {
  actorId: string;
  actorRoleCode: string | undefined;
  actorRoleCategory: string | undefined;
  targetId: string;
  targetRoleCategory: string | undefined;
  targetCreatorIsInActorHierarchy: boolean;
  targetHierarchyPath: readonly string[];
}

export function canAccessEmployeeByPolicy(input: EmployeeAccessPolicyInput): boolean {
  if (input.actorRoleCode === 'MD' || input.actorId === input.targetId) return true;
  if (input.actorRoleCategory === 'ADMIN_HEAD') return false;
  if (input.targetRoleCategory === 'ADMIN_HEAD') {
    return input.actorRoleCode === 'BDO' && input.targetCreatorIsInActorHierarchy;
  }
  return input.targetHierarchyPath.includes(input.actorId);
}

export type BusinessResource = 'lead' | 'customer' | 'visit' | 'quotation';

export function canAccessOwnedResourceByPolicy(input: {
  actorId: string;
  actorRoleCode: string | undefined;
  actorRoleCategory: string | undefined;
  ownerId: string;
  ownerIsInActorHierarchy: boolean;
  resourceType: BusinessResource;
}): boolean {
  if (input.actorRoleCode === 'MD') return true;
  if (input.actorRoleCategory === 'ADMIN_HEAD') return true;
  return input.actorId === input.ownerId || input.ownerIsInActorHierarchy;
}
