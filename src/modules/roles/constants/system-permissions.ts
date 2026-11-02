export const SYSTEM_PERMISSIONS = [
  ['employees', 'create'], ['employees', 'read'], ['employees', 'update'], ['employees', 'deactivate'],
  ['employees', 'activate'], ['employees', 'invite'], ['employees', 'hierarchy'],
  ['roles', 'read'], ['roles', 'manage'], ['permissions', 'read'], ['permissions', 'manage'],
  ['leads', 'create'], ['leads', 'read'], ['leads', 'update'], ['leads', 'delete'], ['leads', 'assign'], ['leads', 'status'],
  ['customers', 'create'], ['customers', 'read'], ['customers', 'update'],
  ['visits', 'create'], ['visits', 'read'],
  ['quotations', 'create'], ['quotations', 'read'], ['quotations', 'share'],
  ['amc', 'create'], ['amc', 'read'], ['amc', 'update'],
  ['audit', 'read'],
  ['reports', 'read'], ['dashboard', 'read'],
  ['geography', 'create'], ['geography', 'update']
] as const;

export const PROTECTED_PERMISSION_CODES = new Set(['roles.manage', 'permissions.manage', 'employees.bootstrap']);
