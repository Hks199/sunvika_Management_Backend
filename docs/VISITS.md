# Visit API

Visit endpoints are mounted at `/api/v1/visits` and require the corresponding `visits.create` or `visits.read` permission. Access is scoped through the lead owner's hierarchy. CPs see visits for their leads, while authorized uplines can see visits for downline leads. Each visit is a separate record; creating another visit never replaces an earlier one.

- `POST /` records a site visit with `{ "leadId": "<lead ObjectId>", "visitDate": "2030-04-01T10:00:00.000Z", "remark": "Site inspected", "nextVisitDate": "2030-04-08T10:00:00.000Z", "location": { "latitude": 21.25, "longitude": 81.63, "address": "Raipur" } }`. `visitedBy` is always the authenticated employee.
- `GET /?page=1&limit=20&branchId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&employeeName=...` lists visits for accessible leads. Optional `leadId`, `employeeId`, `upcoming=true`, or `overdue=true` filters are also supported. Branch is matched through the related lead, dates filter `visitDate`, and employee name/code searches the accessible visitor hierarchy including the matched employee's downline. CPs cannot use the employee-name filter.
- `GET /leads/:leadId` and `GET /employees/:employeeId` return paginated visit history by lead or visitor.
- `GET /:visitId` returns one authorized visit.
- `PATCH /:visitId` updates permitted visit details (`visitDate`, `remark`, `nextVisitDate`, `location`) and records `updatedBy`/`updatedAt`.
- `GET /follow-ups` and `GET /follow-ups/overdue` return scheduled next visits.

Visit dates cannot be in the future. Optional next-visit dates must be in the future. Location is optional and accepts latitude/longitude and/or an address. Customer references are reserved for the customer conversion phase.
