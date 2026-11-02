# Customer API

Customer routes use `/api/v1/customers`; all require the matching `customers.*` permission and hierarchy access to the source lead owner. Customer records are created only through the controlled conversion endpoint.

- `POST /from-lead/:leadId/document-upload-urls` reserves uploads for exactly one each of `PAN`, `AADHAAR`, `ELECTRICITY_BILL`, and `BANK_PASSBOOK`. Body: `{ "documents": [{ "documentType": "PAN", "fileName": "pan.pdf", "mimeType": "application/pdf", "fileSize": 34567 }, ...] }`. Send each file's raw bytes to `PUT /from-lead/:leadId/document-uploads/:uploadId` with its matching `Content-Type`; the authenticated API uploads the file to private S3 storage, avoiding browser-to-S3 CORS requirements.
- `POST /from-lead/:leadId` converts an accessible lead only after all four reserved uploads have been received and verified. Include their IDs as `documentUploadIds` along with `{ "requiredCapacityKW": 5, "ratePerKW": 62000, "paymentMode": "Finance", "panelBrand": "Example", "panelTechnology": "TOPCon", "remark": "Project details confirmed" }`. The source lead is locked to one customer by a unique index.
- `GET /?page=1&limit=20&search=...&branchId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&employeeName=...` lists customers in the caller's hierarchy. Dates filter customer creation date. Employee names/codes expand to that employee's accessible downline; CPs cannot use the employee-name filter.
- `GET /:customerId` returns the customer profile, solar information, source lead, uploaded document metadata, lead status history, site visit history, and customer activities.
- `PATCH /:customerId` updates permitted customer profile/project fields and records the actor and activity.
- `GET /:customerId/timeline` returns a combined customer, lead-status, and visit timeline.

Lead conversion writes the customer and its four verified documents, marks the lead `CONVERTED`, and records lead status and customer activity history in a MongoDB transaction when supported. Standalone MongoDB uses compensating writes and the unique source-lead constraint. Upload reservations expire after ten minutes. A lead already marked `LOST` or `NOT_INTERESTED` cannot be converted. Generic lead status updates cannot set `CONVERTED`.

## Customer documents

Only `PAN`, `AADHAAR`, `ELECTRICITY_BILL`, and `BANK_PASSBOOK` document types are accepted. Uploads permit PDF, JPEG, PNG, and WebP, up to `CUSTOMER_DOCUMENT_MAX_SIZE_BYTES` (default 10 MiB). Configure `AWS_REGION`, a private `AWS_S3_CUSTOMER_DOCUMENT_BUCKET` (or the shared `AWS_S3_BUCKET_NAME` fallback), and AWS credentials or an instance role.

The backend's runtime IAM user or role needs object access to the configured customer-document bucket. Replace `YOUR_CUSTOMER_DOCUMENT_BUCKET` with the bucket name configured by `AWS_S3_CUSTOMER_DOCUMENT_BUCKET` (or its fallback):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::YOUR_CUSTOMER_DOCUMENT_BUCKET/customer-document-staging/*",
        "arn:aws:s3:::YOUR_CUSTOMER_DOCUMENT_BUCKET/customer-documents/*"
      ]
    }
  ]
}
```

Attach this policy to the identity the backend actually uses (environment credentials or its compute role), then retry the conversion. Do not attach this permission to the frontend user or make the bucket public. An explicit deny in a bucket policy, permissions boundary, or organization policy can still block the upload.

1. `POST /:customerId/documents/upload-url` with `{ "documentType": "PAN", "fileName": "pan.pdf", "mimeType": "application/pdf", "fileSize": 34567 }`.
2. Upload the bytes to the returned short-lived `uploadUrl` with the matching `Content-Type`.
3. `POST /:customerId/documents/complete` with `{ "uploadId": "<upload ObjectId>" }`.
4. `GET /:customerId/documents` returns metadata and verification status. `GET /:customerId/documents/:documentId/preview-url` returns a five-minute URL with inline content disposition for previewing supported files. `GET /:customerId/documents/:documentId/download-url` returns a five-minute download URL.
5. `PATCH /:customerId/documents/:documentId/verification` with `{ "status": "VERIFIED", "remark": "Reviewed" }` records the verifier and activity.

Upload completion checks S3 content type and size and inspects file signatures; it does not trust the filename extension. Keys remain private, objects request AES-256 server-side encryption, and the API never returns a permanent object URL or raw S3 key.
