# QA & Reports

## Purpose

QA records answer one question: **which build was verified, by whom, in what environment, and with what result?** Relixor stores these records per release and exposes them in the QA dashboard and exportable reports. It does not run tests itself.

## Record a verification

1. Open the release (Releases or app detail).
2. Choose **QA verification**.
3. Select result: `PASS`, `FAIL` or `BLOCKED`.
4. Add notes/evidence summary, build identifier, environment/device, and tester name if not you.
5. Save.

Requirements and behaviour:

- Caller needs **WRITE** permission; VIEWER is denied.
- Caller must have access to the release's app.
- The tester is recorded from the authenticated user; timestamps are server-side.
- A release can have multiple verifications; the summary reports counts and latest result per status.
- Nothing is pre-filled or invented: an empty result set means no QA evidence.

## Read the QA dashboard

The dashboard/release summary shows:

- pending approvals and releases awaiting QA,
- PASS/FAIL/BLOCKED counts,
- latest verification per release,
- links to the release and report.

Use filters by app/project/channel/time where available. Role scoping applies: you only see releases you can access.

## Reports

`GET /api/v1/reports/qa?format=json|csv|pdf` (plus app/release/channel/date filters supported by the API).

- **JSON** — structured report for automation.
- **CSV** — spreadsheet-friendly, values escaped; cells beginning with `=`, `+`, `-`, `@` are neutralised to prevent spreadsheet formula injection.
- **PDF** — generated server-side without external dependencies; valid `%PDF` document with a simple table and page numbers.
- **Invalid format** → 400 `INVALID_REPORT_FORMAT`.

Exports are audited. API tokens with READ may read reports but cannot write QA records. Report output excludes secrets and token hashes.

## Interpret results honestly

- `PASS` means a named tester recorded a pass for that build; it is not proof of exhaustive testing.
- `FAIL`/`BLOCKED` should block production promotion until resolved or explicitly accepted by the release owner.
- A newer upload invalidates assumptions: verify the exact release ID/versionCode, not just the version string.
- Missing QA records are **not** a pass. Reports show absence explicitly.

## Limitations

- No test-case management, attachments, screenshots, or automated test-result ingestion.
- No signed/immutable report artifact; PDFs are generated on demand.
- One latest state per verification record; history is the list of records.
- PDF layout is functional and minimal (no branding, no charts).

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| 403 recording QA | VIEWER role or no app access | Request DEVELOPER membership |
| Empty report | No verifications / filters too narrow | Widen date/app filters |
| CSV opens with changed values | Formula neutralisation | Expected; use JSON if raw values needed |
| PDF looks plain | Minimal generator | Use CSV/JSON for detailed analysis |
| Report export 403 | No access to any matching release | Adjust scope |

## Related

- [Release management](/docs/user-guide/release-management)
- [QA manual](/docs/user-guide/qa-manual)
- [API Reference](/docs/api/reference)
