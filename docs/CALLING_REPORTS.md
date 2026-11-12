# RM calling reports

An RM can click **Generate today's report** from CP calling lists or the Calling reports page. The system calculates a saved daily report; no manual totals are accepted. MD can also generate a report for a selected RM. CP Heads see reports for RMs currently in their downline; MD and MIS can read organization-wide. Only the RM's current CP Head or MD can verify a report. RMs cannot verify their own report, and MIS read visibility does not grant verification permission.

Reports show the calling sheet name and counts of recorded calls, CP conversions, interested candidates and candidates needing follow-up. A candidate contacted on two sheets appears under the corresponding sheet. Each **Record call** save still appends an immutable activity entry. **Recorded calls** now copies the corresponding sheet's **Total calling** value from Calling lists: deleted + converted to CP + interested + needs follow-up. It is a cumulative sheet counter, not the number of repeated call saves. CP creation is a separate conversion event and does not invent an extra call. Interested and follow-up counts use the candidate's latest outcome for that reporting day, excluding candidates converted that day. Weekly/monthly totals sum these daily outcomes; they are not all-time distinct candidate counts.

The calling-list **Total calling** column is the source for **Recorded calls**. For a currently assigned sheet, report generation and verification read that exact counter using the same calculation and transaction session. The report date selects which sheets had activity; conversions, interested and follow-up outcomes remain date-filtered. Deleting a candidate leaves its dated activity available for reports. Sheet reassignment does not transfer earlier activity to a different RM. MD/MIS actions on an assigned sheet are attributed to that assigned RM, while the activity stores who performed the action.

All date boundaries use **Asia/Kolkata (IST)**, independently of the server timezone. Daily reports cover midnight to midnight. Week means the last seven dates ending on the selected date. Month means the calendar month containing the selected date. Period reports include a consolidated per-RM/per-sheet table, overall totals and individual daily report/review status. The cumulative Recorded calls value is taken once from the latest included day for each RM/sheet; it is not summed again for every date. Other dated outcomes are summed across the period.

## API

- `GET /api/v1/calling-reports/options`: accessible RMs, current IST date and viewer role.
- `GET /api/v1/calling-reports?period=DAY|WEEK|MONTH&date=YYYY-MM-DD&rmId=<optional RM>`: live dated activity totals, sheet consolidation and saved daily report status. Out-of-scope RM filters return 404.
- `POST /api/v1/calling-reports/today` with `{}`: RM generates their own report. MD passes `{ "rmId": "..." }`.
- `POST /api/v1/calling-reports/:reportId/verify` with `{ "revision": 1, "reviewNote": "optional" }`: verify a reviewed, current report.

Daily reports are unique by RM and IST date. Saved historical daily reports keep the sheet total captured at generation. Today's live view reflects the current sheet counter; regenerate today's previously saved report if it is marked changed. Reassigned sheets use the earlier RM's saved counter (or their own dated outcome history if no snapshot exists), without exposing the new RM's sheet totals. Generating unchanged totals preserves the same revision and verification. Regenerating changed activity increments the revision and resets verification. Verification checks the revision and recomputes the saved sheet totals inside a transaction. A changed report is rejected with 409 and must be regenerated. The review stores the verifying employee, timestamp and note. Both clients refresh only on user actions, never by polling.

Calling status changes and their activity entries commit together in a transaction. Conversion links and conversion events also commit together, with a unique conversion key per candidate. Employee account creation remains recoverable using its deterministic employee code, so a failed link/activity transaction can be retried without creating a duplicate employee or sending another invitation.

## Existing data and checks

`node dist/scripts/backfill-calling-activity.js` idempotently recovers the latest timestamped call where its RM caller is known (or an MD/MIS call has a provable assigned RM at that time), plus CP conversion dates from linked employee creation timestamps. It does not invent earlier repeat calls or infer dates from current cumulative counts. The report screens explain this historical limitation.

Standard unit/HTTP tests cover date boundaries, validation and access. Optional real MongoDB workflow test:

```powershell
$env:CALLING_REPORT_DB_TEST='1'
node tests/calling-reports.db.test.mjs
```

This test creates a uniquely named temporary database, uses fixture accounts and no email delivery, verifies exact equality with Calling lists totals, repeat-save stability, historical snapshots, period consolidation and actual aggregation/transactions, and removes only that temporary database after checking its name. It never edits live business records.
