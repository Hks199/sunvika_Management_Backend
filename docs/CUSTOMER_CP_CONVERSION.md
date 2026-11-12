# Convert an existing customer to Channel Partner

In web and mobile, open a customer and choose **Convert to CP**. A confirmation form reviews first/last name, invitation email, phone and employee address. Existing customer details prefill the form; email must be supplied because original customer records do not require one. Choose the reporting RM and explicitly press **OK, convert to CP**. Opening or cancelling the popup does not create an account or send an email.

## Authorization and hierarchy

- MD: any accessible customer, with any active RM as manager.
- CP Head: an accessible customer, with an active RM in that CP Head's current downline.
- RM: an accessible customer, with that RM as the direct manager.
- MIS, CP, Admin Head and custom roles: cannot convert customers to employees.

The API additionally requires customers.read and employees.create. The server resolves roles, scope and RM membership; client-supplied roleCode can only be CP. The existing employee-creation hierarchy for MD/MIS/CP Head accounts is unchanged. New CPs follow MD -> CP Head -> RM -> CP.

## Stored data and duplicate protection

The original Customer record remains. A new Employee is created with role CP, reportingTo RM, the RM's hierarchyPath plus RM, createdBy the actual actor, and sourceCustomer linking back to the original customer. The employee code is deterministically CP-CUS-<customer ID>. Customer.cpEmployee, cpConvertedAt and cpConvertedBy record the link and one CP_ACCOUNT_CREATED customer activity is added. A unique partial index on employees.sourceCustomer and the existing employee-code/email/mobile uniqueness constraints prevent duplicate accounts. No existing employee with a matching email/phone is silently taken over.

The shared hierarchy lock serializes conversion and reporting-manager changes. Interrupted pre-link conversions can be retried using the same email and manager; the existing employee is reused and missing links completed. Completed conversions return alreadyConverted without creating another employee or repeatedly sending invitations. Customer record/history creators are never rewritten. New indexes are additive; no customer data migration is required.

## Password setup and login

The new CP initially has no password hash and isVerified false. After the account and customer link are saved, the existing authService.createInvitation sends a single-use password-setup link using the existing SMTP and FRONTEND_URL settings. Its existing expiry and password strength rules apply. The CP cannot log in until that invitation is used to set a password. After setup they sign in normally on web or mobile with the CP role. If delivery fails, account creation remains successful and the response/UI reports invitationSent false. The upline can use Employees > Resend invitation; conversion must not be repeated to create a second account.

## Preserved history and access

Customer/employee links preserve the customer, source lead, status changes, documents, site visits, quotations, AMC records and customer activity. Customer and lead scopes include the linked CP as well as the original creator's existing access. The CP and its current upline can view that specific customer's history; they do not gain access to unrelated records owned by the former creator. Reporting-manager changes naturally move linked-history visibility with the CP's current hierarchy. Existing module permissions still apply. Employee details includes **Customer history**; Customers also lists the linked customer for the CP and upline. Customer details includes the original timeline plus quote and AMC summaries. Sensitive document and quotation download checks use the linked resource scope.

## API

- GET /customers/:customerId/cp-conversion returns permitted RMs, prefilled account fields and conversion status. No writes or emails.
- POST /customers/:customerId/convert-to-cp accepts validated CP employee details, reportingManagerId (required for MD/CP Head) and confirmed: true. The server fixes role CP and the deterministic employee code. It returns the customer _id, employeeId, alreadyConverted and invitationSent.

Normal customer timelines and employee reporting/history endpoints continue to apply. Conversion POST requests use the existing audit middleware with the real authenticated actor.

Validation: backend build and 48 unit/HTTP checks passed, including confirmation, role/manager boundaries, preservation of original creators, duplicate prevention, unrelated-history denial, and login blocked before password setup / successful CP login after setup. Account and email tests use model/service fixtures; no real customer accounts were converted and no test invitations were sent.
