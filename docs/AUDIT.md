# Audit Trail

The API records successful authenticated business mutations (`POST`, `PUT`, `PATCH`, and `DELETE`) and sensitive file reads (document, quotation, and profile-image download URLs). Records include a normalized action and module, actor, resource type and ID, request ID, IP address, user agent, response status, and creation time. Failed requests remain in application logs.

The middleware stores no request or response body. This avoids copying passwords, personal data, document content, tokens, or uploaded material into the audit trail. `oldValue` and `newValue` are optional schema fields for future callers that can provide explicitly minimized snapshots; the automatic request audit does not populate them.

## Reading audit records

`GET /api/v1/audit-logs` is Managing Director-only. Supported filters are `module`, `action`, `resourceType`, `resourceId`, `performedBy`, `dateFrom`, `dateTo`, `page`, and `limit` (maximum 100). Results are newest first and include the actor's employee code and name.

The audit writer is append-only at the application API layer; there are no update or delete routes. Successful audited responses are sent after the audit insert succeeds or fails, so writes are attempted before the client receives success. Audit database write failures are reported through structured application logs and do not turn a successful business operation into an API failure. Use database credentials that deny audit collection updates/deletes where operational tooling permits. Set retention and archival periods to match company policy and applicable privacy requirements.
