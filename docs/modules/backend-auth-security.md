# Backend authentication and security

## Purpose and scope

Authentication, authorization, security middleware, input/configuration guards, and shared security utilities for the Express API.

## Key files

`backend/src/app.ts` composes Helmet, CORS, body limits, and rate limits. `middleware/auth.ts` authenticates JWT/API tokens; `middleware/rbac.ts` applies roles and token permissions. Auth routes/controllers handle login, current-user, and password change. `utils/token.ts` generates and hashes API tokens; `config/index.ts` applies production fail-closed checks.

## Flow and interfaces

Requests enter `createApp`, pass global API/auth rate limits, then route-level `authenticate` and RBAC middleware. Controllers use Prisma and return JSON. CORS permits configured origins and no-origin requests; downloads expose checksum/content headers. JWT and API-token semantics are implemented in the auth middleware and token service.

## Security rules

Never weaken production JWT, admin-password, or CORS checks; never log or document secrets. Verify route middleware and ownership checks in source before claiming authorization. API-token management must not be reachable through API-token auth.

## Tests and evidence

- **Status:** **VERIFIED**
- `npm run build:backend` passed cleanly.
- `backend/tests/auth.test.ts` (4 passed), `permissions.test.ts` (27 passed), and `security.test.ts` (6 passed) all executed and passed in the dedicated disposable database (`relixor_test`).
- E2E browser and API test suite (`scripts/e2e-uat-runner.mjs`) verified:
  - Wrong credentials rejected (`E2E-03`).
  - Admin login, JWT issuance, profile fetch (`E2E-04`).
  - Developer role boundaries enforced via API (`E2E-14`, `E2E-16`).
  - Viewer role boundaries enforced via API (`E2E-21`).
  - Unauthenticated access blocked with HTTP 401 (`E2E-22`).
  - Container logs inspected; zero credential or secret leaks.

## Review result and acceptance

The module has satisfied all acceptance criteria.
Remaining follow-up for public production: QR download query-string token should be migrated to a short-lived, single-use ticket mechanism.
Refer to [docs/UAT_REPORT.md](../UAT_REPORT.md) for detailed execution records.
