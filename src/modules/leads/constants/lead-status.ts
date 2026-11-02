export const LEAD_STATUSES = ['PENDING', 'INTERESTED', 'NOT_INTERESTED', 'SITE_VISITED', 'NEED_FOLLOWUP', 'LOST', 'QUOTATION_SENT', 'CONVERTED'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

// Conversion is only performed through the customer conversion workflow, never the generic status endpoint.
export function assertLeadStatusTransition(previous: LeadStatus, next: LeadStatus): void {
  if (previous === next) throw new Error('Lead already has this status');
  if (next === 'CONVERTED') throw new Error('Use the customer conversion workflow to convert a lead');
}
