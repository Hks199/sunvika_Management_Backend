export type LegacyMhPolicy = 'mis' | 'deactivate' | 'delete';
export interface ReportingEmployee {
  id: string;
  roleCode: string;
  reportingTo?: string | undefined;
  hierarchyPath: string[];
  isActive: boolean;
}
export interface ReportingChange {
  id: string;
  roleCode: string;
  reportingTo?: string | undefined;
  hierarchyPath: string[];
  isActive: boolean;
}

/** Build the entire change set before any writes; preserve employee IDs and ownership. */
export function planDirectMdHierarchy(employees: readonly ReportingEmployee[], mhPolicy?: LegacyMhPolicy): ReportingChange[] {
  const original = new Map(employees.map(employee => [employee.id, employee]));
  if (original.size !== employees.length) throw new Error('Duplicate employee IDs in hierarchy');
  if (employees.some(employee => employee.roleCode === 'MH') && !mhPolicy) {
    throw new Error('Existing MH accounts require --mh-to-mis or --deactivate-mh or --delete-mh; no records were changed');
  }
  function managingDirector(employee: ReportingEmployee): string {
    const seen = new Set([employee.id]);
    let parentId = employee.reportingTo;
    while (parentId) {
      if (seen.has(parentId)) throw new Error(`Circular reporting hierarchy for ${employee.id}`);
      seen.add(parentId);
      const parent = original.get(parentId);
      if (!parent) throw new Error(`Missing reporting manager for ${employee.id}`);
      if (parent.roleCode === 'MD') {
        if (!parent.isActive) throw new Error(`Inactive MD for ${employee.id}`);
        return parent.id;
      }
      parentId = parent.reportingTo;
    }
    throw new Error(`No MD ancestor for ${employee.id}; choose a reporting manager before migration`);
  }
  const next = new Map(employees.filter(employee => mhPolicy !== 'delete' || employee.roleCode !== 'MH').map(employee => {
    const updated: ReportingChange = { ...employee, hierarchyPath: [...employee.hierarchyPath] };
    if (['CP_HEAD', 'MIS', 'MH'].includes(employee.roleCode)) updated.reportingTo = managingDirector(employee);
    if (employee.roleCode === 'MH') {
      if (mhPolicy === 'mis') updated.roleCode = 'MIS';
      else updated.isActive = false;
    }
    if (['MD', 'ADMIN_HEAD'].includes(updated.roleCode)) updated.reportingTo = undefined;
    return [employee.id, updated] as const;
  }));
  const paths = new Map<string, string[]>();
  function path(id: string, visiting = new Set<string>()): string[] {
    const existing = paths.get(id);
    if (existing) return existing;
    if (visiting.has(id)) throw new Error(`Circular reporting hierarchy for ${id}`);
    const employee = next.get(id);
    if (!employee) throw new Error(`Missing employee ${id}`);
    visiting.add(id);
    let ancestors: string[] = [];
    if (employee.reportingTo) {
      const parent = next.get(employee.reportingTo);
      if (!parent) throw new Error(`Missing reporting manager for ${id}`);
      if (parent.roleCode === 'ADMIN_HEAD' || parent.roleCode === 'MH') throw new Error(`Employee ${id} still reports to a retired or non-hierarchy manager`);
      ancestors = [...path(parent.id, visiting), parent.id];
    } else if (!['MD', 'ADMIN_HEAD'].includes(employee.roleCode)) {
      throw new Error(`Missing reporting manager for ${id}`);
    }
    visiting.delete(id);
    paths.set(id, ancestors);
    return ancestors;
  }
  const changes: ReportingChange[] = [];
  for (const employee of next.values()) {
    employee.hierarchyPath = path(employee.id);
    const before = original.get(employee.id)!;
    if (before.roleCode !== employee.roleCode || before.reportingTo !== employee.reportingTo || before.isActive !== employee.isActive || JSON.stringify(before.hierarchyPath) !== JSON.stringify(employee.hierarchyPath)) changes.push(employee);
  }
  return changes;
}
