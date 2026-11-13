# CP to customer conversion

The Channel Partners detail view in web and mobile offers **Convert to customer** for an active CP without a linked customer. MD can convert any active CP; CP Heads and RMs can convert only their downline. MIS has organization read access but cannot perform this conversion.

The review form prefills CP name, phone, address and geography. The operator must select an active state, district and matching branch and supply site details, capacity, rate, payment mode, panel brand, panel technology and a conversion note. PAN, Aadhaar, electricity bill and bank passbook are mandatory (PDF/JPEG/PNG/WebP, subject to the existing upload limit, maximum 20 MB). Confirmation is required.

`GET /customers/from-cp/:cpId/options` returns defaults and existing conversion status. `POST /customers/from-cp/:cpId/document-upload-urls` reserves all four documents, `PUT /customers/from-cp/:cpId/document-uploads/:uploadId` uploads authenticated bytes, and `POST /customers/from-cp/:cpId` completes the conversion. Uploads are bound to both the CP and uploading operator, expire after ten minutes and are verified against encrypted private S3 objects using the existing customer document service.

The transaction creates the converted source lead, customer, document metadata and history, and links `Employee.sourceCustomer` with `Customer.cpEmployee`. The employee remains a CP with the same ID, password, verification state and reporting manager. No new login or invitation is created. Existing Customer history and CP type filters apply. Repeated conversion is idempotent; failures roll back database changes. MongoDB transactions require a replica set.

Verification: backend unit and HTTP tests plus `CP_CUSTOMER_DB_TEST=1 node tests/cp-customer.db.test.mjs`. The latter uses a uniquely named temporary database, stubs S3 entirely and removes only that temporary database. It never sends emails.
