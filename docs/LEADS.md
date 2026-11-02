# Lead API

Endpoints are mounted at `/api/v1/leads`. All require authentication and the matching `leads.*` permission. Permission checks are followed by hierarchy scoping: the MD can see all leads, primary managers can access their downline, CPs can access their own leads, and Admin Heads have read-only visibility.

- `POST /` creates a lead. `creatorId`, lead code, and initial `PENDING` status are assigned by the server. The selected active state, district, and branch must form a valid relationship.
- `GET /?page=1&limit=20&status=PENDING&search=...&branchId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&employeeName=...` lists accessible leads, excluding leads already converted to customers. Branch and creation-date filters are optional. `employeeName` searches accessible employee names/codes and includes records owned by that employee's downline; CPs cannot use this filter. The total and pagination counts reflect all filters.
- `GET /:leadId` returns one accessible lead.
- `PATCH /:leadId` updates lead details and location.
- `PATCH /:leadId/status` changes status; body: `{ "status": "NEED_FOLLOWUP", "remark": "Call after site discussion", "nextFollowUpDate": "2030-04-01T10:00:00.000Z" }`. A follow-up date is required for `NEED_FOLLOWUP`, and every change is stored in status history.
- `GET /:leadId/history` returns status history.
- `PATCH /:leadId/assignment` assigns to an active employee in the actor's hierarchy; body: `{ "assignedTo": "<employee ObjectId>" }`.
- `GET /follow-ups` returns future follow-ups; `GET /follow-ups/overdue` returns overdue follow-ups. Both accept the same optional branch, date, and employee filters.

Lead mobile numbers must contain 10–15 digits, optionally prefixed with `+`. Status values are `PENDING`, `INTERESTED`, `NOT_INTERESTED`, `SITE_VISITED`, `NEED_FOLLOWUP`, `LOST`, `QUOTATION_SENT`, and `CONVERTED`. `CONVERTED` is set only through the controlled customer conversion workflow and is not included in the Leads list.
