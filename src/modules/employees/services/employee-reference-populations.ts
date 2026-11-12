/** Resolve only display fields, without expanding related employee/customer profiles. */
export const EMPLOYEE_DETAIL_REFERENCES = [
  { path: 'role', select: 'name code category level' },
  { path: 'reportingTo', select: 'employeeCode firstName middleName lastName' },
  { path: 'createdBy', select: 'employeeCode firstName middleName lastName' },
  { path: 'hierarchyPath', select: 'employeeCode firstName middleName lastName' },
  { path: 'branch', select: 'name code' },
  { path: 'address.state', select: 'name code' },
  { path: 'address.district', select: 'name' },
  { path: 'sourceCustomer', select: 'customerName customerCode' }
];
