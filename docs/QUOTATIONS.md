# Quotation and brochure API

Routes are mounted under `/api/v1/quotations` and require the relevant `quotations.*` permission. Quotation access is also scoped to the lead owner's hierarchy. Generated files stay in a private S3 bucket. Set `AWS_REGION`, `AWS_S3_QUOTATION_BUCKET` (or shared `AWS_S3_BUCKET_NAME`), AWS credentials or an instance role, and the externally reachable `PUBLIC_API_URL`. Optional company details can be configured with `QUOTATION_COMPANY_ADDRESS`, `QUOTATION_COMPANY_PHONE`, `QUOTATION_COMPANY_EMAIL`, and `QUOTATION_AUTHORIZED_SIGNATORY`.

The AWS identity used by the backend must have access to quotation objects. Attach this identity-based policy to the backend's runtime IAM user or role, replacing the bucket name if `AWS_S3_QUOTATION_BUCKET` is different:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::sunvika-media/quotations/*"
    }
  ]
}
```

`s3:PutObject` is required to generate and store a quotation PDF; `s3:GetObject` is required for signed downloads and shares, and `s3:DeleteObject` is used to clean up an upload if saving its quotation record fails. Keep this policy scoped to the quotation prefix. Do not add AWS credentials or S3 permissions to the frontend. If the backend uses environment credentials, attach the policy to the IAM identity represented by those credentials; otherwise attach it to the compute role. The identity named in an AWS `AccessDenied` error is the one to check.

## Quotations

- `POST /` creates a quotation for a `QUOTATION_SENT` lead. Body: `{ "leadId": "<lead ObjectId>", "requiredCapacityKW": 5, "ratePerKW": 62000, "paymentMode": "Finance", "panelBrand": "Example", "panelTechnology": "TOPCon", "termsAndConditions": "..." }`. The server calculates the total and generates a PDF. Repeated requests create a new version with a unique quotation number; only the latest version remains marked `GENERATED`.
- `GET /?page=1&limit=20&leadId=...&branchId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&employeeName=...` returns hierarchy-scoped quotation history. Branch and employee filters are applied through the related lead; dates filter `quotationDate`. Employee names/codes expand to that employee's accessible downline, and CPs cannot use the employee-name filter.
- `GET /:quotationId` returns a quotation snapshot without its private S3 key.
- `GET /:quotationId/file` returns the authorized quotation PDF as a file download for browser/device sharing.
- `GET /:quotationId/download-url` returns a five-minute presigned download URL.
- `GET /:quotationId/shares` shows recorded Click-to-Chat link creation activity.

## Brochures and sharing

- `POST /brochures` generates and stores a reusable company brochure PDF, returning its ID and a short-lived download URL.
- `GET /brochures/:brochureId/download-url` returns a fresh five-minute URL.
- `POST /:quotationId/share` accepts `{ "mobileNumber": "+919876543210", "brochureId": "<optional brochure ObjectId>" }`. With a brochure ID it shares both files; without one it shares the quotation.
- `POST /brochures/:brochureId/share` accepts `{ "mobileNumber": "+919876543210" }`.

Share responses contain a `whatsappUrl`, expiry, and `deliveryStatus: "NOT_SENT"`. Opening the link does not send a WhatsApp message. The recipient-facing URLs use random, expiring tokens; only token hashes are stored. `GET /public/shares/:token` redirects to a five-minute S3 URL while the token remains valid.

PDF terms are supplied for each quotation version. The total is computed as capacity × rate, rounded to two decimal places and stored with Decimal128 precision. Configure company contact/signatory details before production so quotation PDFs contain the approved details.
