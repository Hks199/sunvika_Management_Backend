/** Organization-wide business visibility does not grant management permissions. */
export type AccessMode = 'read' | 'manage';
export function hasOrganizationVisibility(code: string | undefined): boolean { return code === 'MD' || code === 'MIS'; }
export const MIS_READ_PERMISSIONS = ['employees.read', 'leads.read', 'customers.read', 'visits.read', 'quotations.read', 'amc.read', 'reports.read', 'dashboard.read'] as const;
