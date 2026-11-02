# Annual Maintenance Contracts

AMC records are linked to customers and remain separate from lead workflows. Access to every contract, schedule, and service history is checked through its customer owner and the existing employee hierarchy. MD has organization-wide access. BDO, MH, DC, and RM can register and manage contracts in their hierarchy; CP can register and read their own customer contracts and record service history. Admin Head can read organization-wide AMC data.

All endpoints are mounted under `/api/v1/amc` and use bearer authentication.

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `POST /` | `amc.create` | Register a customer contract |
| `GET /` | `amc.read` | Paginated contract list; optional customer, status, and renewal status filters |
| `GET /:contractId` | `amc.read` | Contract plus its maintenance schedule and service history |
| `GET /renewals/upcoming?days=60` | `amc.read` | Active contracts expiring within the selected horizon (1–365 days) |
| `POST /:contractId/renew` | `amc.update` | Create the next linked contract and mark the current one renewed |
| `POST /:contractId/cancel` | `amc.update` | Cancel an active contract and its remaining scheduled visits |
| `PATCH /:contractId/renewal-status` | `amc.update` | Mark a contract declined or reset it to not due |
| `POST /:contractId/schedules` | `amc.create` | Schedule maintenance and assign an in-scope employee |
| `PATCH /:contractId/schedules/:scheduleId` | `amc.update` | Reschedule, reassign, or update schedule status |
| `GET /schedules/upcoming?days=30` | `amc.read` | Paginated upcoming maintenance in the caller's customer scope |
| `POST /:contractId/service-history` | `amc.create` | Record completed service, optionally completing a schedule |
| `GET /:contractId/service-history` | `amc.read` | Paginated service history |

Contract numbers are allocated atomically by year. Contract amounts are stored as Decimal128. Dates are checked against the contract period when creating maintenance schedules. The contract stores the nearest scheduled service date and its assigned employee for renewal/scheduling views; service events remain separate append-only documents.
