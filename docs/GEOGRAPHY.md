# Geography API

All endpoints are mounted below `/api/v1/geography` and require a signed-in employee. Dropdown endpoints return active records only. Create and update endpoints are restricted to the Managing Director. Deactivate parent records only after their active children have been deactivated. District state and branch state/district relationships are fixed after creation to protect existing employee assignments.

## Dropdowns

- `GET /states`
- `GET /states/:stateId/districts`
- `GET /districts/:districtId/branches`

## Management (MD only)

- `POST /states` with `{ "name": "Maharashtra", "code": "MH" }`
- `PATCH /states/:stateId` with optional `name`, `code`, and `isActive`
- `POST /districts` with `{ "name": "Pune", "state": "<state ObjectId>" }`
- `PATCH /districts/:districtId` with optional `name` and `isActive`
- `POST /branches` with `{ "name": "Pune Central", "code": "PUN-C", "state": "<state ObjectId>", "district": "<district ObjectId>", "address": "..." }`
- `PATCH /branches/:branchId` with optional `name`, `code`, `address`, and `isActive`

District names are unique within a state, state names and optional state codes are unique, and branch codes are globally unique. Employee create/update also checks that selected state, district, and optional branch are active and belong together.
