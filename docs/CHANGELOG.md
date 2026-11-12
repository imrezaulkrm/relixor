# Changelog

## 1.0.0 — 12 November 2026

Documentation portal and full A–Z manual added under `/docs`.

### Release lifecycle and platform
- Five channels including **BETA**; statuses `DRAFT/UPLOADED/PENDING_APPROVAL/APPROVED/PUBLISHED/REJECTED/DEPRECATED/ARCHIVED`.
- Submit/approve/reject/publish/deprecate/promote/rollback; approval gate; self-approval policy; status history.
- Global release catalog with scope, filters and pagination; current production and compare endpoints.
- App publication (`isPublic`, `publicSlug`), ADMIN-only.

### Downloads and updates
- DB-backed short-lived **single-use download tickets**; query-string JWT/API-token auth removed.
- Public portal API and UI at `/portal`; public update checks.
- Authenticated update check/latest with mandatory/min-supported flags.
- QR codes now use tickets and require publicly downloadable releases.

### CI and QA
- Checksum verification (`CHECKSUM_MISMATCH`), GitLab CI guide/example, scoped tokens.
- QA verification records (`PASS/FAIL/BLOCKED`), JSON/CSV/PDF reports, CSV injection neutralisation, export audit.

### Retention
- Per-channel policies; BETA default 90 days; protected production/pinned/active releases.
- Preview, dry-run, execution gated by `RETENTION_ALLOW_DELETE`; metadata archived; scheduler opt-in.

### Account security
- DB-backed sessions with `sid`/`tokenVersion`; logout, revocation, admin session management.
- Password change/reset with hashed, expiring, atomic single-use tokens; login/logout/failure history.
- Profile UI and admin session/reset modal.

### UI
- Releases, QA dashboard/reports, retention, public portal, profile, dashboard role overview, publication settings, admin account controls, docs portal.

### Migrations
- `20261112140000_add_project_management`
- `20261112150000_add_rbac_memberships`
- `20261112170000_release_lifecycle_platform`
- `20261112180000_seed_beta_retention`
- `20261112190000_download_tickets`
- `20261112200000_sessions_password_resets`

### Verification
- Backend: 13 suites / 155 tests pass on disposable PostgreSQL 17.
- Backend and frontend production builds pass.
- Fresh migration replay 7/7; health 200.
- Browser E2E and clean-VM Compose deployment: **NOT TESTED**.

## 0.1.0 — 13 October 2026

Initial platform: authentication, projects/apps, APK upload/download, channels, API tokens, audit, Docker Compose deployment, RBAC.
