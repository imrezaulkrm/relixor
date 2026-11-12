# QA Manual

QA engineers typically hold a `DEVELOPER` membership (or a global DEVELOPER role) for the apps they test. VIEWER cannot record results.

## Receive a build

1. Check the app and exact version/versionCode.
2. Download and verify SHA-256.
3. Confirm commit/pipeline metadata matches the candidate.

## Test and record

1. Open the release → **QA verification**.
2. Choose `PASS`, `FAIL` or `BLOCKED`.
3. Write evidence: devices/OS versions, scenarios, observed defects, build identifier.
4. Save. The record includes your user and a server timestamp.

Do not record PASS for partial coverage. Use BLOCKED when the environment prevents testing, and FAIL with reproducible notes when behaviour is wrong.

## Review and export

- The QA dashboard shows recent results and pending work within your access.
- Export via **Reports** (`/api/v1/reports/qa?format=csv|pdf`).
- CSV is formula-neutralised; JSON is best for automation.
- Exports are audited.

## What does not exist

- No test-case library, attachments, screenshots or automated result ingestion.
- No email notifications.
- No signed report artifact.
- QA records do not block publication automatically; reviewers must honour them.

## Escalation

- Build won't install / bad signature → report to developer; Relixor does not verify signatures.
- Checksum mismatch → stop, report security-relevant artifact corruption.
- Cannot see the app → request membership from an administrator.
- Cannot record → confirm your role is DEVELOPER, not VIEWER.

## Related

- [QA & reports](/docs/user-guide/qa-reports)
- [Release management](/docs/user-guide/release-management)
