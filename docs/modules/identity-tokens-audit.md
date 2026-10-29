# Identity, tokens, and audit

## Scope

User administration, API-token lifecycle, audit event recording/querying, and their role/application scope rules.

## Key files and flow

`user.routes.ts` and `user.controller.ts` are admin-only user CRUD. `token.routes.ts` and `token.controller.ts` create/list/revoke/delete scoped tokens. `auditService.ts` writes events; `audit.routes.ts` and controller query them. Prisma models `User`, `ApiToken`, and `AuditLog` define persistence.

## Interfaces and rules

Roles are `ADMIN`, `DEVELOPER`, and `VIEWER`; token permissions are `READ`, `WRITE`, and `ADMIN`. Token hashes, not plaintext, are persisted. Developers cannot create ADMIN tokens; user/token administration is not available through API-token auth. Audit access is role-aware but the schema has no organization boundary.

## Evidence and acceptance

- **Status:** **VERIFIED**
- `backend/tests/permissions.test.ts` (27 tests passed), `auth.test.ts` (4 tests passed), and `security.test.ts` (6 tests passed) verified the complete role/token matrix, one-time secret display, token hashing in database, and audit log permissions.
- E2E Playwright verification (`scripts/e2e-uat-runner.mjs`) confirmed:
  - Developer cannot list users (`E2E-14`) or create ADMIN tokens (`E2E-16`).
  - Developer can create WRITE token (`E2E-15`).
  - Viewer cannot list users, tokens, or audit logs (`E2E-17`, `E2E-21`).
  - User Management and Audit Logs are restricted to ADMIN in UI and API.

Acceptance criteria fully executed and passed in [docs/UAT_REPORT.md](../UAT_REPORT.md).
